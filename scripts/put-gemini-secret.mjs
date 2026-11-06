#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const vars = readFileSync(path.join(root, '.dev.vars'), 'utf8');
const key = vars.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key || key === 'YOUR_KEY' || key.length < 20) {
  console.error('No real GEMINI_API_KEY found in .dev.vars');
  process.exit(1);
}
console.log(`Uploading GEMINI_API_KEY (len=${key.length}, prefix=${key.slice(0, 6)})…`);
const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'secret', 'put', 'GEMINI_API_KEY', '--name', 'teamup'],
  { cwd: root, input: key, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] },
);
process.exit(result.status ?? 1);
