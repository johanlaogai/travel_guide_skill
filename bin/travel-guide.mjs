#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main(process.argv.slice(2)).catch((error) => {
  const debug = process.argv.includes('--debug');
  console.error(`\n✖ ${error.message}`);
  if (debug && error.stack) console.error(error.stack);
  process.exit(error.exitCode ?? 1);
});
