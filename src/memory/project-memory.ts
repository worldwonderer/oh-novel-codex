import fs from 'node:fs/promises';
import path from 'node:path';

export async function readProjectMemory(projectDir: string): Promise<Record<string, unknown>> {
  const filePath = projectMemoryPath(projectDir);
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function writeProjectMemory(
  projectDir: string,
  memory: Record<string, unknown>,
  options: { merge?: boolean } = {},
): Promise<Record<string, unknown>> {
  const current = options.merge ? await readProjectMemory(projectDir) : {};
  const next = options.merge ? deepMerge(current, memory) : memory;
  const filePath = projectMemoryPath(projectDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export function projectMemoryPath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.onx', 'project-memory.json');
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    if (isObject(existing) && isObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
