import fs from 'node:fs/promises';
import path from 'node:path';
import { writeProjectMemory } from '../memory/project-memory.js';

export async function memoryWrite(args: string[]): Promise<void> {
  const projectDir = readFlagValue(args, '--project') ?? process.cwd();
  const json = readFlagValue(args, '--json');
  const file = readFlagValue(args, '--file');
  const merge = args.includes('--merge');

  let payload: Record<string, unknown>;
  if (json) {
    payload = JSON.parse(json) as Record<string, unknown>;
  } else if (file) {
    payload = JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as Record<string, unknown>;
  } else {
    throw new Error('memory-write requires --json <json> or --file <path>');
  }

  const next = await writeProjectMemory(projectDir, payload, { merge });
  process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
