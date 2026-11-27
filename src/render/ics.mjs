import { zonedDateTimeToUtc } from '../core/dates.mjs';
import { sourceIndex } from '../core/provenance.mjs';

const ITEM_TYPES = new Set(['anchor', 'meal', 'transit', 'hotel', 'rest']);

export function buildIcs(trip, { now = new Date() } = {}) {
  const timezone = trip.meta.destination.timezone || 'Asia/Shanghai';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//travel-guide//v0.1//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(trip.meta.title)}`,
    `X-WR-TIMEZONE:${escapeIcs(timezone)}`,
  ];
  const dtstamp = formatUtc(now);
  const sources = sourceIndex(trip);
  for (const day of trip.days ?? []) {
    for (const item of day.items ?? []) {
      if (!ITEM_TYPES.has(item.type)) continue;
      if (!item.start || !item.end) continue;
      const start = zonedDateTimeToUtc(day.date, item.start, timezone);
      const end = zonedDateTimeToUtc(day.date, item.end, timezone);
      const location = [item.place?.name, item.place?.address].filter(Boolean).join('，');
      const sourceLines = (item.sourceIds ?? [])
        .map((id) => sources.get(id))
        .filter((source) => source?.url)
        .map((source) => `来源：${source.title || source.provider} ${source.url}`);
      const description = [
        item.notes,
        item.booking?.note,
        item.booking?.url ? `预约：${item.booking.url}` : '',
        ...sourceLines,
      ].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeIcs(`${trip.meta.id}-${item.id}@travel-guide`)}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${formatUtc(start)}`,
        `DTEND:${formatUtc(end)}`,
        `SUMMARY:${escapeIcs(item.title)}`,
        location ? `LOCATION:${escapeIcs(location)}` : '',
        description ? `DESCRIPTION:${escapeIcs(description)}` : '',
        item.place?.lat != null && item.place?.lon != null
          ? `GEO:${Number(item.place.lat).toFixed(6)};${Number(item.place.lon).toFixed(6)}`
          : '',
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.filter((line) => line !== '').map(foldLine).join('\r\n') + '\r\n';
}

export function escapeIcs(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function formatUtc(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export function foldLine(line) {
  const max = 72;
  if (line.length <= max) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, max));
  rest = rest.slice(max);
  while (rest.length) {
    parts.push(` ${rest.slice(0, max - 1)}`);
    rest = rest.slice(max - 1);
  }
  return parts.join('\r\n');
}
