import fs from 'node:fs/promises';
import path from 'node:path';
import { parse, ensureOutDir, printJson } from './helpers.mjs';
import { UsageError } from '../core/errors.mjs';
import { importNote, parseShareInput, estimateCostUsd } from '../data/providers/tikhub.mjs';
import { createContext } from '../data/context.mjs';
import { makeSource } from '../core/provenance.mjs';
import { writeJsonAtomic } from '../core/atomic.mjs';
import { sha256 } from '../core/ids.mjs';

export async function run(argv) {
  const { values } = parse('import', argv, {
    url: { type: 'string' },
    'note-id': { type: 'string' },
    text: { type: 'string' },
    image: { type: 'string' },
    tikhub: { type: 'boolean', default: false },
    'max-cost-usd': { type: 'string', default: '0' },
    'max-notes': { type: 'string', default: '1' },
    'dry-run': { type: 'boolean', default: false },
    out: { type: 'string', default: 'imports' },
    cache: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const input = values['note-id'] ?? values.url;
  if (!input && !values.text && !values.image) {
    throw new UsageError('需要 --url / --note-id / --text / --image 之一');
  }
  const outDir = path.resolve(values.out);
  await ensureOutDir(outDir);
  const maxCostUsd = Number(values['max-cost-usd']);
  if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0) throw new UsageError('--max-cost-usd 必须是非负数字');
  const maxNotes = Number(values['max-notes']);
  if (!Number.isInteger(maxNotes) || maxNotes < 1 || maxNotes > 5) throw new UsageError('--max-notes 必须是 1–5');

  let payload;
  if (values.tikhub) {
    if (!input) throw new UsageError('--tikhub 需要 --url 或 --note-id');
    if (maxNotes > 1) throw new UsageError('v0.1 一次只导入 1 条笔记；请分开调用，避免重复计费');
    const parsed = parseShareInput(input);
    const ctx = createContext({
      cacheDir: values.cache,
      now: () => new Date(),
    });
    const result = await importNote({
      input,
      maxCostUsd,
      maxNotes,
      dryRun: values['dry-run'],
      allowPaid: true,
    }, ctx);
    if (values['dry-run']) {
      if (values.json) printJson(result);
      else {
        console.log('TikHub 成本预估（未调用）：');
        console.log(`  note: ${result.noteId || result.shareText}`);
        console.log(`  单价: $${result.unitPriceUsd.toFixed(2)} / 次`);
        console.log(`  本次预计: $${result.estimatedCostUsd.toFixed(2)}`);
        console.log(`  Key: ${result.keyConfigured ? '已配置' : '未配置'}`);
        console.log(`  护栏: --max-cost-usd ${result.maxCostUsd}`);
      }
      return 0;
    }
    const source = makeSource({
      provider: 'tikhub',
      kind: 'ugc',
      title: result.note.title,
      url: result.note.url,
      transport: result.fromCache ? 'cache' : 'live',
      confidence: 'community',
      rawHash: result.rawHash,
      note: '第三方 API 导入的小红书笔记；仅作线索，事实需另行核验。',
      extra: { costUsd: result.costUsd },
    });
    payload = {
      importedAt: new Date().toISOString(),
      input: parsed,
      note: result.note,
      source,
      costUsd: result.costUsd,
      fromCache: result.fromCache,
      warnings: [
        '这是社区/UGC 内容，不能作为营业时间、票价、预约规则的依据。',
        '请用 Nominatim/Overpass/官方页面核验地点和动态信息。',
      ],
    };
  } else if (values.text) {
    const text = await fs.readFile(path.resolve(values.text), 'utf8');
    payload = manualPayload({
      kind: 'text',
      title: path.basename(values.text),
      text,
      inputPath: path.resolve(values.text),
      url: `manual://text/${encodeURIComponent(path.basename(values.text))}`,
    });
  } else if (values.image) {
    const imagePath = path.resolve(values.image);
    await fs.access(imagePath);
    payload = manualPayload({
      kind: 'image',
      title: path.basename(values.image),
      text: '',
      inputPath: imagePath,
      url: `manual://image/${encodeURIComponent(path.basename(values.image))}`,
    });
  } else {
    const parsed = parseShareInput(input);
    payload = {
      importedAt: new Date().toISOString(),
      input: parsed,
      note: {
        noteId: parsed.noteId,
        title: '未导入的小红书链接',
        desc: '',
        tags: [],
        images: [],
        author: '',
        url: parsed.url,
      },
      source: makeSource({
        provider: 'manual',
        kind: 'ugc',
        title: '用户提供的小红书链接（未调用付费 API）',
        url: parsed.url,
        transport: 'manual',
        confidence: 'community',
        note: '未抓取正文；请用户粘贴文字或截图。',
      }),
      costUsd: 0,
      warnings: [
        '没有调用 TikHub，因此没有正文；请让用户粘贴笔记文字或截图。',
        `如需自动导入，先确认按次费用；预估 $${estimateCostUsd(1).toFixed(2)}/条。`,
      ],
    };
  }

  const safeName = (payload.note?.noteId || `import-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
  const outPath = path.join(outDir, `${safeName}.json`);
  await writeJsonAtomic(outPath, payload);
  if (values.json) {
    printJson({ outPath, ...payload });
  } else {
    console.log(`✓ 已写入 ${outPath}`);
    if (payload.note?.title) console.log(`  标题：${payload.note.title}`);
    if (payload.note?.desc) console.log(`  正文：${payload.note.desc.slice(0, 160)}${payload.note.desc.length > 160 ? '…' : ''}`);
    for (const warning of payload.warnings ?? []) console.log(`⚠ ${warning}`);
    console.log('\n下一步：从正文/截图抽取地点，补进 trip.json，再用 Nominatim/Overpass/官方核验。');
  }
  return 0;
}

function manualPayload({ kind, title, text, inputPath, url }) {
  return {
    importedAt: new Date().toISOString(),
    input: { kind, inputPath },
    note: {
      noteId: '',
      title,
      desc: text,
      tags: [],
      images: kind === 'image' ? [inputPath] : [],
      author: '',
      url,
    },
    source: makeSource({
      provider: 'manual',
      kind: 'ugc',
      title: `手动导入：${title}`,
      url,
      transport: 'manual',
      confidence: 'community',
      rawHash: sha256(text || inputPath),
      note: '用户提供的文字/截图；仅作线索。',
    }),
    costUsd: 0,
    warnings: [
      '截图/文字由用户提供，可能不完整；请保留原链接或原图作为来源。',
      '地点和动态信息仍需用开放数据/官方页面核验。',
    ],
  };
}
