import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getPackageRoot } from './package.js';

export function getRepoRoot(): string {
  return getPackageRoot();
}

export function getCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME ? path.resolve(env.CODEX_HOME) : path.join(os.homedir(), '.codex');
}

export function getInstallTargets(codexHome = getCodexHome()): { promptsDir: string; skillsDir: string } {
  return {
    promptsDir: path.join(codexHome, 'prompts'),
    skillsDir: path.join(codexHome, 'skills'),
  };
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function copyRecursive(source: string, target: string): Promise<void> {
  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await ensureDir(target);
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(source, entry.name), path.join(target, entry.name));
    }
    return;
  }
  await ensureDir(path.dirname(target));
  await fs.copyFile(source, target);
}
