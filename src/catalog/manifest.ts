import { readCatalogManifest } from './reader.js';
import type { CatalogManifest } from './schema.js';

export type Manifest = CatalogManifest;
export const MANIFEST: Manifest = readCatalogManifest();
