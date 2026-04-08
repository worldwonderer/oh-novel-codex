import fs from 'node:fs/promises';
import path from 'node:path';
import { getInstallablePromptNames, getInstallableSkillNames } from '../catalog/reader.js';
import { copyRecursive, ensureDir, getCodexHome, getInstallTargets, getRepoRoot } from '../utils/paths.js';
import { ensureNotepad, notepadPath } from '../memory/notepad.js';
import { projectMemoryPath } from '../memory/project-memory.js';
import { STORY_MEMORY_SCAFFOLD_DIRECTORIES, STORY_MEMORY_SCAFFOLD_FILES, ensureStoryMemoryScaffold } from '../story-memory/store.js';

export type InstallOptions = {
  codexHome?: string;
  projectDir?: string;
  force?: boolean;
};

export const PROJECT_SCAFFOLD_DIRECTORIES = [
  '.onx/plans',
  '.onx/drafts/jobs',
  '.onx/reviews/cards',
  '.onx/reviews/final',
  '.onx/reviews/jobs',
  '.onx/revisions/jobs',
  '.onx/workflows/jobs',
  '.onx/team/jobs',
  '.onx/notes',
  '.onx/reports',
  '.onx/logs',
  '.onx/state/modes',
  ...STORY_MEMORY_SCAFFOLD_DIRECTORIES,
] as const;

export const PROJECT_SCAFFOLD_FILES = [
  'AGENTS.md',
  '.gitignore',
  '.onx/notepad.md',
  '.onx/project-memory.json',
  '.onx/logs/events.jsonl',
  ...STORY_MEMORY_SCAFFOLD_FILES,
] as const;

export type ProjectScaffoldReport = {
  projectDir: string;
  createdDirectories: string[];
  createdFiles: string[];
  updatedGitignore: boolean;
  wroteAgents: boolean;
};

export type ProjectScaffoldStatus = {
  projectDir: string;
  directories: { required: string[]; missing: string[] };
  files: { required: string[]; missing: string[] };
  agentsPresent: boolean;
  gitignoreHasOnxEntry: boolean;
  ok: boolean;
};

export async function installAssets(
  options: InstallOptions = {},
): Promise<{ codexHome: string; projectDir?: string; promptsInstalled: number; skillsInstalled: number; scaffold?: ProjectScaffoldReport }> {
  const repoRoot = getRepoRoot();
  const codexHome = options.codexHome ?? getCodexHome();
  const { promptsDir, skillsDir } = getInstallTargets(codexHome);
  const prompts = getInstallablePromptNames();
  const skills = getInstallableSkillNames();
  await ensureDir(promptsDir);
  await ensureDir(skillsDir);

  for (const prompt of prompts) {
    await copyRecursive(path.join(repoRoot, 'prompts', `${prompt}.md`), path.join(promptsDir, `${prompt}.md`));
  }
  for (const skill of skills) {
    await copyRecursive(path.join(repoRoot, 'skills', skill), path.join(skillsDir, skill));
  }

  let scaffold: ProjectScaffoldReport | undefined;
  if (options.projectDir) {
    scaffold = await scaffoldProject(options.projectDir, { force: options.force });
  }

  return {
    codexHome,
    projectDir: options.projectDir,
    promptsInstalled: prompts.length,
    skillsInstalled: skills.length,
    scaffold,
  };
}

export async function scaffoldProject(projectDir: string, options: { force?: boolean } = {}): Promise<ProjectScaffoldReport> {
  const repoRoot = getRepoRoot();
  const target = path.resolve(projectDir);
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];

  await ensureDir(target);
  for (const relativeDir of PROJECT_SCAFFOLD_DIRECTORIES) {
    const absoluteDir = path.join(target, relativeDir);
    if (!await fileExists(absoluteDir)) {
      createdDirectories.push(relativeDir);
    }
    await ensureDir(absoluteDir);
  }

  const agentsTemplate = path.join(repoRoot, 'templates', 'AGENTS.md');
  const targetAgents = path.join(target, 'AGENTS.md');
  const exists = await fileExists(targetAgents);
  let wroteAgents = false;
  if (!exists || options.force) {
    await copyRecursive(agentsTemplate, targetAgents);
    wroteAgents = true;
    if (!exists) {
      createdFiles.push('AGENTS.md');
    }
  }

  const notepadExists = await fileExists(notepadPath(target));
  await ensureNotepad(target);
  if (!notepadExists) {
    createdFiles.push('.onx/notepad.md');
  }

  const memoryFile = projectMemoryPath(target);
  if (!await fileExists(memoryFile)) {
    await fs.writeFile(memoryFile, '{}\n', 'utf8');
    createdFiles.push('.onx/project-memory.json');
  }

  const eventsLog = path.join(target, '.onx', 'logs', 'events.jsonl');
  if (!await fileExists(eventsLog)) {
    await fs.writeFile(eventsLog, '', 'utf8');
    createdFiles.push('.onx/logs/events.jsonl');
  }

  const storyScaffold = await ensureStoryMemoryScaffold(target);
  createdDirectories.push(...storyScaffold.createdDirectories.filter((entry) => !createdDirectories.includes(entry)));
  createdFiles.push(...storyScaffold.createdFiles.filter((entry) => !createdFiles.includes(entry)));

  const updatedGitignore = await ensureGitignoreEntry(target, '.onx/');
  if (updatedGitignore) {
    createdFiles.push('.gitignore');
  }

  return {
    projectDir: target,
    createdDirectories,
    createdFiles,
    updatedGitignore,
    wroteAgents,
  };
}

export async function describeProjectScaffold(projectDir: string): Promise<ProjectScaffoldStatus> {
  const target = path.resolve(projectDir);
  const missingDirectories: string[] = [];
  const missingFiles: string[] = [];

  for (const relativeDir of PROJECT_SCAFFOLD_DIRECTORIES) {
    if (!await fileExists(path.join(target, relativeDir))) {
      missingDirectories.push(relativeDir);
    }
  }

  for (const relativeFile of PROJECT_SCAFFOLD_FILES) {
    if (!await fileExists(path.join(target, relativeFile))) {
      missingFiles.push(relativeFile);
    }
  }

  const agentsPresent = await fileExists(path.join(target, 'AGENTS.md'));
  const gitignoreHasOnxEntry = await hasGitignoreEntry(target, '.onx/');

  return {
    projectDir: target,
    directories: {
      required: [...PROJECT_SCAFFOLD_DIRECTORIES],
      missing: missingDirectories,
    },
    files: {
      required: [...PROJECT_SCAFFOLD_FILES],
      missing: missingFiles,
    },
    agentsPresent,
    gitignoreHasOnxEntry,
    ok: missingDirectories.length === 0 && missingFiles.length === 0 && agentsPresent && gitignoreHasOnxEntry,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureGitignoreEntry(projectDir: string, entry: string): Promise<boolean> {
  const gitignore = path.join(projectDir, '.gitignore');
  const current = await fs.readFile(gitignore, 'utf8').catch(() => '');
  const normalizedEntry = entry.trim();
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(normalizedEntry)) {
    return false;
  }

  const prefix = current.length === 0 ? '' : current.endsWith('\n') ? current : `${current}\n`;
  await fs.writeFile(gitignore, `${prefix}${normalizedEntry}\n`, 'utf8');
  return true;
}

async function hasGitignoreEntry(projectDir: string, entry: string): Promise<boolean> {
  const gitignore = path.join(projectDir, '.gitignore');
  try {
    const content = await fs.readFile(gitignore, 'utf8');
    return content.split(/\r?\n/).some((line) => line.trim() === entry.trim());
  } catch {
    return false;
  }
}
