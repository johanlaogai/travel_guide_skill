import { fetchJson } from '../../core/http.mjs';
import { cacheKey } from '../../core/cache.mjs';
import { sha256 } from '../../core/ids.mjs';

const DEFAULT_BASE = 'https://date.nager.at/api/v3';

export async function publicHolidays(year, country = 'CN', ctx = {}) {
  const baseUrl = ctx.baseUrl ?? process.env.TRAVEL_GUIDE_NAGER_BASE ?? DEFAULT_BASE;
  const url = `${baseUrl}/PublicHolidays/${year}/${country}`;
  const key = cacheKey('nager', url);
  const { value, fromCache } = await ctx.cache.getOrFetch(
    'nager',
    key,
    async () => {
      await ctx.limiter.wait('nager');
      return fetchJson(url, { provider: 'nager', proxy: ctx.proxy });
    },
    { url },
  );
  return {
    holidays: Array.isArray(value) ? value : [],
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
    rawHash: sha256(value),
  };
}
