(() => {
  'use strict';

  const DAY_COLORS = ['#0f766e', '#b45309', '#4338ca', '#be123c', '#0369a1', '#4d7c0f'];
  const STORE_KEY = 'tg:basemap';
  const TILE_PROVIDERS = {
    esri: {
      label: 'Esri 街道',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
    },
    amap: {
      label: '高德中文',
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      maxZoom: 18,
      subdomains: '1234',
      attribution: '&copy; 高德地图',
    },
    osm: {
      label: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    },
  };

  const PI = Math.PI;
  const A = 6378245.0;
  const EE = 0.00669342162296594323;

  function outOfChina(lat, lon) {
    return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function transformLon(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }
  function wgs84ToGcj02(lat, lon) {
    if (outOfChina(lat, lon)) return [lat, lon];
    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLon = transformLon(lon - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    return [lat + dLat, lon + dLon];
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }
  const escapeAttr = (value) => escapeHtml(value).replaceAll('\n', ' ');

  function init(trip, { onFocus } = {}) {
    const container = document.getElementById('trip-map');
    if (!container) return null;
    const feedback = document.getElementById('map-feedback');
    const loading = document.getElementById('map-loading');
    if (!window.L) {
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = '地图脚本未能加载；可以先用下方链接打开地点。';
      }
      loading?.classList.add('is-done');
      return null;
    }

    let currentTrip = trip;
    let basemap = 'esri';
    try {
      const stored = localStorage.getItem(STORE_KEY);
      if (stored && TILE_PROVIDERS[stored]) basemap = stored;
    } catch { /* ignore */ }

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false,
      minZoom: 2,
      maxZoom: 19,
      worldCopyJump: true,
    }).setView([34.5, 105.0], 4);

    let tileLayer = null;
    let tileErrors = 0;
    let layers = [];
    let markerById = new Map();
    let routeByDay = new Map();
    let filter = { day: 'all', type: 'all', visibleIds: new Set(), filtering: false };

    const select = document.getElementById('basemap-select');
    if (select) {
      select.value = basemap;
      select.addEventListener('change', () => setBasemap(select.value));
    }

    document.querySelectorAll('[data-map-zoom]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.mapZoom === 'reset') resetView();
        else if (button.dataset.mapZoom === 'in') map.zoomIn();
        else map.zoomOut();
      });
    });

    function setBasemap(next) {
      if (!TILE_PROVIDERS[next]) next = 'esri';
      basemap = next;
      try { localStorage.setItem(STORE_KEY, next); } catch { /* ignore */ }
      if (select) select.value = next;
      if (tileLayer) map.removeLayer(tileLayer);
      tileErrors = 0;
      if (feedback) feedback.hidden = true;
      const provider = TILE_PROVIDERS[next];
      tileLayer = L.tileLayer(provider.url, {
        maxZoom: provider.maxZoom,
        subdomains: provider.subdomains || 'abc',
        attribution: provider.attribution,
        crossOrigin: true,
      });
      tileLayer.on('tileerror', () => {
        tileErrors += 1;
        if (tileErrors === 3 && feedback) {
          feedback.hidden = false;
          feedback.textContent = `底图「${provider.label}」加载较慢或不可达，可在右上角切换 Esri / 高德 / OSM。`;
        }
      });
      tileLayer.addTo(map);
      renderLayers();
      resetView();
      setTimeout(() => loading?.classList.add('is-done'), 650);
    }

    function coordinates(place) {
      const lat = Number(place.lat);
      const lon = Number(place.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (basemap === 'amap') {
        const [gcjLat, gcjLon] = wgs84ToGcj02(lat, lon);
        return [gcjLat, gcjLon];
      }
      return [lat, lon];
    }

    function pointsForTrip() {
      const points = [];
      (currentTrip.days ?? []).forEach((day, dayIndex) => {
        for (const item of day.items ?? []) {
          const coords = coordinates(item.place ?? {});
          if (!coords) continue;
          points.push({ item, dayIndex, coords });
        }
      });
      return points;
    }

    function renderLayers() {
      layers.forEach((layer) => map.removeLayer(layer));
      layers = [];
      markerById = new Map();
      routeByDay = new Map();
      const points = pointsForTrip();
      const byDay = new Map();
      for (const point of points) {
        if (!byDay.has(point.dayIndex)) byDay.set(point.dayIndex, []);
        byDay.get(point.dayIndex).push(point);
      }

      for (const [dayIndex, dayPoints] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
        const sorted = [...dayPoints].sort((a, b) => String(a.item.start ?? '').localeCompare(String(b.item.start ?? '')));
        const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
        if (sorted.length > 1) {
          const route = L.polyline(sorted.map((point) => point.coords), {
            color,
            weight: 2.4,
            opacity: 0.62,
            dashArray: '5 7',
            lineCap: 'round',
            interactive: false,
          }).addTo(map);
          layers.push(route);
          routeByDay.set(dayIndex, route);
        }
        sorted.forEach((point, index) => {
          const { item, coords } = point;
          const label = `${dayIndex + 1}-${index + 1}`;
          const icon = L.divIcon({
            className: `map-pin day-c${dayIndex + 1}`,
            html: `<span class="map-pin-inner"><span>${index + 1}</span></span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14],
          });
          const marker = L.marker(coords, {
            icon,
            title: item.title,
            alt: `${item.title}（Day ${dayIndex + 1}）`,
            keyboard: true,
            riseOnHover: true,
          }).addTo(map);
          marker.bindPopup(`<span class="map-popup-title">${escapeHtml(item.title)}</span>
            <span class="map-popup-meta">Day ${dayIndex + 1} · ${escapeHtml(item.start ?? '')}${item.place?.name ? ` · ${escapeHtml(item.place.name)}` : ''}</span>
            <a class="map-popup-link" href="#item-${escapeAttr(item.id)}" data-focus-item="${escapeAttr(item.id)}">定位到行程卡片</a>`);
          marker.on('click', () => onFocus?.(item.id, { source: 'map' }));
          markerById.set(item.id, { marker, dayIndex, type: item.type ?? 'other' });
          layers.push(marker);
          marker.__label = label;
        });
      }

      if (select && TILE_PROVIDERS[basemap]) select.value = basemap;
      applyFilter(filter);
    }

    function allBounds() {
      const points = pointsForTrip();
      if (!points.length) return null;
      return L.latLngBounds(points.map((point) => point.coords));
    }

    function resetView() {
      const bounds = allBounds();
      if (!bounds) {
        map.setView([34.5, 105.0], 4);
        return;
      }
      if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
        map.setView(bounds.getCenter(), 13);
      } else {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      }
      setTimeout(() => map.invalidateSize(), 50);
    }

    function applyFilter(next) {
      const previousDay = filter.day;
      filter = {
        day: next?.day ?? 'all',
        type: next?.type ?? 'all',
        visibleIds: next?.visibleIds instanceof Set ? next.visibleIds : new Set(),
        filtering: Boolean(next?.filtering),
      };
      for (const [id, entry] of markerById) {
        const dayMatch = filter.day === 'all' || String(entry.dayIndex + 1) === String(filter.day);
        const typeMatch = filter.type === 'all' || entry.type === filter.type;
        const visible = filter.filtering ? filter.visibleIds.has(id) : true;
        const show = dayMatch && typeMatch && visible;
        const el = entry.marker.getElement();
        if (el) el.classList.toggle('is-dim', !show);
        entry.marker.setOpacity(show ? 1 : 0.24);
        if (!show) entry.marker.closePopup();
      }
      for (const [dayIndex, route] of routeByDay) {
        const dayMatch = filter.day === 'all' || String(dayIndex + 1) === String(filter.day);
        route.setStyle({ opacity: dayMatch ? 0.62 : 0.1 });
      }
      if (filter.day !== previousDay) {
        if (filter.day === 'all') {
          resetView();
        } else {
          const visible = [];
          for (const [id, entry] of markerById) {
            const dayMatch = filter.day === 'all' || String(entry.dayIndex + 1) === String(filter.day);
            const typeMatch = filter.type === 'all' || entry.type === filter.type;
            const searchMatch = !filter.filtering || filter.visibleIds.has(id);
            if (dayMatch && typeMatch && searchMatch) visible.push(entry.marker.getLatLng());
          }
          if (visible.length) {
            map.fitBounds(L.latLngBounds(visible), { padding: [30, 30], maxZoom: 13, animate: true });
          }
        }
      }
    }

    function focus(id) {
      const entry = markerById.get(id);
      if (!entry) return false;
      const latlng = entry.marker.getLatLng();
      map.setView(latlng, Math.max(map.getZoom(), 14), { animate: true });
      entry.marker.openPopup();
      for (const [markerId, markerEntry] of markerById) {
        const el = markerEntry.marker.getElement();
        if (el) el.classList.toggle('is-active', markerId === id);
      }
      return true;
    }

    function refresh(nextTrip) {
      currentTrip = nextTrip;
      renderLayers();
      resetView();
      setTimeout(() => map.invalidateSize(), 50);
    }

    function destroy() {
      map.remove();
    }

    window.addEventListener('resize', () => map.invalidateSize());
    setBasemap(basemap);
    const initialBounds = allBounds();
    if (initialBounds) resetView();
    setTimeout(() => map.invalidateSize(), 80);

    return { refresh, focus, applyFilter, resetView, destroy, getBasemap: () => basemap };
  }

  window.TravelGuideMap = { init, wgs84ToGcj02, TILE_PROVIDERS };
})();
