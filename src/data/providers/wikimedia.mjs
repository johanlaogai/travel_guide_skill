import { fetchJson, USER_AGENT } from '../../core/http.mjs';
import { cacheKey } from '../../core/cache.mjs';
import { sha256 } from '../../core/ids.mjs';

const DEFAULTS = {
  wikipedia: 'https://zh.wikipedia.org/w/api.php',
  wikivoyage: 'https://zh.wikivoyage.org/w/api.php',
  wikidata: 'https://www.wikidata.org/w/api.php',
  commons: 'https://commons.wikimedia.org/w/api.php',
};

function apiBase(site, ctx) {
  const envKey = `TRAVEL_GUIDE_${site.toUpperCase()}_BASE`;
  return ctx?.[`${site}Base`] ?? process.env[envKey] ?? DEFAULTS[site];
}

async function query(site, params, ctx) {
  const base = apiBase(site, ctx);
  const search = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    ...params,
  });
  const url = `${base}?${search}`;
  const key = cacheKey('wikimedia', url);
  const { value, fromCache } = await ctx.cache.getOrFetch(
    'wikimedia',
    key,
    async () => {
      await ctx.limiter.wait('wikimedia');
      return fetchJson(url, {
        provider: 'wikimedia',
        userAgent: ctx.userAgent ?? USER_AGENT,
        proxy: ctx.proxy,
      });
    },
    { url },
  );
  if (value?.error) throw new Error(`Wikimedia API 错误：${value.error.code ?? ''} ${value.error.info ?? ''}`);
  return { value, url, fromCache, transport: fromCache ? 'cache' : 'live' };
}

export async function extract(title, ctx = {}) {
  const site = ctx.site ?? 'wikipedia';
  const { value, url, fromCache } = await query(site, {
    action: 'query',
    prop: 'extracts|coordinates|pageimages|pageprops',
    titles: title,
    exintro: ctx.intro === false ? '0' : '1',
    explaintext: '1',
    redirects: '1',
    piprop: 'thumbnail',
    pithumbsize: '960',
  }, ctx);
  const page = value?.query?.pages?.[0];
  return {
    page: page
      ? {
          title: page.title,
          extract: page.extract ?? '',
          coordinates: page.coordinates?.[0] ?? null,
          thumbnail: page.thumbnail?.source ?? '',
          pageprops: page.pageprops ?? {},
          fullUrl: `https://${site === 'wikivoyage' ? 'zh.wikivoyage.org' : 'zh.wikipedia.org'}/wiki/${encodeURIComponent(page.title)}`,
        }
      : null,
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
    rawHash: sha256(value),
  };
}

export async function geosearch(lat, lon, ctx = {}) {
  const site = ctx.site ?? 'wikipedia';
  const { value, url, fromCache } = await query(site, {
    action: 'query',
    list: 'geosearch',
    gscoord: `${lat}|${lon}`,
    gsradius: String(Math.min(Math.max(ctx.radius ?? 10000, 500), 10000)),
    gslimit: String(Math.min(Math.max(ctx.limit ?? 20, 1), 50)),
  }, ctx);
  return {
    results: value?.query?.geosearch ?? [],
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
  };
}

export async function wikidataSearch(search, ctx = {}) {
  const { value, url, fromCache } = await query('wikidata', {
    action: 'wbsearchentities',
    search,
    language: ctx.language ?? 'zh',
    uselang: ctx.language ?? 'zh',
    limit: String(Math.min(Math.max(ctx.limit ?? 5, 1), 10)),
  }, ctx);
  return { results: value?.search ?? [], url, fromCache, transport: fromCache ? 'cache' : 'live' };
}

export async function wikidataEntity(id, ctx = {}) {
  const { value, url, fromCache } = await query('wikidata', {
    action: 'wbgetentities',
    ids: id,
    props: 'claims|sitelinks|descriptions|labels',
    languages: 'zh|en',
  }, ctx);
  const entity = value?.entities?.[id];
  if (!entity) return { entity: null, url, fromCache, transport: fromCache ? 'cache' : 'live' };
  const officialWebsite = entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
  return {
    entity: {
      id,
      label: entity.labels?.zh?.value ?? entity.labels?.en?.value ?? id,
      description: entity.descriptions?.zh?.value ?? entity.descriptions?.en?.value ?? '',
      officialWebsite: typeof officialWebsite === 'string' ? officialWebsite : '',
      claims: entity.claims ?? {},
      sitelinks: entity.sitelinks ?? {},
    },
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
  };
}

export async function pageImage(title, ctx = {}) {
  return extract(title, { ...ctx, intro: false });
}
