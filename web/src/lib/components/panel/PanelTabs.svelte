<script lang="ts" module>
  export type PanelTab = 'live' | 'files' | 'chat';
  const KEY = 'crewstead-panel-tab';
  /** The tab last picked on this device; browser storage may be off. */
  export function savedTab(): PanelTab {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'files' || value === 'chat' ? value : 'live';
    } catch {
      return 'live';
    }
  }
</script>

<script lang="ts">
  import { Activity, Files, MessageSquare } from '@lucide/svelte';
  let {
    current = $bindable(),
    changed,
  }: {
    current: PanelTab;
    /** Files the chat changed, counted on the Files tab. */
    changed: number;
  } = $props();
  const tabs = [
    { id: 'live', label: 'Live', icon: Activity, hint: 'Subagents, commands, terminals, browsers' },
    { id: 'files', label: 'Files', icon: Files, hint: 'Changed and attached files, and the place' },
    { id: 'chat', label: 'Chat', icon: MessageSquare, hint: 'Usage, skills and scheduled tasks' },
  ] as const;
  function pick(tab: PanelTab) {
    current = tab;
    try {
      localStorage.setItem(KEY, tab);
    } catch {
      // Not remembered this time.
    }
  }
  /** Arrow keys move along the tabs, as in any tab list. */
  function keydown(event: KeyboardEvent) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = tabs.findIndex((tab) => tab.id === current);
    const next = tabs[(at + step + tabs.length) % tabs.length]!.id;
    pick(next);
    document.getElementById(`panel-tab-${next}`)?.focus();
  }
</script>

<!-- Three tabs: what runs now, what the chat touched, and the chat itself. The Live tab's dot shows
     while something there works (see panel-tabs.css), without switching tabs on its own. -->
<div class="panel-tabs" role="tablist" aria-label="Details tabs">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      role="tab"
      id={`panel-tab-${tab.id}`}
      class={`panel-tab tab-${tab.id}`}
      aria-selected={current === tab.id}
      aria-controls={`panel-pane-${tab.id}`}
      tabindex={current === tab.id ? 0 : -1}
      title={tab.hint}
      onclick={() => pick(tab.id)}
      onkeydown={keydown}
      ><tab.icon size={14} />{tab.label}{#if tab.id === 'live'}<i
          class="panel-live-dot"
          aria-hidden="true"
        ></i>{:else if tab.id === 'files' && changed}<span class="panel-tab-count">{changed}</span
        >{/if}</button
    >
  {/each}
</div>
