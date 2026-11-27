const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g;
const LANDLINE_RE = /(?<!\d)0\d{2,3}[-\s]?\d{7,8}(?!\d)/g;
const ID_RE = /(?<!\d)\d{17}[\dXx](?!\d)/g;
const ORDER_RE = /\b(?:订单|确认号|confirmation|booking)[:：\s]*[A-Z0-9-]{6,}\b/gi;

export function redactText(value) {
  return String(value ?? '')
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
    .replace(LANDLINE_RE, '[phone]')
    .replace(ID_RE, '[id]')
    .replace(ORDER_RE, (match) => `${match.split(/[:：]/)[0]}：[redacted]`);
}

export function scanPii(value, path = '$') {
  const findings = [];
  if (typeof value === 'string') {
    const patterns = [
      ['email', EMAIL_RE],
      ['phone', PHONE_RE],
      ['landline', LANDLINE_RE],
      ['id', ID_RE],
      ['order', ORDER_RE],
    ];
    for (const [type, re] of patterns) {
      re.lastIndex = 0;
      if (re.test(value)) findings.push({ path, type });
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...scanPii(entry, `${path}[${index}]`)));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      findings.push(...scanPii(entry, `${path}.${key}`));
    }
  }
  return findings;
}

export function publicTrip(trip) {
  const copy = structuredClone(trip);
  if (copy.meta) {
    if (typeof copy.meta.travelers !== 'number') copy.meta.travelers = 1;
    copy.meta.notes = copy.meta.notes ? redactText(copy.meta.notes) : copy.meta.notes;
    delete copy.meta.contact;
    delete copy.meta.bookingReference;
  }
  if (copy.emergency) {
    copy.emergency.contacts = [];
    copy.emergency.notes = (copy.emergency.notes ?? []).map(redactText);
    copy.emergency.redacted = true;
  }
  for (const day of copy.days ?? []) {
    for (const item of day.items ?? []) {
      item.notes = item.notes ? redactText(item.notes) : item.notes;
      if (item.booking) {
        delete item.booking.confirmation;
        delete item.booking.reference;
        item.booking.note = item.booking.note ? redactText(item.booking.note) : item.booking.note;
      }
    }
  }
  copy.meta = { ...copy.meta, publicMode: true };
  return copy;
}

export function redactSecret(text, secret) {
  if (!secret) return text;
  return String(text).split(secret).join('[redacted]');
}

export function redactEnvSummary(env = process.env) {
  const keys = Object.keys(env).filter((key) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key));
  return Object.fromEntries(keys.map((key) => [key, env[key] ? 'set' : 'unset']));
}
