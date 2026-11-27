import { fetchJson, USER_AGENT } from '../../core/http.mjs';
import { cacheKey } from '../../core/cache.mjs';

const DEFAULT_BASE = 'https://nominatim.openstreetmap.org';

function base(ctx) {
  return ctx?.baseUrl ?? process.env.TRAVEL_GUIDE_NOMINATIM_BASE ?? DEFAULT_BASE;
}

function normalize(entry) {
  return {
    osmType: entry.osm_type,
    osmId: entry.osm_id,
    name: entry.namedetails?.name ?? entry.name ?? entry.display_name?.split(',')[0] ?? '',
    displayName: entry.display_name,
    lat: Number(entry.lat),
    lon: Number(entry.lon),
    category: entry.category ?? entry.class,
    type: entry.type,
    address: entry.address ?? {},
    namedetails: entry.namedetails ?? {},
    extratags: entry.extratags ?? {},
    boundingbox: entry.boundingbox,
    raw: entry,
  };
}

export async function search(query, ctx = {}) {
  const baseUrl = base(ctx);
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    limit: String(Math.min(Math.max(ctx.limit ?? 5, 1), 10)),
    'accept-language': ctx.language ?? 'zh-CN',
  });
  if (ctx.countryCode) params.set('countrycodes', String(ctx.countryCode).toLowerCase());
  if (ctx.viewbox) params.set('viewbox', ctx.viewbox);
  if (ctx.bounded) params.set('bounded', '1');
  const url = `${baseUrl}/search?${params}`;
  const key = cacheKey('nominatim', url);
  const { value, fromCache } = await ctx.cache.getOrFetch(
    'nominatim',
    key,
    async () => {
      await ctx.limiter.wait('nominatim');
      return fetchJson(url, {
        provider: 'nominatim',
        userAgent: ctx.userAgent ?? USER_AGENT,
        proxy: ctx.proxy,
      });
    },
    { url },
  );
  return {
    results: (Array.isArray(value) ? value : []).map(normalize),
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
  };
}

export async function reverse(lat, lon, ctx = {}) {
  const baseUrl = base(ctx);
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    'accept-language': ctx.language ?? 'zh-CN',
  });
  const url = `${baseUrl}/reverse?${params}`;
  const key = cacheKey('nominatim', url);
  const { value, fromCache } = await ctx.cache.getOrFetch(
    'nominatim',
    key,
    async () => {
      await ctx.limiter.wait('nominatim');
      return fetchJson(url, {
        provider: 'nominatim',
        userAgent: ctx.userAgent ?? USER_AGENT,
        proxy: ctx.proxy,
      });
    },
    { url },
  );
  return {
    result: value?.error ? null : normalize(value),
    error: value?.error,
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
  };
}

export async function lookup(osmIds, ctx = {}) {
  const baseUrl = base(ctx);
  const params = new URLSearchParams({
    osm_ids: osmIds.join(','),
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    'accept-language': ctx.language ?? 'zh-CN',
  });
  const url = `${baseUrl}/lookup?${params}`;
  const key = cacheKey('nominatim', url);
  const { value, fromCache } = await ctx.cache.getOrFetch(
    'nominatim',
    key,
    async () => {
      await ctx.limiter.wait('nominatim');
      return fetchJson(url, {
        provider: 'nominatim',
        userAgent: ctx.userAgent ?? USER_AGENT,
        proxy: ctx.proxy,
      });
    },
    { url },
  );
  return {
    results: (Array.isArray(value) ? value : []).map(normalize),
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
  };
}

export { DEFAULT_BASE as NOMINATIM_BASE };
