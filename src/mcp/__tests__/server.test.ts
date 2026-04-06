import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { encodeMessage } from '../protocol.js';

test('MCP server handles initialize and tools/list', async () => {
  await fs.mkdtemp(path.join(os.tmpdir(), 'onx-mcp-'));
  const child = spawn(process.execPath, ['dist/cli/onx.js', 'mcp-server', 'all'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  child.stdin.write(
    encodeMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    }),
  );
  child.stdin.write(
    encodeMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }),
  );

  const output = await waitForOutput(chunks, /state_read/, 4_000);
  child.kill('SIGTERM');

  assert.match(output, /onx-mcp/);
  assert.match(output, /state_read/);
  assert.match(output, /project_memory_read/);
  assert.match(output, /trace_summary/);
  assert.match(output, /team_status/);
});

async function waitForOutput(chunks: Buffer[], pattern: RegExp, timeoutMs: number): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const output = Buffer.concat(chunks).toString('utf8');
    if (pattern.test(output)) return output;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return Buffer.concat(chunks).toString('utf8');
}
