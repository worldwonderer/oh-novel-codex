export type DocsSectionId =
  | 'getting-started'
  | 'generated'
  | 'workflows'
  | 'internals';

export type DocsEntry = {
  title: string;
  path: string;
};

export type DocsSection = {
  id: DocsSectionId;
  title: string;
  entries: readonly DocsEntry[];
};

export const DOCS_SECTIONS: readonly DocsSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    entries: [
      { title: 'Getting started', path: './getting-started.md' },
      { title: 'Zhihu remix automation showcase', path: './showcase-zhihu-remix-automation.md' },
      { title: 'Story memory + quality gate showcase', path: './showcase-story-memory-quality-gate.md' },
      { title: 'CLI reference', path: './cli.md' },
      { title: 'Release process', path: './release-process.md' },
    ],
  },
  {
    id: 'generated',
    title: 'Generated references',
    entries: [
      { title: 'Skills catalog', path: './skills.md' },
      { title: 'Prompts catalog', path: './prompts.md' },
      { title: 'Catalog JSON contract', path: './catalog.json' },
    ],
  },
  {
    id: 'workflows',
    title: 'Workflow guides',
    entries: [
      { title: 'Draft pipeline', path: './draft-pipeline.md' },
      { title: 'Story memory & continuity', path: './story-memory.md' },
      { title: 'Quality engine', path: './quality-engine.md' },
      { title: 'Review pipeline', path: './review-pipeline.md' },
      { title: 'Revision pipeline', path: './revision-pipeline.md' },
      { title: 'Workflow pipeline', path: './workflow-pipeline.md' },
      { title: 'Team runtime', path: './team-runtime.md' },
    ],
  },
  {
    id: 'internals',
    title: 'Project internals',
    entries: [
      { title: 'Agents', path: './agents.md' },
      { title: 'Hooks', path: './hooks.md' },
      { title: 'MCP', path: './mcp.md' },
      { title: 'State, memory, story-memory, and trace', path: './state-memory-trace.md' },
      { title: 'Guidance schema', path: './guidance-schema.md' },
      { title: 'Review card contract', path: './review-card-contract.md' },
    ],
  },
] as const;

const README_DOC_PATHS = new Set([
  './index.md',
  './skills.md',
  './prompts.md',
  './cli.md',
  './catalog.json',
  './story-memory.md',
  './quality-engine.md',
]);

export function renderDocsIndexMarkdown(): string {
  const lines = [
    '# ONX Docs Index',
    '',
    'Start here when you need the shortest path to the right ONX document.',
    '',
  ];

  for (const section of DOCS_SECTIONS) {
    lines.push(`## ${section.title}`, '');
    for (const entry of section.entries) {
      lines.push(`- [${entry.title}](${entry.path})`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export function renderReadmeDocsSnippet(): string {
  const allEntries = DOCS_SECTIONS.flatMap((section) => section.entries);
  const docsIndexEntry: DocsEntry = { title: 'docs index', path: './index.md' };
  const selected = [docsIndexEntry, ...allEntries.filter((entry) => README_DOC_PATHS.has(entry.path))];
  const unique = selected.filter((entry, index, items) => items.findIndex((other) => other.path === entry.path) === index);
  const lines = [
    '<!-- ONX:DOCS:START -->',
    ...unique.map((entry) => `- [${entry.title}](./docs/${entry.path.replace('./', '')})`),
    '<!-- ONX:DOCS:END -->',
  ];
  return `${lines.join('\n')}\n`;
}
