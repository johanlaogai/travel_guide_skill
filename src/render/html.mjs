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
import { sourceIndex } from '../core/provenance.mjs';
import { allItems } from '../core/trip.mjs';
import { WEATHER_CODES } from '../data/providers/open-meteo.mjs';
import { renderMap, DAY_COLORS } from './map.mjs';
import { buildIcs } from './ics.mjs';
import {
  attributionHtml,
  escapeAttr,
  escapeHtml,
  safeUrl,
  sourceLinksHtml,
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

const BOOKING_STATUS_LABELS = {
  pending: '待预约',
  booked: '已预约',
  cancelled: '已取消',
  done: '已完成',
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
  const { css, js, leafletCss, leafletJs } = await loadAssets();
  const sources = sourceIndex(trip);
  const currency = trip.meta.budget.currency || 'CNY';
  const items = allItems(trip);
  const anchors = items.filter((item) => item.type === 'anchor');
  const map = renderMap(trip);
  const ics = buildIcs(trip, { now });
  const budget = safeBudget(trip, currency);
  const dataJson = JSON.stringify(trip).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  const inlineStyle = (text) => String(text).replaceAll('</style>', '<\\/style>');
  const inlineScript = (text) => String(text).replaceAll('</script>', '<\\/script>');
  const description = (trip.overview?.summary || `${trip.meta.destination.name} ${trip.meta.days} 天行程`).slice(0, 160);
  const dayTabs = [
    `<button class="day-tab is-active" data-day-filter="all">全部 <span class="tab-count">${items.length}</span></button>`,
    ...(trip.days ?? []).map((day, index) => {
      const count = (day.items ?? []).length;
      return `<button class="day-tab day-c${index + 1}" data-day-filter="${index + 1}"><span class="tab-dot" aria-hidden="true"></span>Day ${index + 1}<span class="tab-count">${count}项</span></button>`;
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
<style>${inlineStyle(leafletCss)}${inlineStyle(css)}</style>
</head>
<body>
<div class="page">
  <header class="hero">
    <div class="hero-top">
      <div class="brand"><span class="brand-mark" aria-hidden="true">◐</span> Travel Guide <span class="brand-ver">v0.3</span></div>
      <div class="actions">
        <button class="btn btn-icon" type="button" data-action="theme" aria-label="切换主题" title="切换主题"><svg data-theme-icon class="icon-theme" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="icon-sun"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></g><path class="icon-moon" d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"></path></svg></button>
        <button class="btn btn-edit" type="button" data-action="edit" aria-pressed="false" aria-label="编辑行程" title="编辑行程"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg><span class="btn-label">编辑</span></button>
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
      <div class="stat"><strong data-hero-anchors>${anchors.length}</strong><span>计划锚点</span></div>
      <div class="stat"><strong>${budget.ok ? formatRangeCents(budget.minCents, budget.maxCents, budget.currency) : '待补'}</strong><span>预算区间</span></div>
    </div>
    ${trip.meta.demo ? `<div class="banner"><strong>示例数据</strong><span>这是用快照数据生成的演示行程；营业时间、票价、预约等动态信息请在出行前用官方页面复核。</span></div>` : ''}
    ${publicMode || trip.meta.publicMode ? `<div class="banner is-public"><strong>公开分享版</strong><span>已移除姓名、电话、订单号等个人信息；请仍注意不要公开住宿房间号等细节。</span></div>` : ''}
    <div id="draft-banner" class="banner is-draft" hidden><strong>本地修改</strong><span>已载入保存在这个浏览器里的修改；要分享修改版，请导出 JSON 后重新构建。</span><button class="banner-action" type="button" data-action="reset-draft">恢复初始</button></div>
  </header>

  ${renderGuide(trip)}

  <div id="edit-bar" class="edit-bar no-print" hidden>
    <span>编辑模式：修改只保存在本机，不会上传。</span>
    <div class="edit-bar-actions">
      <button class="btn btn-small" type="button" data-action="export-json">导出 JSON</button>
      <button class="btn btn-small" type="button" data-action="reset-draft">恢复初始</button>
    </div>
  </div>

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

    <aside class="sidebar" aria-label="地图与行前信息">
      <div class="map-card">
        <div class="map-head">
          <div><h2>地图</h2><p>点击图钉查看当天安排</p></div>
          <div class="map-controls">
            <select id="basemap-select" class="basemap-select" aria-label="切换地图底图" title="切换底图">
              <option value="esri">Esri 街道</option>
              <option value="amap">高德中文</option>
              <option value="osm">OpenStreetMap</option>
            </select>
            <button class="map-btn" type="button" data-map-zoom="in" aria-label="放大地图" title="放大">+</button>
            <button class="map-btn" type="button" data-map-zoom="out" aria-label="缩小地图" title="缩小">−</button>
            <button class="map-btn" type="button" data-map-zoom="reset" aria-label="重置地图" title="重置">↺</button>
          </div>
        </div>
        <div class="map-frame">${map.html}</div>
        ${map.empty ? '' : `<div class="map-legend">${(trip.days ?? []).map((day, index) => `<span class="legend-item day-c${index + 1}"><span class="legend-dot" aria-hidden="true"></span>Day ${index + 1}</span>`).join('')}</div>`}
        <div class="map-foot">底图：Esri / 高德 / OSM，仅地图瓦片请求网络。地图用于看顺序，不替代导航。</div>
      </div>

      ${trip.overview?.risks?.length && !trip.overview?.guide?.pitfalls?.length ? `<div class="panel">
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

  <section class="emergency-section" aria-labelledby="emergency-title">
    <div class="section-head"><h2 id="emergency-title" class="section-title">紧急与实用信息</h2><p>出发前请再核对当地号码</p></div>
    ${renderEmergency(trip)}
  </section>

  <footer class="footer">
    <div class="attrib">${attributionHtml()}</div>
    <div>由 travel-guide v0.3.0 生成 · ${escapeHtml(new Date(now).toISOString())} · 行程数据来自 trip.json；仅地图底图请求瓦片，行程数据不联网。</div>
    <div>信息会变化；营业时间、票价、预约、交通管制等以官方当日公告为准。本工具不提供下单、支付、实时导航或签证法律意见。</div>
    <div>来源链接在各行程卡片上；完整来源记录随 build 生成在 <code>sources.md</code>。重新生成：<code>travel-guide build --trip trip.json</code></div>
  </footer>
</div>
${renderEditorDialogs(currency)}
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script type="application/json" id="trip-data">${dataJson}</script>
<script type="text/plain" id="ics-data">${escapeHtml(ics)}</script>
<script>${inlineScript(leafletJs)}</script>
<script>${inlineScript(js)}</script>
</body>
</html>`;
}

const PITFALL_SEVERITY_LABELS = { high: '高', medium: '中', low: '低' };
const PITFALL_CATEGORY_LABELS = {
  ticket: '门票',
  transport: '交通',
  scam: '消费陷阱',
  health: '健康',
  weather: '天气',
  food: '饮食',
  custom: '风俗',
};

function renderGuide(trip) {
  const guide = trip.overview?.guide;
  if (!guide || typeof guide !== 'object') return '';
  const blocks = [];
  if (guide.intro?.body) {
    blocks.push(`<article class="guide-card guide-intro">
      <p class="guide-kicker">目的地手册</p>
      <h2>${escapeHtml(guide.intro.title || '先读这一段')}</h2>
      <p>${escapeHtml(guide.intro.body)}</p>
      ${sourceLinksHtml(trip, guide.intro.sourceIds, 4)}
    </article>`);
  }
  for (const section of guide.sections ?? []) {
    if (!section?.body) continue;
    const kicker = { background: '背景', culture: '文化', customs: '风俗' }[section.id] ?? '背景';
    blocks.push(`<article class="guide-card">
      <p class="guide-kicker">${escapeHtml(kicker)}</p>
      <h2>${escapeHtml(section.title || kicker)}</h2>
      <p>${escapeHtml(section.body)}</p>
      ${sourceLinksHtml(trip, section.sourceIds, 4)}
    </article>`);
  }
  const food = (guide.food ?? []).filter((item) => item?.name);
  const photoSpots = (guide.photoSpots ?? []).filter((item) => item?.name);
  const pitfalls = (guide.pitfalls ?? []).filter((item) => item?.title);
  const tips = (guide.tips ?? []).filter((item) => item?.body);

  const foodHtml = food.length ? `<article class="guide-card guide-list-card">
    <p class="guide-kicker">吃什么</p><h2>本地味道</h2>
    <div class="guide-list">${food.map((item) => `<div class="guide-list-item"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description ?? '')}</p>${sourceLinksHtml(trip, item.sourceIds, 3)}</div>`).join('')}</div>
  </article>` : '';
  const photoHtml = photoSpots.length ? `<article class="guide-card guide-list-card">
    <p class="guide-kicker">去哪儿拍</p><h2>打卡点</h2>
    <div class="guide-list">${photoSpots.map((item) => `<div class="guide-list-item"><strong>${escapeHtml(item.name)} <span class="guide-meta">${escapeHtml(item.area ?? '')} · ${escapeHtml(item.bestTime ?? '')}</span></strong><p>${escapeHtml(item.tip ?? '')}</p>${sourceLinksHtml(trip, item.sourceIds, 3)}</div>`).join('')}</div>
  </article>` : '';
  const tipsHtml = tips.length ? `<article class="guide-card guide-list-card">
    <p class="guide-kicker">实用贴士</p><h2>少走弯路</h2>
    <ul class="guide-tips">${tips.map((item) => `<li><strong>${escapeHtml(item.title || '贴士')}</strong>：${escapeHtml(item.body)}${sourceLinksHtml(trip, item.sourceIds, 2)}</li>`).join('')}</ul>
  </article>` : '';
  const pitfallHtml = pitfalls.length ? `<section class="pitfalls" id="pitfalls" aria-labelledby="pitfalls-title">
    <div class="section-head"><h2 id="pitfalls-title" class="section-title">避坑与踩雷</h2><p>先看这一节，能省不少麻烦</p></div>
    <div class="pitfall-grid">${pitfalls.map((item) => `<article class="pitfall-card" data-severity="${escapeAttr(item.severity ?? 'medium')}">
      <div class="pitfall-top"><span class="pitfall-severity">${escapeHtml(PITFALL_SEVERITY_LABELS[item.severity] ?? '中')}</span><span class="pitfall-category">${escapeHtml(PITFALL_CATEGORY_LABELS[item.category] ?? item.category ?? '提醒')}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
      ${sourceLinksHtml(trip, item.sourceIds, 3)}
    </article>`).join('')}</div>
  </section>` : '';

  if (!blocks.length && !foodHtml && !photoHtml && !tipsHtml && !pitfallHtml) return '';
  return `<section class="guide-section" id="guide" aria-labelledby="guide-title">
    <div class="section-head"><h2 id="guide-title" class="section-title">目的地手册</h2><p>文化、吃喝、拍照和避坑；每块都带来源</p></div>
    ${blocks.length ? `<div class="guide-grid">${blocks.join('')}</div>` : ''}
    ${foodHtml || photoHtml ? `<div class="guide-grid guide-grid-2">${foodHtml}${photoHtml}</div>` : ''}
    ${tipsHtml}
    ${pitfallHtml}
  </section>`;
}

function renderItemDetail(item) {
  const detail = item.detail;
  if (!detail || typeof detail !== 'object') return '';
  const highlights = Array.isArray(detail.highlights) ? detail.highlights.filter(Boolean) : [];
  if (!detail.description && !highlights.length && !detail.photoTip) return '';
  return `<details class="item-story">
    <summary>看点与故事</summary>
    ${detail.description ? `<p>${escapeHtml(detail.description)}</p>` : ''}
    ${highlights.length ? `<ul>${highlights.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
    ${detail.photoTip ? `<p class="photo-tip">拍照：${escapeHtml(detail.photoTip)}</p>` : ''}
  </details>`;
}

function renderDay(day, index, trip, sources, currency) {
  const items = day.items ?? [];
  const weather = renderWeather(day, sources);
  const transitMinutes = items.reduce((sum, item) => sum + (Number(item.transit?.durationMin) || 0), 0);
  return `<section class="day day-c${index + 1}" id="day-${index + 1}" data-day="${index + 1}" data-day-index="${index}">
    <header class="day-head">
      <div class="day-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div>
      <div class="day-title-wrap">
        <h2>${escapeHtml(day.title || `Day ${index + 1}`)}</h2>
        <p class="day-sub">${escapeHtml(formatDateZh(day.date, { withYear: false }))} ${escapeHtml(day.weekday ?? '')}${day.area ? ` · ${escapeHtml(day.area)}` : ''}</p>
        <div class="day-actions edit-only">
          <button type="button" class="btn btn-small" data-edit-day="${index}">编辑这天</button>
          <button type="button" class="btn btn-small" data-add-item="${index}">+ 添加项目</button>
        </div>
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
  if (!weather) return `<div class="day-weather"><span class="weather-label">天气待补</span></div>`;
  const icon = WEATHER_CODES[weather.weatherCode]?.icon ?? 'cloud';
  const source = weather.sourceId ? sources.get(weather.sourceId) : null;
  const sourceUrl = safeUrl(source?.url);
  return `<div class="day-weather">
    <div class="weather-icon" aria-hidden="true">${weatherIcon(icon)}</div>
    <strong>${weather.high != null ? `${Math.round(weather.high)}°` : '—'}${weather.low != null ? ` / ${Math.round(weather.low)}°` : ''}</strong>
    <span class="weather-label">${escapeHtml(weather.summary ?? '天气')}${weather.climate ? ' · 气候' : ''}</span>
    ${weather.precipitationProbability != null ? `<span class="weather-label">降雨 ${weather.precipitationProbability}%</span>` : ''}
    ${sourceUrl ? `<a class="weather-source" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer" data-external title="打开 Open-Meteo 来源">天气来源</a>` : ''}
  </div>`;
}

function renderItem(item, day, dayIndex, trip, sources, currency) {
  const place = item.place ?? {};
  const type = item.type ?? 'other';
  const time = item.start && item.end ? `${item.start}–${item.end}` : (item.start ?? '');
  let duration = '';
  if (item.start && item.end) {
    try { duration = formatDuration(durationMinutes(item.start, item.end)); } catch { duration = ''; }
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
    const query = encodeURIComponent(`${place.name} ${trip.meta.destination.name}`);
    links.push(`<a href="https://www.amap.com/search?query=${query}" target="_blank" rel="noopener noreferrer" data-external>高德搜索</a>`);
  }
  links.push(`<button type="button" class="edit-only" data-edit-item="${escapeAttr(item.id)}">编辑</button>`);
  links.push(`<button type="button" class="edit-only" data-move-item="${escapeAttr(item.id)}" data-move-dir="up" aria-label="上移">上移</button>`);
  links.push(`<button type="button" class="edit-only" data-move-item="${escapeAttr(item.id)}" data-move-dir="down" aria-label="下移">下移</button>`);
  links.push(`<button type="button" class="edit-only is-danger" data-delete-item="${escapeAttr(item.id)}">删除</button>`);

  const chips = [];
  if (item.cost?.amount != null) {
    chips.push(`<span class="chip-static is-cost">${escapeHtml(formatCents(Number(item.cost.amount) * 100, item.cost.currency ?? currency))}</span>`);
  }
  if (item.booking?.required) {
    chips.push(`<span class="chip-static is-booking">预约 ${escapeHtml(BOOKING_STATUS_LABELS[item.booking.status] ?? item.booking.status ?? '待确认')}</span>`);
  }
  if (item.transit) {
    chips.push(`<span class="chip-static">${escapeHtml(TRANSIT_LABELS[item.transit.mode] ?? item.transit.mode)} ${item.transit.durationMin ?? '?'} 分钟</span>`);
  }
  const transit = item.transit
    ? `<div class="transit-line"><span>从上一站</span><span class="transit-mode">${escapeHtml(TRANSIT_LABELS[item.transit.mode] ?? item.transit.mode)}</span><span>${item.transit.durationMin ?? '?'} 分钟</span>${item.transit.distanceKm ? `<span>· ${item.transit.distanceKm} km</span>` : ''}${item.transit.note ? `<span>· ${escapeHtml(item.transit.note)}</span>` : ''}</div>`
    : '';
  const bookingUrl = safeUrl(item.booking?.url);
  const booking = item.booking?.required ? `<div class="transit-line"><span>预约</span><span>${escapeHtml(BOOKING_STATUS_LABELS[item.booking.status] ?? item.booking.status ?? '待确认')}</span>${item.booking.deadline ? `<span>· 截止 ${escapeHtml(item.booking.deadline)}</span>` : ''}${bookingUrl ? `· <a href="${escapeAttr(bookingUrl)}" target="_blank" rel="noopener noreferrer" data-external>官方链接</a>` : ''}</div>` : '';
  const sourceLinks = sourceLinksHtml(trip, item.sourceIds ?? [], 4, {
    derived: item.derived === true,
    derivation: item.derivation,
  });
  const detail = renderItemDetail(item);
  const derivedChip = item.derived === true ? '<span class="chip-static is-derived">估算</span>' : '';
  return `<article class="item type-${escapeAttr(type)}" id="item-${escapeAttr(item.id)}" data-item-id="${escapeAttr(item.id)}" data-day="${dayIndex + 1}" data-type="${escapeAttr(type)}" data-search="${escapeAttr(search)}">
    <div class="item-rail"><span class="item-time">${escapeHtml(time)}</span><span class="item-duration">${escapeHtml(duration)}</span><span class="item-dot" aria-hidden="true"></span></div>
    <div class="item-card">
      <div class="item-top"><span class="type-label">${escapeHtml(TYPE_LABELS[type] ?? type)}</span>${derivedChip}${item.booking?.deadline ? `<span class="chip-static">截止 ${escapeHtml(item.booking.deadline)}</span>` : ''}</div>
      <h3>${escapeHtml(item.title)}</h3>
      ${place.name ? `<p class="place">${escapeHtml(place.name)}${place.address ? ` · <span class="address">${escapeHtml(place.address)}</span>` : ''}</p>` : ''}
      ${transit}
      ${booking}
      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
      ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ''}
      ${detail}
      ${sourceLinks}
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
    ${items.length ? `<ul class="check-list">${items.map((item) => `<li class="check-item"><input type="checkbox" data-persist="booking:${escapeAttr(item.id)}" aria-label="${escapeAttr(item.label)}"${item.status === 'done' ? ' checked' : ''}><span>${escapeHtml(item.label)}${item.required ? ' <span class="chip-static is-booking">必做</span>' : ''}${safeUrl(item.url) ? ` <a href="${escapeAttr(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer" data-external>官方</a>` : ''}</span>${item.deadline ? `<span class="deadline" data-deadline="${escapeAttr(item.deadline)}">${escapeHtml(item.deadline)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="check-empty">还没有预约项。热门博物馆/观景台通常需要提前预约。</p>'}
  </div>`;
}


function renderEditorDialogs(currency) {
  const typeOptions = Object.entries(TYPE_LABELS).map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join('');
  const transitOptions = Object.entries(TRANSIT_LABELS).map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join('');
  const categoryOptions = Object.entries(CATEGORY_LABELS).map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join('');
  const currencyOptions = ['CNY', 'USD', 'EUR', 'JPY', 'THB', 'SGD']
    .map((value) => `<option value="${value}"${value === currency ? ' selected' : ''}>${value}</option>`)
    .join('');
  return `<dialog id="item-dialog" class="editor-dialog" aria-labelledby="item-dialog-title">
  <form id="item-form" class="editor-form" novalidate>
    <div class="editor-head"><div><p class="editor-kicker">编辑行程</p><h2 id="item-dialog-title">修改这一项</h2></div><button class="editor-close" type="button" data-editor-cancel aria-label="关闭">×</button></div>
    <input type="hidden" id="f-item-id">
    <div class="form-grid">
      <label class="field"><span>类型</span><select id="f-type">${typeOptions}</select></label>
      <label class="field field-wide"><span>标题</span><input id="f-title" type="text" maxlength="120" required placeholder="例如：云南省博物馆"></label>
      <label class="field"><span>开始</span><input id="f-start" type="time" required></label>
      <label class="field"><span>结束</span><input id="f-end" type="time" required></label>
      <label class="field field-wide"><span>地点名</span><input id="f-place-name" type="text" maxlength="120" placeholder="云南省博物馆"></label>
      <label class="field field-wide"><span>地址</span><input id="f-place-address" type="text" maxlength="200" placeholder="广福路 6393 号"></label>
      <label class="field"><span>纬度</span><input id="f-lat" type="number" step="any" min="-90" max="90" inputmode="decimal" placeholder="25.03889"></label>
      <label class="field"><span>经度</span><input id="f-lon" type="number" step="any" min="-180" max="180" inputmode="decimal" placeholder="102.71833"></label>
      <p class="field-hint field-wide">经纬度使用 WGS84；不填坐标时这项不会出现在地图上。</p>
      <label class="field"><span>交通方式</span><select id="f-transit-mode"><option value="">不填</option>${transitOptions}</select></label>
      <label class="field"><span>交通分钟</span><input id="f-transit-min" type="number" min="0" max="1440" step="1" inputmode="numeric"></label>
      <label class="field"><span>距离 km</span><input id="f-distance-km" type="number" min="0" max="2000" step="0.1" inputmode="decimal"></label>
      <label class="field"><span>费用金额</span><input id="f-cost-amount" type="number" min="0" step="0.01" inputmode="decimal"></label>
      <label class="field"><span>币种</span><select id="f-cost-currency">${currencyOptions}</select></label>
      <label class="field"><span>费用分类</span><select id="f-cost-category">${categoryOptions}</select></label>
      <label class="field field-wide"><span>备注</span><textarea id="f-notes" rows="3" maxlength="800" placeholder="开放时间、注意事项、为什么这样排…"></textarea></label>
      <label class="field field-wide"><span>景点介绍（卡片内展开）</span><textarea id="f-detail-description" rows="3" maxlength="1200" placeholder="为什么值得去、历史/文化背景…"></textarea></label>
      <label class="field field-wide"><span>看点（一行一个）</span><textarea id="f-detail-highlights" rows="3" maxlength="1200" placeholder="三塔倒影&#10;南诏建极大钟"></textarea></label>
      <label class="field field-wide"><span>拍照建议</span><input id="f-detail-photo" type="text" maxlength="300" placeholder="上午顺光，倒影池…"></label>
      <label class="field"><span>开放时间</span><input id="f-opening-hours" type="text" maxlength="120" placeholder="09:00–17:00，周一闭馆"></label>
      <label class="field"><span>票价</span><input id="f-ticket-price" type="text" maxlength="120" placeholder="免费 / ¥60"></label>
      <label class="field field-wide"><span>预约链接</span><input id="f-booking-url" type="url" maxlength="500" placeholder="https://…"></label>
      <label class="field"><span>预约截止</span><input id="f-booking-deadline" type="date"></label>
      <label class="field field-check"><input id="f-booking-required" type="checkbox"><span>需要预约</span></label>
    </div>
    <p id="item-editor-error" class="form-error" role="alert" hidden></p>
    <div class="editor-actions">
      <button class="btn btn-danger" type="button" data-editor-delete>删除</button>
      <span class="editor-spacer"></span>
      <button class="btn" type="button" data-editor-cancel>取消</button>
      <button class="btn btn-primary" type="button" data-editor-save>保存</button>
    </div>
  </form>
</dialog>
<dialog id="day-dialog" class="editor-dialog" aria-labelledby="day-dialog-title">
  <form id="day-form" class="editor-form" novalidate>
    <div class="editor-head"><div><p class="editor-kicker">编辑行程</p><h2 id="day-dialog-title">修改当天标题</h2></div><button class="editor-close" type="button" data-day-cancel aria-label="关闭">×</button></div>
    <div class="form-grid">
      <label class="field field-wide"><span>当天标题</span><input id="f-day-title" type="text" maxlength="80" required></label>
      <label class="field field-wide"><span>区域</span><input id="f-day-area" type="text" maxlength="80" placeholder="例如：五华区 / 古城区"></label>
    </div>
    <p id="day-editor-error" class="form-error" role="alert" hidden></p>
    <div class="editor-actions"><span class="editor-spacer"></span><button class="btn" type="button" data-day-cancel>取消</button><button class="btn btn-primary" type="button" data-day-save>保存</button></div>
  </form>
</dialog>`;
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
