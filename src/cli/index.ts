import { doctor } from './doctor.js';
import { executeRevision } from './execute-revision.js';
import { executeReview } from './execute-review.js';
import { executeWorkflow } from './execute-workflow.js';
import { fallbackWatcher } from './fallback-watcher.js';
import { history } from './history.js';
import { hud } from './hud.js';
import { mcpConfig } from './mcp-config.js';
import { mcpServer } from './mcp-server.js';
import { memoryRead } from './memory-read.js';
import { memoryWrite } from './memory-write.js';
import { note } from './note.js';
import { notifyHook } from './notify-hook.js';
import { reviewStatus } from './review-status.js';
import { runDraft } from './run-draft.js';
import { runRevision } from './run-revision.js';
import { runWorkflow } from './run-workflow.js';
import { runReview } from './run-review.js';
import { reviewAggregate } from './review-aggregate.js';
import { revisionStatus } from './revision-status.js';
import { stateClear } from './state-clear.js';
import { stateRead } from './state-read.js';
import { status } from './status.js';
import { setup } from './setup.js';
import { teamRun } from './team-run.js';
import { teamStart } from './team-start.js';
import { teamStatus } from './team-status.js';
import { tmuxGuard } from './tmux-guard.js';
import { trace } from './trace.js';
import { uninstall } from './uninstall.js';
import { update } from './update.js';
import { verifyJob } from './verify-job.js';
import { version } from './version.js';
import { watchdog } from './watchdog.js';
import { workflowStatus } from './workflow-status.js';
import { HELP_TEXT } from './help-text.js';
import { scaffoldProject } from '../config/generator.js';

export async function runCli(argv: string[]): Promise<void> {
      const [command, ...args] = argv;

      switch (command) {
        case 'setup':
          await setup(args);
          return;
        case 'doctor':
          await doctor(args);
          return;
        case 'history':
          await history(args);
          return;
        case 'fallback-watcher':
          await fallbackWatcher(args);
          return;
        case 'update':
          await update(args);
          return;
        case 'uninstall':
          await uninstall(args);
          return;
        case 'hud':
          await hud(args);
          return;
        case 'mcp-server':
          await mcpServer(args);
          return;
        case 'mcp-config':
          await mcpConfig(args);
          return;
        case 'note':
          await note(args);
          return;
        case 'notify-hook':
          await notifyHook(args);
          return;
        case 'memory-read':
          await memoryRead(args);
          return;
        case 'memory-write':
          await memoryWrite(args);
          return;
        case 'state-read':
          await stateRead(args);
          return;
        case 'state-clear':
          await stateClear(args);
          return;
        case 'trace':
          await trace(args);
          return;
        case 'verify-job':
          await verifyJob(args);
          return;
        case 'watchdog':
          await watchdog(args);
          return;
        case 'status':
          await status(args);
          return;
        case 'run-draft':
          await runDraft(args);
          return;
        case 'run-revision':
          await runRevision(args);
          return;
        case 'run-workflow':
          await runWorkflow(args);
          return;
        case 'team-start':
          await teamStart(args);
          return;
        case 'team-run':
          await teamRun(args);
          return;
        case 'team-status':
          await teamStatus(args);
          return;
        case 'tmux-guard':
          await tmuxGuard(args);
          return;
        case 'execute-revision':
          await executeRevision(args);
          return;
        case 'execute-review':
          await executeReview(args);
          return;
        case 'revision-status':
          await revisionStatus(args);
          return;
        case 'review-status':
          await reviewStatus(args);
          return;
        case 'execute-workflow':
          await executeWorkflow(args);
          return;
        case 'workflow-status':
          await workflowStatus(args);
          return;
        case 'run-review':
          await runReview(args);
          return;
        case 'review-aggregate':
          await reviewAggregate(args);
          return;
        case 'version':
        case '--version':
        case '-v':
          console.log(version);
          return;
        case 'init': {
          const target = args[0] ?? process.cwd();
          const scaffold = await scaffoldProject(target, { force: args.includes('--force') });
          console.log(`Scaffolded ONX project in ${scaffold.projectDir}`);
          console.log(`  ensured directories: ${scaffold.createdDirectories.length}`);
          console.log(`  ensured files: ${scaffold.createdFiles.length}`);
          return;
        }
        case 'help':
        case '--help':
        case '-h':
        case undefined:
          printHelp();
          return;
        default:
          console.error(`Unknown command: ${command}`);
          printHelp();
          process.exitCode = 1;
      }
    }

function printHelp(): void {
  console.log(HELP_TEXT);
}
