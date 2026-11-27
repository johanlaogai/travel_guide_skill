import { parse, requireOption, nowFrom, formatIssue } from './helpers.mjs';
import { loadTrip } from '../core/trip.mjs';
import { validateTrip } from '../core/validate.mjs';
import { sourceCoverage } from '../core/provenance.mjs';

export async function run(argv) {
  const { values } = parse('check', argv, {
    trip: { type: 'string' },
    strict: { type: 'boolean', default: false },
    'allow-unverified': { type: 'boolean', default: false },
    public: { type: 'boolean', default: false },
    now: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const tripPath = requireOption(values, 'trip', '缺少 --trip');
  const trip = await loadTrip(tripPath);
  const result = validateTrip(trip, {
    strict: values.strict,
    allowUnverified: values['allow-unverified'],
    publicMode: values.public,
    now: nowFrom(values.now),
  });
  const coverage = sourceCoverage(trip);
  const output = {
    ok: result.ok,
    tripPath,
    strict: values.strict,
    errors: result.errors,
    warnings: result.warnings,
    stats: { ...result.stats, coverage },
  };
  if (values.json) {
    console.log(JSON.stringify(output, null, 2));
    return result.ok ? 0 : 1;
  }
  if (result.errors.length) {
    console.log(`✖ ${result.errors.length} 个错误`);
    for (const issue of result.errors) console.log(`  - ${formatIssue(issue)}`);
  } else {
    console.log('✓ 硬规则通过');
  }
  if (result.warnings.length) {
    console.log(`\n⚠ ${result.warnings.length} 个提醒${values.strict ? '（strict 模式下带 * 的会升级为错误）' : ''}`);
    for (const issue of result.warnings) {
      console.log(`  - ${issue.strictError ? '* ' : ''}${formatIssue(issue)}`);
    }
  }
  console.log(`\n${coverage.items} 个项目 / ${coverage.anchored} 个锚点餐饮 / ${coverage.sources} 条来源 / 官方 ${coverage.official}`);
  console.log(`来源覆盖：${coverage.sourced}/${coverage.anchored}（${coverage.sourcedPct}%）`);
  if (!result.ok) {
    console.log('\n先修错误，再 build。正式行程请用 --strict。');
    return 1;
  }
  console.log('\n下一步：node bin/travel-guide.mjs build --trip ' + tripPath + ' --out <dir>');
  return 0;
}
