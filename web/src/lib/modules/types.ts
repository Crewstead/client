import type { Component } from 'svelte';
import type { ContextId, Session } from '@crewstead/core/protocol';

/** Lazily imported module UI, so a turned-off module's code is never loaded. */
export type Lazy<Props extends Record<string, unknown>> = () => Promise<{
  default: Component<Props>;
}>;

/** Props each UI slot passes to the panels modules contribute to it. */
export interface SlotProps {
  /** Settings → Models: the user's own models and how to set them up. `note` explains where they apply. */
  'personal-models': { note: string };
  /** Inside the Personal models list, after provider connections (e.g. Claude Code on a computer). */
  'personal-providers': { changed: () => Promise<void> };
  /** Settings → Models, after the model sections (e.g. development tools). */
  models: Record<string, never>;
  /** A shared workspace's settings page, below its members. */
  workspace: { context: ContextId; name: string; canManage: boolean };
  /** Settings → Chats: each panel renders one `<li>` row (name, status, control) in the shared card. */
  chats: Record<string, never>;
  /** A chat's side panel, above the core sections (e.g. the skills in use). */
  'chat-panel': { session: Session };
}
export type SlotName = keyof SlotProps;

/** Where a section sits in the Settings list: models and what chats can use, chats, or people. */
export type SettingsGroup = 'tools' | 'chats' | 'people';

export interface SettingsTab {
  id: string;
  label: string;
  group: SettingsGroup;
  /** Position among all Settings tabs; core tabs use 10, 30, 40. */
  order: number;
  load: Lazy<Record<string, never>>;
}
export type SettingsPanel = {
  [Slot in SlotName]: { slot: Slot; order: number; load: Lazy<SlotProps[Slot]> };
}[SlotName];

/** A page at /settings/<section>/<id>, e.g. one organisation. */
export interface SettingsPage {
  section: string;
  load: Lazy<{ id: string }>;
}
/** An extra choice in "Connect a provider" (Personal only) that opens the module's own setup. */
export interface ConnectOption {
  id: string;
  label: string;
  hint: string;
  /** Shown when chosen, before Continue. */
  description: string;
  load: Lazy<{ close: () => void }>;
}
/** A link in the workspace menu; `href` is an app path such as "/settings?tab=organisations". */
export interface WorkspaceAction {
  label: string;
  href: string;
}

/** A link in the sidebar, under Live browsers; `href` is an app path such as "/settings?tab=scheduled". */
export interface SidebarLink {
  label: string;
  href: string;
  icon: Component<{ size?: number }>;
}

/** Something the user can mention as "@name" in a message, e.g. a skill. */
export interface Mention {
  name: string;
  hint: string;
}

/**
 * A client module: the UI one server module contributes. Core reads these descriptors and never
 * imports module internals; a module shows only while the hub reports that module as on.
 */
export interface ClientModule {
  id: string;
  tabs?: SettingsTab[];
  panels?: SettingsPanel[];
  pages?: SettingsPage[];
  connectOptions?: ConnectOption[];
  workspaceActions?: WorkspaceAction[];
  sidebarLinks?: SidebarLink[];
  /** Names offered after "@" in the prompt box. */
  mentions?: () => Promise<Mention[]>;
  /**
   * API path of browser sessions this module can show live: GET it to list them, GET
   * `<path>/<key>/stream` to watch one, POST `<path>/<key>/<control>` to steer it.
   */
  liveBrowsers?: string;
}
