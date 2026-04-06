import { startMcpServer } from '../mcp/server.js';

export async function mcpServer(args: string[]): Promise<void> {
  const surface = (args[0] ?? 'all') as 'all' | 'state' | 'memory' | 'trace' | 'team';
  if (!['all', 'state', 'memory', 'trace', 'team'].includes(surface)) {
    throw new Error('mcp-server surface must be one of: all, state, memory, trace, team');
  }
  await startMcpServer(surface);
}
