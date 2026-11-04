<script lang="ts">
  import PanelSection from './PanelSection.svelte';
  import { Radar, Square, SquareTerminal } from '@lucide/svelte';
  import { useTerminals } from '#lib/terminals/terminals.svelte.ts';
  import type { Session } from '@crewstead/core/protocol';
  import { request, scoped } from '#lib/api.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  type Watch = {
    id: string;
    label: string;
    command: string;
    match?: string;
    lines: number;
    reports: number;
  };
  let { session }: { session: Session } = $props();
  const workspace = useWorkspace();
  const terminals = useTerminals();
  let watches = $state<Watch[]>([]);
  async function load() {
    watches = await request<Watch[]>(
      scoped(`/sessions/${session.id}/watches`, workspace.context),
    ).catch(() => watches);
  }
  // Loaded again as watch calls start and end, and now and then while any runs.
  const calls = $derived(
    session.items
      .filter((item) => item.toolName?.startsWith('watch_'))
      .map((item) => item.status)
      .join(),
  );
  $effect(() => {
    void session.id;
    void calls;
    void session.items.length;
    void load();
  });
  $effect(() => {
    if (!watches.length) return;
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  });
  async function stop(id: string) {
    await request(scoped(`/sessions/${session.id}/watches/${id}`, workspace.context), {
      method: 'DELETE',
    }).catch(() => undefined);
    await load();
  }
</script>

<!-- Background commands this chat's model started; their output comes back to the chat. -->
{#if watches.length}
  <PanelSection
    id="watches"
    label="Watches"
    title="Background commands"
    icon={Radar}
    count={watches.length}
  >
    <ul class="panel-list panel-watches">
      {#each watches as watch (watch.id)}
        <li title={watch.command} data-working>
          <span class="panel-subagent-text">
            <span class="panel-subagent-title">{watch.label}</span>
            <small
              >{watch.lines} line{watch.lines === 1 ? '' : 's'}{watch.match
                ? ` matching /${watch.match}/`
                : ''} · {watch.reports} report{watch.reports === 1 ? '' : 's'}</small
            >
          </span>
          {#if terminals?.find(watch.id)}<button
              class="icon-button"
              aria-label={`Open terminal of ${watch.label}`}
              title="Open its terminal"
              onclick={() => terminals.show(watch.id)}><SquareTerminal size={13} /></button
            >{/if}
          <button
            class="icon-button"
            aria-label={`Stop watch ${watch.label}`}
            title="Stop"
            onclick={() => stop(watch.id)}><Square size={13} /></button
          >
        </li>
      {/each}
    </ul>
  </PanelSection>
{/if}
