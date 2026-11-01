/**
 * How each tool behaves on the timeline: reads fold into one line; changes and commands get cards;
 * changes to chats are one line once done (a card only while they wait for approval).
 */
export type ToolKind = 'read' | 'change' | 'command' | 'note' | 'browser' | 'chat';

export const toolKinds: Record<string, ToolKind> = {
  write_note: 'note',
  list_files: 'read',
  read_file: 'read',
  search_files: 'read',
  edit_file: 'change',
  write_file: 'change',
  run_command: 'command',
  browser_open: 'browser',
  browser_click: 'browser',
  browser_type: 'browser',
  browser_snapshot: 'read',
  browser_screenshot: 'read',
  browser_logs: 'read',
  browser_close: 'read',
  browser_tabs: 'read',
  browser_switch_tab: 'read',
  web_tabs: 'read',
  web_switch_tab: 'read',
  use_skill: 'read',
  web_search: 'read',
  web_fetch: 'read',
  chat_search: 'read',
  chats_list: 'read',
  chat_read: 'read',
  chat_wait: 'read',
  chat_create: 'chat',
  chat_send: 'chat',
  chat_rename: 'chat',
  chat_archive: 'chat',
  agent: 'chat',
  agent_status: 'read',
  agent_wait: 'read',
  watch_start: 'command',
  watch_list: 'read',
  watch_stop: 'read',
  plan_update: 'read',
  web_open: 'browser',
  web_click: 'browser',
  web_type: 'browser',
  web_snapshot: 'read',
  web_screenshot: 'read',
  web_logs: 'read',
  web_close: 'read',
};

export const kindOf = (name = 'write_note'): ToolKind => toolKinds[name] ?? 'change';
