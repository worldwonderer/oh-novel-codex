import fs from 'node:fs/promises';
import path from 'node:path';
import { aggregateReviewCards, loadReviewCards, renderAggregatedReviewMarkdown } from '../review/aggregate.js';

export async function reviewAggregate(args: string[]): Promise<void> {
  const input = args[0];
  if (!input) {
    throw new Error('review-aggregate requires an input file or directory');
  }

  const format = readFlagValue(args, '--format') ?? 'markdown';
  const output = readFlagValue(args, '--output');
  const cards = await loadReviewCards(path.resolve(input));
  const aggregate = aggregateReviewCards(cards);

  const rendered =
    format === 'json'
      ? `${JSON.stringify(aggregate, null, 2)}\n`
      : renderAggregatedReviewMarkdown(aggregate);

  if (output) {
    const target = path.resolve(output);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, rendered, 'utf8');
    console.log(`Wrote aggregated review to ${target}`);
    return;
  }

  process.stdout.write(rendered);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}
