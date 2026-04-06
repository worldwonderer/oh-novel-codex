import { installAssets } from '../config/generator.js';
import { getInstallablePromptNames, getInstallableSkillNames } from '../catalog/reader.js';

export async function setup(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project');
  const codexHome = readFlagValue(args, '--codex-home');
  const force = args.includes('--force');
  const result = await installAssets({ projectDir, codexHome, force });
  const promptCount = getInstallablePromptNames().length;
  const skillCount = getInstallableSkillNames().length;
  console.log(`Installed ${result.promptsInstalled}/${promptCount} installable prompts and ${result.skillsInstalled}/${skillCount} installable skills into ${result.codexHome}`);
  if (result.scaffold) {
    console.log(`Scaffolded ONX project files in ${result.scaffold.projectDir}`);
    console.log(`  ensured directories: ${result.scaffold.createdDirectories.length}`);
    console.log(`  ensured files: ${result.scaffold.createdFiles.length}`);
    if (result.scaffold.updatedGitignore) {
      console.log('  updated .gitignore with .onx/');
    }
  }
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
