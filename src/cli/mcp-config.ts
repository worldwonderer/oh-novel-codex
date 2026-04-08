import fs from 'node:fs/promises';
import path from 'node:path';
import { buildMcpConfig } from '../config/mcp-registry.js';

export async function mcpConfig(args: string[]): Promise<void> {
  const surface = (readFlagValue(args, '--surface') ?? 'all') as 'all' | 'state' | 'memory' | 'trace' | 'team' | 'story';
  const nodePath = readFlagValue(args, '--node');
  const onxPath = readFlagValue(args, '--onx');
  const output = readFlagValue(args, '--output');

  const config = buildMcpConfig(surface, { nodePath, onxPath });
  const rendered = `${JSON.stringify(config, null, 2)}\n`;

  if (output) {
    const target = path.resolve(output);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, rendered, 'utf8');
    console.log(`Wrote MCP config to ${target}`);
    return;
  }

  process.stdout.write(rendered);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
