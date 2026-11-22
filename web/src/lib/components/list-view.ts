import type { ChatSummary as Chat } from '#lib/api.ts';
import { chatOrder } from './sidebar-places.ts';

/** A named section of chats the owner made (New section); chats are moved into it. */
export interface ListSection {
  id: string;
  name: string;
  chats: string[];
}

/** How the left panel lists a workspace's chats, as its options menu sets it (saved on the hub). */
export interface ListView {
  group: 'none' | 'date' | 'model';
  sort: 'updated' | 'created' | 'name';
  show: {
    /** The model and when, under each title. */
    metadata: boolean;
    /** Chats only scheduled runs wrote in. */
    scheduled: boolean;
    /** Subagents' chats, under the chat that started them. */
    side: boolean;
    /** Projects without chats in the projects bar. */
    empty: boolean;
  };
  sections: ListSection[];
}

export const DEFAULT_LIST_VIEW: ListView = {
  group: 'none',
  sort: 'updated',
  show: { metadata: false, scheduled: true, side: false, empty: true },
  sections: [],
};

/** One run of chats in the list: pinned ones, a section, or a group; unnamed when there is one. */
export interface ListBlock {
  key: string;
  label?: string;
  section?: ListSection;
  chats: Chat[];
}

const written = (chat: Chat) => chat.lastMessageAt ?? chat.createdAt;

export function sorted(chats: Chat[], sort: ListView['sort']) {
  return [...chats].sort((a, b) =>
    sort === 'name'
      ? a.title.localeCompare(b.title)
      : sort === 'created'
        ? b.createdAt.localeCompare(a.createdAt)
        : written(b).localeCompare(written(a)),
  );
}

/** Today, Yesterday, Previous 7 days, Previous 30 days, then the month ("October 2026"). */
export function dateGroup(at: string, now = new Date()) {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day(now).getTime() - day(new Date(at)).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  if (days < 30) return 'Previous 30 days';
  return new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * The chats of one place as the view lists them: pinned first (in the owner's order), then the owner's
 * sections, then the rest in the chosen order, grouped by date or model when asked.
 */
export function arrange(
  chats: Chat[],
  view: ListView,
  options: { pinnedOrder?: string[]; modelLabel: (id: string) => string; now?: Date },
): ListBlock[] {
  const listed = view.show.scheduled ? chats : chats.filter((chat) => !chat.scheduledOnly);
  const pinned = chatOrder(
    listed.filter((chat) => chat.pinned),
    options.pinnedOrder,
  );
  const inSection = new Set(view.sections.flatMap((section) => section.chats));
  const sections = view.sections.map((section) => ({
    key: `section:${section.id}`,
    label: section.name,
    section,
    chats: sorted(
      listed.filter((chat) => !chat.pinned && section.chats.includes(chat.id)),
      view.sort,
    ),
  }));
  const rest = sorted(
    listed.filter((chat) => !chat.pinned && !inSection.has(chat.id)),
    view.sort,
  );
  const groups: ListBlock[] = [];
  if (view.group === 'none') groups.push({ key: 'rest', chats: rest });
  else
    for (const chat of rest) {
      const label =
        view.group === 'model'
          ? options.modelLabel(chat.modelId)
          : dateGroup(view.sort === 'created' ? chat.createdAt : written(chat), options.now);
      const group = groups.find((entry) => entry.label === label);
      if (group) group.chats.push(chat);
      else groups.push({ key: `group:${label}`, label, chats: [chat] });
    }
  // With sections or groups, the pinned run and the rest get names too.
  const named = sections.length > 0 || view.group !== 'none';
  const blocks: ListBlock[] = [];
  if (pinned.length)
    blocks.push({ key: 'pinned', ...(named ? { label: 'Pinned' } : {}), chats: pinned });
  blocks.push(...sections);
  for (const group of groups)
    if (group.chats.length || !named)
      blocks.push(group.key === 'rest' && sections.length ? { ...group, label: 'Chats' } : group);
  return blocks;
}

/** The view with a chat moved into a section (or out of every section, with no section). */
export function moveToSection(view: ListView, chat: string, section?: string): ListView {
  return {
    ...view,
    sections: view.sections.map((entry) => ({
      ...entry,
      chats:
        entry.id === section
          ? [...entry.chats.filter((id) => id !== chat), chat]
          : entry.chats.filter((id) => id !== chat),
    })),
  };
}
