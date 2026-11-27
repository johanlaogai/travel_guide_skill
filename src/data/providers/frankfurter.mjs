import { fetchJson } from '../../core/http.mjs';
import { cacheKey } from '../../core/cache.mjs';
import { sha256 } from '../../core/ids.mjs';

const DEFAULT_BASE = 'https://api.frankfurter.dev/v1';

export async function latest(base = 'CNY', symbols = ['USD', 'EUR', 'JPY'], ctx = {}) {
  const baseUrl = ctx.baseUrl ?? process.env.TRAVEL_GUIDE_FRANKFURTER_BASE ?? DEFAULT_BASE;
  const params = new URLSearchParams({ base, symbols: symbols.join(',') });
  const url = `${baseUrl}/latest?${params}`;
  const key = cacheKey('frankfurter', url);
  const { value, fromCache } = await ctx.cache.getOrFetch(
    'frankfurter',
    key,
    async () => {
      await ctx.limiter.wait('frankfurter');
      return fetchJson(url, { provider: 'frankfurter', proxy: ctx.proxy });
    },
    { url },
  );
  return {
    base: value.base ?? base,
    date: value.date,
    rates: value.rates ?? {},
    url,
    fromCache,
    transport: fromCache ? 'cache' : 'live',
    rawHash: sha256(value),
  };
}

export async function rate(base, quote, ctx = {}) {
  const result = await latest(base, [quote], ctx);
  const value = result.rates[quote];
  if (!Number.isFinite(value)) throw new Error(`没有 ${base}→${quote} 汇率`);
  return { ...result, quote, rate: value };
}
