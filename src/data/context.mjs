import path from 'node:path';
import { Cache } from '../core/cache.mjs';
import { RateLimiter } from '../core/rate-limit.mjs';
import { USER_AGENT } from '../core/http.mjs';

export function createContext(options = {}) {
  const cacheDir = options.cacheDir ?? path.resolve('.travel-guide-cache');
  return {
    cache: options.cache ?? new Cache({
      dir: cacheDir,
      offline: options.offline,
      refresh: options.refresh,
      now: options.now,
    }),
    limiter: options.limiter ?? new RateLimiter(),
    proxy: options.proxy ?? process.env.TRAVEL_GUIDE_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY,
    now: options.now ?? (() => new Date()),
    userAgent: options.userAgent ?? USER_AGENT,
    cacheDir,
    openMeteoBase: options.openMeteoBase,
    nominatimBase: options.nominatimBase,
    overpassBase: options.overpassBase,
  };
}
