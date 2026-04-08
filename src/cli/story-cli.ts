import { STORY_MEMORY_COLLECTIONS, type StoryMemoryCollection } from '../story-memory/store.js';

export function readStoryCliFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

export function parseStoryCliCollection(collection: string | undefined, command: string): StoryMemoryCollection {
  if (!collection) {
    throw new Error(`${command} requires --collection <${STORY_MEMORY_COLLECTIONS.join('|')}>`);
  }
  if (STORY_MEMORY_COLLECTIONS.includes(collection as StoryMemoryCollection)) {
    return collection as StoryMemoryCollection;
  }
  throw new Error(`Unsupported story-memory collection: ${collection}`);
}
