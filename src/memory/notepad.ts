import fs from 'node:fs/promises';
import path from 'node:path';

export type NotepadSection = 'priority' | 'working' | 'manual';

const SECTION_HEADERS: Record<NotepadSection, string> = {
  priority: '## Priority',
  working: '## Working',
  manual: '## Manual',
};

export async function ensureNotepad(projectDir: string): Promise<string> {
  const filePath = notepadPath(projectDir);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      ['# ONX Notepad', '', '## Priority', '', '## Working', '', '## Manual', ''].join('\n'),
      'utf8',
    );
    return filePath;
  }
}

export async function readNotepad(projectDir: string, section?: NotepadSection): Promise<string> {
  const filePath = await ensureNotepad(projectDir);
  const content = await fs.readFile(filePath, 'utf8');
  if (!section) return content;
  return extractSection(content, section).trim();
}

export async function writePriority(projectDir: string, content: string): Promise<void> {
  await updateSection(projectDir, 'priority', content.trim());
}

export async function appendWorking(projectDir: string, content: string): Promise<void> {
  const stamp = new Date().toISOString();
  await appendSection(projectDir, 'working', `- [${stamp}] ${content.trim()}`);
}

export async function appendManual(projectDir: string, content: string): Promise<void> {
  await appendSection(projectDir, 'manual', `- ${content.trim()}`);
}

export function notepadPath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.onx', 'notepad.md');
}

async function updateSection(projectDir: string, section: NotepadSection, newContent: string): Promise<void> {
  const filePath = await ensureNotepad(projectDir);
  const content = await fs.readFile(filePath, 'utf8');
  const next = replaceSection(content, section, newContent);
  await fs.writeFile(filePath, next, 'utf8');
}

async function appendSection(projectDir: string, section: NotepadSection, line: string): Promise<void> {
  const current = await readNotepad(projectDir, section);
  const updated = current ? `${current}\n${line}` : line;
  await updateSection(projectDir, section, updated);
}

function extractSection(content: string, section: NotepadSection): string {
  const header = SECTION_HEADERS[section];
  const parts = content.split(header);
  if (parts.length < 2) return '';
  const after = parts[1];
  const nextHeader = after.match(/\n##\s+[A-Za-z]+\s*/);
  if (!nextHeader || nextHeader.index === undefined) {
    return after.trim();
  }
  return after.slice(0, nextHeader.index).trim();
}

function replaceSection(content: string, section: NotepadSection, newContent: string): string {
  const lines = content.split('\n');
  const header = SECTION_HEADERS[section];
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    return `${content.trim()}\n\n${header}\n${newContent}\n`;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }

  const replacement = [header, ...(newContent ? newContent.split('\n') : []), ''];
  const nextLines = [...lines.slice(0, start), ...replacement, ...lines.slice(end)];
  return `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
