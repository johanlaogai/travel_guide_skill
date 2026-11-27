const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAYS_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

export function parseDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error('Invalid Date');
    return { year: input.getUTCFullYear(), month: input.getUTCMonth() + 1, day: input.getUTCDate() };
  }
  const match = DATE_RE.exec(String(input ?? ''));
  if (!match) throw new Error(`日期格式必须是 YYYY-MM-DD：${input}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    throw new Error(`不存在的日期：${input}`);
  }
  return { year, month, day };
}

export function isValidDate(input) {
  try {
    parseDate(input);
    return true;
  } catch {
    return false;
  }
}

export function dateFromUtc(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function dateToUtc(input) {
  const { year, month, day } = parseDate(input);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(input, days) {
  const d = dateToUtc(input);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return dateFromUtc(d);
}

export function diffDays(start, end) {
  const a = dateToUtc(start).getTime();
  const b = dateToUtc(end).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function endDateForDays(start, days) {
  if (!Number.isInteger(days) || days < 1) throw new Error(`天数必须是正整数：${days}`);
  return addDays(start, days - 1);
}

export function eachDate(start, days) {
  if (!Number.isInteger(days) || days < 1) throw new Error(`天数必须是正整数：${days}`);
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

export function weekdayZh(input) {
  return WEEKDAYS_ZH[dateToUtc(input).getUTCDay()];
}

export function weekdayShort(input) {
  return WEEKDAYS_SHORT[dateToUtc(input).getUTCDay()];
}

export function isWeekend(input) {
  const day = dateToUtc(input).getUTCDay();
  return day === 0 || day === 6;
}

export function formatDateZh(input, options = {}) {
  const { year, month, day } = parseDate(input);
  const withYear = options.withYear !== false;
  return withYear ? `${year}年${month}月${day}日` : `${month}月${day}日`;
}

export function formatRangeZh(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.year === e.year && s.month === e.month) {
    return `${s.year}年${s.month}月${s.day}日–${e.day}日`;
  }
  if (s.year === e.year) {
    return `${s.year}年${s.month}月${s.day}日–${e.month}月${e.day}日`;
  }
  return `${formatDateZh(start)}–${formatDateZh(end)}`;
}

export function parseTime(input) {
  const match = TIME_RE.exec(String(input ?? ''));
  if (!match) throw new Error(`时间格式必须是 HH:MM：${input}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTime(input) {
  try {
    parseTime(input);
    return true;
  } catch {
    return false;
  }
}

export function timeFromMinutes(total) {
  const n = ((Number(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export function durationMinutes(start, end) {
  return parseTime(end) - parseTime(start);
}

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

export function timezoneOffsetMinutes(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - date.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

export function zonedDateTimeToUtc(dateStr, timeStr, timeZone = 'Asia/Shanghai') {
  const { year, month, day } = parseDate(dateStr);
  const [hour, minute] = String(timeStr).split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = timezoneOffsetMinutes(timeZone, new Date(guess));
  let result = new Date(guess - offset * 60_000);
  const offset2 = timezoneOffsetMinutes(timeZone, result);
  if (offset2 !== offset) {
    offset = offset2;
    result = new Date(guess - offset * 60_000);
  }
  return result;
}

export function todayInZone(timeZone = 'Asia/Shanghai', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function assertDateRange(start, end, days) {
  parseDate(start);
  parseDate(end);
  if (diffDays(start, end) !== days - 1) {
    throw new Error(`日期范围与天数不一致：${start} → ${end}，${days} 天`);
  }
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = parseTime(aStart);
  const ae = parseTime(aEnd);
  const bs = parseTime(bStart);
  const be = parseTime(bEnd);
  return as < be && bs < ae;
}
