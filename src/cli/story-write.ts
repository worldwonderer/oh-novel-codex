import fs from 'node:fs/promises';
import path from 'node:path';
import { writeStoryMemoryEntry } from '../story-memory/store.js';
import { parseStoryCliCollection, readStoryCliFlag } from './story-cli.js';

export async function storyWrite(args: string[]): Promise<void> {
  const projectDir = readStoryCliFlag(args, '--project') ?? process.cwd();
  const collection = parseStoryCliCollection(readStoryCliFlag(args, '--collection') ?? readStoryCliFlag(args, '--surface'), 'story-write');
  const key = readStoryCliFlag(args, '--key') ?? readStoryCliFlag(args, '--slug');
  const content = readStoryCliFlag(args, '--text') ?? readStoryCliFlag(args, '--content');
  const file = readStoryCliFlag(args, '--file');

  if (!key) {
    throw new Error('story-write requires --key <name>');
  }

  let nextContent: string;
  if (content) {
    nextContent = content;
  } else if (file) {
    nextContent = await fs.readFile(path.resolve(file), 'utf8');
  } else {
    throw new Error('story-write requires --text <content> or --file <path>');
  }

  const entry = await writeStoryMemoryEntry(projectDir, collection, key, nextContent);

  process.stdout.write(`${JSON.stringify({ collection, key: entry.key, path: entry.path }, null, 2)}\n`);
}
