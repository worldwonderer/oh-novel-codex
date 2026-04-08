import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpConfig } from '../mcp-registry.js';

test('buildMcpConfig creates stdio mcp config', () => {
  const config = buildMcpConfig('team', {
    nodePath: '/usr/bin/node',
    onxPath: '/tmp/onx.js',
  }) as {
    mcpServers: Record<string, { command: string; args: string[] }>;
  };
  assert.equal(config.mcpServers['onx-team'].command, '/usr/bin/node');
  assert.deepEqual(config.mcpServers['onx-team'].args, ['/tmp/onx.js', 'mcp-server', 'team']);
});

test('buildMcpConfig supports story surface', () => {
  const config = buildMcpConfig('story', {
    nodePath: '/usr/bin/node',
    onxPath: '/tmp/onx.js',
  }) as {
    mcpServers: Record<string, { command: string; args: string[] }>;
  };
  assert.deepEqual(config.mcpServers['onx-story'].args, ['/tmp/onx.js', 'mcp-server', 'story']);
});
