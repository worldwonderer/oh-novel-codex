import fs from 'node:fs/promises';
import path from 'node:path';
import { getInstallablePromptNames, getInstallableSkillNames } from '../catalog/reader.js';
import { describeProjectScaffold, type ProjectScaffoldStatus } from '../config/generator.js';
import { getCodexHome, getInstallTargets } from '../utils/paths.js';

export type CatalogHealth = {
  total: number;
  installed: number;
  missing: string[];
};

export type DoctorReport = {
  node: string;
  codexHome: string;
  prompts: CatalogHealth;
  skills: CatalogHealth;
  project?: ProjectScaffoldStatus;
  ok: boolean;
};

export async function doctor(args: string[] = []): Promise<DoctorReport> {
  const codexHome = readFlagValue(args, '--codex-home') ?? getCodexHome();
  const projectDir = readFlagValue(args, '--project');
  const json = args.includes('--json');
  const { promptsDir, skillsDir } = getInstallTargets(codexHome);
  const prompts = getInstallablePromptNames();
  const skills = getInstallableSkillNames();

  const promptChecks = await Promise.all(
    prompts.map(async (name) => ({
      name,
      installed: await exists(path.join(promptsDir, `${name}.md`)),
    })),
  );
  const skillChecks = await Promise.all(
    skills.map(async (name) => ({
      name,
      installed: await exists(path.join(skillsDir, name, 'SKILL.md')),
    })),
  );

  const report: DoctorReport = {
    node: process.version,
    codexHome,
    prompts: summarizeChecks(promptChecks),
    skills: summarizeChecks(skillChecks),
    project: projectDir ? await describeProjectScaffold(projectDir) : undefined,
    ok: false,
  };
  report.ok = report.prompts.missing.length === 0 && report.skills.missing.length === 0 && (report.project?.ok ?? true);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  printReport(report);
  return report;
}

function printReport(report: DoctorReport): void {
  console.log('oh-novel-codex doctor');
  console.log('====================\n');
  console.log(`Node: ${report.node}`);
  console.log(`Codex home: ${report.codexHome}`);
  console.log(`Prompts installed: ${report.prompts.installed}/${report.prompts.total}`);
  console.log(`Skills installed: ${report.skills.installed}/${report.skills.total}`);

  if (report.prompts.missing.length > 0) {
    console.log(`Missing prompts: ${report.prompts.missing.join(', ')}`);
  }
  if (report.skills.missing.length > 0) {
    console.log(`Missing skills: ${report.skills.missing.join(', ')}`);
  }

  if (report.project) {
    console.log(`\nProject scaffold: ${report.project.projectDir}`);
    console.log(`  directories: ${report.project.directories.required.length - report.project.directories.missing.length}/${report.project.directories.required.length}`);
    console.log(`  files: ${report.project.files.required.length - report.project.files.missing.length}/${report.project.files.required.length}`);
    console.log(`  AGENTS.md present: ${report.project.agentsPresent ? 'yes' : 'no'}`);
    console.log(`  .gitignore contains .onx/: ${report.project.gitignoreHasOnxEntry ? 'yes' : 'no'}`);
    if (report.project.directories.missing.length > 0) {
      console.log(`  missing directories: ${report.project.directories.missing.join(', ')}`);
    }
    if (report.project.files.missing.length > 0) {
      console.log(`  missing files: ${report.project.files.missing.join(', ')}`);
    }
  }

  if (!report.ok) {
    console.log('\nRun `onx setup --project .` to install or refresh missing assets.');
  } else {
    console.log('\nONX doctor: all required assets present.');
  }
}

function summarizeChecks(checks: Array<{ name: string; installed: boolean }>): CatalogHealth {
  return {
    total: checks.length,
    installed: checks.filter((entry) => entry.installed).length,
    missing: checks.filter((entry) => !entry.installed).map((entry) => entry.name),
  };
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
