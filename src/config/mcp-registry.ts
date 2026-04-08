export type McpServerSurface = 'all' | 'state' | 'memory' | 'trace' | 'team' | 'story';

export function buildMcpConfig(
  surface: McpServerSurface,
  options: { nodePath?: string; onxPath?: string } = {},
): Record<string, unknown> {
  const nodePath = options.nodePath ?? process.execPath;
  const onxPath = options.onxPath ?? 'onx';
  const serverName = surface === 'all' ? 'onx' : `onx-${surface}`;

  return {
    mcpServers: {
      [serverName]: {
        command: nodePath,
        args: [onxPath, 'mcp-server', surface],
      },
    },
  };
}
