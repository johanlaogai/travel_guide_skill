import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  addDays,
  diffDays,
  eachDate,
  endDateForDays,
  formatRangeZh,
  todayInZone,
  weekdayZh,
  zonedDateTimeToUtc,
} from '../src/core/dates.mjs';
import {
  parseAmountToCents,
  settleExpenses,
  splitEvenly,
  summarizeBudget,
} from '../src/core/money.mjs';
import {
  dedupeSources,
  makeSource,
  sourceCoverage,
  validateSource,
} from '../src/core/provenance.mjs';
import { loadTrip } from '../src/core/trip.mjs';
import { validateTrip } from '../src/core/validate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('日期：起止、逐日、星期与跨时区', () => {
  assert.equal(endDateForDays('2026-11-23', 4), '2026-11-26');
  assert.deepEqual(eachDate('2026-11-23', 4), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  assert.deepEqual([weekdayZh('2026-11-23'), weekdayZh('2026-11-26')], ['周一', '周四']);
  assert.equal(diffDays('2026-09-25', '2026-10-07'), 12);
  assert.equal(diffDays('2026-11-23', '2026-11-26') + 1, 4);
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(formatRangeZh('2026-11-28', '2026-11-30'), '2026年11月28日–30日');
  assert.equal(zonedDateTimeToUtc('2026-11-28', '09:00', 'Asia/Shanghai').toISOString(), '2026-11-28T01:00:00.000Z');
  assert.equal(todayInZone('Asia/Shanghai', new Date('2026-11-27T16:30:00Z')), '2026-11-28');
  assert.throws(() => endDateForDays('2026-11-23', 0), /正整数/);
});

test('金额：解析、等分余数与最少转账', () => {
  assert.equal(parseAmountToCents('1,234.5'), 123450);
  assert.equal(parseAmountToCents('¥0.01'), 1);
  assert.deepEqual(splitEvenly(268, ['A', 'B', 'C']), { A: 90, B: 89, C: 89 });
  const summary = settleExpenses([
    { item: '门票', category: 'tickets', amountCents: 10000, payer: 'A', participants: ['A', 'B'] },
    { item: '午餐', category: 'food', amountCents: 5000, payer: 'B', participants: ['B', 'C'] },
  ]);
  assert.equal(summary.totalCents, 15000);
  assert.deepEqual(summary.balances.A, { cents: 5000, amount: 50, label: '应收' });
  assert.deepEqual(summary.balances.B, { cents: -2500, amount: -25, label: '应付' });
  assert.deepEqual(summary.transfers.map((entry) => [entry.from, entry.to, entry.amountCents]), [
    ['B', 'A', 2500],
    ['C', 'A', 2500],
  ]);
  const budget = summarizeBudget([
    { key: 'transport', min: 100, max: 200 },
    { key: 'food', min: 50, max: 50 },
  ]);
  assert.equal(budget.currency, 'CNY');
  assert.equal(budget.minCents, 15000);
  assert.equal(budget.maxCents, 25000);
});

test('来源：稳定 id、校验、去重与覆盖统计', () => {
  const base = {
    provider: 'manual',
    kind: 'note',
    title: '用户提供的行程',
    url: 'manual://user-notes',
    confidence: 'community',
    rawHash: 'abc',
  };
  const first = makeSource({ ...base, retrievedAt: '2026-11-01T00:00:00.000Z' });
  const second = makeSource({ ...base, retrievedAt: '2026-11-02T00:00:00.000Z' });
  assert.equal(first.id, second.id);
  assert.match(first.id, /^src-[a-z0-9-]+$/);
  assert.deepEqual(validateSource(first), []);
  assert.ok(validateSource({ ...first, url: 'javascript:alert(1)' }).length > 0);
  assert.equal(dedupeSources([first, second]).length, 1);
  const coverage = sourceCoverage({
    sources: [first],
    days: [{ items: [{ type: 'anchor', sourceIds: [first.id] }, { type: 'buffer' }] }],
  });
  assert.equal(coverage.anchored, 1);
  assert.equal(coverage.required, 2);
  assert.equal(coverage.sourced, 1);
  assert.equal(coverage.missing, 1);
  assert.equal(coverage.sourcedPct, 50);
});

test('校验：广州示例 strict 通过，缺来源/官方动态事实/无饭点被拦', async () => {
  const trip = await loadTrip(path.join(ROOT, 'examples/guangzhou-3d/trip.json'));
  const options = { strict: true, now: new Date('2026-11-27T00:00:00+08:00'), today: '2026-11-27' };
  const passing = validateTrip(trip, options);
  assert.equal(passing.ok, true, JSON.stringify(passing.errors));

  const missing = structuredClone(trip);
  const anchor = missing.days[0].items.find((item) => item.type === 'anchor');
  anchor.sourceIds = [];
  const missingResult = validateTrip(missing, options);
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.some((error) => error.code === 'ITEM_SOURCE'));

  const dynamic = structuredClone(trip);
  const dynamicAnchor = dynamic.days[0].items.find((item) => item.type === 'anchor');
  dynamicAnchor.openingHours = '09:00–17:00';
  const dynamicResult = validateTrip(dynamic, options);
  assert.equal(dynamicResult.ok, false);
  assert.ok(dynamicResult.errors.some((error) => error.code === 'DYNAMIC_FACT_OFFICIAL'));

  const noMeal = structuredClone(trip);
  noMeal.days[0].items = noMeal.days[0].items.filter((item) => item.type !== 'meal');
  const noMealResult = validateTrip(noMeal, options);
  assert.ok(noMealResult.errors.some((error) => error.code === 'STRICT_NO_MEAL'));
});

test('校验：v0.3 来源完整、guide 与 derived 规则', async () => {
  const trip = await loadTrip(path.join(ROOT, 'tests/fixtures/yunnan-6d.json'));
  const options = { strict: true, now: new Date('2026-11-27T00:00:00+08:00'), today: '2026-11-27' };
  const result = validateTrip(trip, options);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.warnings.some((warning) => warning.code === 'NO_DINNER'));
  const coverage = sourceCoverage(trip);
  assert.equal(coverage.missing, 0);
  assert.equal(coverage.derived, 11);

  const noGuide = structuredClone(trip);
  delete noGuide.overview.guide;
  const noGuideResult = validateTrip(noGuide, options);
  assert.equal(noGuideResult.ok, false);
  assert.ok(noGuideResult.errors.some((error) => error.code === 'STRICT_GUIDE_MISSING'));

  const noHotelSource = structuredClone(trip);
  const hotel = noHotelSource.days.flatMap((day) => day.items).find((item) => item.type === 'hotel');
  hotel.sourceIds = [];
  const hotelResult = validateTrip(noHotelSource, options);
  assert.ok(hotelResult.errors.some((error) => error.code === 'ITEM_SOURCE'));

  const noBufferSource = structuredClone(trip);
  const buffer = noBufferSource.days.flatMap((day) => day.items).find((item) => item.type === 'buffer');
  delete buffer.sourceIds;
  delete buffer.derived;
  delete buffer.derivation;
  const bufferResult = validateTrip(noBufferSource, options);
  assert.ok(bufferResult.errors.some((error) => error.code === 'ITEM_UNSOURCED'));

  const badDerived = structuredClone(trip);
  const anchor = badDerived.days.flatMap((day) => day.items).find((item) => item.type === 'anchor');
  anchor.derived = true;
  anchor.derivation = '不应该这样';
  const derivedResult = validateTrip(badDerived, options);
  assert.ok(derivedResult.errors.some((error) => error.code === 'DERIVED_TYPE'));
});
