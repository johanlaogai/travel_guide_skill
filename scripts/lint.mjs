import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const errors = [];
const required = [
  'SKILL.md',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
  'bin/travel-guide.mjs',
  'docs/data-sources.md',
  'docs/tikhub.md',
  'docs/architecture.md',
  'references/intake.md',
  'references/research.md',
  'references/sources.md',
  'references/planning.md',
  'references/revise.md',
  'references/expenses.md',
  'references/checklists.md',
  'references/delivery.md',
  'schemas/trip.schema.json',
  'schemas/source.schema.json',
  'examples/guangzhou-3d/trip.json',
  'scripts/install.sh',
  '.github/workflows/ci.yml',
];
for (const file of required) {
  try {
    await fs.access(path.join(root, file));
  } catch {
    errors.push(`缺少文件：${file}`);
  }
}

const sources = await collect(path.join(root, 'src'));
sources.push(path.join(root, 'bin/travel-guide.mjs'));
for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${path.relative(root, file)} 语法错误：${result.stderr.trim()}`);
}

const skill = await fs.readFile(path.join(root, 'SKILL.md'), 'utf8');
const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? '';
if (!/^name:\s*travel-guide\s*$/m.test(frontmatter)) errors.push('SKILL.md frontmatter 缺少 name: travel-guide');
if (!/^description:\s*\S/m.test(frontmatter)) errors.push('SKILL.md frontmatter 缺少 description');

for (const file of ['schemas/trip.schema.json', 'schemas/source.schema.json']) {
  try {
    JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  } catch (error) {
    errors.push(`${file} 不是合法 JSON：${error.message}`);
  }
}

if (errors.length) {
  console.error(`lint 失败：${errors.length} 个问题`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`lint 通过：${sources.length} 个源码文件、${required.length} 个必需文件。`);

async function collect(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collect(full));
    else if (entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}
