import fs from 'node:fs/promises';
import path from 'node:path';

export type StoryMemoryCollection =
  | 'characters'
  | 'world'
  | 'relationships'
  | 'timeline'
  | 'voice'
  | 'continuity';

export type StoryMemoryEntrySummary = {
  collection: StoryMemoryCollection;
  key: string;
  title: string;
  path: string;
  preview: string;
  updatedAt: string;
};

export type StoryMemoryEntry = StoryMemoryEntrySummary & {
  content: string;
};

export type StoryMemoryScaffoldReport = {
  createdDirectories: string[];
  createdFiles: string[];
};

export type DraftContinuityCoverage = {
  path: string;
  referencedKeywords: string[];
  missingKeywords: string[];
};

export type ContinuityReport = {
  generatedAt: string;
  projectDir: string;
  surfaces: Record<StoryMemoryCollection, StoryMemoryEntrySummary[]>;
  continuityEntries: StoryMemoryEntrySummary[];
  unresolvedCount: number;
  resolvedCount: number;
  collectionCounts: Record<StoryMemoryCollection, number>;
  missingCoreSurfaces: StoryMemoryCollection[];
  draft?: DraftContinuityCoverage;
  warnings: string[];
};

export const STORY_MEMORY_COLLECTIONS: readonly StoryMemoryCollection[] = [
  'characters',
  'world',
  'relationships',
  'timeline',
  'voice',
  'continuity',
] as const;

export const STORY_MEMORY_DIRECTORIES: Record<StoryMemoryCollection, string> = {
  characters: '.onx/characters',
  world: '.onx/world',
  relationships: '.onx/relationships',
  timeline: '.onx/timeline',
  voice: '.onx/voice',
  continuity: '.onx/continuity',
};

const STORY_MEMORY_STARTERS: Record<StoryMemoryCollection, string> = {
  characters: [
    '# Character bible',
    '',
    '- [replace protagonist or ensemble anchor]',
    '- Core wound:',
    '- Visible desire:',
    '- Hidden fear:',
    '- Distinct speech texture:',
    '',
  ].join('\n'),
  world: [
    '# World bible',
    '',
    '- [replace the system or setting premise]',
    '- Power structure:',
    '- Public rules:',
    '- Private rules:',
    '- Social cost of failure:',
    '',
  ].join('\n'),
  relationships: [
    '# Relationship map',
    '',
    '- [replace the core relationship axis]',
    '- Current tension:',
    '- Shared history:',
    '- Secret imbalance:',
    '',
  ].join('\n'),
  timeline: [
    '# Story timeline',
    '',
    '- [replace with the inciting incident date or order]',
    '- Midpoint shift:',
    '- Final irreversible turn:',
    '',
  ].join('\n'),
  voice: [
    '# Voice profile',
    '',
    '- [replace with the dominant voice promise]',
    '- POV guardrails:',
    '- Rhythm notes:',
    '- Forbidden crutches:',
    '',
  ].join('\n'),
  continuity: [
    '# Continuity tracker',
    '',
    'Replace this starter entry with concrete continuity constraints, open loops, and resolved fixes.',
    '',
  ].join('\n'),
};

export const STORY_MEMORY_STARTER_FILES = STORY_MEMORY_COLLECTIONS.map((collection) => (
  `${STORY_MEMORY_DIRECTORIES[collection]}/index.md`
)) as readonly string[];

export const STORY_MEMORY_SCAFFOLD_DIRECTORIES = Object.values(STORY_MEMORY_DIRECTORIES) as readonly string[];
export const STORY_MEMORY_SCAFFOLD_FILES = STORY_MEMORY_STARTER_FILES;

export async function ensureStoryMemoryScaffold(projectDir: string): Promise<StoryMemoryScaffoldReport> {
  const root = path.resolve(projectDir);
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];

  for (const collection of STORY_MEMORY_COLLECTIONS) {
    const directory = storyMemoryCollectionPath(root, collection);
    if (!await fileExists(directory)) {
      createdDirectories.push(STORY_MEMORY_DIRECTORIES[collection]);
    }
    await fs.mkdir(directory, { recursive: true });

    const starterPath = storyMemoryStarterPath(root, collection);
    if (!await fileExists(starterPath)) {
      await fs.writeFile(starterPath, STORY_MEMORY_STARTERS[collection], 'utf8');
      createdFiles.push(`${STORY_MEMORY_DIRECTORIES[collection]}/index.md`);
    }
  }

  return {
    createdDirectories,
    createdFiles,
  };
}

export async function listStoryMemoryEntries(
  projectDir: string,
  collection: StoryMemoryCollection,
): Promise<StoryMemoryEntrySummary[]> {
  await ensureStoryMemoryScaffold(projectDir);
  const root = storyMemoryCollectionPath(projectDir, collection);
  let names: string[] = [];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }

  const entries = await Promise.all(names
    .filter((name) => name.endsWith('.md'))
    .map(async (name) => {
      const filePath = path.join(root, name);
      const content = await fs.readFile(filePath, 'utf8');
      const stat = await fs.stat(filePath);
      return summarizeEntry({
        collection,
        key: name.replace(/\.md$/i, ''),
        filePath,
        content,
        updatedAt: stat.mtime.toISOString(),
      });
    }));

  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

export async function listAuthoredStoryMemoryEntries(
  projectDir: string,
  collection: StoryMemoryCollection,
): Promise<StoryMemoryEntrySummary[]> {
  const entries = await listStoryMemoryEntries(projectDir, collection);
  const fullEntries = await Promise.all(entries.map((entry) => readStoryMemoryEntry(projectDir, collection, entry.key)));
  return entries.filter((entry, index) => {
    const full = fullEntries[index];
    return !(entry.key === 'index' && full && containsPlaceholder(full.content));
  });
}

export async function readStoryMemoryEntry(
  projectDir: string,
  collection: StoryMemoryCollection,
  key: string,
): Promise<StoryMemoryEntry | null> {
  await ensureStoryMemoryScaffold(projectDir);
  const target = storyMemoryEntryPath(projectDir, collection, key);
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(target, 'utf8'),
      fs.stat(target),
    ]);
    return {
      ...summarizeEntry({
        collection,
        key: slugifyStoryMemoryKey(key),
        filePath: target,
        content,
        updatedAt: stat.mtime.toISOString(),
      }),
      content,
    };
  } catch {
    return null;
  }
}

export async function writeStoryMemoryEntry(
  projectDir: string,
  collection: StoryMemoryCollection,
  key: string,
  content: string,
): Promise<StoryMemoryEntry> {
  await ensureStoryMemoryScaffold(projectDir);
  const target = storyMemoryEntryPath(projectDir, collection, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  await fs.writeFile(target, normalized, 'utf8');
  const stat = await fs.stat(target);
  return {
    ...summarizeEntry({
      collection,
      key: slugifyStoryMemoryKey(key),
      filePath: target,
      content: normalized,
      updatedAt: stat.mtime.toISOString(),
    }),
    content: normalized,
  };
}

export async function buildStoryMemorySnapshot(projectDir: string): Promise<string> {
  await ensureStoryMemoryScaffold(projectDir);
  const sections: string[] = ['# Story memory snapshot', ''];

  for (const collection of STORY_MEMORY_COLLECTIONS) {
    const entries = await listAuthoredStoryMemoryEntries(projectDir, collection);
    sections.push(`## ${labelForCollection(collection)}`, '');
    if (entries.length === 0) {
      sections.push('- none', '');
      continue;
    }
    for (const entry of entries) {
      sections.push(`- ${entry.key}: ${entry.title}${entry.preview ? ` — ${entry.preview}` : ''}`);
    }
    sections.push('');
  }

  const continuity = await buildContinuityReport(projectDir);
  sections.push('## Continuity summary', '');
  sections.push(`- unresolved items: ${continuity.unresolvedCount}`);
  sections.push(`- resolved items: ${continuity.resolvedCount}`);
  if (continuity.warnings.length > 0) {
    sections.push('- warnings:');
    for (const warning of continuity.warnings) {
      sections.push(`  - ${warning}`);
    }
  }
  sections.push('');

  return `${sections.join('\n')}\n`;
}

export async function buildContinuityReport(
  projectDir: string,
  options: { draftPath?: string } = {},
): Promise<ContinuityReport> {
  await ensureStoryMemoryScaffold(projectDir);
  const collectionEntries = Object.fromEntries(
    await Promise.all(STORY_MEMORY_COLLECTIONS.map(async (collection) => [
      collection,
      await listAuthoredStoryMemoryEntries(projectDir, collection),
    ])),
  ) as Record<StoryMemoryCollection, StoryMemoryEntrySummary[]>;

  const collectionCounts = Object.fromEntries(
    Object.entries(collectionEntries).map(([collection, entries]) => [collection, entries.length]),
  ) as Record<StoryMemoryCollection, number>;

  const continuityEntries = collectionEntries.continuity;
  let unresolvedCount = 0;
  let resolvedCount = 0;
  for (const entry of continuityEntries) {
    const full = await readStoryMemoryEntry(projectDir, 'continuity', entry.key);
    if (!full) continue;
    unresolvedCount += countCheckboxes(full.content, false);
    resolvedCount += countCheckboxes(full.content, true);
  }

  const warnings: string[] = [];
  if (await collectionNeedsAuthoring(projectDir, 'continuity')) {
    warnings.push('No continuity tracker entries recorded yet.');
  }
  if (await collectionNeedsAuthoring(projectDir, 'characters')) {
    warnings.push('No character bible entries recorded yet.');
  }
  if (await collectionNeedsAuthoring(projectDir, 'voice')) {
    warnings.push('No voice/style profile entries recorded yet.');
  }
  if (await collectionNeedsAuthoring(projectDir, 'timeline')) {
    warnings.push('No timeline entries recorded yet.');
  }

  const missingCoreSurfaceChecks = await Promise.all(
    (['characters', 'world', 'timeline', 'voice', 'continuity'] as const).map(async (collection) => ({
      collection,
      missing: await collectionNeedsAuthoring(projectDir, collection),
    })),
  );
  const missingCoreSurfaces = missingCoreSurfaceChecks
    .filter((entry) => entry.missing)
    .map((entry) => entry.collection);

  const draft = options.draftPath ? await buildDraftContinuityCoverage(options.draftPath, collectionEntries) : undefined;
  if (draft && draft.missingKeywords.length > 0) {
    warnings.push(`Draft is missing ${draft.missingKeywords.length} tracked story-memory keyword(s).`);
  }

  return {
    generatedAt: new Date().toISOString(),
    projectDir: path.resolve(projectDir),
    surfaces: collectionEntries,
    continuityEntries,
    unresolvedCount,
    resolvedCount,
    collectionCounts,
    missingCoreSurfaces,
    draft,
    warnings,
  };
}

export function storyMemoryCollectionPath(projectDir: string, collection: StoryMemoryCollection): string {
  return path.join(path.resolve(projectDir), STORY_MEMORY_DIRECTORIES[collection]);
}

export function storyMemoryEntryPath(projectDir: string, collection: StoryMemoryCollection, key: string): string {
  return path.join(storyMemoryCollectionPath(projectDir, collection), `${slugifyStoryMemoryKey(key)}.md`);
}

export function storyMemoryStarterPath(projectDir: string, collection: StoryMemoryCollection): string {
  return storyMemoryEntryPath(projectDir, collection, 'index');
}

export function slugifyStoryMemoryKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'entry';
}

function summarizeEntry(input: {
  collection: StoryMemoryCollection;
  key: string;
  filePath: string;
  content: string;
  updatedAt: string;
}): StoryMemoryEntrySummary {
  const title = extractTitle(input.content) ?? input.key;
  return {
    collection: input.collection,
    key: input.key,
    title,
    path: input.filePath,
    preview: extractPreview(input.content),
    updatedAt: input.updatedAt,
  };
}

function extractTitle(content: string): string | undefined {
  const heading = content.match(/^#\s+(.+?)\s*$/m);
  return heading?.[1]?.trim();
}

function extractPreview(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));
  return lines[0]?.slice(0, 120) ?? '';
}

function containsPlaceholder(content: string): boolean {
  return /\[replace|replace this starter entry|todo|tbd/i.test(content);
}

async function collectionNeedsAuthoring(projectDir: string, collection: StoryMemoryCollection): Promise<boolean> {
  const entries = await listStoryMemoryEntries(projectDir, collection);
  if (entries.length === 0) {
    return true;
  }

  const fullEntries = await Promise.all(entries.map((entry) => readStoryMemoryEntry(projectDir, collection, entry.key)));
  return fullEntries.every((entry) => !entry || containsPlaceholder(entry.content));
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function countCheckboxes(content: string, resolved: boolean): number {
  const pattern = resolved ? /^\s*[-*]\s+\[[xX]\]/gm : /^\s*[-*]\s+\[\s\]/gm;
  return [...content.matchAll(pattern)].length;
}

function labelForCollection(collection: StoryMemoryCollection): string {
  switch (collection) {
    case 'characters':
      return 'Characters';
    case 'world':
      return 'World';
    case 'relationships':
      return 'Relationships';
    case 'timeline':
      return 'Timeline';
    case 'voice':
      return 'Voice';
    case 'continuity':
      return 'Continuity';
  }
}

async function buildDraftContinuityCoverage(
  draftPath: string,
  surfaces: Record<StoryMemoryCollection, StoryMemoryEntrySummary[]>,
): Promise<DraftContinuityCoverage> {
  const target = path.resolve(draftPath);
  let content = '';
  try {
    content = (await fs.readFile(target, 'utf8')).toLowerCase();
  } catch {
    return {
      path: target,
      referencedKeywords: [],
      missingKeywords: [],
    };
  }

  const keywords = [...new Set(
    Object.values(surfaces)
      .flatMap((entries) => entries)
      .flatMap((entry) => [entry.key, entry.title])
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length >= 2 && value !== 'index'),
  )];

  const referencedKeywords = keywords.filter((keyword) => content.includes(keyword));
  const missingKeywords = keywords.filter((keyword) => !content.includes(keyword));

  return {
    path: target,
    referencedKeywords,
    missingKeywords,
  };
}
