import path from 'node:path';
import { listModeStates, readModeState, resolveLatestModeJob } from '../state/mode-state.js';
import { appendManual, appendWorking, readNotepad, writePriority } from '../memory/notepad.js';
import { readProjectMemory, writeProjectMemory } from '../memory/project-memory.js';
import { createTeamJob, executeTeamJob, getTeamStatus } from '../team/runtime.js';
import { readTrace, summarizeTrace } from '../trace/reader.js';
import { createMessageParser, encodeMessage, type JsonRpcRequest, type JsonRpcResponse } from './protocol.js';

export type McpSurface = 'all' | 'state' | 'memory' | 'trace' | 'team';

type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

export async function startMcpServer(surface: McpSurface): Promise<void> {
  const tools = buildTools(surface);
  const parser = createMessageParser((message) => {
    void handleMessage(message, tools);
  });

  process.stdin.on('data', parser);
  process.stdin.resume();
}

async function handleMessage(message: JsonRpcRequest, tools: ToolSpec[]): Promise<void> {
  try {
    if (message.method === 'notifications/initialized') {
      return;
    }

    if (message.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'onx-mcp',
            version: '0.1.0',
          },
          capabilities: {
            tools: {},
          },
        },
      });
      return;
    }

    if (message.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      });
      return;
    }

    if (message.method === 'tools/call') {
      const name = message.params?.name as string | undefined;
      const args = (message.params?.arguments as Record<string, unknown> | undefined) ?? {};
      const tool = tools.find((item) => item.name === name);
      if (!tool) {
        sendError(message.id ?? null, -32601, `Unknown tool: ${name}`);
        return;
      }

      const result = await tool.handler(args);
      send({
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      });
      return;
    }

    sendError(message.id ?? null, -32601, `Unknown method: ${message.method}`);
  } catch (error) {
    sendError(message.id ?? null, -32000, error instanceof Error ? error.message : String(error));
  }
}

function send(response: JsonRpcResponse): void {
  process.stdout.write(encodeMessage(response));
}

function sendError(id: string | number | null, code: number, message: string): void {
  send({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });
}

function buildTools(surface: McpSurface): ToolSpec[] {
  const groups = {
    state: stateTools(),
    memory: memoryTools(),
    trace: traceTools(),
    team: teamTools(),
  };

  if (surface === 'all') {
    return [...groups.state, ...groups.memory, ...groups.trace, ...groups.team];
  }
  return groups[surface];
}

function stateTools(): ToolSpec[] {
  return [
    {
      name: 'state_read',
      description: 'Read one ONX mode state by name.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string' },
          projectDir: { type: 'string' },
        },
        required: ['mode'],
      },
      handler: async (args) => readModeState(resolveProjectDir(args), args.mode as any),
    },
    {
      name: 'state_list',
      description: 'List ONX mode states for a project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
        },
      },
      handler: async (args) => listModeStates(resolveProjectDir(args)),
    },
    {
      name: 'state_latest_job',
      description: 'Resolve latest job path for a given mode.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string' },
          projectDir: { type: 'string' },
        },
        required: ['mode'],
      },
      handler: async (args) => ({
        jobDir: await resolveLatestModeJob(resolveProjectDir(args), args.mode as any),
      }),
    },
  ];
}

function memoryTools(): ToolSpec[] {
  return [
    {
      name: 'notepad_read',
      description: 'Read ONX notepad or one section.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          section: { type: 'string' },
        },
      },
      handler: async (args) => ({
        content: await readNotepad(resolveProjectDir(args), (args.section as any) || undefined),
      }),
    },
    {
      name: 'notepad_write',
      description: 'Write to ONX notepad section.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          section: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['section', 'content'],
      },
      handler: async (args) => {
        const projectDir = resolveProjectDir(args);
        const section = args.section as string;
        const content = String(args.content);
        if (section === 'priority') await writePriority(projectDir, content);
        else if (section === 'manual') await appendManual(projectDir, content);
        else await appendWorking(projectDir, content);
        return { success: true, section };
      },
    },
    {
      name: 'project_memory_read',
      description: 'Read ONX project memory JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
        },
      },
      handler: async (args) => readProjectMemory(resolveProjectDir(args)),
    },
    {
      name: 'project_memory_write',
      description: 'Write or merge ONX project memory JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          memory: { type: 'object' },
          merge: { type: 'boolean' },
        },
        required: ['memory'],
      },
      handler: async (args) =>
        writeProjectMemory(resolveProjectDir(args), (args.memory as Record<string, unknown>) ?? {}, {
          merge: Boolean(args.merge),
        }),
    },
  ];
}

function traceTools(): ToolSpec[] {
  return [
    {
      name: 'trace_timeline',
      description: 'Read ONX event timeline.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          last: { type: 'number' },
        },
      },
      handler: async (args) => {
        const events = await readTrace(resolveProjectDir(args));
        const last = Number(args.last ?? 0);
        return last > 0 ? events.slice(-last) : events;
      },
    },
    {
      name: 'trace_summary',
      description: 'Summarize ONX event trace.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
        },
      },
      handler: async (args) => summarizeTrace(resolveProjectDir(args)),
    },
  ];
}

function teamTools(): ToolSpec[] {
  return [
    {
      name: 'team_latest_job',
      description: 'Resolve latest ONX team job for a project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
        },
      },
      handler: async (args) => ({
        jobDir: await resolveLatestModeJob(resolveProjectDir(args), 'team'),
      }),
    },
    {
      name: 'team_status',
      description: 'Read ONX team lane status.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          jobDir: { type: 'string' },
          latest: { type: 'boolean' },
        },
      },
      handler: async (args) => {
        const projectDir = resolveProjectDir(args);
        const explicit = (args.jobDir as string | undefined) ? path.resolve(String(args.jobDir)) : undefined;
        const latest = explicit ? explicit : (await resolveLatestModeJob(projectDir, 'team'));
        if (!latest) {
          return { error: 'No team job found' };
        }
        return {
          status: await getTeamStatus(latest),
        };
      },
    },
    {
      name: 'team_start',
      description: 'Create an ONX team runtime job from a review job or workflow job.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          reviewJobDir: { type: 'string' },
          workflowJobDir: { type: 'string' },
          jobName: { type: 'string' },
        },
      },
      handler: async (args) => {
        const projectDir = resolveProjectDir(args);
        const team = await createTeamJob({
          projectDir,
          reviewJobDir: args.reviewJobDir as string | undefined,
          workflowJobDir: args.workflowJobDir as string | undefined,
          jobName: args.jobName as string | undefined,
        });
        return {
          jobDir: team.jobDir,
          reviewJobDir: team.reviewJobDir,
          statePath: team.statePath,
        };
      },
    },
    {
      name: 'team_run',
      description: 'Execute or resume an ONX team runtime job.',
      inputSchema: {
        type: 'object',
        properties: {
          projectDir: { type: 'string' },
          jobDir: { type: 'string' },
          latest: { type: 'boolean' },
          dryRun: { type: 'boolean' },
          parallel: { type: 'boolean' },
          fromLane: { type: 'string' },
          toLane: { type: 'string' },
          force: { type: 'boolean' },
        },
      },
      handler: async (args) => {
        const projectDir = resolveProjectDir(args);
        const explicit = (args.jobDir as string | undefined) ? path.resolve(String(args.jobDir)) : undefined;
        const latest = explicit ? explicit : (await resolveLatestModeJob(projectDir, 'team'));
        if (!latest) {
          return { error: 'No team job found' };
        }
        const result = await executeTeamJob({
          jobDir: latest,
          dryRun: Boolean(args.dryRun),
          parallel: args.parallel === undefined ? true : Boolean(args.parallel),
          fromLane: args.fromLane as string | undefined,
          toLane: args.toLane as string | undefined,
          force: Boolean(args.force),
        });
        return result;
      },
    },
  ];
}

function resolveProjectDir(args: Record<string, unknown>): string {
  return path.resolve((args.projectDir as string | undefined) ?? process.cwd());
}
