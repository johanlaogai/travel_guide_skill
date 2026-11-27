import { stableId } from './ids.mjs';

export const PROVIDERS = [
  'open-meteo',
  'nominatim',
  'overpass',
  'wikimedia',
  'official',
  'frankfurter',
  'nager',
  'tikhub',
  'manual',
];

export const SOURCE_KINDS = [
  'weather',
  'geocode',
  'poi',
  'wiki',
  'official',
  'ugc',
  'fx',
  'holiday',
  'note',
  'lodging',
  'transport',
  'route',
  'culture',
  'food',
  'photo',
  'safety',
];

export const TRANSPORTS = ['live', 'cache', 'snapshot', 'manual'];

export const CONFIDENCES = ['official', 'verified', 'forecast', 'community', 'estimate', 'unverified'];

export const CONFIDENCE_RANK = {
  official: 6,
  verified: 5,
  forecast: 4,
  community: 3,
  estimate: 2,
  unverified: 1,
};

export const CONFIDENCE_LABELS = {
  official: '官方',
  verified: '已验证',
  forecast: '预报',
  community: '社区',
  estimate: '估算',
  unverified: '待核实',
};

export const PROVIDER_LABELS = {
  'open-meteo': 'Open-Meteo',
  nominatim: 'Nominatim / OSM',
  overpass: 'Overpass / OSM',
  wikimedia: 'Wikimedia',
  official: '官方',
  frankfurter: 'Frankfurter',
  nager: 'Nager.Date',
  tikhub: 'TikHub / 小红书',
  manual: '手动录入',
};

export const LICENSE_BY_PROVIDER = {
  'open-meteo': 'CC BY 4.0',
  nominatim: 'ODbL 1.0',
  overpass: 'ODbL 1.0',
  wikimedia: 'CC BY-SA 4.0',
  official: '官方页面条款',
  frankfurter: 'ECB reference rates',
  nager: 'MIT / public data',
  tikhub: 'third-party API; platform terms apply',
  manual: 'user-provided',
};

export function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isManualUrl(value) {
  return typeof value === 'string' && value.startsWith('manual://');
}

export function makeSource({
  provider,
  kind,
  title,
  url,
  retrievedAt = new Date().toISOString(),
  transport = 'live',
  license,
  confidence = 'community',
  rawHash,
  note,
  label = '',
  extra = {},
}) {
  if (!PROVIDERS.includes(provider)) throw new Error(`未知 provider：${provider}`);
  if (!SOURCE_KINDS.includes(kind)) throw new Error(`未知 source kind：${kind}`);
  if (!TRANSPORTS.includes(transport)) throw new Error(`未知 transport：${transport}`);
  if (!CONFIDENCES.includes(confidence)) throw new Error(`未知 confidence：${confidence}`);
  const id = stableId('src', provider, kind, url ?? title, rawHash ?? '');
  return {
    id,
    provider,
    kind,
    title: title ?? '',
    url: url ?? '',
    retrievedAt,
    transport,
    license: license ?? LICENSE_BY_PROVIDER[provider] ?? '',
    confidence,
    rawHash: rawHash ?? '',
    note: note ?? '',
    label: label ?? '',
    ...extra,
  };
}

export function validateSource(source) {
  const errors = [];
  if (!source || typeof source !== 'object') return ['source 必须是对象'];
  if (!/^src-[a-z0-9-]+$/.test(String(source.id ?? ''))) errors.push('source.id 格式无效');
  if (!PROVIDERS.includes(source.provider)) errors.push(`未知 provider：${source.provider}`);
  if (!SOURCE_KINDS.includes(source.kind)) errors.push(`未知 source kind：${source.kind}`);
  if (!TRANSPORTS.includes(source.transport)) errors.push(`未知 transport：${source.transport}`);
  if (!CONFIDENCES.includes(source.confidence)) errors.push(`未知 confidence：${source.confidence}`);
  if (source.url && !isHttpUrl(source.url) && !isManualUrl(source.url)) {
    errors.push(`source.url 必须是 http(s) 或 manual://：${source.url}`);
  }
  if (!source.retrievedAt || Number.isNaN(Date.parse(source.retrievedAt))) {
    errors.push('source.retrievedAt 必须是可解析的 ISO 时间');
  }
  if (!source.license) errors.push('source.license 不能为空');
  if (source.label != null && (typeof source.label !== 'string' || source.label.length > 80)) {
    errors.push('source.label 必须是不超过 80 字的字符串');
  }
  return errors;
}

export function sourceIndex(trip) {
  const map = new Map();
  for (const source of trip.sources ?? []) {
    if (!source?.id) continue;
    map.set(source.id, source);
  }
  return map;
}

export function resolveSourceIds(trip, ids = []) {
  const index = sourceIndex(trip);
  return ids.map((id) => index.get(id)).filter(Boolean);
}

export function bestConfidence(sources) {
  let best = 'unverified';
  for (const source of sources) {
    if ((CONFIDENCE_RANK[source.confidence] ?? 0) > (CONFIDENCE_RANK[best] ?? 0)) {
      best = source.confidence;
    }
  }
  return best;
}

export function hasConfidence(sources, minimum) {
  const min = CONFIDENCE_RANK[minimum] ?? 0;
  return sources.some((source) => (CONFIDENCE_RANK[source.confidence] ?? 0) >= min);
}

export function sourceCoverage(trip) {
  const sources = trip.sources ?? [];
  const byProvider = {};
  const byConfidence = {};
  for (const source of sources) {
    byProvider[source.provider] = (byProvider[source.provider] ?? 0) + 1;
    byConfidence[source.confidence] = (byConfidence[source.confidence] ?? 0) + 1;
  }
  const items = (trip.days ?? []).flatMap((day) => day.items ?? []);
  const required = items.filter((item) => item.type !== 'rest');
  const hasSource = (item) => (item.sourceIds ?? []).length > 0;
  const sourced = required.filter(hasSource);
  const derived = required.filter((item) => item.derived === true);
  const missing = required.filter((item) => !hasSource(item) && item.derived !== true);
  const byType = {};
  for (const item of required) {
    const type = item.type ?? 'unknown';
    byType[type] ??= { required: 0, sourced: 0, derived: 0, missing: 0 };
    byType[type].required += 1;
    if (hasSource(item)) byType[type].sourced += 1;
    if (item.derived === true) byType[type].derived += 1;
    if (!hasSource(item) && item.derived !== true) byType[type].missing += 1;
  }
  const anchored = items.filter((item) => item.type === 'anchor' || item.type === 'meal');
  const official = sources.filter((source) => source.confidence === 'official');
  const guide = trip.overview?.guide ?? {};
  const guideBlocks = [
    ...(guide.intro ? [guide.intro] : []),
    ...(guide.sections ?? []),
    ...(guide.food ?? []),
    ...(guide.photoSpots ?? []),
    ...(guide.pitfalls ?? []),
    ...(guide.tips ?? []),
  ];
  const guideSourced = guideBlocks.filter((block) => (block.sourceIds ?? []).length > 0);
  return {
    sources: sources.length,
    byProvider,
    byConfidence,
    items: items.length,
    required: required.length,
    anchored: anchored.length,
    sourced: sourced.length,
    derived: derived.length,
    missing: missing.length,
    missingByType: byType,
    official: official.length,
    sourcedPct: required.length ? Math.round((sourced.length / required.length) * 100) : 100,
    guideBlocks: guideBlocks.length,
    guideSourced: guideSourced.length,
    guideMissing: guideBlocks.length - guideSourced.length,
  };
}

export function dedupeSources(sources) {
  const seen = new Set();
  const out = [];
  for (const source of sources) {
    const key = source.id || `${source.provider}|${source.url}|${source.retrievedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

export function sourceLabel(source) {
  if (source?.label) return source.label;
  return `${PROVIDER_LABELS[source.provider] ?? source.provider} · ${CONFIDENCE_LABELS[source.confidence] ?? source.confidence}`;
}
