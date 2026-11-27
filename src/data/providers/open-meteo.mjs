import { fetchJson } from '../../core/http.mjs';
import { cacheKey } from '../../core/cache.mjs';
import { sha256 } from '../../core/ids.mjs';

const DEFAULT_BASE = 'https://api.open-meteo.com';
const DEFAULT_GEOCODE_BASE = 'https://geocoding-api.open-meteo.com';
const DEFAULT_ARCHIVE_BASE = 'https://archive-api.open-meteo.com';

function base(options, key, fallback) {
  return options?.[key] ?? process.env[key] ?? fallback;
}

export async function geocode(name, ctx = {}) {
  const baseUrl = base(ctx, 'TRAVEL_GUIDE_OPEN_METEO_GEOCODE_BASE', DEFAULT_GEOCODE_BASE);
  const params = new URLSearchParams({
    name,
    count: String(ctx.count ?? 5),
    language: ctx.language ?? 'zh',
    format: 'json',
  });
  if (ctx.countryCode) params.set('countryCode', ctx.countryCode);
  const url = `${baseUrl}/v1/search?${params}`;
  const key = cacheKey('open-meteo', url);
  const { value, record, fromCache } = await ctx.cache.getOrFetch(
    'open-meteo',
    key,
    async () => {
      await ctx.limiter.wait('open-meteo');
      return fetchJson(url, { provider: 'open-meteo', proxy: ctx.proxy });
    },
    { ttlKey: 'open-meteo-geocode', url },
  );
  const results = (value.results ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    country: entry.country,
    countryCode: entry.country_code,
    admin1: entry.admin1,
    admin2: entry.admin2,
    lat: entry.latitude,
    lon: entry.longitude,
    timezone: entry.timezone,
    population: entry.population,
    elevation: entry.elevation,
    sourceUrl: url,
    raw: entry,
  }));
  return { results, url, fromCache, transport: fromCache ? (record.stale ? 'cache' : 'cache') : 'live' };
}

export async function forecast({ lat, lon, startDate, endDate, timezone = 'auto' }, ctx = {}) {
  const baseUrl = base(ctx, 'TRAVEL_GUIDE_OPEN_METEO_BASE', DEFAULT_BASE);
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'sunrise',
      'sunset',
    ].join(','),
    timezone,
    start_date: startDate,
    end_date: endDate,
  });
  const url = `${baseUrl}/v1/forecast?${params}`;
  const key = cacheKey('open-meteo', url);
  const { value, record, fromCache } = await ctx.cache.getOrFetch(
    'open-meteo',
    key,
    async () => {
      await ctx.limiter.wait('open-meteo');
      return fetchJson(url, { provider: 'open-meteo', proxy: ctx.proxy });
    },
    { ttlKey: 'open-meteo', url },
  );
  const daily = value.daily ?? {};
  const days = (daily.time ?? []).map((date, index) => ({
    date,
    weatherCode: daily.weather_code?.[index] ?? null,
    tempMax: daily.temperature_2m_max?.[index] ?? null,
    tempMin: daily.temperature_2m_min?.[index] ?? null,
    precipitationProbability: daily.precipitation_probability_max?.[index] ?? null,
    precipitationSum: daily.precipitation_sum?.[index] ?? null,
    sunrise: daily.sunrise?.[index] ?? null,
    sunset: daily.sunset?.[index] ?? null,
  }));
  return {
    days,
    timezone: value.timezone ?? timezone,
    latitude: value.latitude ?? lat,
    longitude: value.longitude ?? lon,
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
    rawHash: sha256(value),
  };
}

export async function archive({ lat, lon, startDate, endDate, timezone = 'auto' }, ctx = {}) {
  const baseUrl = base(ctx, 'TRAVEL_GUIDE_OPEN_METEO_ARCHIVE_BASE', DEFAULT_ARCHIVE_BASE);
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone,
  });
  const url = `${baseUrl}/v1/archive?${params}`;
  const key = cacheKey('open-meteo', url);
  const { value, fromCache } = await ctx.cache.getOrFetch(
    'open-meteo',
    key,
    async () => {
      await ctx.limiter.wait('open-meteo');
      return fetchJson(url, { provider: 'open-meteo', proxy: ctx.proxy });
    },
    { ttlKey: 'open-meteo-archive', url },
  );
  const daily = value.daily ?? {};
  return {
    days: (daily.time ?? []).map((date, index) => ({
      date,
      weatherCode: daily.weather_code?.[index] ?? null,
      tempMax: daily.temperature_2m_max?.[index] ?? null,
      tempMin: daily.temperature_2m_min?.[index] ?? null,
      precipitationSum: daily.precipitation_sum?.[index] ?? null,
      climate: true,
    })),
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
    rawHash: sha256(value),
  };
}

export const WEATHER_CODES = {
  0: { label: '晴', icon: 'sun' },
  1: { label: '大致晴朗', icon: 'sun' },
  2: { label: '局部多云', icon: 'cloud-sun' },
  3: { label: '阴', icon: 'cloud' },
  45: { label: '雾', icon: 'fog' },
  48: { label: '雾凇', icon: 'fog' },
  51: { label: '小毛毛雨', icon: 'drizzle' },
  53: { label: '毛毛雨', icon: 'drizzle' },
  55: { label: '大毛毛雨', icon: 'drizzle' },
  56: { label: '冻毛毛雨', icon: 'drizzle' },
  57: { label: '强冻毛毛雨', icon: 'drizzle' },
  61: { label: '小雨', icon: 'rain' },
  63: { label: '中雨', icon: 'rain' },
  65: { label: '大雨', icon: 'rain' },
  66: { label: '冻雨', icon: 'rain' },
  67: { label: '强冻雨', icon: 'rain' },
  71: { label: '小雪', icon: 'snow' },
  73: { label: '中雪', icon: 'snow' },
  75: { label: '大雪', icon: 'snow' },
  77: { label: '雪粒', icon: 'snow' },
  80: { label: '阵雨', icon: 'rain' },
  81: { label: '中等阵雨', icon: 'rain' },
  82: { label: '强阵雨', icon: 'rain' },
  85: { label: '阵雪', icon: 'snow' },
  86: { label: '强阵雪', icon: 'snow' },
  95: { label: '雷阵雨', icon: 'storm' },
  96: { label: '雷阵雨伴冰雹', icon: 'storm' },
  99: { label: '强雷暴伴冰雹', icon: 'storm' },
};

export function weatherLabel(code) {
  return WEATHER_CODES[code]?.label ?? '天气未知';
}

export function weatherIcon(code) {
  return WEATHER_CODES[code]?.icon ?? 'cloud';
}
