<script lang="ts">
  import ResizeHandle from '../ResizeHandle.svelte';
  import { chatPanelWidth } from '#lib/panel-widths.svelte.ts';
  import { ChartNoAxesColumn, FileDiff, Paperclip, Folder, Monitor, X } from '@lucide/svelte';
  import type { Model, Project, Session } from '@crewstead/core/protocol';
  import { request, scoped } from '#lib/api.ts';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import Attachments from '../attachments/Attachments.svelte';
  import { compact, percent } from '../chat-stats.ts';
  import { changedFiles } from '../timeline-entries.ts';
  import { chatFiles } from './chat-facts.ts';
  import PanelBrowsers from './PanelBrowsers.svelte';
  import PanelSubagents from './PanelSubagents.svelte';
  import PanelWatches from './PanelWatches.svelte';
  import '@crewstead/ui/chat-panel.css';
  let {
    session,
    model,
    project,
    close,
    details,
  }: {
    session: Session;
    model?: Model;
    /** The chat's project, while its computer is online. */
    project?: Project;
    close: () => void;
    /** Opens the full statistics. */
    details: () => void;
  } = $props();
  const workspace = useWorkspace();
  const files = $derived(chatFiles(session));
  const changes = $derived(changedFiles(session.items));
  const tokens = $derived(
    Object.values(session.usage ?? {}).reduce((sum, usage) => sum + usage.input + usage.output, 0),
  );
  let cost = $state<{ usd: number; estimated: boolean }>();
  // Cost changes when a reply ends; read again whenever the chat settles.
  $effect(() => {
    if (session.status === 'running' || session.status === 'awaiting_approval') return;
    void session.updatedAt;
    void request<{ usd: number; estimated: boolean }>(
      scoped(`/sessions/${session.id}/cost`, workspace.context),
    )
      .then((value) => (cost = value))
      .catch(() => (cost = undefined));
  });
  const rules = $derived(
    project?.kind === 'computer'
      ? [
          'files anywhere',
          project.rules.commands ? 'commands' : '',
          project.browser ? 'browser' : '',
        ].filter(Boolean)
      : project
        ? [
            project.sandbox && project.rules.commands ? 'commands' : '',
            project.browser && project.rules.browser ? 'browser' : '',
            project.rules.network ? 'network' : '',
          ].filter(Boolean)
        : [],
  );
</script>

<aside class="chat-panel" aria-label="Chat details">
  <ResizeHandle panel={chatPanelWidth} edge="left" label="Resize the details panel" />
  <header class="chat-panel-header">
    <h2>Details</h2>
    <button class="icon-button" aria-label="Close details" onclick={close}><X size={16} /></button>
  </header>
  <div class="chat-panel-body">
    <ModuleSlot slot="chat-panel" props={{ session }} />
    <PanelSubagents {session} />
    <PanelWatches {session} />
    <PanelBrowsers {session} />

    <section class="panel-section" aria-label="Files in this chat">
      <h3>
        <Paperclip size={13} />Files{#if files.length}<span>{files.length}</span>{/if}
      </h3>
      {#if files.length}<div class="panel-files"><Attachments {files} /></div>
      {:else}<p class="panel-empty">Attached files and screenshots show here.</p>{/if}
    </section>

    <section class="panel-section" aria-label="Files changed in this chat">
      <h3>
        <FileDiff size={13} />Changed files{#if changes.length}<span>{changes.length}</span>{/if}
      </h3>
      {#if changes.length}
        <ul class="panel-list">
          {#each changes as file (file.path)}
            <li class="panel-change">
              <code title={file.path}>{file.path}</code><span class="diff-count"
                ><ins>+{file.added}</ins> <del>−{file.removed}</del></span
              >
            </li>
          {/each}
        </ul>
      {:else}<p class="panel-empty">No files changed in this chat.</p>{/if}
    </section>

    {#if session.projectId}
      {@const whole = project?.kind === 'computer' || session.projectId.endsWith(':computer')}
      <section class="panel-section" aria-label={whole ? 'Whole computer' : 'Project'}>
        <h3>
          {#if whole}<Monitor size={13} />Whole computer{:else}<Folder size={13} />Project{/if}
        </h3>
        <dl class="panel-facts">
          {#if !whole}<dt>Folder</dt>
            <dd title={project?.path}>{project?.name ?? session.projectName ?? 'Project'}</dd>{/if}
          <dt>Computer</dt>
          <dd>{project ? `${project.machine} · online` : 'Offline'}</dd>
          {#if project}<dt>{whole ? 'Home' : 'Path'}</dt>
            <dd><code title={project.path}>{project.path}</code></dd>
            <dt>Allowed</dt>
            <dd>{rules.length ? rules.join(', ') : 'files only'}</dd>{/if}
        </dl>
      </section>
    {/if}

    <section class="panel-section" aria-label="Usage">
      <h3><ChartNoAxesColumn size={13} />Usage</h3>
      {#if session.contextUsed && model?.contextTokens}
        <div
          class="panel-meter"
          role="meter"
          aria-label="Context used"
          aria-valuemin={0}
          aria-valuemax={model.contextTokens}
          aria-valuenow={session.contextUsed}
        >
          <span style:width={`${Math.min(100, (session.contextUsed / model.contextTokens) * 100)}%`}
          ></span>
        </div>
      {/if}
      <dl class="panel-facts">
        <dt>Context</dt>
        <dd>
          {session.contextUsed
            ? model?.contextTokens
              ? `${compact(session.contextUsed)} of ${compact(model.contextTokens)} · ${percent(session.contextUsed, model.contextTokens)}`
              : compact(session.contextUsed)
            : '—'}
        </dd>
        <dt>Tokens</dt>
        <dd>{tokens ? compact(tokens) : '—'}</dd>
        {#if cost?.usd}<dt>Cost</dt>
          <dd>
            ${cost.usd.toFixed(cost.usd < 1 ? 4 : 2)}{cost.estimated ? ' (estimated)' : ''}
          </dd>{/if}
      </dl>
      <button class="panel-link" onclick={details}>All statistics</button>
    </section>
  </div>
</aside>
