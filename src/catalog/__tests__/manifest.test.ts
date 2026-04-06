import test from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST } from '../manifest.js';
import { getCatalogCounts, getCoreSkillNames, getInstallablePromptNames, getInstallableSkillNames, toPublicCatalogContract } from '../reader.js';

test('manifest exposes active prompts and skills', () => {
  assert.equal(MANIFEST.name, 'oh-novel-codex');
  assert.ok(getInstallablePromptNames(MANIFEST).length >= 5);
  assert.ok(getInstallableSkillNames(MANIFEST).length >= 5);
});

test('catalog counts and public contract stay coherent', () => {
  const counts = getCatalogCounts();
  assert.equal(counts.promptCount, MANIFEST.prompts.length);
  assert.equal(counts.skillCount, MANIFEST.skills.length);
  assert.equal(counts.coreSkillCount, getCoreSkillNames(MANIFEST).length);

  const contract = toPublicCatalogContract(MANIFEST);
  assert.equal(contract.version, MANIFEST.catalogVersion);
  assert.deepEqual(contract.coreSkills, getCoreSkillNames(MANIFEST));
  assert.deepEqual(contract.installablePrompts, getInstallablePromptNames(MANIFEST));
  assert.deepEqual(contract.installableSkills, getInstallableSkillNames(MANIFEST));
});
