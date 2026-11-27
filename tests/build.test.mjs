import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadTrip } from '../src/core/trip.mjs';
import { renderHtml } from '../src/render/html.mjs';
import { renderMap } from '../src/render/map.mjs';
import { sourceLinksHtml } from '../src/render/sources.mjs';
import { buildIcs } from '../src/render/ics.mjs';
import { buildMarkdown, buildSourcesMarkdown } from '../src/render/markdown.mjs';
import { sha256 } from '../src/core/ids.mjs';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TRIP = path.join(ROOT, 'examples/guangzhou-3d/trip.json');
const NOW = '2026-11-27T00:00:00.000Z';

test('渲染：单文件 HTML、Leaflet 地图、Markdown 与 ICS 都包含关键内容', async () => {
  const trip = await loadTrip(TRIP);
  const now = new Date(NOW);
  const html = await renderHtml(trip, { now });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /id="trip-map"/);
  assert.match(html, /id="map-feedback"/);
  assert.match(html, /data-action="edit"/);
  assert.match(html, /id="item-dialog"/);
  assert.match(html, /data-external/);
  assert.match(html, /source-link/);
  assert.doesNotMatch(html, /id="map-svg"/);
  assert.doesNotMatch(html, /id="sources-section"/);
  assert.doesNotMatch(html, /来源覆盖/);
  assert.match(html, /广州/);
  assert.match(html, /data-action="ics"/);
  assert.match(html, /ics-data/);

  const map = renderMap(trip);
  assert.equal(map.empty ?? false, false);
  assert.ok(map.points > 0);
  assert.match(map.html, /id="trip-map"/);
  assert.match(map.html, /map-feedback/);
  assert.doesNotMatch(map.html, /<svg[^>]*class="map-svg"/);

  const official = trip.sources.find((source) => source.provider === 'official');
  const manual = trip.sources.find((source) => !source.url && source.provider === 'manual');
  if (official) {
    const officialLinks = sourceLinksHtml(trip, [official.id, official.id]);
    assert.match(officialLinks, /data-external/);
    assert.equal((officialLinks.match(/class="source-link"/g) ?? []).length, 1);
  }
  if (manual) {
    const manualLinks = sourceLinksHtml(trip, [manual.id]);
    assert.match(manualLinks, /source-manual/);
    assert.doesNotMatch(manualLinks, /<a /);
  }

  const markdown = buildMarkdown(trip);
  assert.match(markdown, /广州/);
  assert.match(markdown, /Day 1/);
  assert.match(buildSourcesMarkdown(trip), /来源/);

  const ics = buildIcs(trip, { now });
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:/);
  assert.match(ics, /GEO:/);
});

test('CLI：check --strict 通过，build 原子产物与回执哈希正确', async () => {
  const check = await execFileAsync(process.execPath, [
    'bin/travel-guide.mjs', 'check', '--trip', TRIP, '--strict', '--json', '--now', NOW,
  ], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
  const checkResult = JSON.parse(check.stdout);
  assert.equal(checkResult.ok, true, JSON.stringify(checkResult.errors));

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-guide-build-'));
  try {
    const build = await execFileAsync(process.execPath, [
      'bin/travel-guide.mjs', 'build', '--trip', TRIP, '--out', outDir,
      '--allow-unverified', '--now', NOW, '--json',
    ], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
    const result = JSON.parse(build.stdout);
    assert.equal(result.ok, true);
    const files = ['index.html', 'itinerary.md', 'sources.md', 'trip.ics', 'build-receipt.json'];
    for (const file of files) {
      const stat = await fs.stat(path.join(outDir, file));
      assert.ok(stat.size > 0, `${file} 为空`);
    }
    const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
    const ics = await fs.readFile(path.join(outDir, 'trip.ics'), 'utf8');
    const receipt = JSON.parse(await fs.readFile(path.join(outDir, 'build-receipt.json'), 'utf8'));
    assert.match(html, /id="trip-map"/);
    assert.match(ics, /^BEGIN:VCALENDAR/);
    assert.equal(receipt.outputs['index.html'], sha256(html));
    assert.equal(receipt.outputs['trip.ics'], sha256(ics));
    assert.equal(receipt.counts.sources, 12);
    assert.equal(receipt.providerTransports['open-meteo'].snapshot, 1);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});

test('CLI：expenses 汇总示例账本；init 生成可继续编辑的骨架', async () => {
  const expenses = await execFileAsync(process.execPath, [
    'bin/travel-guide.mjs', 'expenses', '--trip', TRIP, '--json',
  ], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(expenses.stdout);
  assert.equal(result.baseCurrency, 'CNY');
  assert.equal(result.summary.totalCents, 96000);
  assert.equal(result.summary.transfers.length, 1);
  assert.deepEqual(
    [result.summary.transfers[0].from, result.summary.transfers[0].to, result.summary.transfers[0].amountCents],
    ['小林', '小周', 8000],
  );

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-guide-init-'));
  try {
    const init = await execFileAsync(process.execPath, [
      'bin/travel-guide.mjs', 'init', '--destination', '测试城', '--start', '2027-01-01',
      '--days', '3', '--travelers', '2', '--out', outDir, '--json',
    ], { cwd: ROOT });
    const created = JSON.parse(init.stdout);
    assert.equal(created.endDate, '2027-01-03');
    const trip = JSON.parse(await fs.readFile(path.join(outDir, 'trip.json'), 'utf8'));
    assert.equal(trip.meta.days, 3);
    assert.equal(trip.days.length, 3);
    assert.equal(trip.meta.travelers, 2);
    assert.match(await fs.readFile(path.join(outDir, 'expenses.csv'), 'utf8'), /^date,item,category/);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
