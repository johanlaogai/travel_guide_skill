import { fetchJson, USER_AGENT } from '../../core/http.mjs';
import { cacheKey } from '../../core/cache.mjs';
import { sha256 } from '../../core/ids.mjs';
import { Mutex } from '../../core/rate-limit.mjs';

const DEFAULT_BASE = 'https://overpass-api.de/api/interpreter';
const overpassMutex = new Mutex();

function base(ctx) {
  return ctx?.baseUrl ?? process.env.TRAVEL_GUIDE_OVERPASS_BASE ?? DEFAULT_BASE;
}

export function buildAroundQuery({ lat, lon, radius = 5000, limit = 30 }) {
  const r = Math.min(Math.max(Number(radius) || 5000, 300), 10000);
  const max = Math.min(Math.max(Number(limit) || 30, 1), 50);
  return `[out:json][timeout:25];
(
  nwr["tourism"~"attraction|museum|viewpoint|zoo|theme_park|artwork|gallery"](around:${r},${lat},${lon});
  nwr["historic"~"memorial|monument|castle|ruins|archaeological_site"](around:${r},${lat},${lon});
  nwr["amenity"~"restaurant|cafe|marketplace|theatre"](around:${r},${lat},${lon});
  nwr["leisure"~"park|garden"](around:${r},${lat},${lon});
);
out center tags ${max};`;
}

export async function around(lat, lon, ctx = {}) {
  const query = buildAroundQuery({ lat, lon, radius: ctx.radius, limit: ctx.limit });
  const url = base(ctx);
  const body = `data=${encodeURIComponent(query)}`;
  const key = cacheKey('overpass', url, query);
  return overpassMutex.run(async () => {
    const { value, fromCache } = await ctx.cache.getOrFetch(
      'overpass',
      key,
      async () => {
        await ctx.limiter.wait('overpass');
        return fetchJson(url, {
          method: 'POST',
          provider: 'overpass',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': ctx.userAgent ?? USER_AGENT,
          },
          body,
          proxy: ctx.proxy,
        });
      },
      { url },
    );
    const elements = Array.isArray(value.elements) ? value.elements : [];
    const pois = elements.map(normalizeElement).filter(Boolean);
    return {
      pois: dedupePois(pois),
      url,
      query,
      fromCache,
      transport: fromCache ? 'cache' : 'live',
      rawHash: sha256(value),
      attribution: 'Data © OpenStreetMap contributors (ODbL)',
    };
  });
}

function normalizeElement(element) {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = tags['name:zh'] ?? tags.name ?? tags['name:en'];
  if (!name) return null;
  const category = tags.tourism ?? tags.historic ?? tags.amenity ?? tags.leisure ?? 'place';
  return {
    osmType: element.type,
    osmId: element.id,
    name,
    nameEn: tags['name:en'] ?? '',
    category,
    lat,
    lon,
    address: tags['addr:full'] ?? [tags['addr:city'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
    openingHours: tags.opening_hours ?? '',
    fee: tags.fee ?? '',
    website: tags.website ?? tags['contact:website'] ?? '',
    wikidata: tags.wikidata ?? '',
    wikipedia: tags.wikipedia ?? '',
    tags,
    raw: element,
  };
}

function dedupePois(pois) {
  const out = [];
  for (const poi of pois) {
    const duplicate = out.find((entry) => {
      if (entry.osmType === poi.osmType && entry.osmId === poi.osmId) return true;
      if (entry.name !== poi.name) return false;
      const dy = (entry.lat - poi.lat) * 111_000;
      const dx = (entry.lon - poi.lon) * 111_000 * Math.cos((entry.lat * Math.PI) / 180);
      return Math.hypot(dx, dy) < 80;
    });
    if (!duplicate) out.push(poi);
  }
  return out;
}

export function buildAroundQueryForTests(options) {
  return buildAroundQuery(options);
}
