import { parse } from './helpers.mjs';
import {
  addDays,
  diffDays,
  eachDate,
  endDateForDays,
  formatDateZh,
  formatRangeZh,
  isWeekend,
  parseDate,
  weekdayZh,
} from '../core/dates.mjs';
import { UsageError } from '../core/errors.mjs';
import { createContext } from '../data/context.mjs';
import * as nager from '../data/providers/nager.mjs';

export async function run(argv) {
  const { values } = parse('dates', argv, {
    start: { type: 'string' },
    days: { type: 'string', default: '3' },
    end: { type: 'string' },
    holidays: { type: 'string' },
    cache: { type: 'string' },
    offline: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  });
  if (!values.start) throw new UsageError('缺少 --start（YYYY-MM-DD）');
  parseDate(values.start);
  let days = Number(values.days);
  if (values.end) days = diffDays(values.start, values.end) + 1;
  if (!Number.isInteger(days) || days < 1) throw new UsageError('--days 必须是正整数');
  const end = values.end ?? endDateForDays(values.start, days);
  if (diffDays(values.start, end) !== days - 1) throw new UsageError('--start/--days/--end 不一致');

  const dates = eachDate(values.start, days);
  const weekendDays = dates.filter(isWeekend);
  const weekdayDays = dates.filter((date) => !isWeekend(date));
  let holidays = [];
  let warnings = [];
  if (values.holidays) {
    const ctx = createContext({
      cacheDir: values.cache,
      offline: values.offline,
      now: () => new Date(),
    });
    try {
      const result = await nager.publicHolidays(Number(values.start.slice(0, 4)), values.holidays.toUpperCase(), ctx);
      holidays = result.holidays.filter((holiday) => holiday.date >= values.start && holiday.date <= end);
    } catch (error) {
      warnings.push(`假期数据获取失败：${error.message}`);
    }
  }
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const leaveDays = dates.filter((date) => !isWeekend(date) && !holidayDates.has(date));
  const result = {
    start: values.start,
    end,
    days,
    weekday: weekdayZh(values.start),
    dates: dates.map((date) => ({
      date,
      weekday: weekdayZh(date),
      weekend: isWeekend(date),
      holiday: holidayDates.has(date),
    })),
    weekendDays: weekendDays.length,
    weekdayDays: weekdayDays.length,
    holidays,
    leaveDays: leaveDays.length,
    leaveDates: leaveDays,
    warnings,
  };

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  console.log(`${formatRangeZh(values.start, end)} · ${days} 天`);
  console.log(`周末 ${weekendDays.length} 天，工作日 ${weekdayDays.length} 天${holidays.length ? `，公共假期 ${holidays.length} 天` : ''}`);
  console.log('');
  for (const entry of result.dates) {
    console.log(`${entry.date} ${entry.weekday}${entry.weekend ? ' · 周末' : ''}${entry.holiday ? ' · 假期' : ''}`);
  }
  if (values.holidays) {
    console.log(`\n若全程出行，需请假 ${leaveDays.length} 天：${leaveDays.join('、') || '无'}`);
    if (holidays.length) {
      console.log('假期：');
      for (const holiday of holidays) console.log(`  ${holiday.date} ${holiday.localName ?? holiday.name}`);
    }
  } else {
    console.log('\n加 --holidays CN 可查公共假期并估算请假天数。');
  }
  for (const warning of warnings) console.log(`⚠ ${warning}`);
  return 0;
}
