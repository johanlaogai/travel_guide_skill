import { spawn } from 'node:child_process';
import { ProviderError } from './errors.mjs';

export const USER_AGENT =
  'travel-guide-skill/0.1 (+https://github.com/johanlaogai/travel_guide_skill)';

export class HttpError extends ProviderError {
  constructor(message, options = {}) {
    super(message, { code: 'EHTTP', provider: options.provider, status: options.status, ...options });
    this.name = 'HttpError';
    this.body = options.body;
    this.url = options.url;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, options = {}) {
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? 25_000;
  const headers = {
    accept: 'application/json',
    'user-agent': options.userAgent ?? USER_AGENT,
    ...(options.headers ?? {}),
  };
  const proxy = options.proxy ?? process.env.TRAVEL_GUIDE_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (proxy) {
    return curlJson(url, { ...options, method, timeoutMs, headers, proxy });
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
  } catch (error) {
    throw new HttpError(`请求失败：${options.provider ?? ''} ${url}\n${error.message}`, {
      provider: options.provider,
      url,
      status: 0,
      cause: error,
    });
  }
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status}：${options.provider ?? ''} ${url}\n${text.slice(0, 500)}`, {
      provider: options.provider,
      url,
      status: response.status,
      body: text,
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(`响应不是 JSON：${options.provider ?? ''} ${url}\n${text.slice(0, 300)}`, {
      provider: options.provider,
      url,
      status: response.status,
      body: text,
      cause: error,
    });
  }
}

async function curlJson(url, options) {
  const args = ['-sS', '--compressed', '--max-time', String(Math.ceil(options.timeoutMs / 1000)), '--proxy', options.proxy];
  args.push('-X', options.method);
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    args.push('-H', `${key}: ${value}`);
  }
  if (options.body !== undefined) args.push('--data-binary', String(options.body));
  args.push('--write-out', '\\n%{http_code}', url);
  const result = await new Promise((resolve, reject) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  }).catch((error) => {
    throw new HttpError(`curl 请求失败：${url}\n${error.message}`, { provider: options.provider, url, status: 0 });
  });
  const marker = result.stdout.lastIndexOf('\n');
  const text = marker >= 0 ? result.stdout.slice(0, marker) : result.stdout;
  const status = Number(result.stdout.slice(marker + 1).trim()) || 0;
  if (result.code !== 0 || status < 200 || status >= 300) {
    throw new HttpError(`curl HTTP ${status}：${url}\n${(result.stderr || text).slice(0, 500)}`, {
      provider: options.provider,
      url,
      status,
      body: text,
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(`curl 响应不是 JSON：${url}\n${text.slice(0, 300)}`, {
      provider: options.provider,
      url,
      status,
      body: text,
      cause: error,
    });
  }
}

export async function withRetry(fn, options = {}) {
  const attempts = options.attempts ?? 2;
  const baseMs = options.baseMs ?? 600;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const status = error?.status ?? 0;
      const retryable = status === 0 || status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === attempts - 1) throw error;
      const retryAfter = Number(error?.retryAfter ?? 0);
      const delay = Math.max(baseMs * 2 ** attempt, retryAfter * 1000);
      if (options.onRetry) options.onRetry({ attempt, delay, error });
      await sleep(delay);
    }
  }
  throw lastError;
}
