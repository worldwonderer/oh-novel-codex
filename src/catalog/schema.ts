export type CatalogSkillCategory = 'intake' | 'planning' | 'drafting' | 'revision' | 'review' | 'publish';
export type CatalogPromptCategory = 'planning' | 'drafting' | 'revision' | 'review';
export type CatalogEntryStatus = 'active' | 'alias' | 'internal';

export interface CatalogSkillEntry {
  name: string;
  category: CatalogSkillCategory;
  status: CatalogEntryStatus;
  summary: string;
  canonical?: string;
  core?: boolean;
}

export interface CatalogPromptEntry {
  name: string;
  category: CatalogPromptCategory;
  status: CatalogEntryStatus;
  summary: string;
  canonical?: string;
}

export interface CatalogManifest {
  schemaVersion: number;
  catalogVersion: string;
  name: string;
  prompts: CatalogPromptEntry[];
  skills: CatalogSkillEntry[];
}

const SKILL_CATEGORIES = new Set<CatalogSkillCategory>(['intake', 'planning', 'drafting', 'revision', 'review', 'publish']);
const PROMPT_CATEGORIES = new Set<CatalogPromptCategory>(['planning', 'drafting', 'revision', 'review']);
const ENTRY_STATUSES = new Set<CatalogEntryStatus>(['active', 'alias', 'internal']);
const REQUIRED_CORE_SKILLS = new Set(['novel-interview', 'story-architect', 'draft-longform', 'review-pipeline', 'publish-check']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`catalog_manifest_invalid:${field}`);
  }
}

function parseCanonical(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function validateCatalogManifest(input: unknown): CatalogManifest {
  if (!isObject(input)) throw new Error('catalog_manifest_invalid:root');
  if (typeof input.schemaVersion !== 'number' || !Number.isInteger(input.schemaVersion)) {
    throw new Error('catalog_manifest_invalid:schemaVersion');
  }

  assertNonEmptyString(input.catalogVersion, 'catalogVersion');
  assertNonEmptyString(input.name, 'name');

  if (!Array.isArray(input.prompts)) throw new Error('catalog_manifest_invalid:prompts');
  if (!Array.isArray(input.skills)) throw new Error('catalog_manifest_invalid:skills');

  const seenPrompts = new Set<string>();
  const prompts: CatalogPromptEntry[] = input.prompts.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`catalog_manifest_invalid:prompts[${index}]`);
    assertNonEmptyString(entry.name, `prompts[${index}].name`);
    assertNonEmptyString(entry.category, `prompts[${index}].category`);
    assertNonEmptyString(entry.status, `prompts[${index}].status`);
    assertNonEmptyString(entry.summary, `prompts[${index}].summary`);

    if (!PROMPT_CATEGORIES.has(entry.category as CatalogPromptCategory)) {
      throw new Error(`catalog_manifest_invalid:prompts[${index}].category`);
    }
    if (!ENTRY_STATUSES.has(entry.status as CatalogEntryStatus)) {
      throw new Error(`catalog_manifest_invalid:prompts[${index}].status`);
    }

    const name = entry.name.trim();
    if (seenPrompts.has(name)) throw new Error(`catalog_manifest_invalid:duplicate_prompt:${name}`);
    seenPrompts.add(name);

    const canonical = parseCanonical(entry.canonical);
    if (entry.status === 'alias' && !canonical) {
      throw new Error(`catalog_manifest_invalid:prompts[${index}].canonical`);
    }

    return {
      name,
      category: entry.category as CatalogPromptCategory,
      status: entry.status as CatalogEntryStatus,
      summary: entry.summary.trim(),
      canonical,
    };
  });

  const seenSkills = new Set<string>();
  const skills: CatalogSkillEntry[] = input.skills.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`catalog_manifest_invalid:skills[${index}]`);
    assertNonEmptyString(entry.name, `skills[${index}].name`);
    assertNonEmptyString(entry.category, `skills[${index}].category`);
    assertNonEmptyString(entry.status, `skills[${index}].status`);
    assertNonEmptyString(entry.summary, `skills[${index}].summary`);

    if (!SKILL_CATEGORIES.has(entry.category as CatalogSkillCategory)) {
      throw new Error(`catalog_manifest_invalid:skills[${index}].category`);
    }
    if (!ENTRY_STATUSES.has(entry.status as CatalogEntryStatus)) {
      throw new Error(`catalog_manifest_invalid:skills[${index}].status`);
    }

    const name = entry.name.trim();
    if (seenSkills.has(name)) throw new Error(`catalog_manifest_invalid:duplicate_skill:${name}`);
    seenSkills.add(name);

    const canonical = parseCanonical(entry.canonical);
    if (entry.status === 'alias' && !canonical) {
      throw new Error(`catalog_manifest_invalid:skills[${index}].canonical`);
    }

    return {
      name,
      category: entry.category as CatalogSkillCategory,
      status: entry.status as CatalogEntryStatus,
      summary: entry.summary.trim(),
      canonical,
      core: entry.core === true,
    };
  });

  for (const coreSkill of REQUIRED_CORE_SKILLS) {
    const skill = skills.find((entry) => entry.name === coreSkill);
    if (!skill || skill.status !== 'active' || skill.core !== true) {
      throw new Error(`catalog_manifest_invalid:missing_core_skill:${coreSkill}`);
    }
  }

  return {
    schemaVersion: input.schemaVersion,
    catalogVersion: input.catalogVersion.trim(),
    name: input.name.trim(),
    prompts,
    skills,
  };
}

export interface CatalogCounts {
  promptCount: number;
  skillCount: number;
  activePromptCount: number;
  activeSkillCount: number;
  coreSkillCount: number;
}

export function summarizeCatalogCounts(manifest: CatalogManifest): CatalogCounts {
  return {
    promptCount: manifest.prompts.length,
    skillCount: manifest.skills.length,
    activePromptCount: manifest.prompts.filter((entry) => entry.status === 'active').length,
    activeSkillCount: manifest.skills.filter((entry) => entry.status === 'active').length,
    coreSkillCount: manifest.skills.filter((entry) => entry.core === true).length,
  };
}
