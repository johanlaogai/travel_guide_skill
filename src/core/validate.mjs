import {
  diffDays,
  eachDate,
  isValidDate,
  isValidTime,
  parseTime,
  todayInZone,
} from './dates.mjs';
import { summarizeBudget } from './money.mjs';
import { scanPii } from './redact.mjs';
import { CONFIDENCES, validateSource, CONFIDENCE_RANK } from './provenance.mjs';

const ITEM_TYPES = new Set(['anchor', 'meal', 'transit', 'rest', 'hotel', 'buffer']);
const TRANSIT_MODES = new Set(['walk', 'metro', 'bus', 'taxi', 'drive', 'train', 'flight', 'other']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

export function validateTrip(trip, options = {}) {
  const errors = [];
  const warnings = [];
  const strict = Boolean(options.strict);
  const publicMode = Boolean(options.publicMode);
  const now = options.now ?? new Date();
  const addError = (code, message, where = '') => errors.push({ code, message, where });
  const addWarning = (code, message, where = '', strictError = false) => {
    warnings.push({ code, message, where, strictError });
  };

  if (!isObject(trip)) {
    return {
      ok: false,
      errors: [{ code: 'TRIP_OBJECT', message: 'trip 必须是对象', where: '' }],
      warnings: [],
      stats: {},
      promoted: [],
    };
  }

  if (trip.schemaVersion !== '0.1') addError('SCHEMA_VERSION', 'schemaVersion 必须是 0.1', 'schemaVersion');
  const meta = trip.meta;
  if (!isObject(meta)) {
    addError('META', '缺少 meta', 'meta');
    return finish();
  }
  if (!isNonEmptyString(meta.id)) addError('META_ID', 'meta.id 不能为空', 'meta.id');
  if (!isNonEmptyString(meta.title)) addError('META_TITLE', 'meta.title 不能为空', 'meta.title');
  const dest = meta.destination;
  if (!isObject(dest) || !isNonEmptyString(dest.name)) {
    addError('DESTINATION', '缺少 meta.destination.name', 'meta.destination');
  } else {
    if (dest.lat != null && !isNum(dest.lat)) addError('DEST_LAT', 'destination.lat 必须是数字', 'meta.destination.lat');
    if (dest.lon != null && !isNum(dest.lon)) addError('DEST_LON', 'destination.lon 必须是数字', 'meta.destination.lon');
    if (dest.lat != null && (dest.lat < -90 || dest.lat > 90)) addError('DEST_LAT_RANGE', 'destination.lat 超出范围', 'meta.destination.lat');
    if (dest.lon != null && (dest.lon < -180 || dest.lon > 180)) addError('DEST_LON_RANGE', 'destination.lon 超出范围', 'meta.destination.lon');
    if (dest.coordSystem && dest.coordSystem !== 'WGS84') {
      addError('COORD_SYSTEM', '坐标必须统一为 WGS84', 'meta.destination.coordSystem');
    }
  }
  if (!isValidDate(meta.startDate)) addError('START_DATE', 'meta.startDate 必须是 YYYY-MM-DD', 'meta.startDate');
  if (!isValidDate(meta.endDate)) addError('END_DATE', 'meta.endDate 必须是 YYYY-MM-DD', 'meta.endDate');
  if (!Number.isInteger(meta.days) || meta.days < 1) addError('DAYS', 'meta.days 必须是正整数', 'meta.days');
  if (!Number.isInteger(meta.travelers) || meta.travelers < 1) addError('TRAVELERS', 'meta.travelers 必须是正整数', 'meta.travelers');
  if (!isObject(meta.budget) || !/^[A-Z]{3}$/.test(String(meta.budget.currency ?? ''))) {
    addError('BUDGET_CURRENCY', 'meta.budget.currency 必须是三位币种', 'meta.budget.currency');
  }

  let dates = [];
  if (isValidDate(meta.startDate) && Number.isInteger(meta.days) && meta.days > 0) {
    dates = eachDate(meta.startDate, meta.days);
    if (isValidDate(meta.endDate) && dates.at(-1) !== meta.endDate) {
      addError('DATE_RANGE', `endDate 应为 ${dates.at(-1)}，实际 ${meta.endDate}`, 'meta.endDate');
    }
  }

  const sources = Array.isArray(trip.sources) ? trip.sources : [];
  const sourceIndex = new Map();
  for (const source of sources) {
    const sourceErrors = validateSource(source);
    for (const message of sourceErrors) addError('SOURCE_INVALID', message, `sources.${source?.id ?? '?'}`);
    if (source?.id) {
      if (sourceIndex.has(source.id)) addError('SOURCE_DUPLICATE', `来源 id 重复：${source.id}`, 'sources');
      sourceIndex.set(source.id, source);
    }
  }
  if (sources.length === 0) {
    addWarning('NO_SOURCES', 'trip.sources 为空；所有动态事实都无法追溯', 'sources', true);
  }

  const days = Array.isArray(trip.days) ? trip.days : [];
  if (days.length !== meta.days) {
    addError('DAYS_LENGTH', `days 数量 ${days.length} 与 meta.days ${meta.days} 不一致`, 'days');
  }
  const itemIds = new Set();
  const today = options.today ?? todayInZone(dest?.timezone ?? 'Asia/Shanghai', now);
  const startOffset = isValidDate(meta.startDate) && isValidDate(today) ? diffDays(today, meta.startDate) : null;

  days.forEach((day, dayIndex) => {
    const where = `days[${dayIndex}]`;
    if (!isObject(day)) {
      addError('DAY_OBJECT', 'day 必须是对象', where);
      return;
    }
    if (dates[dayIndex] && day.date !== dates[dayIndex]) {
      addError('DAY_DATE', `日期应为 ${dates[dayIndex]}，实际 ${day.date}`, `${where}.date`);
    }
    if (!isValidDate(day.date)) addError('DAY_DATE_INVALID', 'day.date 无效', `${where}.date`);
    const items = Array.isArray(day.items) ? day.items : [];
    if (!Array.isArray(day.items)) addError('ITEMS', 'day.items 必须是数组', `${where}.items`);

    const anchors = items.filter((item) => item.type === 'anchor');
    if (anchors.length > 3) {
      addError('TOO_MANY_ANCHORS', `一天最多 3 个锚点，实际 ${anchors.length}`, `${where}.items`);
    }
    const meals = items.filter((item) => item.type === 'meal');
    if (items.length > 0 && meals.length === 0) {
      addWarning('NO_MEAL', '这一天没有安排饭点', `${where}.items`, true);
    } else if (meals.length > 0) {
      const lunch = meals.some((item) => isValidTime(item.start) && parseTime(item.start) >= 11 * 60 && parseTime(item.start) <= 14 * 60);
      const dinner = meals.some((item) => isValidTime(item.start) && parseTime(item.start) >= 17 * 60 && parseTime(item.start) <= 20 * 60 + 30);
      if (!lunch) addWarning('NO_LUNCH', '没有午餐窗口（11:00–14:00）', `${where}.items`, false);
      if (!dinner) addWarning('NO_DINNER', '没有晚餐窗口（17:00–20:30）', `${where}.items`, false);
    }

    const sorted = [...items].sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
    for (let i = 0; i < sorted.length; i += 1) {
      const item = sorted[i];
      const itemWhere = `${where}.items[${i}]`;
      if (!isObject(item)) {
        addError('ITEM_OBJECT', 'item 必须是对象', itemWhere);
        continue;
      }
      if (!isNonEmptyString(item.id)) addError('ITEM_ID', 'item.id 不能为空', itemWhere);
      else if (itemIds.has(item.id)) addError('ITEM_ID_DUPLICATE', `item.id 重复：${item.id}`, itemWhere);
      else itemIds.add(item.id);
      if (!ITEM_TYPES.has(item.type)) addError('ITEM_TYPE', `item.type 无效：${item.type}`, `${itemWhere}.type`);
      if (!isNonEmptyString(item.title)) addError('ITEM_TITLE', 'item.title 不能为空', `${itemWhere}.title`);
      if (!isValidTime(item.start)) addError('ITEM_START', 'item.start 必须是 HH:MM', `${itemWhere}.start`);
      if (!isValidTime(item.end)) addError('ITEM_END', 'item.end 必须是 HH:MM', `${itemWhere}.end`);
      if (isValidTime(item.start) && isValidTime(item.end) && parseTime(item.end) <= parseTime(item.start)) {
        addError('ITEM_TIME_ORDER', 'item.end 必须晚于 item.start', itemWhere);
      }
      if (item.confidence && !CONFIDENCES.includes(item.confidence)) {
        addError('ITEM_CONFIDENCE', `item.confidence 无效：${item.confidence}`, `${itemWhere}.confidence`);
      }
      const place = item.place;
      if (!isObject(place) || !isNonEmptyString(place.name)) {
        if (item.type !== 'buffer' && item.type !== 'rest' && item.type !== 'transit') {
          addError('PLACE', 'item.place.name 不能为空', `${itemWhere}.place`);
        }
      } else {
        if (place.lat != null && !isNum(place.lat)) addError('PLACE_LAT', 'place.lat 必须是数字', `${itemWhere}.place.lat`);
        if (place.lon != null && !isNum(place.lon)) addError('PLACE_LON', 'place.lon 必须是数字', `${itemWhere}.place.lon`);
        if (place.coordSystem && place.coordSystem !== 'WGS84') {
          addError('PLACE_COORD_SYSTEM', 'place.coordSystem 必须是 WGS84', `${itemWhere}.place.coordSystem`);
        }
        if (item.type === 'anchor' && (!isNum(place.lat) || !isNum(place.lon))) {
          addError('ANCHOR_COORDS', '锚点必须有经纬度', `${itemWhere}.place`);
        }
      }
      const sourceIds = Array.isArray(item.sourceIds) ? item.sourceIds : [];
      if ((item.type === 'anchor' || item.type === 'meal') && sourceIds.length === 0) {
        addError('ITEM_SOURCE', '锚点/餐饮必须有 sourceIds', `${itemWhere}.sourceIds`);
      }
      const itemSources = [];
      for (const sourceId of sourceIds) {
        const source = sourceIndex.get(sourceId);
        if (!source) addError('SOURCE_MISSING', `sourceIds 引用了不存在的来源：${sourceId}`, `${itemWhere}.sourceIds`);
        else itemSources.push(source);
      }
      if (!options.allowUnverified && itemSources.length && itemSources.every((s) => s.confidence === 'unverified')) {
        addWarning('ITEM_UNVERIFIED', '该项只有未核实来源', itemWhere, true);
      }
      if (item.booking?.required) {
        const official = itemSources.some((s) => s.provider === 'official' && s.confidence === 'official');
        if (!official && !isHttpUrlLike(item.booking.url)) {
          addError('BOOKING_OFFICIAL', '需要预约的项必须有官方来源或预约 URL', `${itemWhere}.booking`);
        } else if (!official) {
          addWarning('BOOKING_URL_ONLY', '预约项只有 URL，没有官方来源记录', `${itemWhere}.booking`, true);
        }
      }
      for (const field of ['openingHours', 'ticketPrice']) {
        if (item[field] != null || place?.[field] != null) {
          const official = itemSources.some((s) => s.provider === 'official' && s.confidence === 'official');
          if (!official) addError('DYNAMIC_FACT_OFFICIAL', `${field} 只能来自官方来源`, `${itemWhere}.${field}`);
        }
      }
      if (item.cost) {
        if (!isNum(item.cost.amount) || item.cost.amount < 0) addError('COST_AMOUNT', 'cost.amount 必须是非负数字', `${itemWhere}.cost.amount`);
        if (!/^[A-Z]{3}$/.test(String(item.cost.currency ?? meta.budget.currency))) {
          addError('COST_CURRENCY', 'cost.currency 必须是三位币种', `${itemWhere}.cost.currency`);
        }
      }
      if (i > 0) {
        if (!isObject(item.transit)) {
          addError('TRANSIT_MISSING', '与前一项之间缺少 transit', `${itemWhere}.transit`);
        } else {
          if (!TRANSIT_MODES.has(item.transit.mode)) addError('TRANSIT_MODE', `transit.mode 无效：${item.transit.mode}`, `${itemWhere}.transit.mode`);
          if (!isNum(item.transit.durationMin) || item.transit.durationMin < 0) {
            addError('TRANSIT_DURATION', 'transit.durationMin 必须是非负数字', `${itemWhere}.transit.durationMin`);
          }
          if (item.transit.fromPrevious === false) {
            addWarning('TRANSIT_FLAG', '第 2 项之后的 transit 应标记 fromPrevious=true', `${itemWhere}.transit`);
          }
        }
        const prev = sorted[i - 1];
        if (prev && isValidTime(prev.end) && isValidTime(item.start) && isObject(item.transit) && isNum(item.transit.durationMin)) {
          if (parseTime(item.start) < parseTime(prev.end) + item.transit.durationMin) {
            addWarning('TRANSIT_TIGHT', '交通时间与下一项开始时间重叠，建议留缓冲', itemWhere);
          }
        }
      }
    }

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      if (isValidTime(prev.end) && isValidTime(current.start) && parseTime(current.start) < parseTime(prev.end)) {
        addWarning('ITEM_OVERLAP', '相邻项目时间重叠', `${where}.items[${i}]`);
      }
    }

    if (startOffset != null && startOffset >= 0 && startOffset <= 16 && items.length > 0) {
      if (!day.weather || !day.weather.sourceId) {
        addError('WEATHER_MISSING', '16 天内的行程必须带天气来源', `${where}.weather`);
      } else {
        const weatherSource = sourceIndex.get(day.weather.sourceId);
        if (!weatherSource) addError('WEATHER_SOURCE_MISSING', 'day.weather.sourceId 不存在', `${where}.weather.sourceId`);
        else if (weatherSource.provider !== 'open-meteo') {
          addWarning('WEATHER_PROVIDER', '天气来源不是 Open-Meteo', `${where}.weather.sourceId`, true);
        }
      }
    } else if (startOffset != null && startOffset > 16) {
      addWarning('WEATHER_CLIMATE', '行程超过 16 天，只能用气候估算，不能写当天预报', `${where}.weather`);
    }
  });

  if (Array.isArray(trip.budget) && trip.budget.length) {
    try {
      const summary = summarizeBudget(trip.budget, meta.budget.currency);
      if (summary.currency !== meta.budget.currency) {
        addWarning('BUDGET_CURRENCY_MISMATCH', '预算分类币种与 meta 不一致', 'budget');
      }
      if (isNum(meta.budget.totalMin) && meta.budget.totalMin > 0) {
        const diff = Math.abs(meta.budget.totalMin * 100 - summary.minCents);
        if (diff > 100) addWarning('BUDGET_TOTAL', 'meta.budget.totalMin 与分类合计不一致', 'meta.budget.totalMin');
      }
    } catch (error) {
      addError('BUDGET_INVALID', error.message, 'budget');
    }
  } else {
    addWarning('BUDGET_EMPTY', '预算为空', 'budget', true);
  }

  for (const [index, entry] of (trip.bookingChecklist ?? []).entries()) {
    if (entry.required) {
      const refs = (entry.sourceIds ?? []).map((id) => sourceIndex.get(id)).filter(Boolean);
      const official = refs.some((source) => source.provider === 'official' && source.confidence === 'official');
      if (!official && !isHttpUrlLike(entry.url)) {
        addWarning('CHECKLIST_OFFICIAL', '预约清单项需要官方来源或 URL', `bookingChecklist[${index}]`, true);
      }
    }
  }

  if (publicMode) {
    const findings = scanPii(trip);
    if (findings.length) {
      addWarning('PUBLIC_PII', `public 模式检测到 ${findings.length} 处可能的个人信息，将被脱敏`, 'public');
    }
  }

  return finish();

  function finish() {
    const promoted = strict
      ? warnings.filter((warning) => warning.strictError).map((warning) => ({
          code: `STRICT_${warning.code}`,
          message: warning.message,
          where: warning.where,
        }))
      : [];
    const allErrors = [...errors, ...promoted];
    const stats = {
      days: Array.isArray(trip.days) ? trip.days.length : 0,
      items: Array.isArray(trip.days) ? trip.days.reduce((sum, day) => sum + (day.items?.length ?? 0), 0) : 0,
      sources: Array.isArray(trip.sources) ? trip.sources.length : 0,
      officialSources: Array.isArray(trip.sources)
        ? trip.sources.filter((source) => source.confidence === 'official').length
        : 0,
      errors: allErrors.length,
      warnings: warnings.length,
    };
    return {
      ok: allErrors.length === 0,
      errors: allErrors,
      warnings,
      promoted,
      stats,
    };
  }
}

function isHttpUrlLike(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function bestItemConfidence(itemSources) {
  let best = 'unverified';
  for (const source of itemSources) {
    if ((CONFIDENCE_RANK[source.confidence] ?? 0) > (CONFIDENCE_RANK[best] ?? 0)) best = source.confidence;
  }
  return best;
}
