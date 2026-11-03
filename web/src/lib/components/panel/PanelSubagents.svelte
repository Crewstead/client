<script lang="ts">
  import PanelSection from './PanelSection.svelte';
  import { Bot } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import type { Session } from '@crewstead/core/protocol';
  import { request, scoped } from '#lib/api.ts';
  import { busy, useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/chat-row.css';
  type Subagent = Omit<Session, 'items'> & { task: string; steps: number; latest: string };
  let { session }: { session: Session } = $props();
  const workspace = useWorkspace();
  let subagents = $state<Subagent[]>([]);
  async function load() {
    subagents = await request<Subagent[]>(
      scoped(`/sessions/${session.id}/subagents`, workspace.context),
    ).catch(() => subagents);
  }
  // Loaded again as this chat's `agent` calls start and end, and every few seconds while any
  // of them is working, so each one's state is current.
  const agentCalls = $derived(
    session.items
      .filter((item) => item.toolName === 'agent')
      .map((item) => item.status)
      .join(),
  );
  $effect(() => {
    void session.id;
    void agentCalls;
    void session.status;
    void load();
  });
  $effect(() => {
    if (!subagents.some((agent) => busy(agent.status)) && !busy(session.status)) return;
    const timer = setInterval(load, 3_000);
    return () => clearInterval(timer);
  });
  const label = (id: string) =>
    workspace.catalog?.models.find((model) => model.id === id)?.label ?? id;
  const progress = (agent: Subagent) =>
    agent.status === 'running'
      ? 'Working'
      : agent.status === 'awaiting_approval'
        ? 'Waiting for your approval'
        : agent.status === 'idle'
          ? 'Done'
          : agent.status === 'failed'
            ? 'Failed'
            : 'Stopped';
</script>

<!-- Subagents this chat's model started: each its own chat, which belongs here rather than the chat list. -->
{#if subagents.length}
  <PanelSection id="subagents" label="Subagents" icon={Bot} count={subagents.length}>
    <ul class="panel-list panel-subagents">
      {#each subagents as agent (agent.id)}
        <li>
          <a href={resolve('/sessions/[id]', { id: agent.id })} title={agent.task}>
            <span class="panel-subagent-text">
              <span class="panel-subagent-title">{agent.title}</span>
              <small>
                {progress(agent)} · {label(agent.modelId)}{agent.steps
                  ? ` · ${agent.steps} step${agent.steps === 1 ? '' : 's'}`
                  : ''}{agent.parent?.tools === 'all' ? ' · all tools' : ''}</small
              >
              {#if busy(agent.status)}<small class="panel-subagent-latest">{agent.latest}</small
                >{/if}
            </span>
            <i
              class="chat-state"
              class:working={agent.status === 'running'}
              class:waiting={agent.status === 'awaiting_approval'}
              class:done={agent.status === 'idle'}
              class:failed={agent.status === 'failed'}
            ></i>
          </a>
        </li>
      {/each}
    </ul>
  </PanelSection>
{/if}
