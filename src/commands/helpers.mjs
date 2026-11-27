import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError } from '../core/errors.mjs';

export function parse(command, argv, options) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: false, strict: true });
  } catch (error) {
    throw new UsageError(`${command}: ${error.message}`);
  }
}

export function requireOption(values, key, message) {
  const value = values[key];
  if (value === undefined || value === null || value === '') throw new UsageError(message ?? `缺少 --${key}`);
  return value;
}

export function nowFrom(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new UsageError(`--now 不是有效时间：${value}`);
  return date;
}

export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export async function ensureOutDir(outDir) {
  await fs.mkdir(outDir, { recursive: true });
  return outDir;
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function defaultTripPath(outDir) {
  return path.join(outDir, 'trip.json');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((key, index) => [key.trim(), cells[index]?.trim() ?? ''])));
}

export function formatIssue(issue) {
  const where = issue.where ? ` [${issue.where}]` : '';
  return `${issue.code}${where}: ${issue.message}`;
}

export function shortPath(filePath) {
  const cwd = process.cwd();
  return filePath.startsWith(cwd) ? path.relative(cwd, filePath) : filePath;
}
