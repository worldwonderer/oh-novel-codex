import {
  listAuthoredStoryMemoryEntries,
  readStoryMemoryEntry,
} from '../story-memory/store.js';
import { parseStoryCliCollection, readStoryCliFlag } from './story-cli.js';

export async function storyRead(args: string[]): Promise<void> {
  const projectDir = readStoryCliFlag(args, '--project') ?? process.cwd();
  const collection = parseStoryCliCollection(readStoryCliFlag(args, '--collection') ?? readStoryCliFlag(args, '--surface'), 'story-read');
  const key = readStoryCliFlag(args, '--key') ?? readStoryCliFlag(args, '--slug');
  const json = args.includes('--json');

  if (key) {
    const result = await readStoryMemoryEntry(projectDir, collection, key);
    if (!result) {
      throw new Error(`No story-memory entry found for ${collection}/${key}`);
    }
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : result.content);
    return;
  }

  const entries = await listAuthoredStoryMemoryEntries(projectDir, collection);
  if (json) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }

  const lines = [`# ${collection}`, ''];
  if (entries.length === 0) {
    lines.push('- none');
  } else {
    for (const entry of entries) {
      lines.push(`- ${entry.key}: ${entry.title}${entry.preview ? ` — ${entry.preview}` : ''}`);
    }
  }
  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}
