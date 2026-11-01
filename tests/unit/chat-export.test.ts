import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { Session, TimelineItem } from '@crewstead/core/protocol';
import { chatMarkdown, exportName } from '../../web/src/lib/components/chat-export.ts';

const item = (role: TimelineItem['role'], fields: Partial<TimelineItem> = {}): TimelineItem => ({
  id: randomUUID(),
  role,
  text: '',
  status: 'completed',
  createdAt: '2026-10-30T09:15:00Z',
  ...fields,
});
const chat = (items: TimelineItem[]): Session => ({
  id: randomUUID(),
  contextId: 'personal',
  modelId: 'gpt',
  title: 'Trip plan',
  status: 'idle',
  createdAt: '2026-10-30T09:00:00Z',
  updatedAt: '2026-10-30T10:00:00Z',
  pinned: false,
  archived: false,
  items,
});
const labels = (id: string) => ({ gpt: 'GPT-5', claude: 'Claude Opus' })[id] ?? id;

it('writes each message under its author and time, tools as lines, notes for changes', () => {
  const text = chatMarkdown(
    chat([
      item('user', {
        text: 'Plan a **trip** to Rome',
        attachments: [{ id: 'a', name: 'map.png' } as never],
      }),
      item('assistant', { text: '', reasoning: 'thinking…' }),
      item('tool', { toolName: 'web_search', text: 'Search the web for “Rome”' }),
      item('tool', { toolName: 'plan_update', text: 'Plan: 0 of 2 done' }),
      item('tool', { toolName: 'write_note', text: 'Write a note', status: 'rejected' }),
      item('assistant', { text: 'Here is a plan.', modelId: 'gpt', reasoning: 'secret thoughts' }),
      item('notice', { text: 'Switched to Claude Opus from GPT-5' }),
      item('user', { text: 'Daily check', scheduled: { taskId: 't', title: 'Morning' } }),
      item('assistant', { text: 'Half', modelId: 'claude', status: 'interrupted' }),
      item('assistant', { text: '', modelId: 'claude', result: 'Rate limited', status: 'failed' }),
    ]),
    labels,
    new Date('2026-11-01T12:00:00Z'),
  );
  expect(text).toMatch(
    /^# Trip plan\n\nExported from Crewstead on 2026-11-01 \d\d:\d\d · GPT-5 · Cloud\n/,
  );
  expect(text).toContain('**You** · 2026-10-30');
  expect(text).toContain('Attached: map.png\n\nPlan a **trip** to Rome');
  expect(text).toContain(
    '- Tool: Search the web for “Rome”\n- Tool: Write a note (rejected)\n\n---\n\n**Assistant (GPT-5)**',
  );
  expect(text).toContain('Here is a plan.');
  expect(text).toContain('*Switched to Claude Opus from GPT-5*');
  expect(text).toContain('**Scheduled task “Morning”**');
  expect(text).toContain('Half\n\n*Stopped.*');
  expect(text).toContain('*Error: Rate limited*');
  // Reasoning, plan updates and empty steps stay out.
  expect(text).not.toContain('secret thoughts');
  expect(text).not.toContain('Plan: 0 of 2 done');
  expect(text.match(/\*\*Assistant/g)).toHaveLength(3);
});

it('names the file after the chat, without characters file systems refuse', () => {
  expect(exportName('Notes: a/b <draft>?')).toBe('Notes- a-b -draft-.md');
  expect(exportName('   ')).toBe('Chat.md');
  expect(exportName('x'.repeat(200))).toHaveLength(83);
});
