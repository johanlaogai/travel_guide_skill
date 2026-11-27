import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from './helpers.mjs';
import { createTripSkeleton } from '../core/trip.mjs';
import { endDateForDays, diffDays, formatRangeZh, weekdayZh, parseDate } from '../core/dates.mjs';
import { slugify } from '../core/ids.mjs';
import { UsageError } from '../core/errors.mjs';

export async function run(argv) {
  const { values } = parse('init', argv, {
    destination: { type: 'string' },
    start: { type: 'string' },
    days: { type: 'string', default: '3' },
    end: { type: 'string' },
    travelers: { type: 'string', default: '1' },
    budget: { type: 'string', default: 'mid' },
    currency: { type: 'string', default: 'CNY' },
    title: { type: 'string' },
    country: { type: 'string', default: 'CN' },
    timezone: { type: 'string', default: 'Asia/Shanghai' },
    out: { type: 'string' },
    force: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  });

  if (!values.destination) throw new UsageError('缺少 --destination');
  if (!values.start) throw new UsageError('缺少 --start（YYYY-MM-DD）');
  parseDate(values.start);

  let days = Number(values.days);
  if (values.end) {
    if (!Number.isInteger(days) || values.days === '3') {
      days = diffDays(values.start, values.end) + 1;
    }
  }
  if (!Number.isInteger(days) || days < 1) throw new UsageError('--days 必须是正整数');
  if (values.end && endDateForDays(values.start, days) !== values.end) {
    throw new UsageError(`--start/--days 与 --end 不一致：${values.start} + ${days} 天 ≠ ${values.end}`);
  }
  if (!['low', 'mid', 'high'].includes(values.budget)) throw new UsageError('--budget 必须是 low/mid/high');
  const travelers = Number(values.travelers);
  if (!Number.isInteger(travelers) || travelers < 1) throw new UsageError('--travelers 必须是正整数');

  const outDir = path.resolve(values.out ?? path.join('trips', `${slugify(values.destination)}-${values.start}`));
  const tripPath = path.join(outDir, 'trip.json');
  try {
    await fs.access(tripPath);
    if (!values.force) throw new UsageError(`已存在 ${tripPath}；加 --force 覆盖`);
  } catch (error) {
    if (error instanceof UsageError) throw error;
  }

  const trip = createTripSkeleton({
    destination: values.destination,
    startDate: values.start,
    days,
    travelers,
    budgetLevel: values.budget,
    currency: values.currency.toUpperCase(),
    title: values.title,
    country: values.country.toUpperCase(),
    timezone: values.timezone,
  });
  trip.meta.endDate = endDateForDays(values.start, days);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(tripPath, `${JSON.stringify(trip, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(outDir, 'expenses.csv'),
    'date,item,category,amount,currency,payer,participants,note,source\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(outDir, 'README.md'),
    `# ${trip.meta.title}\n\n- 日期：${formatRangeZh(trip.meta.startDate, trip.meta.endDate)}（${trip.days.map((day) => `${day.date} ${weekdayZh(day.date)}`).join('、')}）\n- 人数：${trip.meta.travelers}\n- 预算：${trip.meta.budget.currency} / ${trip.meta.budget.level}\n\n下一步：\n\n\`\`\`bash\nnode bin/travel-guide.mjs enrich --trip ${path.basename(outDir)}/trip.json\nnode bin/travel-guide.mjs check --trip ${path.basename(outDir)}/trip.json --strict\nnode bin/travel-guide.mjs build --trip ${path.basename(outDir)}/trip.json --out ${path.basename(outDir)}/dist\n\`\`\`\n`,
    'utf8',
  );

  const result = {
    tripPath,
    outDir,
    days,
    startDate: trip.meta.startDate,
    endDate: trip.meta.endDate,
    travelers,
  };
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`✓ 已创建 ${tripPath}`);
    console.log(`  ${formatRangeZh(trip.meta.startDate, trip.meta.endDate)} · ${days} 天 · ${travelers} 人`);
    console.log(`\n下一步：\n  node bin/travel-guide.mjs enrich --trip ${tripPath}`);
    console.log(`  node bin/travel-guide.mjs check --trip ${tripPath} --strict`);
  }
  return 0;
}
