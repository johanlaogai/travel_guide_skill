import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, printJson } from './helpers.mjs';
import { fetchJson, USER_AGENT } from '../core/http.mjs';
import { redactSecret } from '../core/redact.mjs';

const PROVIDER_CHECKS = {
  'open-meteo': {
    url: 'https://api.open-meteo.com/v1/forecast?latitude=23.1291&longitude=113.2644&daily=temperature_2m_max&timezone=auto&forecast_days=1',
    method: 'GET',
  },
  nominatim: {
    url: 'https://nominatim.openstreetmap.org/status',
    method: 'GET',
  },
  overpass: {
    url: 'https://overpass-api.de/api/interpreter',
    method: 'POST',
    body: 'data=' + encodeURIComponent('[out:json][timeout:10];node(1);out;'),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  },
  wikimedia: {
    url: 'https://zh.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&formatversion=2&maxlag=5',
    method: 'GET',
  },
};

export async function run(argv) {
  const { values } = parse('doctor', argv, {
    live: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    cache: { type: 'string' },
    proxy: { type: 'string' },
  });
  const cacheDir = path.resolve(values.cache ?? '.travel-guide-cache');
  const report = {
    node: process.version,
    nodeOk: Number(process.versions.node.split('.')[0]) >= 20,
    platform: `${process.platform} ${process.arch}`,
    cwd: process.cwd(),
    userAgent: USER_AGENT,
    tools: {
      git: toolVersion('git', ['--version']),
      curl: toolVersion('curl', ['--version']),
    },
    skill: await skillStatus(),
    cache: { dir: cacheDir, exists: await exists(cacheDir), writable: await writableDir(cacheDir) },
    env: {
      proxy: values.proxy ? redactSecret(values.proxy) : Boolean(process.env.TRAVEL_GUIDE_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY),
      tikhubKeyConfigured: Boolean(process.env.TIKHUB_API_KEY),
      tikhubUnitPriceUsd: Number(process.env.TIKHUB_UNIT_PRICE_USD ?? 0.01),
    },
    providers: {},
  };
  if (values.live) {
    for (const [name, check] of Object.entries(PROVIDER_CHECKS)) {
      report.providers[name] = await checkProvider(name, check, { proxy: values.proxy });
    }
    report.providers.tikhub = { skipped: true, reason: '付费 API；doctor 不会主动调用' };
  }
  report.ok = report.nodeOk && report.skill.installed && report.cache.writable;
  if (values.json) {
    printJson(report);
    return report.ok ? 0 : 1;
  }
  console.log('travel-guide doctor\n');
  console.log(`Node: ${report.node} ${report.nodeOk ? '✓' : '✖ 需要 >=20'}`);
  console.log(`平台: ${report.platform}`);
  console.log(`git: ${report.tools.git ?? '未找到'}`);
  console.log(`curl: ${report.tools.curl ?? '未找到（仅在需要代理时使用）'}`);
  console.log(`\nskill 安装: ${report.skill.installed ? '✓' : '✖'} ${report.skill.path}`);
  if (report.skill.symlink) console.log(`  -> ${report.skill.target}`);
  if (!report.skill.installed) console.log('  运行 ./scripts/install.sh');
  console.log(`缓存: ${report.cache.dir} ${report.cache.writable ? '✓ 可写' : '✖ 不可写'}`);
  console.log(`代理: ${report.env.proxy ? '已配置' : '未配置'}`);
  console.log(`TikHub Key: ${report.env.tikhubKeyConfigured ? '已配置（不会打印）' : '未配置（可选）'}`);
  if (values.live) {
    console.log('\n实时连通性（各 1 次，遵守限速）:');
    for (const [name, result] of Object.entries(report.providers)) {
      if (result.skipped) console.log(`  ${name}: 跳过（${result.reason}）`);
      else if (result.ok) console.log(`  ${name}: ✓ ${result.ms}ms`);
      else console.log(`  ${name}: ✖ ${result.error}`);
    }
  } else {
    console.log('\n加 --live 检查 Open-Meteo/Nominatim/Overpass/Wikimedia 连通性（不会调用 TikHub）。');
  }
  if (!report.nodeOk) console.log('\n✖ Node 版本过低。');
  if (!report.skill.installed) console.log('\n✖ skill 尚未安装到 ~/.dsh/skills/travel-guide。');
  if (!report.cache.writable) console.log('\n✖ 缓存目录不可写。');
  return report.ok ? 0 : 1;
}

async function checkProvider(name, check, { proxy }) {
  const started = Date.now();
  try {
    const response = await fetchJson(check.url, {
      method: check.method,
      body: check.body,
      headers: check.headers,
      timeoutMs: 8000,
      proxy,
      provider: name,
    });
    return { ok: true, ms: Date.now() - started, sample: summarize(response) };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: String(error.message ?? error).slice(0, 300) };
  }
}

function summarize(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === 'object') return `object(${Object.keys(value).slice(0, 6).join(',')})`;
  return String(value).slice(0, 80);
}

function toolVersion(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
    if (result.status !== 0) return null;
    return String(result.stdout).split('\n')[0].trim();
  } catch {
    return null;
  }
}

async function skillStatus() {
  const target = path.join(os.homedir(), '.dsh', 'skills', 'travel-guide');
  const status = { path: target, installed: false, symlink: false, target: null, hasSkillFile: false };
  try {
    const stat = await fs.lstat(target);
    status.symlink = stat.isSymbolicLink();
    if (status.symlink) status.target = await fs.readlink(target);
    status.installed = true;
    status.hasSkillFile = await exists(path.join(target, 'SKILL.md'));
  } catch {
    status.installed = false;
  }
  return status;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writableDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.doctor-${process.pid}.tmp`);
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
    return true;
  } catch {
    return false;
  }
}
