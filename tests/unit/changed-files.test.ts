import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '@crewstead/core/protocol';
import { changedFiles } from '../../web/src/lib/components/timeline-entries.ts';

const tool = (toolName: string, path: string): TimelineItem =>
  ({
    id: `${toolName}-${path}`,
    role: 'tool',
    toolName,
    status: 'completed',
    text: '',
    createdAt: '2026-11-04T00:00:00Z',
    diff: `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-a\n+b\n`,
  }) as TimelineItem;

describe('changed files', () => {
  it('lists files a chat changed, not the skills it wrote', () => {
    expect(
      changedFiles([tool('edit_file', 'src/a.ts'), tool('skill_create', 'skills/x/SKILL.md')]),
    ).toEqual([{ path: 'src/a.ts', added: 1, removed: 1 }]);
  });
});
