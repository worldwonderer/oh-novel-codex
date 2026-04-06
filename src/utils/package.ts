import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type PackageMetadata = {
  name: string;
  version: string;
};

let cachedPackageRoot: string | null = null;
const cachedPackages = new Map<string, PackageMetadata>();

export function getPackageRoot(): string {
  if (cachedPackageRoot) {
    return cachedPackageRoot;
  }

  try {
    const filename = fileURLToPath(import.meta.url);
    const here = dirname(filename);
    const candidates = [join(here, '..', '..'), join(here, '..')];
    for (const candidate of candidates) {
      if (existsSync(join(candidate, 'package.json'))) {
        cachedPackageRoot = candidate;
        return candidate;
      }
    }
  } catch {
    // Fall back to cwd below.
  }

  cachedPackageRoot = process.cwd();
  return cachedPackageRoot;
}

export function readPackageMetadata(packageRoot: string = getPackageRoot()): PackageMetadata {
  const cached = cachedPackages.get(packageRoot);
  if (cached) {
    return cached;
  }

  const packagePath = join(packageRoot, 'package.json');
  const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as Partial<PackageMetadata>;
  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    throw new Error(`package_metadata_invalid:name:${packagePath}`);
  }
  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    throw new Error(`package_metadata_invalid:version:${packagePath}`);
  }

  const metadata: PackageMetadata = {
    name: parsed.name,
    version: parsed.version,
  };
  cachedPackages.set(packageRoot, metadata);
  return metadata;
}

export function getPackageVersion(packageRoot: string = getPackageRoot()): string {
  return readPackageMetadata(packageRoot).version;
}
