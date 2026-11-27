import { escapeAttr, escapeHtml } from './sources.mjs';

export const DAY_COLORS = ['#0f766e', '#b45309', '#4338ca', '#be123c', '#0369a1', '#4d7c0f'];

const TYPE_LABELS = {
  anchor: '景点',
  meal: '餐饮',
  transit: '交通',
  rest: '休息',
  hotel: '住宿',
  buffer: '缓冲',
};

export function renderMap(trip) {
  const width = 720;
  const height = 520;
  const pad = 48;
  const points = collectPoints(trip);
  if (!points.length) {
    return {
      empty: true,
      points: 0,
      svg: `<div class="map-empty">
        <div class="map-empty-icon" aria-hidden="true">◇</div>
        <p>还没有可落图的地点。</p>
        <p class="muted">给锚点补上 WGS84 经纬度，或先运行 <code>enrich</code>。</p>
      </div>`,
    };
  }
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  if (maxLat - minLat < 0.008) {
    const mid = (minLat + maxLat) / 2;
    minLat = mid - 0.004;
    maxLat = mid + 0.004;
  }
  if (maxLon - minLon < 0.008) {
    const mid = (minLon + maxLon) / 2;
    minLon = mid - 0.004;
    maxLon = mid + 0.004;
  }
  const centerLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((centerLat * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * lonScale, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const project = (lat, lon) => ({
    x: pad + ((lon - minLon) * lonScale / spanX) * innerW,
    y: pad + ((maxLat - lat) / spanY) * innerH,
  });

  const dayGroups = new Map();
  for (const point of points) {
    if (!dayGroups.has(point.dayIndex)) dayGroups.set(point.dayIndex, []);
    dayGroups.get(point.dayIndex).push(point);
  }

  const routes = [];
  const markers = [];
  for (const [dayIndex, dayPoints] of [...dayGroups.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...dayPoints].sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
    const projected = sorted.map((point) => project(point.lat, point.lon));
    if (projected.length > 1) {
      const d = projected.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      routes.push(`<path class="map-route day-c${dayIndex + 1}" d="${d}" />`);
    }
    sorted.forEach((point, index) => {
      const p = project(point.lat, point.lon);
      const anchor = point.type === 'anchor';
      const label = `${point.placeName || point.title}（${TYPE_LABELS[point.type] ?? point.type}）`;
      markers.push(`<g class="map-marker ${anchor ? 'is-anchor' : ''} day-c${dayIndex + 1}" data-item-id="${escapeAttr(point.id)}" data-day="${dayIndex + 1}" data-type="${escapeAttr(point.type)}" data-name="${escapeAttr(point.placeName || point.title)}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})" role="button" tabindex="0" aria-label="${escapeAttr(label)}">
        <title>${escapeHtml(label)} · ${escapeHtml(point.start ?? '')}</title>
        <circle class="marker-halo" r="${anchor ? 18 : 14}" />
        <circle class="marker-body" r="${anchor ? 10 : 8}" />
        <text class="marker-index" text-anchor="middle" dy="${anchor ? 4 : 3}">${index + 1}</text>
      </g>`);
    });
  }

  const kmPerPx = (spanY * 111) / innerH;
  const scaleKm = chooseScale(kmPerPx * 90);
  const scalePx = (scaleKm / 111) / spanY * innerH;
  const latRange = `${minLat.toFixed(3)}–${maxLat.toFixed(3)}`;
  const svg = `<svg id="map-svg" class="map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="行程地图，共 ${points.length} 个地点">
    <defs>
      <pattern id="map-grid" width="36" height="36" patternUnits="userSpaceOnUse">
        <path d="M 36 0 L 0 0 0 36" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" class="map-bg" />
    <rect width="${width}" height="${height}" fill="url(#map-grid)" />
    <g id="map-viewport">
      <g class="map-routes">${routes.join('')}</g>
      <g class="map-markers">${markers.join('')}</g>
    </g>
    <g class="map-compass" transform="translate(${width - 46} 42)" aria-hidden="true">
      <circle r="16" />
      <path d="M0 -10 L4 4 L0 1 L-4 4 Z" />
      <text y="-21" text-anchor="middle">N</text>
    </g>
    <g class="map-scale" transform="translate(${pad} ${height - 28})" aria-hidden="true">
      <path d="M0 0 H${scalePx.toFixed(0)}" />
      <path d="M0 -4 V4 M${scalePx.toFixed(0)} -4 V4" />
      <text x="${(scalePx / 2).toFixed(0)}" y="-8" text-anchor="middle">${scaleKm >= 1 ? `${scaleKm} km` : `${Math.round(scaleKm * 1000)} m`}</text>
    </g>
  </svg>`;
  return { svg, points: points.length, bounds: { minLat, maxLat, minLon, maxLon }, latRange };
}

function collectPoints(trip) {
  const points = [];
  (trip.days ?? []).forEach((day, dayIndex) => {
    for (const item of day.items ?? []) {
      const place = item.place;
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
      points.push({
        id: item.id,
        title: item.title,
        placeName: place.name,
        type: item.type,
        start: item.start,
        dayIndex,
        lat: place.lat,
        lon: place.lon,
      });
    }
  });
  return points;
}

function chooseScale(targetKm) {
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  return candidates.reduce((best, value) => (
    Math.abs(value - targetKm) < Math.abs(best - targetKm) ? value : best
  ), candidates[0]);
}
