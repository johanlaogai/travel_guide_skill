import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createContext } from '../src/data/context.mjs';
import { Cache } from '../src/core/cache.mjs';
import { RateLimiter } from '../src/core/rate-limit.mjs';
import { parseShareInput } from '../src/data/providers/tikhub.mjs';
import * as openMeteo from '../src/data/providers/open-meteo.mjs';
import * as nominatim from '../src/data/providers/nominatim.mjs';
import * as overpass from '../src/data/providers/overpass.mjs';
import * as wikimedia from '../src/data/providers/wikimedia.mjs';
import * as frankfurter from '../src/data/providers/frankfurter.mjs';
import * as nager from '../src/data/providers/nager.mjs';

let server;
let base;
let cacheDir;
let requests = [];
const envKeys = [
  'TRAVEL_GUIDE_OPEN_METEO_BASE',
  'TRAVEL_GUIDE_OPEN_METEO_GEOCODE_BASE',
  'TRAVEL_GUIDE_OPEN_METEO_ARCHIVE_BASE',
  'TRAVEL_GUIDE_NOMINATIM_BASE',
  'TRAVEL_GUIDE_OVERPASS_BASE',
  'TRAVEL_GUIDE_WIKIPEDIA_BASE',
  'TRAVEL_GUIDE_FRANKFURTER_BASE',
  'TRAVEL_GUIDE_NAGER_BASE',
];
const previousEnv = {};

before(async () => {
  for (const key of envKeys) previousEnv[key] = process.env[key];
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      const url = new URL(req.url, 'http://fixture.local');
      let payload;
      if (url.pathname === '/geocode/v1/search') {
        payload = {
          results: [{
            id: 1809858,
            name: '广州',
            country: '中国',
            country_code: 'CN',
            admin1: '广东省',
            latitude: 23.13,
            longitude: 113.26,
            timezone: 'Asia/Shanghai',
            population: 18000000,
          }],
        };
      } else if (url.pathname === '/meteo/v1/forecast') {
        payload = {
          latitude: 23.13,
          longitude: 113.26,
          timezone: 'Asia/Shanghai',
          daily: {
            time: ['2026-11-28', '2026-11-29'],
            weather_code: [1, 61],
            temperature_2m_max: [26, 22],
            temperature_2m_min: [18, 16],
            precipitation_probability_max: [10, 80],
            precipitation_sum: [0, 3.2],
            sunrise: ['2026-11-28T06:45', '2026-11-29T06:46'],
            sunset: ['2026-11-28T17:40', '2026-11-29T17:40'],
          },
        };
      } else if (url.pathname === '/nominatim/search') {
        payload = [{
          osm_type: 'relation',
          osm_id: 123,
          name: '广州',
          display_name: '广州市, 广东省, 中国',
          lat: '23.13',
          lon: '113.26',
          category: 'boundary',
          type: 'administrative',
          address: { country_code: 'cn', state: '广东省' },
          namedetails: { name: '广州' },
          extratags: {},
        }];
      } else if (url.pathname === '/overpass/api/interpreter') {
        payload = {
          elements: [{
            type: 'node',
            id: 456,
            lat: 23.11,
            lon: 113.24,
            tags: { name: '测试景点', tourism: 'attraction', opening_hours: '09:00-17:00' },
          }],
        };
      } else if (url.pathname === '/wiki/w/api.php') {
        payload = {
          query: {
            pages: [{
              title: '广州',
              extract: '广州是广东省省会。',
              coordinates: [{ lat: 23.13, lon: 113.26 }],
              thumbnail: { source: 'https://example.com/guangzhou.jpg' },
              pageprops: { wikibase_item: 'Q16572' },
            }],
          },
        };
      } else if (url.pathname === '/fx/v1/latest') {
        payload = { base: 'CNY', date: '2026-11-27', rates: { USD: 0.15, EUR: 0.14 } };
      } else if (url.pathname === '/nager/PublicHolidays/2026/CN') {
        payload = [{ date: '2026-10-01', localName: '国庆节', name: 'National Day' }];
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-guide-cache-'));

  process.env.TRAVEL_GUIDE_OPEN_METEO_BASE = `${base}/meteo`;
  process.env.TRAVEL_GUIDE_OPEN_METEO_GEOCODE_BASE = `${base}/geocode`;
  process.env.TRAVEL_GUIDE_OPEN_METEO_ARCHIVE_BASE = `${base}/meteo`;
  process.env.TRAVEL_GUIDE_NOMINATIM_BASE = `${base}/nominatim`;
  process.env.TRAVEL_GUIDE_OVERPASS_BASE = `${base}/overpass/api/interpreter`;
  process.env.TRAVEL_GUIDE_WIKIPEDIA_BASE = `${base}/wiki/w/api.php`;
  process.env.TRAVEL_GUIDE_FRANKFURTER_BASE = `${base}/fx/v1`;
  process.env.TRAVEL_GUIDE_NAGER_BASE = `${base}/nager`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(cacheDir, { recursive: true, force: true });
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

function context() {
  return createContext({
    cacheDir,
    proxy: '',
    now: () => Date.parse('2026-11-27T00:00:00.000Z'),
    limiter: new RateLimiter({ sleep: async () => {} }),
  });
}

test('Open-Meteo：地理编码、预报与缓存命中', async () => {
  requests = [];
  const ctx = context();
  const geo = await openMeteo.geocode('广州', { ...ctx, countryCode: 'CN' });
  assert.equal(geo.results[0].name, '广州');
  assert.equal(geo.results[0].lat, 23.13);
  assert.equal(geo.transport, 'live');

  const weather = await openMeteo.forecast({
    lat: 23.13,
    lon: 113.26,
    startDate: '2026-11-28',
    endDate: '2026-11-29',
    timezone: 'Asia/Shanghai',
  }, ctx);
  assert.equal(weather.days[0].tempMax, 26);
  assert.equal(weather.days[1].weatherCode, 61);
  assert.equal(weather.days[1].precipitationProbability, 80);

  const cached = await openMeteo.forecast({
    lat: 23.13,
    lon: 113.26,
    startDate: '2026-11-28',
    endDate: '2026-11-29',
    timezone: 'Asia/Shanghai',
  }, ctx);
  assert.equal(cached.fromCache, true);
  assert.equal(requests.filter((entry) => entry.url.includes('/v1/forecast')).length, 1);
});

test('Nominatim：端点、UA、语言与限制参数', async () => {
  requests = [];
  const result = await nominatim.search('广州', { ...context(), limit: 3 });
  assert.equal(result.results[0].displayName, '广州市, 广东省, 中国');
  assert.equal(result.results[0].osmId, 123);
  const request = requests.find((entry) => entry.url.startsWith('/nominatim/search'));
  assert.ok(request);
  assert.match(request.headers['user-agent'], /^travel-guide-skill\/0\.1/);
  const url = new URL(request.url, base);
  assert.equal(url.searchParams.get('accept-language'), 'zh-CN');
  assert.equal(url.searchParams.get('limit'), '3');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
});

test('Overpass：POST 查询、单连接包装与 POI 归一化', async () => {
  requests = [];
  const result = await overpass.around(23.13, 113.26, { ...context(), radius: 1000, limit: 5 });
  assert.equal(result.pois[0].name, '测试景点');
  assert.equal(result.pois[0].category, 'attraction');
  assert.match(result.attribution, /OpenStreetMap/);
  const request = requests.find((entry) => entry.url === '/overpass/api/interpreter');
  assert.equal(request.method, 'POST');
  assert.match(request.headers['content-type'], /x-www-form-urlencoded/);
  assert.match(request.body, /data=/);
  assert.match(decodeURIComponent(request.body), /around:1000/);
});

test('Wikimedia、Frankfurter、Nager：解析与归属字段', async () => {
  const ctx = context();
  const wiki = await wikimedia.extract('广州', ctx);
  assert.equal(wiki.page.title, '广州');
  assert.match(wiki.page.extract, /广东省省会/);
  assert.equal(wiki.page.coordinates.lat, 23.13);

  const fx = await frankfurter.rate('CNY', 'USD', { ...ctx, baseUrl: `${base}/fx/v1` });
  assert.equal(fx.rate, 0.15);
  const holidays = await nager.publicHolidays(2026, 'CN', { ...ctx, baseUrl: `${base}/nager` });
  assert.equal(holidays.holidays[0].localName, '国庆节');
});

test('TikHub：只解析分享输入，不联网、不扣费', () => {
  assert.equal(parseShareInput('https://www.xiaohongshu.com/explore/0123456789abcdef01234567').noteId, '0123456789abcdef01234567');
  assert.equal(parseShareInput('0123456789abcdef01234567').noteId, '0123456789abcdef01234567');
  assert.throws(() => parseShareInput('https://evil.example.com/explore/0123456789abcdef01234567'), /小红书|xiaohongshu|xhslink/);
});

test('缓存 TTL 与限速器：离线命中、过期重取、间隔等待', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-guide-cache-unit-'));
  let now = Date.parse('2026-11-27T00:00:00.000Z');
  let calls = 0;
  const cache = new Cache({ dir, now: () => now, ttls: { demo: 1000 } });
  await cache.getOrFetch('demo', 'key', async () => { calls += 1; return { value: calls }; }, { ttlKey: 'demo' });
  await cache.getOrFetch('demo', 'key', async () => { calls += 1; return { value: calls }; }, { ttlKey: 'demo' });
  assert.equal(calls, 1);
  now += 2000;
  await cache.getOrFetch('demo', 'key', async () => { calls += 1; return { value: calls }; }, { ttlKey: 'demo' });
  assert.equal(calls, 2);

  let clock = 0;
  const slept = [];
  const limiter = new RateLimiter({
    now: () => clock,
    sleep: async (ms) => { slept.push(ms); clock += ms; },
  });
  await limiter.wait('nominatim');
  clock += 10;
  await limiter.wait('nominatim');
  assert.deepEqual(slept, [1100, 1090]);
  await fs.rm(dir, { recursive: true, force: true });
});
