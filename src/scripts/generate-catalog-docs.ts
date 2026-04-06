#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { toPublicCatalogContract } from '../catalog/reader.js';
import { summarizeCatalogCounts, validateCatalogManifest, type CatalogManifest } from '../catalog/schema.js';
import { readPackageMetadata } from '../utils/package.js';

const CHECK_ONLY = process.argv.includes('--check');
const root = process.cwd();
const sourceManifestPath = join(root, 'src', 'catalog', 'manifest.json');
const templateManifestPath = join(root, 'templates', 'catalog-manifest.json');
const docsSkillsPath = join(root, 'docs', 'skills.md');
const docsPromptsPath = join(root, 'docs', 'prompts.md');
const docsCatalogPath = join(root, 'docs', 'catalog.json');

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function assertDeepEqual(label: string, actual: unknown, expected: unknown): void {
  const left = JSON.stringify(canonicalize(actual));
  const right = JSON.stringify(canonicalize(expected));
  if (left !== right) {
    throw new Error(label);
  }
}

function renderSkillsDoc(manifest: CatalogManifest): string {
  const counts = summarizeCatalogCounts(manifest);
  const lines = [
    '# Skills',
    '',
    '> Auto-generated from `src/catalog/manifest.json`. Do not edit by hand.',
    '',
    `ONX currently ships **${counts.skillCount}** fiction workflow skills across the full draft-to-publish pipeline.`,
    '',
    '## Core workflow skills',
    '',
  ];

  for (const entry of manifest.skills.filter((skill) => skill.core === true && skill.status === 'active')) {
    lines.push(`- \`$${entry.name}\` — **${entry.category}** — ${entry.summary}`);
  }

  lines.push('', '## Full skill catalog', '', '| Skill | Stage | Status | Core | Summary |', '| --- | --- | --- | --- | --- |');
  for (const entry of manifest.skills) {
    lines.push(`| \`$${entry.name}\` | ${entry.category} | ${entry.status} | ${entry.core === true ? 'yes' : 'no'} | ${entry.summary} |`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderPromptsDoc(manifest: CatalogManifest): string {
  const counts = summarizeCatalogCounts(manifest);
  const lines = [
    '# Prompts',
    '',
    '> Auto-generated from `src/catalog/manifest.json`. Do not edit by hand.',
    '',
    `ONX currently ships **${counts.promptCount}** prompt surfaces for planning, drafting, revision, and review lanes.`,
    '',
    '| Prompt | Stage | Status | Summary |',
    '| --- | --- | --- | --- |',
  ];

  for (const entry of manifest.prompts) {
    lines.push(`| \`${entry.name}\` | ${entry.category} | ${entry.status} | ${entry.summary} |`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function normalizePublicContract(contract: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined {
  if (!contract || typeof contract !== 'object') return contract;
  return {
    name: contract.name,
    version: contract.version,
    counts: contract.counts,
    coreSkills: contract.coreSkills,
    installablePrompts: contract.installablePrompts,
    installableSkills: contract.installableSkills,
    prompts: contract.prompts,
    skills: contract.skills,
    aliases: contract.aliases,
  };
}

function main(): void {
  const manifestRaw = JSON.parse(readFileSync(sourceManifestPath, 'utf8')) as unknown;
  const manifest = validateCatalogManifest(manifestRaw);
  const packageMetadata = readPackageMetadata(root);
  if (manifest.catalogVersion !== packageMetadata.version) {
    throw new Error(`catalog_version_drift:package_manifest_version_mismatch:${packageMetadata.version}:${manifest.catalogVersion}`);
  }
  const publicCatalog = toPublicCatalogContract(manifest);
  const skillsDoc = renderSkillsDoc(manifest);
  const promptsDoc = renderPromptsDoc(manifest);
  const templateJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const catalogJson = `${JSON.stringify(publicCatalog, null, 2)}\n`;

  if (CHECK_ONLY) {
    const templateRaw = JSON.parse(readFileSync(templateManifestPath, 'utf8')) as unknown;
    assertDeepEqual('catalog_manifest_drift:template_content_mismatch', validateCatalogManifest(templateRaw), manifest);

    const generatedCatalogRaw = JSON.parse(readFileSync(docsCatalogPath, 'utf8')) as Record<string, unknown>;
    assertDeepEqual(
      'catalog_generated_drift:content_mismatch',
      normalizePublicContract(generatedCatalogRaw),
      normalizePublicContract(publicCatalog as unknown as Record<string, unknown>),
    );

    if (readFileSync(docsSkillsPath, 'utf8') !== skillsDoc) {
      throw new Error('catalog_generated_drift:skills_doc_mismatch');
    }
    if (readFileSync(docsPromptsPath, 'utf8') !== promptsDoc) {
      throw new Error('catalog_generated_drift:prompts_doc_mismatch');
    }

    console.log('catalog check ok');
    return;
  }

  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'templates'), { recursive: true });
  writeFileSync(templateManifestPath, templateJson);
  writeFileSync(docsCatalogPath, catalogJson);
  writeFileSync(docsSkillsPath, skillsDoc);
  writeFileSync(docsPromptsPath, promptsDoc);
  console.log(`wrote ${templateManifestPath}`);
  console.log(`wrote ${docsCatalogPath}`);
  console.log(`wrote ${docsSkillsPath}`);
  console.log(`wrote ${docsPromptsPath}`);
}

main();
