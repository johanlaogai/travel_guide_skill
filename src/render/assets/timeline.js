(() => {
  'use strict';

  const TYPE_LABELS = {
    anchor: '景点',
    meal: '餐饮',
    transit: '交通',
    rest: '休息',
    hotel: '住宿',
    buffer: '缓冲',
  };
  const TRANSIT_LABELS = {
    walk: '步行', metro: '地铁', bus: '公交', taxi: '打车', drive: '自驾', train: '火车', flight: '飞机', other: '其他',
  };
  const BOOKING_STATUS_LABELS = {
    pending: '待预约', booked: '已预约', cancelled: '已取消', done: '已完成',
  };
  const WEATHER_ICONS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    'cloud-sun': '<path d="M8 18h8.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.4-1.5A3.8 3.8 0 0 0 8 18Z"/><path d="M16.5 4.5v2M21 7l-1.6 1.6M19.5 12H22"/>',
    cloud: '<path d="M7 18h9.5a3.5 3.5 0 0 0 .2-7 5.5 5.5 0 0 0-10.4-1.6A4 4 0 0 0 7 18Z"/>',
    rain: '<path d="M7 15h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 6.4 4 4 0 0 0 7 15Z"/><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21"/>',
    storm: '<path d="M7 14h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 5.4 4 4 0 0 0 7 14Z"/><path d="m12 14-2 4h3l-2 4"/>',
    snow: '<path d="M7 15h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 6.4 4 4 0 0 0 7 15Z"/><path d="M8 18h.01M12 19h.01M16 18h.01"/>',
    fog: '<path d="M5 9h14M4 13h16M7 17h10"/>',
    drizzle: '<path d="M7 15h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 6.4 4 4 0 0 0 7 15Z"/><path d="M9 18v2M13 18v2M17 18v2"/>',
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }
  const escapeAttr = (value) => escapeHtml(value).replaceAll('\n', ' ');
  function isHttpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
  }
  const safeUrl = (value) => isHttpUrl(value) ? value : '';

  function formatDateZh(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date);
    } catch {
      return String(value).slice(5);
    }
  }

  function formatDuration(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (!value) return '0 分钟';
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return `${hours ? `${hours} 小时 ` : ''}${mins ? `${mins} 分钟` : ''}`.trim();
  }

  function formatCents(cents, currency = 'CNY') {
    try {
      return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);
    } catch {
      return `${currency} ${((Number(cents) || 0) / 100).toFixed(0)}`;
    }
  }

  function shortTitle(source) {
    const raw = String(source?.title || source?.provider || '来源').replace(/\s+/g, ' ').trim();
    return raw.length > 18 ? `${raw.slice(0, 17)}…` : raw;
  }

  function sourceLinks(trip, ids = [], max = 4, options = {}) {
    const index = new Map((trip.sources ?? []).map((source) => [source.id, source]));
    const seen = new Set();
    const links = [];
    let manual = false;
    let manualLabel = '行程整理';
    let overflow = 0;
    for (const id of ids ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const source = index.get(id);
      if (!source) continue;
      if (!isHttpUrl(source.url)) { manual = true; manualLabel = source.label || '行程整理'; continue; }
      if (links.length >= max) { overflow += 1; continue; }
      const label = source.label
        || (source.provider === 'official'
          ? `官方 · ${shortTitle(source)}`
          : source.provider === 'open-meteo'
            ? '天气 · Open-Meteo'
            : `${source.provider} · ${shortTitle(source)}`);
      links.push(`<a class="source-link" href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer" data-external title="${escapeAttr(source.title || source.url)}">${escapeHtml(label)}</a>`);
    }
    const parts = [...links];
    if (options.derived === true) parts.push(`<span class="source-derived" title="${escapeAttr(options.derivation || '按路线与交通时间估算')}">估算 · 路线时间</span>`);
    if (!links.length && manual) parts.push(`<span class="source-manual" title="由行程整理录入，非官方；请以现场为准">${escapeHtml(manualLabel)}</span>`);
    if (overflow) parts.push(`<span class="source-more" title="更多来源见 sources.md">+${overflow}</span>`);
    return parts.length ? `<p class="source-links"><span class="source-kicker">来源</span>${parts.join('')}</p>` : '';
  }

  function weatherIcon(icon) {
    return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WEATHER_ICONS[icon] ?? WEATHER_ICONS.cloud}</svg>`;
  }

  function renderWeather(day, sources) {
    const weather = day.weather;
    if (!weather) return '<div class="day-weather"><span class="weather-label">天气待补</span></div>';
    const source = weather.sourceId ? sources.get(weather.sourceId) : null;
    const url = safeUrl(source?.url);
    const icon = weather.weatherCode != null && weather.weatherCode >= 95 ? 'storm'
      : weather.weatherCode === 0 ? 'sun'
      : weather.weatherCode <= 3 ? (weather.weatherCode === 1 ? 'cloud-sun' : 'cloud')
      : weather.weatherCode <= 48 ? 'fog'
      : weather.weatherCode <= 57 ? 'drizzle'
      : weather.weatherCode <= 67 ? 'rain'
      : weather.weatherCode <= 77 ? 'snow'
      : weather.weatherCode <= 82 ? 'rain'
      : weather.weatherCode <= 86 ? 'snow' : 'cloud';
    return `<div class="day-weather">
      <div class="weather-icon" aria-hidden="true">${weatherIcon(icon)}</div>
      <strong>${weather.high != null ? `${Math.round(weather.high)}°` : '—'}${weather.low != null ? ` / ${Math.round(weather.low)}°` : ''}</strong>
      <span class="weather-label">${escapeHtml(weather.summary ?? '天气')}${weather.climate ? ' · 气候' : ''}</span>
      ${weather.precipitationProbability != null ? `<span class="weather-label">降雨 ${weather.precipitationProbability}%</span>` : ''}
      ${url ? `<a class="weather-source" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" data-external>天气来源</a>` : ''}
    </div>`;
  }

  function itemDetail(item) {
    const detail = item.detail;
    if (!detail || typeof detail !== 'object') return '';
    const highlights = Array.isArray(detail.highlights) ? detail.highlights.filter(Boolean) : [];
    if (!detail.description && !highlights.length && !detail.photoTip) return '';
    return `<details class="item-story"><summary>看点与故事</summary>
      ${detail.description ? `<p>${escapeHtml(detail.description)}</p>` : ''}
      ${highlights.length ? `<ul>${highlights.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
      ${detail.photoTip ? `<p class="photo-tip">拍照：${escapeHtml(detail.photoTip)}</p>` : ''}
    </details>`;
  }

  function renderItem(item, dayIndex, trip, sources) {
    const place = item.place ?? {};
    const type = item.type ?? 'other';
    const currency = trip.meta?.budget?.currency || 'CNY';
    const time = item.start && item.end ? `${item.start}–${item.end}` : (item.start ?? '');
    let duration = '';
    if (item.start && item.end) {
      const [sh, sm] = String(item.start).split(':').map(Number);
      const [eh, em] = String(item.end).split(':').map(Number);
      if ([sh, sm, eh, em].every(Number.isFinite) && eh * 60 + em > sh * 60 + sm) duration = formatDuration(eh * 60 + em - (sh * 60 + sm));
    }
    const search = [item.title, place.name, place.address, item.notes, item.booking?.note, ...(item.tags ?? [])].filter(Boolean).join(' ');
    const hasCoord = Number.isFinite(place.lat) && Number.isFinite(place.lon);
    const links = [];
    if (hasCoord) {
      links.push(`<button type="button" data-focus-item="${escapeAttr(item.id)}">地图定位</button>`);
      links.push(`<a href="https://www.openstreetmap.org/?mlat=${Number(place.lat)}&mlon=${Number(place.lon)}#map=16/${Number(place.lat)}/${Number(place.lon)}" target="_blank" rel="noopener noreferrer" data-external>OSM</a>`);
      links.push(`<a href="https://www.google.com/maps/search/?api=1&query=${Number(place.lat)},${Number(place.lon)}" target="_blank" rel="noopener noreferrer" data-external>Google</a>`);
    }
    if (place.name) {
      links.push(`<a href="https://www.amap.com/search?query=${encodeURIComponent(`${place.name} ${trip.meta.destination.name}`)}" target="_blank" rel="noopener noreferrer" data-external>高德搜索</a>`);
    }
    links.push(`<button type="button" class="edit-only" data-edit-item="${escapeAttr(item.id)}">编辑</button>`);
    links.push(`<button type="button" class="edit-only" data-move-item="${escapeAttr(item.id)}" data-move-dir="up" aria-label="上移">上移</button>`);
    links.push(`<button type="button" class="edit-only" data-move-item="${escapeAttr(item.id)}" data-move-dir="down" aria-label="下移">下移</button>`);
    links.push(`<button type="button" class="edit-only is-danger" data-delete-item="${escapeAttr(item.id)}">删除</button>`);

    const chips = [];
    if (item.cost?.amount != null) chips.push(`<span class="chip-static is-cost">${escapeHtml(formatCents(Number(item.cost.amount) * 100, item.cost.currency ?? currency))}</span>`);
    if (item.booking?.required) chips.push(`<span class="chip-static is-booking">预约 ${escapeHtml(BOOKING_STATUS_LABELS[item.booking.status] ?? item.booking.status ?? '待确认')}</span>`);
    if (item.transit) chips.push(`<span class="chip-static">${escapeHtml(TRANSIT_LABELS[item.transit.mode] ?? item.transit.mode)} ${item.transit.durationMin ?? '?'} 分钟</span>`);
    if (item.derived) chips.push('<span class="chip-static is-derived">估算</span>');

    const transit = item.transit
      ? `<div class="transit-line"><span>从上一站</span><span class="transit-mode">${escapeHtml(TRANSIT_LABELS[item.transit.mode] ?? item.transit.mode)}</span><span>${item.transit.durationMin ?? '?'} 分钟</span>${item.transit.distanceKm ? `<span>· ${item.transit.distanceKm} km</span>` : ''}${item.transit.note ? `<span>· ${escapeHtml(item.transit.note)}</span>` : ''}</div>`
      : '';
    const bookingUrl = safeUrl(item.booking?.url);
    const booking = item.booking?.required
      ? `<div class="transit-line"><span>预约</span><span>${escapeHtml(BOOKING_STATUS_LABELS[item.booking.status] ?? item.booking.status ?? '待确认')}</span>${item.booking.deadline ? `<span>· 截止 ${escapeHtml(item.booking.deadline)}</span>` : ''}${bookingUrl ? `· <a href="${escapeAttr(bookingUrl)}" target="_blank" rel="noopener noreferrer" data-external>官方链接</a>` : ''}</div>`
      : '';
    const sourcesHtml = sourceLinks(trip, item.sourceIds ?? [], 4, {
      derived: item.derived === true,
      derivation: item.derivation,
    });
    const detail = itemDetail(item);
    return `<article class="item type-${escapeAttr(type)}" id="item-${escapeAttr(item.id)}" data-item-id="${escapeAttr(item.id)}" data-day="${dayIndex + 1}" data-type="${escapeAttr(type)}" data-search="${escapeAttr(search)}">
      <div class="item-rail"><span class="item-time">${escapeHtml(time)}</span><span class="item-duration">${escapeHtml(duration)}</span><span class="item-dot" aria-hidden="true"></span></div>
      <div class="item-card">
        <div class="item-top"><span class="type-label">${escapeHtml(TYPE_LABELS[type] ?? type)}</span>${item.derived ? '<span class="chip-static is-derived">估算</span>' : ''}${item.booking?.deadline ? `<span class="chip-static">截止 ${escapeHtml(item.booking.deadline)}</span>` : ''}</div>
        <h3>${escapeHtml(item.title)}</h3>
        ${place.name ? `<p class="place">${escapeHtml(place.name)}${place.address ? ` · <span class="address">${escapeHtml(place.address)}</span>` : ''}</p>` : ''}
        ${transit}
        ${booking}
        ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
        ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ''}
        ${detail}
        ${sourcesHtml}
        ${links.length ? `<div class="item-actions">${links.join('')}</div>` : ''}
      </div>
    </article>`;
  }

  function renderDay(day, index, trip, sources) {
    const items = day.items ?? [];
    const weather = renderWeather(day, sources);
    const transitMinutes = items.reduce((sum, item) => sum + (Number(item.transit?.durationMin) || 0), 0);
    return `<section class="day day-c${index + 1}" id="day-${index + 1}" data-day="${index + 1}" data-day-index="${index}">
      <header class="day-head">
        <div class="day-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div>
        <div class="day-title-wrap">
          <h2>${escapeHtml(day.title || `Day ${index + 1}`)}</h2>
          <p class="day-sub">${escapeHtml(formatDateZh(day.date))} ${escapeHtml(day.weekday ?? '')}${day.area ? ` · ${escapeHtml(day.area)}` : ''}</p>
          <div class="day-actions edit-only">
            <button type="button" class="btn btn-small" data-edit-day="${index}">编辑这天</button>
            <button type="button" class="btn btn-small" data-add-item="${index}">+ 添加项目</button>
          </div>
        </div>
        ${weather}
      </header>
      <div class="items">
        ${items.length ? items.map((item) => renderItem(item, index, trip, sources)).join('') : '<p class="check-empty">这一天还没有安排。</p>'}
      </div>
      <div class="day-foot"><span>${items.filter((item) => item.type === 'anchor').length} 个锚点</span><span>交通约 ${formatDuration(transitMinutes)}</span><span>${items.length} 个项目</span></div>
    </section>`;
  }

  window.TG = window.TG || {};
  window.TG.renderTimeline = (trip) => {
    const sources = new Map((trip.sources ?? []).map((source) => [source.id, source]));
    return (trip.days ?? []).map((day, index) => renderDay(day, index, trip, sources)).join('');
  };
  window.TG.formatCents = formatCents;
  window.TG.formatDateZh = formatDateZh;
})();
