import fs from 'node:fs/promises';
import path from 'node:path';
import { getInstallablePromptNames, getInstallableSkillNames } from '../catalog/reader.js';
import { getCodexHome, getInstallTargets } from '../utils/paths.js';

export async function uninstall(args: string[]): Promise<void> {
  const codexHome = readFlagValue(args, '--codex-home') ?? getCodexHome();
  const projectDir = readFlagValue(args, '--project');
  const projectOnly = args.includes('--project-only');
  const globalOnly = args.includes('--global-only');
  const { promptsDir, skillsDir } = getInstallTargets(codexHome);
  const prompts = getInstallablePromptNames();
  const skills = getInstallableSkillNames();

  if (!projectOnly) {
    for (const prompt of prompts) {
      await fs.rm(path.join(promptsDir, `${prompt}.md`), { force: true });
    }
    for (const skill of skills) {
      await fs.rm(path.join(skillsDir, skill), { recursive: true, force: true });
    }
  }

  if (projectDir && !globalOnly) {
    await fs.rm(path.join(path.resolve(projectDir), '.onx'), { recursive: true, force: true });
  }

  console.log(`Uninstalled ONX assets from ${codexHome}${projectDir && !globalOnly ? ` and cleaned ${path.resolve(projectDir)}` : ''}`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
