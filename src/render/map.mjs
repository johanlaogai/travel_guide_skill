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

/**
 * The map shell is intentionally tiny: Leaflet is initialized client-side.
 * Keeping the shell in static HTML means the page still has useful fallback
 * content when JavaScript or the tile service is unavailable.
 */
export function renderMap(trip) {
  const points = collectPoints(trip);
  if (!points.length) {
    return {
      empty: true,
      points: 0,
      html: `<div class="map-empty">
        <div class="map-empty-icon" aria-hidden="true">◇</div>
        <p>还没有可落图的地点。</p>
        <p class="muted">给行程项补上经纬度后，这里会显示真实地图。</p>
      </div>`,
    };
  }

  const fallback = points
    .slice(0, 12)
    .map((point) => {
      const label = `${point.placeName || point.title}（Day ${point.dayIndex + 1} · ${TYPE_LABELS[point.type] ?? point.type}）`;
      const query = encodeURIComponent(`${point.placeName || point.title} ${trip.meta.destination.name}`);
      return `<li><span>${escapeHtml(label)}</span>
        <a href="https://www.openstreetmap.org/?mlat=${Number(point.lat)}&mlon=${Number(point.lon)}#map=16/${Number(point.lat)}/${Number(point.lon)}" target="_blank" rel="noopener noreferrer" data-external>OSM</a>
        <a href="https://www.amap.com/search?query=${escapeAttr(query)}" target="_blank" rel="noopener noreferrer" data-external>高德</a>
      </li>`;
    })
    .join('');

  return {
    empty: false,
    points: points.length,
    html: `<div id="trip-map" class="trip-map" role="application" aria-label="行程地图，共 ${points.length} 个地点"></div>
      <div class="map-loading" id="map-loading"><span class="map-loading-dot" aria-hidden="true"></span><span>正在加载真实地图…</span></div>
      <div class="map-feedback" id="map-feedback" role="status" hidden></div>
      <noscript>
        <div class="map-noscript">
          <p>地图需要 JavaScript。可以先用下面的地点链接：</p>
          <ul>${fallback}</ul>
        </div>
      </noscript>`,
  };
}

export function collectPoints(trip) {
  const points = [];
  (trip.days ?? []).forEach((day, dayIndex) => {
    for (const item of day.items ?? []) {
      const place = item.place;
      if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
      points.push({
        id: item.id,
        title: item.title,
        placeName: place.name,
        address: place.address,
        type: item.type,
        start: item.start,
        end: item.end,
        dayIndex,
        dayTitle: day.title,
        lat: place.lat,
        lon: place.lon,
      });
    }
  });
  return points;
}
