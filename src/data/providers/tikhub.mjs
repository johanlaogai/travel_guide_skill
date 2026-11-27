import { fetchJson } from '../../core/http.mjs';
import { cacheKey } from '../../core/cache.mjs';
import { sha256 } from '../../core/ids.mjs';
import { UsageError } from '../../core/errors.mjs';

const DEFAULT_BASE = 'https://api.tikhub.io';
const NOTE_PATH = '/api/v1/xiaohongshu/app_v2/get_image_note_detail';
const NOTE_ID_RE = /^[0-9a-f]{24}$/i;
const ALLOWED_HOSTS = new Set(['www.xiaohongshu.com', 'xiaohongshu.com', 'xhslink.com', 'www.xhslink.com', 'xhslink.cn']);
const DEFAULT_UNIT_PRICE = 0.01;
const MAX_NOTES = 5;

export function unitPriceUsd() {
  const value = Number(process.env.TIKHUB_UNIT_PRICE_USD ?? DEFAULT_UNIT_PRICE);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_UNIT_PRICE;
}

export function parseShareInput(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new UsageError('缺少小红书链接或 note_id');
  if (NOTE_ID_RE.test(text)) {
    return { noteId: text, shareText: '', url: `https://www.xiaohongshu.com/explore/${text}`, host: 'xiaohongshu.com' };
  }
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) throw new UsageError('没有识别到小红书链接；请粘贴分享链接或 24 位 note_id');
  let url;
  try {
    url = new URL(match[0]);
  } catch {
    throw new UsageError('小红书链接格式无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UsageError('只支持 http(s) 链接');
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new UsageError(`只支持 xiaohongshu.com / xhslink.com / xhslink.cn，收到：${url.hostname}`);
  }
  const noteId = url.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-f]{24})/i)?.[1];
  if (!noteId && url.hostname.includes('xiaohongshu.com')) {
    throw new UsageError('链接里没有 24 位 note_id；请使用完整笔记链接或直接给 note_id');
  }
  return {
    noteId: noteId ?? '',
    shareText: text,
    url: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : url.toString(),
    host: url.hostname.toLowerCase(),
  };
}

export function estimateCostUsd(notes = 1, unit = unitPriceUsd()) {
  return Math.round(notes * unit * 100) / 100;
}

export async function importNote(options, ctx) {
  const {
    input,
    maxCostUsd = 0,
    dryRun = false,
    maxNotes = 1,
    allowPaid = false,
  } = options;
  if (maxNotes > MAX_NOTES) throw new UsageError(`一次最多导入 ${MAX_NOTES} 条笔记`);
  const parsed = parseShareInput(input);
  const unit = unitPriceUsd();
  const estimated = estimateCostUsd(1, unit);
  if (dryRun) {
    return {
      dryRun: true,
      ...parsed,
      unitPriceUsd: unit,
      estimatedCostUsd: estimated,
      maxCostUsd,
      keyConfigured: Boolean(process.env.TIKHUB_API_KEY),
      allowedHosts: [...ALLOWED_HOSTS],
    };
  }
  if (!allowPaid) {
    throw new UsageError('TikHub 是按次计费的第三方 API；请先明确同意，并传 --tikhub 与 --max-cost-usd');
  }
  const apiKey = process.env.TIKHUB_API_KEY;
  if (!apiKey) throw new UsageError('未设置 TIKHUB_API_KEY；不要调用付费接口，可改用粘贴文字/截图');
  if (!(Number(maxCostUsd) >= estimated)) {
    throw new UsageError(`成本护栏拒绝：本次预计 $${estimated.toFixed(2)}，--max-cost-usd=${maxCostUsd}`);
  }

  const baseUrl = ctx?.baseUrl ?? process.env.TRAVEL_GUIDE_TIKHUB_BASE ?? DEFAULT_BASE;
  const cacheId = parsed.noteId || sha256(parsed.shareText);
  const key = cacheKey('tikhub', `note:${cacheId}`, '');
  const cached = await ctx.cache.get('tikhub', key, { ttlKey: 'tikhub' });
  if (cached) {
    return {
      ...cached.body,
      fromCache: true,
      costUsd: 0,
      unitPriceUsd: unit,
      cacheStale: cached.stale,
      keyConfigured: true,
    };
  }

  const params = new URLSearchParams();
  if (parsed.noteId) params.set('note_id', parsed.noteId);
  else params.set('share_text', parsed.shareText);
  const url = `${baseUrl}${NOTE_PATH}?${params}`;
  let raw;
  try {
    raw = await fetchJson(url, {
      provider: 'tikhub',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      proxy: ctx?.proxy,
      timeoutMs: 30_000,
    });
  } catch (error) {
    const message = String(error?.message ?? error).split(apiKey).join('[redacted]');
    throw new UsageError(`TikHub 请求失败（不会自动重试，避免重复扣费）：${message}`);
  }
  const note = normalizeNote(raw, parsed);
  const result = {
    note,
    ...parsed,
    url: parsed.url,
    apiUrl: url,
    fetchedAt: new Date().toISOString(),
    costUsd: estimated,
    unitPriceUsd: unit,
    rawHash: sha256(raw),
    fromCache: false,
    keyConfigured: true,
  };
  await ctx.cache.set('tikhub', key, {
    url: apiUrlForCache(url),
    status: 200,
    body: result,
    headers: {},
  });
  return result;
}

function apiUrlForCache(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('share_text');
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeNote(raw, parsed) {
  const data = raw?.data ?? raw;
  const note = data?.note ?? data?.note_card ?? data?.items?.[0] ?? data;
  const noteCard = note?.note_card ?? note?.noteCard ?? note;
  const title = firstString([
    noteCard?.title,
    note?.title,
    noteCard?.desc?.slice(0, 60),
  ]);
  const desc = firstString([
    noteCard?.desc,
    note?.desc,
    noteCard?.content,
  ]);
  const tagList = noteCard?.tag_list ?? note?.tag_list ?? note?.tags ?? [];
  const tags = Array.isArray(tagList)
    ? tagList.map((tag) => (typeof tag === 'string' ? tag : tag?.name)).filter(Boolean)
    : [];
  const imageList = noteCard?.image_list ?? note?.image_list ?? note?.images ?? [];
  const images = Array.isArray(imageList)
    ? imageList.map((image) => image?.url_default ?? image?.url ?? image?.url_pre ?? image).filter(Boolean)
    : [];
  const user = note?.user ?? noteCard?.user ?? {};
  const noteId = noteCard?.note_id ?? note?.note_id ?? note?.id ?? parsed.noteId ?? '';
  return {
    noteId,
    title: title || `小红书笔记 ${noteId}`.trim(),
    desc,
    tags,
    images,
    author: firstString([user?.nickname, user?.name, note?.nickname]),
    avatar: user?.avatar ?? '',
    interact: note?.interact_info ?? noteCard?.interact_info ?? {},
    url: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : parsed.url,
    rawKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 20) : [],
  };
}

function firstString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export const TIKHUB_NOTE_PATH = NOTE_PATH;
export const TIKHUB_ALLOWED_HOSTS = [...ALLOWED_HOSTS];
