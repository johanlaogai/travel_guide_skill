import {
  formatDateZh,
  formatDuration,
  formatRangeZh,
  durationMinutes,
} from '../core/dates.mjs';
import {
  CATEGORY_LABELS,
  formatCents,
  formatRangeCents,
  summarizeBudget,
} from '../core/money.mjs';
import {
  CONFIDENCE_LABELS,
  PROVIDER_LABELS,
  bestConfidence,
  sourceCoverage,
  sourceIndex,
} from '../core/provenance.mjs';
import { allItems } from '../core/trip.mjs';
import { WEATHER_CODES } from '../data/providers/open-meteo.mjs';
import { renderMap, DAY_COLORS } from './map.mjs';
import { buildIcs } from './ics.mjs';
import {
  attributionHtml,
  escapeAttr,
  escapeHtml,
  safeUrl,
  sourceChipsHtml,
  sourceBadgeHtml,
} from './sources.mjs';
import { loadAssets } from './assets.mjs';

const TYPE_LABELS = {
  anchor: '景点',
  meal: '餐饮',
  transit: '交通',
  rest: '休息',
  hotel: '住宿',
  buffer: '缓冲',
};

const TRANSIT_LABELS = {
  walk: '步行',
  metro: '地铁',
  bus: '公交',
  taxi: '打车',
  drive: '自驾',
  train: '火车',
  flight: '飞机',
  other: '其他',
};

const PACE_LABELS = {
  relaxed: '轻松',
  balanced: '平衡',
  packed: '紧凑',
};

const BUDGET_LABELS = {
  low: '经济',
  mid: '中等',
  high: '舒适',
};

export async function renderHtml(trip, { now = new Date(), publicMode = false } = {}) {
  const { css, js } = await loadAssets();
  const sources = sourceIndex(trip);
  const coverage = sourceCoverage(trip);
  const currency = trip.meta.budget.currency || 'CNY';
  const items = allItems(trip);
  const anchors = items.filter((item) => item.type === 'anchor');
  const map = renderMap(trip);
  const ics = buildIcs(trip, { now });
  const budget = safeBudget(trip, currency);
  const dataJson = JSON.stringify(trip).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  const description = (trip.overview?.summary || `${trip.meta.destination.name} ${trip.meta.days} 天行程`).slice(0, 160);
  const dayTabs = [
    `<button class="day-tab is-active" data-day-filter="all">全部 <span class="tab-count">${items.length}</span></button>`,
    ...(trip.days ?? []).map((day, index) => {
      const count = (day.items ?? []).length;
      return `<button class="day-tab day-c${index + 1}" data-day-filter="${index + 1}"><span class="tab-dot" aria-hidden="true"></span>Day ${index + 1}<span class="tab-count">${count}</span></button>`;
    }),
  ].join('');
  const typeCounts = countTypes(items);
  const typeChips = [
    `<button class="chip is-active" data-type-filter="all">全部类型</button>`,
    ...Object.entries(typeCounts).map(([type, count]) => `<button class="chip" data-type-filter="${escapeAttr(type)}">${TYPE_LABELS[type] ?? type} ${count}</button>`),
  ].join('');

  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${escapeAttr(description)}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(trip.meta.title)} · Travel Guide</title>
<style>${css}</style>
</head>
<body>
<div class="page">
  <header class="hero">
    <div class="hero-top">
      <div class="brand"><span class="brand-mark" aria-hidden="true">◐</span> Travel Guide <span class="brand-ver">v0.1</span></div>
      <div class="actions">
        <button class="btn btn-icon" type="button" data-action="theme" aria-label="切换主题" title="切换主题"><svg data-theme-icon class="icon-theme" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="icon-sun"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></g><path class="icon-moon" d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"></path></svg></button>
        <button class="btn" type="button" data-action="print">打印 / PDF</button>
        <button class="btn" type="button" data-action="ics">下载日历</button>
      </div>
    </div>
    <p class="eyebrow">${escapeHtml(trip.meta.destination.name)} · ${escapeHtml(formatRangeZh(trip.meta.startDate, trip.meta.endDate))}</p>
    <h1>${escapeHtml(trip.meta.title)}</h1>
    ${trip.overview?.summary ? `<p class="lede">${escapeHtml(trip.overview.summary)}</p>` : ''}
    <div class="hero-meta">
      <span>${trip.meta.days} 天</span>
      <span>${trip.meta.travelers} 人</span>
      <span>${escapeHtml(PACE_LABELS[trip.meta.pace] ?? trip.meta.pace ?? '平衡')}</span>
      <span>${escapeHtml(BUDGET_LABELS[trip.meta.budget.level] ?? trip.meta.budget.level ?? '中等')}预算</span>
      ${trip.meta.origin ? `<span>从 ${escapeHtml(trip.meta.origin)} 出发</span>` : ''}
      ${trip.meta.interests?.length ? `<span>${escapeHtml(trip.meta.interests.join(' · '))}</span>` : ''}
    </div>
    <div class="hero-stats">
      <div class="stat"><strong>${anchors.length}</strong><span>计划锚点</span></div>
      <div class="stat"><strong>${budget.ok ? formatRangeCents(budget.minCents, budget.maxCents, budget.currency) : '待补'}</strong><span>预算区间</span></div>
      <div class="stat"><strong>${coverage.sources}</strong><span>来源记录</span></div>
      <div class="stat"><strong>${coverage.official}</strong><span>官方来源</span></div>
    </div>
    ${trip.meta.demo ? `<div class="banner"><strong>示例数据</strong><span>这是用快照数据生成的演示行程；营业时间、票价、预约等动态信息请在出行前用官方页面复核。</span></div>` : ''}
    ${publicMode || trip.meta.publicMode ? `<div class="banner is-public"><strong>公开分享版</strong><span>已移除姓名、电话、订单号等个人信息；请仍注意不要公开住宿房间号等细节。</span></div>` : ''}
  </header>

  <nav class="day-tabs" aria-label="按天筛选">${dayTabs}</nav>

  <div class="layout">
    <section class="timeline-panel" aria-label="行程时间线">
      <div class="toolbar">
        <div class="toolbar-row">
          <div class="search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <input id="search-input" class="search" type="search" placeholder="搜索地点、餐厅、备注…" autocomplete="off" aria-label="搜索行程">
          </div>
          <span id="visible-count" class="visible-count">${items.length} 个项目</span>
          <button id="clear-filters" class="chip" type="button">重置</button>
        </div>
        <div class="chip-row">${typeChips}</div>
      </div>
      <div id="timeline">
        ${(trip.days ?? []).map((day, index) => renderDay(day, index, trip, sources, currency)).join('')}
      </div>
      <div id="empty-state" class="empty-state">没有匹配的项目。试试清空搜索或切回“全部”。</div>
    </section>

    <aside class="sidebar" aria-label="地图与来源">
      <div class="map-card">
        <div class="map-head">
          <div><h2>地图</h2><p>${map.points} 个可落图地点 · WGS84</p></div>
          <div class="map-controls">
            <button class="map-btn" type="button" data-map-zoom="in" aria-label="放大地图" title="放大">+</button>
            <button class="map-btn" type="button" data-map-zoom="out" aria-label="缩小地图" title="缩小">−</button>
            <button class="map-btn" type="button" data-map-zoom="reset" aria-label="重置地图" title="重置">↺</button>
          </div>
        </div>
        <div class="map-frame">${map.svg}</div>
        ${map.empty ? '' : `<div class="map-legend">${(trip.days ?? []).map((day, index) => `<span class="legend-item day-c${index + 1}"><span class="legend-dot" aria-hidden="true"></span>Day ${index + 1}</span>`).join('')}</div>`}
        <div class="map-foot">自绘示意图，不是导航底图。高德链接按名称搜索，避免 WGS84/GCJ-02 偏移；Google/OSM 使用 WGS84 坐标。</div>
      </div>

      <div class="source-summary">
        <h2>来源覆盖</h2>
        <p>${coverage.sourced}/${coverage.anchored} 个锚点/餐饮有来源记录</p>
        <div class="coverage-bar"><span style="width:${coverage.sourcedPct}%"></span></div>
        <p class="micro">官方 ${coverage.official} · 预报 ${coverage.byConfidence.forecast ?? 0} · 社区 ${coverage.byConfidence.community ?? 0} · 待核实 ${coverage.byConfidence.unverified ?? 0}</p>
        <p class="micro">数据截止：${escapeHtml(trip.provenance?.lastCheckedAt || trip.meta.updatedAt || trip.meta.generatedAt || '未记录')}</p>
      </div>

      ${trip.overview?.risks?.length ? `<div class="panel">
        <div class="section-head"><h2 class="section-title">行前提醒</h2></div>
        <ul class="risk-list">${trip.overview.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul>
      </div>` : ''}

      ${trip.overview?.highlights?.length ? `<div class="panel">
        <div class="section-head"><h2 class="section-title">这次的重点</h2></div>
        <div class="chips">${trip.overview.highlights.map((highlight) => `<span class="chip-static">${escapeHtml(highlight)}</span>`).join('')}</div>
      </div>` : ''}
    </aside>
  </div>

  <section class="budget-section" aria-labelledby="budget-title">
    <div class="section-head"><h2 id="budget-title" class="section-title">预算</h2><p>${escapeHtml(currency)} · 区间估算，不是报价</p></div>
    ${renderBudget(trip, budget)}
  </section>

  <section class="checklist-grid" aria-label="行前清单">
    ${renderPacking(trip)}
    ${renderBooking(trip, sources)}
  </section>

  <section class="sources-section" aria-labelledby="sources-title">
    <div class="section-head"><h2 id="sources-title" class="section-title">数据来源与时效</h2><p>${coverage.sources} 条记录 · 点开可复核</p></div>
    ${renderSources(trip)}
  </section>

  <section class="emergency-section" aria-labelledby="emergency-title">
    <div class="section-head"><h2 id="emergency-title" class="section-title">紧急与实用信息</h2><p>出发前请再核对当地号码</p></div>
    ${renderEmergency(trip)}
  </section>

  <footer class="footer">
    <div class="attrib">${attributionHtml()}</div>
    <div>由 travel-guide v0.1.0 生成 · ${escapeHtml(new Date(now).toISOString())} · 行程数据来自 trip.json，HTML 不发起网络请求。</div>
    <div>信息会变化；营业时间、票价、预约、交通管制等以官方当日公告为准。本工具不提供下单、支付、实时导航或签证法律意见。</div>
    <div class="no-print">来源说明与未核实项见 <code>sources.md</code>；重新生成：<code>travel-guide build --trip trip.json</code></div>
  </footer>
</div>
<script type="application/json" id="trip-data">${dataJson}</script>
<script type="text/plain" id="ics-data">${escapeHtml(ics)}</script>
<script>${js.replaceAll('</script>', '<\\/script>')}</script>
</body>
</html>`;
}

function renderDay(day, index, trip, sources, currency) {
  const items = day.items ?? [];
  const weather = renderWeather(day, sources);
  const transitMinutes = items.reduce((sum, item) => sum + (Number(item.transit?.durationMin) || 0), 0);
  return `<section class="day day-c${index + 1}" id="day-${index + 1}" data-day="${index + 1}">
    <header class="day-head">
      <div class="day-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div>
      <div>
        <h2>${escapeHtml(day.title || `Day ${index + 1}`)}</h2>
        <p class="day-sub">${escapeHtml(formatDateZh(day.date, { withYear: false }))} ${escapeHtml(day.weekday ?? '')}${day.area ? ` · ${escapeHtml(day.area)}` : ''}</p>
      </div>
      ${weather}
    </header>
    <div class="items">
      ${items.length ? items.map((item) => renderItem(item, day, index, trip, sources, currency)).join('') : `<p class="check-empty">这一天还没有安排；从 <code>discoveries</code> 里挑一个地点，补上时间与交通。</p>`}
    </div>
    <div class="day-foot"><span>${items.filter((item) => item.type === 'anchor').length} 个锚点</span><span>交通约 ${formatDuration(transitMinutes)}</span><span>${items.length} 个项目</span></div>
  </section>`;
}

function renderWeather(day, sources) {
  const weather = day.weather;
  if (!weather) return `<div class="day-weather"><span class="weather-label">天气待补</span><span class="source-badge is-empty">无来源</span></div>`;
  const icon = WEATHER_CODES[weather.weatherCode]?.icon ?? 'cloud';
  const source = weather.sourceId ? sources.get(weather.sourceId) : null;
  return `<div class="day-weather">
    <div class="weather-icon" aria-hidden="true">${weatherIcon(icon)}</div>
    <strong>${weather.high != null ? `${Math.round(weather.high)}°` : '—'}${weather.low != null ? ` / ${Math.round(weather.low)}°` : ''}</strong>
    <span class="weather-label">${escapeHtml(weather.summary ?? '天气')}${weather.climate ? ' · 气候' : ''}</span>
    ${weather.precipitationProbability != null ? `<span class="weather-label">降雨 ${weather.precipitationProbability}%</span>` : ''}
    ${source ? sourceBadgeHtml(source) : '<span class="source-badge is-empty">无来源</span>'}
  </div>`;
}

function renderItem(item, day, dayIndex, trip, sources, currency) {
  const place = item.place ?? {};
  const itemSources = (item.sourceIds ?? []).map((id) => sources.get(id)).filter(Boolean);
  const confidence = item.confidence || bestConfidence(itemSources) || 'unverified';
  const type = item.type ?? 'other';
  const time = item.start && item.end ? `${item.start}–${item.end}` : (item.start ?? '');
  let duration = '';
  if (item.start && item.end) {
    try { duration = formatDuration(durationMinutes(item.start, item.end)); } catch { duration = ''; }
  }
  const search = [item.title, place.name, place.address, item.notes, item.booking?.note, ...(item.tags ?? [])].filter(Boolean).join(' ');
  const links = [];
  if (place.lat != null && place.lon != null) {
    links.push(`<button type="button" data-focus-item="${escapeAttr(item.id)}">地图定位</button>`);
    links.push(`<a href="https://www.openstreetmap.org/?mlat=${Number(place.lat)}&mlon=${Number(place.lon)}#map=16/${Number(place.lat)}/${Number(place.lon)}" target="_blank" rel="noopener noreferrer">OSM</a>`);
    links.push(`<a href="https://www.google.com/maps/search/?api=1&query=${Number(place.lat)},${Number(place.lon)}" target="_blank" rel="noopener noreferrer">Google</a>`);
  }
  if (place.name) {
    const query = encodeURIComponent(`${place.name} ${trip.meta.destination.name}`);
    links.push(`<a href="https://www.amap.com/search?query=${query}" target="_blank" rel="noopener noreferrer">高德搜索</a>`);
  }
  const chips = [];
  if (item.cost?.amount != null) {
    chips.push(`<span class="chip-static is-cost">${escapeHtml(formatCents(Number(item.cost.amount) * 100, item.cost.currency ?? currency))}</span>`);
  }
  if (item.booking?.required) {
    chips.push(`<span class="chip-static is-booking">预约 ${escapeHtml(item.booking.status ?? '待确认')}</span>`);
  }
  if (item.transit) {
    chips.push(`<span class="chip-static">${escapeHtml(TRANSIT_LABELS[item.transit.mode] ?? item.transit.mode)} ${item.transit.durationMin ?? '?'} 分钟</span>`);
  }
  if (confidence) {
    chips.push(`<span class="chip-static${confidence === 'unverified' ? ' is-warn' : ''}">${escapeHtml(CONFIDENCE_LABELS[confidence] ?? confidence)}</span>`);
  }
  const transit = item.transit
    ? `<div class="transit-line"><span>从上一站</span><span class="transit-mode">${escapeHtml(TRANSIT_LABELS[item.transit.mode] ?? item.transit.mode)}</span><span>${item.transit.durationMin ?? '?'} 分钟</span>${item.transit.distanceKm ? `<span>· ${item.transit.distanceKm} km</span>` : ''}${item.transit.note ? `<span>· ${escapeHtml(item.transit.note)}</span>` : ''}</div>`
    : '';
  const booking = item.booking?.required ? `<div class="transit-line"><span>预约</span><span>${escapeHtml(item.booking.status ?? '待确认')}</span>${item.booking.deadline ? `<span>· 截止 ${escapeHtml(item.booking.deadline)}</span>` : ''}${safeUrl(item.booking.url) ? `· <a href="${escapeAttr(safeUrl(item.booking.url))}" target="_blank" rel="noopener noreferrer">官方链接</a>` : ''}</div>` : '';
  return `<article class="item type-${escapeAttr(type)}" id="item-${escapeAttr(item.id)}" data-item-id="${escapeAttr(item.id)}" data-day="${dayIndex + 1}" data-type="${escapeAttr(type)}" data-search="${escapeAttr(search)}">
    <div class="item-rail"><span class="item-time">${escapeHtml(time)}</span><span class="item-duration">${escapeHtml(duration)}</span><span class="item-dot" aria-hidden="true"></span></div>
    <div class="item-card">
      <div class="item-top"><span class="type-label">${escapeHtml(TYPE_LABELS[type] ?? type)}</span>${item.booking?.deadline ? `<span class="chip-static">截止 ${escapeHtml(item.booking.deadline)}</span>` : ''}</div>
      <h3>${escapeHtml(item.title)}</h3>
      ${place.name ? `<p class="place">${escapeHtml(place.name)}${place.address ? ` · <span class="address">${escapeHtml(place.address)}</span>` : ''}</p>` : ''}
      ${transit}
      ${booking}
      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
      ${item.sourceIds?.length ? `<div class="sources-row">${sourceChipsHtml(trip, item.sourceIds)}</div>` : '<div class="sources-row"><span class="source-badge is-empty">无来源</span></div>'}
      ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ''}
      ${links.length ? `<div class="item-actions">${links.join('')}</div>` : ''}
    </div>
  </article>`;
}

function renderBudget(trip, budget) {
  if (!budget.ok || budget.maxCents === 0) return `<div class="budget-empty">预算还没填。给 <code>trip.budget</code> 补上分类区间后重新构建。</div>`;
  const total = budget.maxCents || budget.minCents || 1;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = budget.categories.map((category, index) => {
    const value = category.maxCents || category.minCents;
    const length = (value / total) * circumference;
    const segment = `<circle class="donut-seg" cx="60" cy="60" r="${radius}" stroke="${DAY_COLORS[index % DAY_COLORS.length]}" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"></circle>`;
    offset += length;
    return segment;
  }).join('');
  const rows = budget.categories.map((category, index) => {
    const max = category.maxCents || category.minCents;
    const width = Math.max(2, (max / total) * 100);
    const min = category.minCents ? (category.minCents / total) * 100 : 0;
    return `<div class="budget-row">
      <span class="label"><span class="legend-dot" style="background:${DAY_COLORS[index % DAY_COLORS.length]};display:inline-block;margin-right:5px"></span>${escapeHtml(category.label ?? CATEGORY_LABELS[category.key] ?? category.key)}</span>
      <span class="budget-bar"><span class="range" style="width:${width.toFixed(1)}%"></span><span class="min" style="left:${min.toFixed(1)}%"></span></span>
      <span class="value">${escapeHtml(formatRangeCents(category.minCents, category.maxCents, budget.currency))}</span>
    </div>`;
  }).join('');
  return `<div class="budget-grid">
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 120 120" role="img" aria-label="预算分类占比">
        <circle class="donut-track" cx="60" cy="60" r="${radius}"></circle>
        ${segments}
        <text x="60" y="58" text-anchor="middle" font-size="13">${escapeHtml(formatCents(budget.minCents, budget.currency))}</text>
        <text class="donut-sub" x="60" y="72" text-anchor="middle">预算下限</text>
      </svg>
      <div class="donut-caption">上限 ${escapeHtml(formatCents(budget.maxCents, budget.currency))}</div>
    </div>
    <div class="budget-rows">${rows}
      <div class="budget-total"><span>合计</span><strong>${escapeHtml(formatRangeCents(budget.minCents, budget.maxCents, budget.currency))}</strong></div>
    </div>
  </div>`;
}

function renderPacking(trip) {
  const items = trip.packing ?? [];
  return `<div class="check-panel">
    <div class="section-head"><h2 class="section-title">行李清单</h2><span class="check-progress"><span data-progress-text="packing">0/${items.length}</span><span class="bar" data-progress-for="packing"><span></span></span></span></div>
    ${items.length ? `<ul class="check-list">${items.map((item) => `<li class="check-item"><input type="checkbox" data-persist="packing:${escapeAttr(item.id)}" aria-label="${escapeAttr(item.label)}"><span>${escapeHtml(item.label)}${item.essential ? ' <span class="chip-static">必备</span>' : ''}</span></li>`).join('')}</ul>` : '<p class="check-empty">还没有行李项。</p>'}
  </div>`;
}

function renderBooking(trip, sources) {
  const items = trip.bookingChecklist ?? [];
  return `<div class="check-panel">
    <div class="section-head"><h2 class="section-title">预约与行前确认</h2><span class="check-progress"><span data-progress-text="booking">0/${items.length}</span><span class="bar" data-progress-for="booking"><span></span></span></span></div>
    ${items.length ? `<ul class="check-list">${items.map((item) => `<li class="check-item"><input type="checkbox" data-persist="booking:${escapeAttr(item.id)}" aria-label="${escapeAttr(item.label)}"${item.status === 'done' ? ' checked' : ''}><span>${escapeHtml(item.label)}${item.required ? ' <span class="chip-static is-booking">必做</span>' : ''}${safeUrl(item.url) ? ` <a href="${escapeAttr(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">官方</a>` : ''}${item.sourceIds?.length ? `<span class="sources-row">${sourceChipsHtml(trip, item.sourceIds, 2)}</span>` : ''}</span>${item.deadline ? `<span class="deadline" data-deadline="${escapeAttr(item.deadline)}">${escapeHtml(item.deadline)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="check-empty">还没有预约项。热门博物馆/观景台通常需要提前预约。</p>'}
  </div>`;
}

function renderSources(trip) {
  const sources = trip.sources ?? [];
  if (!sources.length) return `<div class="budget-empty">还没有来源记录。先运行 <code>enrich</code>，或手动补 <code>sources</code>。</div>`;
  const counts = {};
  for (const source of sources) counts[source.confidence] = (counts[source.confidence] ?? 0) + 1;
  const filters = ['all', 'official', 'verified', 'forecast', 'community', 'estimate', 'unverified']
    .filter((key) => key === 'all' || counts[key])
    .map((key) => `<button class="chip${key === 'all' ? ' is-active' : ''}" type="button" data-source-filter="${key}">${key === 'all' ? '全部' : escapeHtml(CONFIDENCE_LABELS[key] ?? key)} ${key === 'all' ? sources.length : counts[key]}</button>`)
    .join('');
  const rows = sources.map((source) => {
    const url = /^https?:\/\//i.test(source.url ?? '')
      ? `<a href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.url)}</a>`
      : `<span>${escapeHtml(source.url || '无链接')}</span>`;
    return `<div class="source-row" data-confidence="${escapeAttr(source.confidence)}">
      <span class="confidence-pill" data-confidence="${escapeAttr(source.confidence)}"><span class="badge-dot"></span>${escapeHtml(CONFIDENCE_LABELS[source.confidence] ?? source.confidence)}</span>
      <div><div class="src-title">${escapeHtml(source.title || '(无标题)')}</div><div class="src-meta">${escapeHtml(PROVIDER_LABELS[source.provider] ?? source.provider)} · ${escapeHtml(source.transport)} · ${escapeHtml(source.retrievedAt)} · ${escapeHtml(source.license)}${source.rawHash ? ` · ${escapeHtml(String(source.rawHash).slice(0, 14))}` : ''}</div><div class="src-meta">${url}</div></div>
      <span class="src-provider">${escapeHtml(source.kind)}</span>
    </div>`;
  }).join('');
  return `<div class="chips" style="margin-bottom:10px">${filters}</div><div class="sources-table">${rows}</div>`;
}

function renderEmergency(trip) {
  const contacts = trip.emergency?.contacts ?? [];
  const notes = trip.emergency?.notes ?? [];
  return `<div class="emergency-grid">
    <div class="emergency-card"><h3>紧急电话</h3>
      ${contacts.length ? `<ul>${contacts.map((contact) => `<li>${escapeHtml(contact.label)}：${escapeHtml(contact.value)}</li>`).join('')}</ul>` : '<p>中国报警 110，急救 120，火警 119；境外请查当地紧急电话。公开版会移除个人紧急联系人。</p>'}
    </div>
    <div class="emergency-card"><h3>实用提醒</h3>
      ${notes.length ? `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '<p>把护照/身份证复印件、保险单、住宿地址和使领馆电话放在离线可查的位置。</p>'}
    </div>
  </div>`;
}

function countTypes(items) {
  const counts = {};
  for (const item of items) {
    const type = item.type ?? 'other';
    counts[type] = (counts[type] ?? 0) + 1;
  }
  const order = ['anchor', 'meal', 'transit', 'hotel', 'rest', 'buffer'];
  return Object.fromEntries(order.filter((type) => counts[type]).map((type) => [type, counts[type]]));
}

function safeBudget(trip, currency) {
  try {
    const summary = summarizeBudget(trip.budget, currency);
    return { ok: true, ...summary };
  } catch {
    return { ok: false, currency, minCents: 0, maxCents: 0, categories: [] };
  }
}

function weatherIcon(icon) {
  const paths = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    'cloud-sun': '<path d="M8 18h8.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.4-1.5A3.8 3.8 0 0 0 8 18Z"/><path d="M16.5 4.5v2M21 7l-1.6 1.6M19.5 12H22"/>',
    cloud: '<path d="M7 18h9.5a3.5 3.5 0 0 0 .2-7 5.5 5.5 0 0 0-10.4-1.6A4 4 0 0 0 7 18Z"/>',
    rain: '<path d="M7 15h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 6.4 4 4 0 0 0 7 15Z"/><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21"/>',
    storm: '<path d="M7 14h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 5.4 4 4 0 0 0 7 14Z"/><path d="m12 14-2 4h3l-2 4"/>',
    snow: '<path d="M7 15h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 6.4 4 4 0 0 0 7 15Z"/><path d="M8 18h.01M12 19h.01M16 18h.01"/>',
    fog: '<path d="M5 9h14M4 13h16M7 17h10"/>',
    drizzle: '<path d="M7 15h9.5a3.5 3.5 0 0 0 .2-7A5.5 5.5 0 0 0 6.3 6.4 4 4 0 0 0 7 15Z"/><path d="M9 18v2M13 18v2M17 18v2"/>',
  };
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[icon] ?? paths.cloud}</svg>`;
}
