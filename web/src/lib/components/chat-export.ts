import type { Session, TimelineItem } from '@crewstead/core/protocol';
import { PLAN_TOOL } from '@crewstead/core/protocol';

const pad = (n: number) => String(n).padStart(2, '0');
/** A time as "2026-11-01 14:05", in this browser's time zone. */
function when(iso: string) {
  const at = new Date(iso);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Who wrote a message, as its heading. */
function author(item: TimelineItem, label: (modelId: string) => string) {
  if (item.role === 'assistant')
    return item.modelId ? `Assistant (${label(item.modelId)})` : 'Assistant';
  if (item.scheduled) return `Scheduled task “${item.scheduled.title}”`;
  if (item.sentBy) return `${item.sentBy.model}, from chat “${item.sentBy.chatTitle}”`;
  return 'You';
}

/**
 * The chat as Markdown, as it reads on screen: each message under its author and time, tool calls
 * as one line each, and changes of model or place as notes. Reasoning and tool output are left out.
 */
export function chatMarkdown(
  session: Session,
  label: (modelId: string) => string,
  now = new Date(),
) {
  const place = session.projectId ? (session.projectName ?? 'a project') : 'Cloud';
  const lines = [
    `# ${session.title}`,
    '',
    `Exported from Crewstead on ${when(now.toISOString())} · ${label(session.modelId)} · ${place}`,
  ];
  let tools: string[] = [];
  const flush = () => {
    if (tools.length) lines.push('', ...tools);
    tools = [];
  };
  for (const item of session.items) {
    if (item.role === 'tool') {
      if (item.toolName === PLAN_TOOL) continue;
      const state = item.status === 'completed' ? '' : ` (${item.status})`;
      tools.push(`- Tool: ${item.text || item.toolName || 'call'}${state}`);
      continue;
    }
    flush();
    if (item.role === 'summary') continue;
    if (item.role === 'notice') {
      lines.push('', `*${item.text}*`);
      continue;
    }
    if (item.role === 'assistant' && !item.text && !item.result && item.status !== 'interrupted')
      continue;
    lines.push('', '---', '', `**${author(item, label)}** · ${when(item.createdAt)}`);
    if (item.attachments?.length)
      lines.push('', `Attached: ${item.attachments.map((file) => file.name).join(', ')}`);
    if (item.text) lines.push('', item.text.trim());
    if (item.status === 'interrupted') lines.push('', '*Stopped.*');
    if (item.result) lines.push('', `*Error: ${item.result}*`);
  }
  flush();
  return `${lines.join('\n')}\n`;
}

/** A file name from the chat's name: no characters file systems refuse. */
export function exportName(title: string) {
  const name = title
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return `${name.slice(0, 80) || 'Chat'}.md`;
}

/** Saves the chat as a Markdown file through the browser's download. */
export function downloadChat(session: Session, label: (modelId: string) => string) {
  const file = new Blob([chatMarkdown(session, label)], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = exportName(session.title);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}
