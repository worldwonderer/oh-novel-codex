import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPackageRoot } from '../utils/package.js';
import { type CatalogCounts, type CatalogManifest, summarizeCatalogCounts, validateCatalogManifest } from './schema.js';

const MANIFEST_CANDIDATE_PATHS = [
  ['src', 'catalog', 'manifest.json'],
  ['templates', 'catalog-manifest.json'],
  ['dist', 'catalog', 'manifest.json'],
] as const;

let cachedManifest: CatalogManifest | null = null;
let cachedPath: string | null = null;

function resolveManifestPath(packageRoot: string): string | null {
  for (const segments of MANIFEST_CANDIDATE_PATHS) {
    const fullPath = join(packageRoot, ...segments);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

export function readCatalogManifest(packageRoot: string = getPackageRoot()): CatalogManifest {
  const manifestPath = resolveManifestPath(packageRoot);
  if (!manifestPath) {
    throw new Error('catalog_manifest_missing');
  }

  if (cachedManifest && cachedPath === manifestPath) {
    return cachedManifest;
  }

  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  const manifest = validateCatalogManifest(raw);
  cachedManifest = manifest;
  cachedPath = manifestPath;
  return manifest;
}

export function tryReadCatalogManifest(packageRoot: string = getPackageRoot()): CatalogManifest | null {
  try {
    return readCatalogManifest(packageRoot);
  } catch {
    return null;
  }
}

export function getCatalogCounts(packageRoot: string = getPackageRoot()): CatalogCounts {
  return summarizeCatalogCounts(readCatalogManifest(packageRoot));
}

export function getInstallablePromptNames(manifest: CatalogManifest = readCatalogManifest()): string[] {
  return manifest.prompts.filter((entry) => entry.status === 'active').map((entry) => entry.name);
}

export function getInstallableSkillNames(manifest: CatalogManifest = readCatalogManifest()): string[] {
  return manifest.skills.filter((entry) => entry.status === 'active').map((entry) => entry.name);
}

export function getCoreSkillNames(manifest: CatalogManifest = readCatalogManifest()): string[] {
  return manifest.skills.filter((entry) => entry.status === 'active' && entry.core === true).map((entry) => entry.name);
}

export interface PublicCatalogContract {
  generatedAt: string;
  name: string;
  version: string;
  counts: CatalogCounts;
  coreSkills: string[];
  installablePrompts: string[];
  installableSkills: string[];
  prompts: CatalogManifest['prompts'];
  skills: CatalogManifest['skills'];
  aliases: Array<{ kind: 'prompt' | 'skill'; name: string; canonical: string }>;
}

export function toPublicCatalogContract(manifest: CatalogManifest): PublicCatalogContract {
  const aliases = [
    ...manifest.prompts
      .filter((entry) => entry.status === 'alias' && typeof entry.canonical === 'string')
      .map((entry) => ({ kind: 'prompt' as const, name: entry.name, canonical: entry.canonical! })),
    ...manifest.skills
      .filter((entry) => entry.status === 'alias' && typeof entry.canonical === 'string')
      .map((entry) => ({ kind: 'skill' as const, name: entry.name, canonical: entry.canonical! })),
  ];

  return {
    generatedAt: new Date().toISOString(),
    name: manifest.name,
    version: manifest.catalogVersion,
    counts: summarizeCatalogCounts(manifest),
    coreSkills: getCoreSkillNames(manifest),
    installablePrompts: getInstallablePromptNames(manifest),
    installableSkills: getInstallableSkillNames(manifest),
    prompts: manifest.prompts,
    skills: manifest.skills,
    aliases,
  };
}
