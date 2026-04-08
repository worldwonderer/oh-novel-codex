import { buildContinuityReport } from '../story-memory/store.js';
import { readStoryCliFlag } from './story-cli.js';

export async function continuityReport(args: string[]): Promise<void> {
  const projectDir = readStoryCliFlag(args, '--project') ?? process.cwd();
  const draftPath = readStoryCliFlag(args, '--draft');
  const json = args.includes('--json');
  const report = await buildContinuityReport(projectDir, { draftPath });

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const lines = [
    '# ONX Continuity Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Continuity entries: ${report.continuityEntries.length}`,
    `- Unresolved items: ${report.unresolvedCount}`,
    `- Resolved items: ${report.resolvedCount}`,
    '',
    '## Collection counts',
    '',
  ];

  for (const [collection, count] of Object.entries(report.collectionCounts)) {
    lines.push(`- ${collection}: ${count}`);
  }

  lines.push('## Warnings', '');
  if (report.warnings.length === 0) {
    lines.push('- none');
  } else {
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (report.draft) {
    lines.push('', '## Draft coverage', '');
    lines.push(`- Draft: ${report.draft.path}`);
    lines.push(`- Referenced keywords: ${report.draft.referencedKeywords.length}`);
    lines.push(`- Missing keywords: ${report.draft.missingKeywords.length}`);
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}
