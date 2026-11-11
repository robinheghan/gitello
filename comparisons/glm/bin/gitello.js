#!/usr/bin/env node

import { main } from '../src/cli.js';

try {
  const code = await main(process.argv.slice(2));
  if (typeof code === 'number' && code !== 0) {
    process.exitCode = code;
  }
} catch (err) {
  process.stderr.write(`gitello: fatal error: ${err?.stack ?? err}\n`);
  process.exitCode = 1;
}
