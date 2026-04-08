import { listAuthoredStoryMemoryEntries, STORY_MEMORY_COLLECTIONS, type StoryMemoryCollection } from '../story-memory/store.js';
import { readStoryCliFlag } from './story-cli.js';

export async function storyList(args: string[]): Promise<void> {
  const projectDir = readStoryCliFlag(args, '--project') ?? process.cwd();
  const json = args.includes('--json');
  const collection = (readStoryCliFlag(args, '--surface') ?? 'all') as StoryMemoryCollection | 'all';
  const collections = collection === 'all' ? [...STORY_MEMORY_COLLECTIONS] : [parseCollection(collection)];
  const payload = Object.fromEntries(
    await Promise.all(collections.map(async (current) => [current, await listAuthoredStoryMemoryEntries(projectDir, current)])),
  );

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  for (const current of collections) {
    process.stdout.write(`## ${current}\n`);
    const entries = payload[current];
    if (entries.length === 0) {
      process.stdout.write('- none\n\n');
      continue;
    }
    for (const entry of entries) {
      process.stdout.write(`- ${entry.key}: ${entry.title}\n`);
    }
    process.stdout.write('\n');
  }
}

function parseCollection(collection: string): StoryMemoryCollection {
  if (STORY_MEMORY_COLLECTIONS.includes(collection as StoryMemoryCollection)) {
    return collection as StoryMemoryCollection;
  }
  throw new Error(`Unsupported story-memory collection: ${collection}`);
}
