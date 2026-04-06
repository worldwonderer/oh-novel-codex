import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PACKED_INSTALL_SMOKE_CORE_COMMANDS = [
  ['--help'],
  ['--version'],
] as const;

export const PACKED_INSTALL_SMOKE_POST_INSTALL_COMMANDS = [
  'setup',
  'doctor',
  'run-draft',
  'run-review',
  'run-workflow',
] as const;

type DoctorReport = {
  ok: boolean;
  prompts?: { missing?: string[] };
  skills?: { missing?: string[] };
  project?: { ok?: boolean };
};

function usage(): string {
  return [
    'Usage: node dist/scripts/smoke-packed-install.js',
    '',
    'Creates an npm tarball, installs it into an isolated prefix, and smoke tests the installed onx CLI.',
    'The smoke path validates boot commands plus a minimal installed setup -> doctor -> run-draft -> run-review -> run-workflow chain.',
  ].join('\n');
}

function parseArgs(argv: string[]): void {
  for (const token of argv) {
    if (token === '--help' || token === '-h') {
      console.log(usage());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}\n${usage()}`);
  }
}

function run(cmd: string, args: readonly string[], cwd: string): ReturnType<typeof spawnSync> {
  const result = spawnSync(cmd, [...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${cmd} ${args.join(' ')}`,
      result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
      result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : '',
    ].filter(Boolean).join('\n\n'));
  }
  return result;
}

function npmBinName(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runJson(cmd: string, args: readonly string[], cwd: string): unknown {
  const result = run(cmd, args, cwd);
  const stdout = typeof result.stdout === 'string' ? result.stdout : String(result.stdout);
  return JSON.parse(stdout);
}

async function main(): Promise<void> {
  parseArgs(process.argv.slice(2));

  const repoRoot = process.cwd();
  const tempRoot = mkdtempSync(join(tmpdir(), 'onx-packed-install-'));
  const prefixDir = join(tempRoot, 'prefix');
  const codexHome = join(tempRoot, 'codex-home');
  const projectDir = join(tempRoot, 'project');
  mkdirSync(prefixDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  let tarballPath: string | undefined;
  try {
    const packed = run(npmCommand(), ['pack', '--json'], repoRoot);
    const packedStdout = typeof packed.stdout === 'string' ? packed.stdout : String(packed.stdout);
    const jsonStart = packedStdout.indexOf('[');
    if (jsonStart === -1) {
      throw new Error(`npm pack did not return JSON output\n${packedStdout}`);
    }

    const packOutput = JSON.parse(packedStdout.slice(jsonStart)) as Array<{ filename: string }>;
    const tarballName = packOutput[0]?.filename;
    if (!tarballName) {
      throw new Error('npm pack did not return a tarball filename');
    }

    tarballPath = join(repoRoot, tarballName);
    run(npmCommand(), ['install', '-g', tarballPath, '--prefix', prefixDir], repoRoot);

    const onxPath = join(prefixDir, process.platform === 'win32' ? '' : 'bin', npmBinName('onx'));
    for (const argv of PACKED_INSTALL_SMOKE_CORE_COMMANDS) {
      run(onxPath, argv, repoRoot);
    }

    run(onxPath, ['setup', '--codex-home', codexHome, '--project', projectDir], repoRoot);
    const doctorReport = runJson(onxPath, ['doctor', '--codex-home', codexHome, '--project', projectDir, '--json'], repoRoot) as DoctorReport;
    if (doctorReport.ok !== true) {
      throw new Error(`installed doctor check failed: ${JSON.stringify(doctorReport)}`);
    }

    const draftResult = run(onxPath, ['run-draft', '--brief', '安装后 smoke draft brief', '--project', projectDir, '--job-name', 'packed-install-smoke'], repoRoot);
    const draftStdout = typeof draftResult.stdout === 'string' ? draftResult.stdout : String(draftResult.stdout);
    const createdLine = draftStdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('Created draft job: '));
    if (!createdLine) {
      throw new Error(`installed run-draft output missing job path: ${draftStdout}`);
    }
    const createdJobDir = createdLine.replace('Created draft job: ', '').trim();
    if (!createdJobDir || !existsSync(createdJobDir)) {
      throw new Error(`installed run-draft did not create job dir: ${createdJobDir}`);
    }
    const installedDraftPath = join(createdJobDir, 'outputs', 'draft.md');
    if (!existsSync(installedDraftPath)) {
      throw new Error(`installed run-draft did not create draft output: ${installedDraftPath}`);
    }

    const reviewResult = run(
      onxPath,
      ['run-review', '--draft', installedDraftPath, '--project', projectDir, '--job-name', 'packed-install-review'],
      repoRoot,
    );
    const reviewStdout = typeof reviewResult.stdout === 'string' ? reviewResult.stdout : String(reviewResult.stdout);
    const reviewCreatedLine = reviewStdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('Created review job: '));
    if (!reviewCreatedLine) {
      throw new Error(`installed run-review output missing job path: ${reviewStdout}`);
    }
    const createdReviewJobDir = reviewCreatedLine.replace('Created review job: ', '').trim();
    if (!createdReviewJobDir || !existsSync(createdReviewJobDir)) {
      throw new Error(`installed run-review did not create job dir: ${createdReviewJobDir}`);
    }

    const workflowResult = run(
      onxPath,
      ['run-workflow', '--brief', '安装后 smoke workflow brief', '--project', projectDir, '--job-name', 'packed-install-workflow', '--execute', '--dry-run'],
      repoRoot,
    );
    const workflowStdout = typeof workflowResult.stdout === 'string' ? workflowResult.stdout : String(workflowResult.stdout);
    const workflowCreatedLine = workflowStdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('Created workflow job: '));
    if (!workflowCreatedLine) {
      throw new Error(`installed run-workflow output missing job path: ${workflowStdout}`);
    }
    const createdWorkflowJobDir = workflowCreatedLine.replace('Created workflow job: ', '').trim();
    if (!createdWorkflowJobDir || !existsSync(createdWorkflowJobDir)) {
      throw new Error(`installed run-workflow did not create job dir: ${createdWorkflowJobDir}`);
    }
    const aggregateLine = workflowStdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('Aggregate: '));
    if (!aggregateLine) {
      throw new Error(`installed run-workflow output missing aggregate path: ${workflowStdout}`);
    }
    const aggregatePath = aggregateLine.replace('Aggregate: ', '').trim();
    if (!aggregatePath || !existsSync(aggregatePath)) {
      throw new Error(`installed run-workflow did not create aggregate output: ${aggregatePath}`);
    }

    console.log('packed install smoke: PASS');
  } finally {
    if (tarballPath) {
      rmSync(tarballPath, { force: true });
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`packed install smoke: FAIL\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
