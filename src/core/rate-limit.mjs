export const DEFAULT_INTERVALS_MS = {
  'open-meteo': 120,
  nominatim: 1100,
  overpass: 1000,
  wikimedia: 300,
  frankfurter: 250,
  nager: 250,
  tikhub: 1000,
  official: 500,
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  constructor(options = {}) {
    this.intervals = { ...DEFAULT_INTERVALS_MS, ...(options.intervals ?? {}) };
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? sleep;
    this.last = new Map();
  }

  intervalFor(provider) {
    return this.intervals[provider] ?? 250;
  }

  async wait(provider) {
    const interval = this.intervalFor(provider);
    const last = this.last.get(provider) ?? 0;
    const elapsed = this.now() - last;
    if (elapsed < interval) await this.sleep(interval - elapsed);
    this.last.set(provider, this.now());
  }

  reset() {
    this.last.clear();
  }
}

export class Mutex {
  constructor() {
    this.tail = Promise.resolve();
  }

  async run(fn) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
