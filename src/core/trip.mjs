import path from 'node:path';
import { readJson, writeJsonAtomic } from './atomic.mjs';
import { eachDate, endDateForDays, weekdayZh, parseDate } from './dates.mjs';
import { slugify } from './ids.mjs';

export function createTripSkeleton(options) {
  const {
    destination,
    startDate,
    days,
    travelers = 1,
    budgetLevel = 'mid',
    currency = 'CNY',
    title,
    country = 'CN',
    timezone = 'Asia/Shanghai',
    origin = '',
    pace = 'balanced',
    interests = [],
    constraints = [],
  } = options;
  parseDate(startDate);
  const endDate = endDateForDays(startDate, days);
  const dates = eachDate(startDate, days);
  const id = `${slugify(destination)}-${days}d-${startDate.replaceAll('-', '')}`;
  return {
    schemaVersion: '0.1',
    meta: {
      id,
      title: title ?? `${destination} ${days} 天行程`,
      destination: {
        name: destination,
        country,
        admin1: '',
        lat: null,
        lon: null,
        timezone,
        coordSystem: 'WGS84',
      },
      origin,
      startDate,
      endDate,
      days,
      travelers,
      budget: {
        currency,
        level: budgetLevel,
        totalMin: null,
        totalMax: null,
      },
      pace,
      interests,
      constraints,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generator: 'travel-guide/0.1.0',
    },
    overview: {
      summary: '',
      background: '',
      highlights: [],
      risks: [],
    },
    days: dates.map((date) => ({
      date,
      weekday: weekdayZh(date),
      title: '',
      area: '',
      weather: null,
      items: [],
    })),
    discoveries: [],
    budget: [
      { key: 'transport', label: '交通', min: 0, max: 0, currency },
      { key: 'lodging', label: '住宿', min: 0, max: 0, currency },
      { key: 'food', label: '餐饮', min: 0, max: 0, currency },
      { key: 'tickets', label: '门票', min: 0, max: 0, currency },
      { key: 'other', label: '其他', min: 0, max: 0, currency },
    ],
    packing: defaultPacking(),
    bookingChecklist: [],
    emergency: {
      contacts: [],
      notes: ['中国报警 110，急救 120，火警 119；境外请查当地紧急电话。'],
    },
    sources: [],
    provenance: {
      policyVersion: '0.1',
      lastCheckedAt: null,
    },
  };
}

export function defaultPacking() {
  return [
    { id: 'pack-id', label: '身份证/护照', category: '证件', essential: true },
    { id: 'pack-phone', label: '手机与充电器', category: '电子', essential: true },
    { id: 'pack-power', label: '充电宝（随身，不托运）', category: '电子', essential: true },
    { id: 'pack-cash', label: '少量现金与银行卡', category: '支付', essential: true },
    { id: 'pack-med', label: '常用药/创可贴', category: '健康', essential: true },
    { id: 'pack-umbrella', label: '折叠伞/雨衣', category: '天气', essential: false },
    { id: 'pack-shoes', label: '好走的鞋', category: '衣物', essential: true },
    { id: 'pack-bottle', label: '水杯', category: '日用', essential: false },
  ];
}

export async function loadTrip(filePath) {
  const trip = await readJson(filePath);
  return normalizeTrip(trip);
}

export function normalizeTrip(trip) {
  if (!trip || typeof trip !== 'object') throw new Error('trip.json 必须是对象');
  trip.schemaVersion ??= '0.1';
  trip.meta ??= {};
  trip.meta.destination ??= {};
  trip.meta.destination.coordSystem ??= 'WGS84';
  trip.meta.budget ??= { currency: 'CNY', level: 'mid' };
  trip.meta.budget.currency ??= 'CNY';
  trip.overview ??= { summary: '', highlights: [], risks: [] };
  trip.overview.highlights ??= [];
  trip.overview.risks ??= [];
  trip.days ??= [];
  trip.discoveries ??= [];
  trip.budget ??= [];
  trip.packing ??= [];
  trip.bookingChecklist ??= [];
  trip.emergency ??= { contacts: [], notes: [] };
  trip.sources ??= [];
  trip.provenance ??= { policyVersion: '0.1', lastCheckedAt: null };
  for (const day of trip.days) {
    day.items ??= [];
    day.weather ??= null;
  }
  return trip;
}

export async function saveTrip(filePath, trip) {
  trip.meta.updatedAt = new Date().toISOString();
  await writeJsonAtomic(filePath, trip);
}

export function allItems(trip) {
  return (trip.days ?? []).flatMap((day) => (day.items ?? []).map((item) => ({ ...item, date: day.date })));
}

export function tripDirFor(filePath) {
  return path.dirname(filePath);
}

export function itemById(trip, id) {
  return allItems(trip).find((item) => item.id === id);
}
