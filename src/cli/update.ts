import { installAssets } from '../config/generator.js';
import { getInstallablePromptNames, getInstallableSkillNames } from '../catalog/reader.js';

export async function update(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project');
  const codexHome = readFlagValue(args, '--codex-home');
  const result = await installAssets({ projectDir, codexHome, force: true });
  const promptCount = getInstallablePromptNames().length;
  const skillCount = getInstallableSkillNames().length;
  console.log(`Updated ${result.promptsInstalled}/${promptCount} installable prompts and ${result.skillsInstalled}/${skillCount} installable skills in ${result.codexHome}`);
  if (result.scaffold) {
    console.log(`Refreshed ONX project scaffold in ${result.scaffold.projectDir}`);
    console.log(`  ensured directories: ${result.scaffold.createdDirectories.length}`);
    console.log(`  ensured files: ${result.scaffold.createdFiles.length}`);
  }
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
