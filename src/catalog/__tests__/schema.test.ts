import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalogManifest } from '../schema.js';

test('validateCatalogManifest rejects duplicate skill names', () => {
  assert.throws(
    () =>
      validateCatalogManifest({
        schemaVersion: 1,
        catalogVersion: '0.1.0',
        name: 'dup-test',
        prompts: [
          { name: 'novel-architect', category: 'planning', status: 'active', summary: 'x' },
        ],
        skills: [
          { name: 'novel-interview', category: 'intake', status: 'active', summary: 'x', core: true },
          { name: 'novel-interview', category: 'planning', status: 'active', summary: 'y' },
          { name: 'story-architect', category: 'planning', status: 'active', summary: 'x', core: true },
          { name: 'draft-longform', category: 'drafting', status: 'active', summary: 'x', core: true },
          { name: 'review-pipeline', category: 'review', status: 'active', summary: 'x', core: true },
          { name: 'publish-check', category: 'publish', status: 'active', summary: 'x', core: true },
        ],
      }),
    /duplicate_skill:novel-interview/,
  );
});

test('validateCatalogManifest requires canonical target for aliases', () => {
  assert.throws(
    () =>
      validateCatalogManifest({
        schemaVersion: 1,
        catalogVersion: '0.1.0',
        name: 'alias-test',
        prompts: [
          { name: 'novel-architect', category: 'planning', status: 'active', summary: 'x' },
        ],
        skills: [
          { name: 'novel-interview', category: 'intake', status: 'active', summary: 'x', core: true },
          { name: 'story-architect', category: 'planning', status: 'active', summary: 'x', core: true },
          { name: 'draft-longform', category: 'drafting', status: 'active', summary: 'x', core: true },
          { name: 'review-pipeline', category: 'review', status: 'active', summary: 'x', core: true },
          { name: 'publish-check', category: 'publish', status: 'active', summary: 'x', core: true },
          { name: 'publish-safety-net', category: 'publish', status: 'alias', summary: 'alias' },
        ],
      }),
    /skills\[5\]\.canonical/,
  );
});
