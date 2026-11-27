import { createHash } from 'node:crypto';

export function sha256(value) {
  const input = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(input).digest('hex');
}

export function shortHash(value, length = 8) {
  return sha256(value).slice(0, length);
}

export function stableId(prefix, ...parts) {
  return `${prefix}-${shortHash(parts.map((p) => String(p)).join('|'))}`;
}

export function slugify(input) {
  const base = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'trip';
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

export function uniqueId(existingIds, base) {
  let candidate = base;
  let i = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  existingIds.add(candidate);
  return candidate;
}
