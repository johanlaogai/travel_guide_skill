import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './ids.mjs';
import { writeJsonAtomic } from './atomic.mjs';

export const DEFAULT_TTL_MS = {
  'open-meteo': 60 * 60 * 1000,
  'open-meteo-geocode': 30 * 24 * 60 * 60 * 1000,
  'open-meteo-archive': 24 * 60 * 60 * 1000,
  nominatim: 30 * 24 * 60 * 60 * 1000,
  overpass: 7 * 24 * 60 * 60 * 1000,
  wikimedia: 30 * 24 * 60 * 60 * 1000,
  frankfurter: 12 * 60 * 60 * 1000,
  nager: 30 * 24 * 60 * 60 * 1000,
  tikhub: 7 * 24 * 60 * 60 * 1000,
  official: 12 * 60 * 60 * 1000,
};

export class Cache {
  constructor(options = {}) {
    this.dir = options.dir ?? path.resolve('.travel-guide-cache');
    this.offline = Boolean(options.offline);
    this.refresh = Boolean(options.refresh);
    this.now = options.now ?? (() => Date.now());
    this.ttls = { ...DEFAULT_TTL_MS, ...(options.ttls ?? {}) };
    this.stats = { hits: 0, misses: 0, stale: 0, writes: 0 };
  }

  fileFor(provider, key) {
    return path.join(this.dir, provider, `${sha256(key).slice(0, 40)}.json`);
  }

  async get(provider, key, options = {}) {
    if (this.refresh) {
      this.stats.misses += 1;
      return null;
    }
    const file = this.fileFor(provider, key);
    try {
      const raw = JSON.parse(await fs.readFile(file, 'utf8'));
      const ttl = options.ttlMs ?? this.ttls[options.ttlKey ?? provider] ?? 0;
      const age = this.now() - Date.parse(raw.fetchedAt);
      const expired = ttl > 0 && age > ttl;
      if (expired && !this.offline) {
        this.stats.misses += 1;
        return null;
      }
      if (expired && this.offline) this.stats.stale += 1;
      this.stats.hits += 1;
      return { ...raw, stale: expired };
    } catch {
      this.stats.misses += 1;
      return null;
    }
  }

  async set(provider, key, record) {
    const file = this.fileFor(provider, key);
    await writeJsonAtomic(file, {
      provider,
      key,
      fetchedAt: new Date(this.now()).toISOString(),
      ...record,
    });
    this.stats.writes += 1;
  }

  async getOrFetch(provider, key, fetcher, options = {}) {
    const cached = await this.get(provider, key, options);
    if (cached) return { value: cached.body, record: cached, fromCache: true };
    if (this.offline) {
      throw new Error(`离线模式且没有缓存：${provider} ${key}`);
    }
    const value = await fetcher();
    const record = {
      url: options.url ?? '',
      status: 200,
      body: value,
      headers: options.headers ?? {},
    };
    await this.set(provider, key, record);
    return { value, record: { ...record, fetchedAt: new Date(this.now()).toISOString(), stale: false }, fromCache: false };
  }
}

export function cacheKey(provider, url, body = '') {
  return `${provider}|${url}|${body}`;
}
