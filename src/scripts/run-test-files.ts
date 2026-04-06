import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function collectTests(targetPath: string, output: string[]): void {
  let stats;
  try {
    stats = statSync(targetPath);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    for (const entry of readdirSync(targetPath)) {
      collectTests(join(targetPath, entry), output);
    }
    return;
  }

  if (stats.isFile() && targetPath.endsWith('.test.js')) {
    output.push(targetPath);
  }
}

const roots = process.argv.slice(2);
const targets = roots.length > 0 ? roots : ['dist'];
const files: string[] = [];
for (const target of targets) {
  collectTests(resolve(target), files);
}

files.sort();

if (files.length === 0) {
  console.error(`No test files found under: ${targets.join(', ')}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
