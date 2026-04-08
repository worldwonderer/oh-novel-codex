#!/usr/bin/env node

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const defaultSourceCandidates = [
  path.resolve(repoRoot, '../.skill-evals/zhihu-short-story-rewriter/real-tests/1833869753817165826_真实改写测试_订婚前夜我把他送进了热搜.md'),
  path.resolve(repoRoot, '../.skill-evals/zhihu-short-story-rewriter/real-tests/1833869753817165826_长稿测试_婚礼前夜我送渣男白月光一起下坠.md'),
];

function usage() {
  return [
    'Usage: node playground/showcases/zhihu-remix-automation/run-local-demo.mjs [--source <path>] [--project <dir>] [--live]',
    '',
    'Default mode is dry-run so you can inspect the workflow without invoking a full live rewrite.',
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    source: undefined,
    projectDir: path.resolve(here, 'workspace'),
    live: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source') {
      parsed.source = path.resolve(argv[++i]);
    } else if (token === '--project') {
      parsed.projectDir = path.resolve(argv[++i]);
    } else if (token === '--live') {
      parsed.live = true;
    } else if (token === '--help' || token === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}\n${usage()}`);
    }
  }

  return parsed;
}

function resolveSource(provided) {
  if (provided && existsSync(provided)) return provided;
  const candidate = defaultSourceCandidates.find((entry) => existsSync(entry));
  if (candidate) return candidate;
  throw new Error('No source manuscript found. Pass --source <path>.');
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = resolveSource(args.source);
  const briefPath = path.resolve(here, 'demo-brief.md');
  const onxEntry = path.resolve(repoRoot, 'dist/cli/onx.js');

  mkdirSync(args.projectDir, { recursive: true });

  const commandArgs = [
    onxEntry,
    'run-workflow',
    '--mode', 'zhihu-remix',
    '--source', source,
    '--source-ownership', 'self-owned',
    '--brief-file', briefPath,
    '--project', args.projectDir,
    '--job-name', 'zhihu-remix-automation-showcase',
    '--execute',
  ];

  if (!args.live) {
    commandArgs.push('--dry-run');
  }

  console.log(`Using source: ${source}`);
  console.log(`Project workspace: ${args.projectDir}`);
  console.log(`Mode: ${args.live ? 'live' : 'dry-run'}`);

  run(process.execPath, commandArgs, repoRoot);
}

main();
