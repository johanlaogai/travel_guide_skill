import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, printJson } from './helpers.mjs';
import { run as runBuild } from './build.mjs';
import { pathExists } from '../core/atomic.mjs';
import { UsageError } from '../core/errors.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export async function run(argv) {
  const { values } = parse('demo', argv, {
    out: { type: 'string', default: '.tmp/demo' },
    now: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const tripPath = path.join(ROOT, 'examples', 'guangzhou-3d', 'trip.json');
  if (!(await pathExists(tripPath))) {
    throw new UsageError(`示例不存在：${tripPath}`);
  }
  const outDir = path.resolve(values.out);
  const buildArgs = ['--trip', tripPath, '--out', outDir, '--allow-unverified'];
  if (values.now) buildArgs.push('--now', values.now);
  if (values.json) buildArgs.push('--json');
  const code = await runBuild(buildArgs);
  if (values.json || code !== 0) return code;
  console.log(`\n打开：file://${path.join(outDir, 'index.html')}`);
  return 0;
}
