import {
  CONFIDENCE_LABELS,
  PROVIDER_LABELS,
  isHttpUrl,
} from '../core/provenance.mjs';

export function sourceBadgeHtml(source) {
  if (!source) return '';
  const label = source.label || `${PROVIDER_LABELS[source.provider] ?? source.provider} · ${CONFIDENCE_LABELS[source.confidence] ?? source.confidence}`;
  const title = [
    source.title,
    source.url,
    source.retrievedAt ? `抓取：${source.retrievedAt}` : '',
    source.license ? `许可：${source.license}` : '',
  ].filter(Boolean).join('\n');
  const inner = `<span class="badge-dot" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  if (isHttpUrl(source.url)) {
    return `<a class="source-badge" data-confidence="${escapeAttr(source.confidence)}" href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer" data-external title="${escapeAttr(title)}">${inner}</a>`;
  }
  return `<span class="source-badge" data-confidence="${escapeAttr(source.confidence)}" title="${escapeAttr(title)}">${inner}</span>`;
}

export function sourceChipsHtml(trip, ids = [], max = 4) {
  const index = new Map((trip.sources ?? []).map((source) => [source.id, source]));
  const sources = ids.map((id) => index.get(id)).filter(Boolean);
  if (!sources.length) return '<span class="source-badge is-empty">无来源</span>';
  const shown = sources.slice(0, max).map(sourceBadgeHtml).join('');
  const more = sources.length > max
    ? `<span class="source-more">+${sources.length - max}</span>`
    : '';
  return shown + more;
}


const SOURCE_TITLE_MAX = 18;

function shortSourceTitle(source) {
  const raw = String(source?.title || source?.provider || '来源').replace(/\s+/g, ' ').trim();
  return raw.length > SOURCE_TITLE_MAX ? `${raw.slice(0, SOURCE_TITLE_MAX - 1)}…` : raw;
}

/**
 * Render compact source links inside an itinerary card.
 * Manual sources are deliberately plain text, not fake buttons.
 */
export function sourceLinksHtml(trip, ids = [], max = 4, options = {}) {
  const index = new Map((trip.sources ?? []).map((source) => [source.id, source]));
  const seen = new Set();
  const seenUrls = new Set();
  const links = [];
  let manual = false;
  let manualLabel = '行程整理';
  let overflow = 0;

  for (const id of ids ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const source = index.get(id);
    if (!source) continue;
    if (!isHttpUrl(source.url)) {
      manual = true;
      manualLabel = source.label || '行程整理';
      continue;
    }
    if (seenUrls.has(source.url)) continue;
    if (links.length >= max) {
      overflow += 1;
      continue;
    }
    seenUrls.add(source.url);
    const label = source.label
      || (source.provider === 'official'
        ? `官方 · ${shortSourceTitle(source)}`
        : source.provider === 'open-meteo'
          ? '天气 · Open-Meteo'
          : `${PROVIDER_LABELS[source.provider] ?? source.provider} · ${shortSourceTitle(source)}`);
    const title = [
      source.title,
      source.url,
      source.retrievedAt ? `抓取：${source.retrievedAt}` : '',
      source.license ? `许可：${source.license}` : '',
    ].filter(Boolean).join('\n');
    links.push(`<a class="source-link" href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer" data-external title="${escapeAttr(title)}">${escapeHtml(label)}</a>`);
  }

  const parts = [...links];
  if (options.derived === true) {
    parts.push(`<span class="source-derived" title="${escapeAttr(options.derivation || '按路线与交通时间估算')}">估算 · 路线时间</span>`);
  }
  if (!links.length && manual) parts.push(`<span class="source-manual" title="由行程整理录入，非官方；请以现场为准">${escapeHtml(manualLabel)}</span>`);
  if (overflow > 0) parts.push(`<span class="source-more" title="更多来源见 sources.md">+${overflow}</span>`);
  if (!parts.length) return '';
  return `<p class="source-links"><span class="source-kicker">来源</span>${parts.join('')}</p>`;
}

export function sourceLabel(source) {
  return `${PROVIDER_LABELS[source.provider] ?? source.provider} · ${CONFIDENCE_LABELS[source.confidence] ?? source.confidence}`;
}

export function attributionHtml() {
  return [
    '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" data-external>Weather data by Open-Meteo.com</a>（CC BY 4.0）',
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" data-external>© OpenStreetMap contributors</a>（ODbL）',
    '<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer" data-external>发现地图错误？</a>',
    '<a href="https://www.mediawiki.org/wiki/Wikimedia_APIs" target="_blank" rel="noopener noreferrer" data-external>Wikimedia</a>（CC BY-SA 4.0）',
    '底图：<a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer" data-external>Esri</a> / <a href="https://www.amap.com/" target="_blank" rel="noopener noreferrer" data-external>高德地图</a> / OSM',
  ].join('<span class="sep">·</span>');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replaceAll('\n', ' ');
}

export function safeUrl(value) {
  return isHttpUrl(value) ? value : '';
}
