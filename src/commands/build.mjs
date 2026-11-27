import path from 'node:path';
import {
  parse,
  requireOption,
  nowFrom,
  printJson,
  formatIssue,
  shortPath,
} from './helpers.mjs';
import { loadTrip } from '../core/trip.mjs';
import { validateTrip } from '../core/validate.mjs';
import { publicTrip } from '../core/redact.mjs';
import { replaceDirAtomic, writeJsonAtomic, writeTextAtomic } from '../core/atomic.mjs';
import { sha256 } from '../core/ids.mjs';
import { sourceCoverage } from '../core/provenance.mjs';
import { UsageError } from '../core/errors.mjs';
import { renderHtml } from '../render/html.mjs';
import { buildMarkdown, buildSourcesMarkdown } from '../render/markdown.mjs';
import { buildIcs } from '../render/ics.mjs';

const VERSION = '0.3.0';

export async function run(argv) {
  const { values } = parse('build', argv, {
    trip: { type: 'string' },
    out: { type: 'string' },
    public: { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
    'allow-unverified': { type: 'boolean', default: false },
    now: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const tripPath = path.resolve(requireOption(values, 'trip', '缺少 --trip'));
  const outDir = path.resolve(values.out ?? path.join(path.dirname(tripPath), 'dist'));
  const tripDir = path.dirname(tripPath);
  if (outDir === tripDir) {
    throw new UsageError('--out 不能是 trip.json 所在目录；请使用子目录，例如 dist/');
  }
  if (tripPath.startsWith(`${outDir}${path.sep}`)) {
    throw new UsageError('--out 不能包含 trip.json；请换一个输出目录，避免覆盖源文件');
  }

  const now = nowFrom(values.now);
  const trip = await loadTrip(tripPath);
  const validation = validateTrip(trip, {
    strict: values.strict,
    allowUnverified: values['allow-unverified'],
    publicMode: values.public,
    now,
  });
  if (!validation.ok) {
    if (values.json) {
      console.log(JSON.stringify({ ok: false, tripPath, outDir, errors: validation.errors, warnings: validation.warnings }, null, 2));
    } else {
      console.log(`✖ build 中止：${validation.errors.length} 个错误`);
      for (const issue of validation.errors) console.log(`  - ${formatIssue(issue)}`);
      if (validation.warnings.length) {
        console.log(`\n⚠ ${validation.warnings.length} 个提醒`);
        for (const issue of validation.warnings) console.log(`  - ${formatIssue(issue)}`);
      }
      console.log('\n先运行 check 修复；草稿/示例可加 --allow-unverified。');
    }
    return 1;
  }

  const outputTrip = values.public ? publicTrip(trip) : trip;
  let html;
  let markdown;
  let sourcesMarkdown;
  let ics;
  await replaceDirAtomic(outDir, async (tempDir) => {
    html = await renderHtml(outputTrip, { now, publicMode: values.public });
    markdown = buildMarkdown(outputTrip);
    sourcesMarkdown = buildSourcesMarkdown(outputTrip);
    ics = buildIcs(outputTrip, { now });
    const receipt = makeReceipt({
      trip,
      outputTrip,
      tripPath,
      outDir,
      validation,
      html,
      markdown,
      sourcesMarkdown,
      ics,
      now,
      publicMode: values.public,
      strict: values.strict,
    });
    await Promise.all([
      writeTextAtomic(path.join(tempDir, 'index.html'), html),
      writeTextAtomic(path.join(tempDir, 'itinerary.md'), markdown),
      writeTextAtomic(path.join(tempDir, 'sources.md'), sourcesMarkdown),
      writeTextAtomic(path.join(tempDir, 'trip.ics'), ics),
      writeJsonAtomic(path.join(tempDir, 'build-receipt.json'), receipt),
    ]);
  });

  const coverage = sourceCoverage(outputTrip);
  const receiptPath = path.join(outDir, 'build-receipt.json');
  const result = {
    ok: true,
    tripPath: shortPath(tripPath),
    outDir: shortPath(outDir),
    files: ['index.html', 'itinerary.md', 'sources.md', 'trip.ics', 'build-receipt.json'].map((name) => path.join(shortPath(outDir), name)),
    publicMode: values.public,
    strict: values.strict,
    warnings: validation.warnings.length,
    coverage,
    receiptPath: shortPath(receiptPath),
  };
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  console.log(`✓ 已生成 ${shortPath(outDir)}`);
  for (const name of ['index.html', 'itinerary.md', 'sources.md', 'trip.ics', 'build-receipt.json']) {
    console.log(`  ${name}`);
  }
  console.log(`\n来源：${coverage.sources} 条 / 官方 ${coverage.official} / 覆盖 ${coverage.sourced}/${coverage.required} 有来源 · ${coverage.derived} 条估算 · ${coverage.missing} 条缺失`);
  if (validation.warnings.length) {
    console.log(`⚠ ${validation.warnings.length} 个提醒，详见 build-receipt.json 或 sources.md`);
  }
  if (!values.public) console.log('分享前可用 --public 脱敏个人信息。');
  return 0;
}

function makeReceipt({
  trip,
  outputTrip,
  tripPath,
  outDir,
  validation,
  html,
  markdown,
  sourcesMarkdown,
  ics,
  now,
  publicMode,
  strict,
}) {
  const coverage = sourceCoverage(outputTrip);
  const transports = {};
  for (const source of outputTrip.sources ?? []) {
    transports[source.provider] ??= {};
    transports[source.provider][source.transport] = (transports[source.provider][source.transport] ?? 0) + 1;
  }
  return {
    schemaVersion: '0.1',
    version: VERSION,
    builtAt: now.toISOString(),
    trip: {
      path: tripPath,
      id: trip.meta.id,
      title: trip.meta.title,
      hash: sha256(JSON.stringify(trip)),
    },
    publicMode,
    strict,
    outputs: {
      'index.html': sha256(html),
      'itinerary.md': sha256(markdown),
      'sources.md': sha256(sourcesMarkdown),
      'trip.ics': sha256(ics),
    },
    counts: {
      days: outputTrip.days.length,
      items: coverage.items,
      anchors: coverage.anchored,
      required: coverage.required,
      sources: coverage.sources,
      officialSources: coverage.official,
      sourcedAnchors: coverage.sourced,
      derived: coverage.derived,
      missing: coverage.missing,
      sourcedPct: coverage.sourcedPct,
    },
    providerTransports: transports,
    warnings: validation.warnings,
    errors: validation.errors,
  };
}
