import { readProjectMemory } from '../memory/project-memory.js';

export async function memoryRead(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const memory = await readProjectMemory(projectDir);
  process.stdout.write(`${JSON.stringify(memory, null, 2)}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
