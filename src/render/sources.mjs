import {
  CONFIDENCE_LABELS,
  PROVIDER_LABELS,
  isHttpUrl,
} from '../core/provenance.mjs';

export function sourceBadgeHtml(source) {
  if (!source) return '';
  const label = `${PROVIDER_LABELS[source.provider] ?? source.provider} · ${CONFIDENCE_LABELS[source.confidence] ?? source.confidence}`;
  const title = [
    source.title,
    source.url,
    source.retrievedAt ? `抓取：${source.retrievedAt}` : '',
    source.license ? `许可：${source.license}` : '',
  ].filter(Boolean).join('\n');
  const inner = `<span class="badge-dot" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  if (isHttpUrl(source.url)) {
    return `<a class="source-badge" data-confidence="${escapeAttr(source.confidence)}" href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(title)}">${inner}</a>`;
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

export function sourceLabel(source) {
  return `${PROVIDER_LABELS[source.provider] ?? source.provider} · ${CONFIDENCE_LABELS[source.confidence] ?? source.confidence}`;
}

export function attributionHtml() {
  return [
    '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a>（CC BY 4.0）',
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>（ODbL）',
    '<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">发现地图错误？</a>',
    '<a href="https://www.mediawiki.org/wiki/Wikimedia_APIs" target="_blank" rel="noopener noreferrer">Wikimedia</a>（CC BY-SA 4.0）',
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
