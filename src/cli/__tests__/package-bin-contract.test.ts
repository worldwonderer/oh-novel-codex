import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { HELP_TEXT } from '../help-text.js';
import { version } from '../version.js';

type NpmPackDryRunFile = {
  path: string;
  mode?: number;
};

type NpmPackDryRunResult = {
  files?: NpmPackDryRunFile[];
};

test('package bin points at the built onx entrypoint with a shebang', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const binPath = path.join(process.cwd(), 'dist', 'cli', 'onx.js');
  const contents = await fs.readFile(binPath, 'utf8');
  const stat = await fs.stat(binPath);

  assert.equal(pkg.bin?.onx, 'dist/cli/onx.js');
  assert.equal(pkg.scripts?.['smoke:packed-install'], 'npm run build && node dist/scripts/smoke-packed-install.js');
  assert.match(contents, /^#!\/usr\/bin\/env node/);
  assert.notEqual(stat.mode & 0o111, 0);
});

test('built onx entrypoint prints the generated help text', async () => {
  const binPath = path.join(process.cwd(), 'dist', 'cli', 'onx.js');
  const result = spawnSync(process.execPath, [binPath, '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `${HELP_TEXT}\n`);
});

test('built onx entrypoint prints the package version', async () => {
  const binPath = path.join(process.cwd(), 'dist', 'cli', 'onx.js');
  const result = spawnSync(process.execPath, [binPath, '--version'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), version);
});

test('npm pack dry-run includes shipped ONX assets and excludes source files', async () => {
  const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(packed.status, 0, packed.stderr || packed.stdout);

  const jsonStart = packed.stdout.indexOf('[');
  assert.notEqual(jsonStart, -1, `expected npm pack --json output in stdout\n${packed.stdout}`);
  const results = JSON.parse(packed.stdout.slice(jsonStart)) as NpmPackDryRunResult[];
  assert.equal(Array.isArray(results), true, 'expected npm pack --json array output');

  const files = results[0]?.files ?? [];
  const byPath = new Set(files.map((file) => file.path));

  assert.ok(byPath.has('dist/cli/onx.js'), 'expected packed output to include dist/cli/onx.js');
  assert.ok(byPath.has('docs/cli.md'), 'expected packed output to include docs/cli.md');
  assert.ok(byPath.has('docs/skills.md'), 'expected packed output to include docs/skills.md');
  assert.ok(byPath.has('templates/catalog-manifest.json'), 'expected packed output to include templates/catalog-manifest.json');
  assert.ok(byPath.has('prompts/novel-architect.md'), 'expected packed output to include prompt assets');
  assert.ok(byPath.has('skills/novel-interview/SKILL.md'), 'expected packed output to include skill assets');
  assert.ok(byPath.has('LICENSE'), 'expected packed output to include LICENSE');
  assert.ok(byPath.has('NOTICE.md'), 'expected packed output to include NOTICE.md');

  assert.equal(byPath.has('src/cli/help-text.ts'), false, 'did not expect source TypeScript files in packed output');
  assert.equal(byPath.has('src/scripts/generate-cli-docs.ts'), false, 'did not expect source generator scripts in packed output');
});
