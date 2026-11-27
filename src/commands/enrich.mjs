import { parse, requireOption } from './helpers.mjs';
import { enrichTrip } from '../data/enrich.mjs';

export async function run(argv) {
  const { values } = parse('enrich', argv, {
    trip: { type: 'string' },
    offline: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
    radius: { type: 'string' },
    'max-pois': { type: 'string' },
    proxy: { type: 'string' },
    cache: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const tripPath = requireOption(values, 'trip', '缺少 --trip');
  const result = await enrichTrip(tripPath, {
    offline: values.offline,
    refresh: values.refresh,
    radius: values.radius ? Number(values.radius) : undefined,
    maxPois: values['max-pois'] ? Number(values['max-pois']) : undefined,
    proxy: values.proxy,
    cacheDir: values.cache,
  });
  if (values.json) {
    console.log(JSON.stringify({
      tripPath,
      added: result.added,
      warnings: result.warnings,
      cacheDir: result.cacheDir,
      destination: result.trip.meta.destination,
      discoveries: result.trip.discoveries.length,
    }, null, 2));
    return 0;
  }
  console.log(`✓ enrich 完成：${tripPath}`);
  console.log(`  来源 +${result.added.sources}，天气 ${result.added.weatherDays} 天，候选地点 +${result.added.discoveries}`);
  console.log(`  缓存：${result.cacheDir}`);
  for (const warning of result.warnings) console.log(`⚠ ${warning}`);
  console.log('\n下一步：核对官方信息，写 days/items，然后 check --strict。');
  return 0;
}
