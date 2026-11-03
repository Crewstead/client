<script lang="ts">
  import { resolve } from '$app/paths';
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    Cloud,
    Download,
    Folder,
    Laptop,
    Layers,
    LoaderCircle,
    MessageSquare,
    Monitor,
    PanelRight,
    Plus,
  } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { downloadChat } from '#lib/components/chat-export.ts';
  import { Conversation } from '#lib/conversation.svelte.ts';
  import Timeline from '#lib/components/Timeline.svelte';
  import Composer from '#lib/components/Composer.svelte';
  import ModelPicker from '#lib/components/ModelPicker.svelte';
  import PlacePicker from '#lib/components/PlacePicker.svelte';
  import ChatTitle from '#lib/components/ChatTitle.svelte';
  import ChatStats from '#lib/components/ChatStats.svelte';
  import type { Command } from '#lib/commands.ts';
  import { goto } from '$app/navigation';
  import { effortSetting } from '#lib/effort.svelte.ts';
  import ChatPanel from '#lib/components/panel/ChatPanel.svelte';
  import { chatPanel } from '#lib/chat-panel.svelte.ts';
  import type { ChatActions } from '#lib/components/versions/chat-actions.ts';
  import QueuedMessages from '#lib/components/QueuedMessages.svelte';
  import PlanSteps from '#lib/components/PlanSteps.svelte';
  import { livePlan } from '#lib/components/timeline-entries.ts';
  import { ChatTerminals, provideTerminals } from '#lib/terminals/terminals.svelte.ts';
  import TerminalDrawer from '#lib/terminals/TerminalDrawer.svelte';
  import '@crewstead/ui/conversation.css';
  import '@crewstead/ui/tools.css';
  import '@crewstead/ui/composer.css';
  import { usageOf } from '#lib/components/plan-usage.ts';
  /** The message being edited in the timeline (Up in an empty message box opens the last one). */
  let editing = $state<string>();
  const workspace = useWorkspace();
  const conversation = new Conversation();
  const terminals = provideTerminals(new ChatTerminals());
  const terminalsFor = $derived(
    conversation.session && `${conversation.session.id}|${conversation.session.projectId ?? ''}`,
  );
  $effect(() => {
    if (!terminalsFor) return;
    const [id, projectId] = terminalsFor.split('|');
    return terminals.follow(id!, projectId || undefined);
  });
  onMount(() => chatPanel.load());
  const mockEnabled = $derived(
    workspace.catalog?.modules.find((item) => item.id === 'mock-provider')?.enabled ?? false,
  );
  const models = $derived(workspace.catalog?.models ?? []);
  // The model for the next message: the chat's own until someone picks another.
  let picked = $state('');
  const chosen = $derived(picked || conversation.session?.modelId || '');
  const model = $derived(models.find((entry) => entry.id === chosen));
  /**
   * A model picked here answers from the next message on: the chat switches (with its "Switched to"
   * divider) when that message is sent, not on picking, so nothing appears in the chat before then.
   */
  function pickModel(id: string) {
    picked = id;
  }
  // The project for the next message, likewise: '' is none, undefined keeps the chat's own.
  let pickedProject = $state<string>();
  const project = $derived(pickedProject ?? conversation.session?.projectId ?? '');
  const projects = $derived(workspace.catalog?.projects ?? []);
  let stats = $state<ReturnType<typeof ChatStats>>();
  let composer = $state<ReturnType<typeof Composer>>();
  const commands: Command[] = [
    { name: 'compact', hint: 'Summarize earlier messages to free up the model’s context' },
    { name: 'stats', hint: 'Show this chat’s statistics', run: () => stats?.open() },
    {
      name: 'rename',
      args: '<name>',
      hint: 'Rename this chat',
      run: async (title) => {
        if (conversation.session)
          await workspace.setPreferences(conversation.session.id, { title: title.slice(0, 100) });
      },
    },
    { name: 'new', hint: 'Start a new chat', run: () => goto(resolve('/new')) },
  ];
  // Retrying, editing and forking from the timeline go with the model and place picked below.
  const actions: ChatActions = {
    get disabled() {
      const status = conversation.session?.status;
      return (
        !model ||
        switching ||
        !conversation.connected ||
        conversation.sending ||
        status === 'running' ||
        status === 'awaiting_approval'
      );
    },
    again: (itemId, text) =>
      conversation.again(itemId, workspace.context, {
        ...(text ? { text } : {}),
        ...(model?.effort ? { effort: effortSetting.forRequest() } : {}),
        modelId: chosen,
        projectId: project,
      }),
    version: (anchor, version) => conversation.version(anchor, version, workspace.context),
    fork: async (itemId) => {
      const id = await conversation.fork(itemId, workspace.context);
      if (!id) return;
      await workspace.refreshChats();
      await goto(resolve('/sessions/[id]', { id }));
    },
  };
  const chatTokens = $derived(
    Object.values(conversation.session?.usage ?? {}).reduce(
      (sum, usage) => sum + usage.input + usage.output,
      0,
    ),
  );
  const workspaceLabel = $derived(
    workspace.catalog?.contexts.find((context) => context.id === conversation.session?.contextId)
      ?.label ?? 'Workspace',
  );
  // While the next chat loads, the one on screen stays (read-only): no blank page, no flash.
  const switching = $derived(!!conversation.session && conversation.session.id !== page.params.id);
  // "Reconnecting…" only once the live connection has really been down a moment, not on every switch.
  let offline = $state(false);
  $effect(() => {
    if (conversation.connected) {
      offline = false;
      return;
    }
    const timer = setTimeout(() => (offline = true), 1_500);
    return () => clearTimeout(timer);
  });
  // Only the very first chat loads onto an empty page; a slow load gets a quiet spinner.
  let slowLoad = $state(false);
  $effect(() => {
    if (conversation.session) return;
    slowLoad = false;
    const timer = setTimeout(() => (slowLoad = true), 600);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    void page.params.id;
    picked = '';
    pickedProject = undefined;
  });
  $effect(() => {
    if (!conversation.session) return;
    workspace.retitle(conversation.session.id, conversation.session.title);
    workspace.setStatus(conversation.session.id, conversation.session.status);
  });
  // A model that starts, renames, archives or prompts chats changes the list beside this one: once
  // such a call finishes here, the list is loaded again.
  const CHAT_CHANGES = new Set(['chat_create', 'chat_rename', 'chat_archive', 'chat_send']);
  const chatChanges = $derived(
    conversation.session?.items.filter(
      (item) =>
        item.role === 'tool' &&
        item.status === 'completed' &&
        CHAT_CHANGES.has(item.toolName ?? ''),
    ).length ?? 0,
  );
  let seenChanges = -1;
  $effect(() => {
    const count = chatChanges;
    if (seenChanges >= 0 && count > seenChanges) void workspace.refresh();
    seenChanges = count;
  });
  // Once the chat itself changes place or model (a sent pick, a drag, the Move dialog), the pick
  // here is done: a stale one would move the chat back with the next message.
  const current = $derived(
    `${conversation.session?.projectId ?? ''} ${conversation.session?.modelId ?? ''}`,
  );
  $effect(() => {
    // Only a changed value counts, not a refreshed copy of the chat.
    void current;
    picked = '';
    pickedProject = undefined;
  });
  $effect(() => {
    const id = page.params.id;
    const context = workspace.context;
    if (id && workspace.ready) void conversation.open(id, context);
    return () => conversation.close();
  });
  onDestroy(() => {
    conversation.close();
    void workspace.refresh();
  });
  async function decide(id: string, decision: 'approve' | 'reject' | 'approve-all') {
    if (!conversation.session) return false;
    // Approving everything also approves what chats are waiting on.
    if (decision === 'approve-all') return approveAll();
    return conversation.accepted(
      `/sessions/${conversation.session.id}/approvals/${id}`,
      workspace.context,
      { decision },
    );
  }
  async function approveAll() {
    try {
      await workspace.setApprovalMode('all');
      return true;
    } catch (cause) {
      conversation.error = cause instanceof Error ? cause.message : 'Could not change approvals';
      return false;
    }
  }
</script>

{#if conversation.session}
  {@const session = conversation.session}
  <div class="conversation-layout">
    <div class="conversation-main">
      <header class="conversation-heading">
        <div>
          <p class="chat-place" aria-label="Where this chat is">
            <Layers size={12} />{workspaceLabel}<span aria-hidden="true">/</span
            >{#if session.projectId}{@const place = projects.find(
                (entry) => entry.id === session.projectId,
              )}<Laptop size={12} />{place?.machine ?? 'Offline computer'}<span aria-hidden="true"
                >/</span
              >{#if place?.kind === 'computer' || session.projectId.endsWith(':computer')}<Monitor
                  size={12}
                />Whole computer{:else}<Folder size={12} />{place?.name ??
                  session.projectName ??
                  'Project'}{/if}{:else}<Cloud size={12} />Cloud{/if}{#if session.parent}<span
                aria-hidden="true">/</span
              ><a
                class="chat-parent"
                href={resolve('/sessions/[id]', { id: session.parent.id })}
                aria-label={`Subagent of ${session.parent.title}`}
                title={`Subagent of ${session.parent.title}`}
                ><MessageSquare size={12} /><span>{session.parent.title}</span></a
              >{/if}
          </p>
          <ChatTitle
            title={session.title}
            rename={(title) => workspace.setPreferences(session.id, { title })}
          />
          <span class:sr-only={!offline} role="status" aria-label="Connection status"
            >{offline
              ? 'Reconnecting…'
              : conversation.connected
                ? 'Connected'
                : 'Connecting…'}</span
          >
        </div>
        <ChatStats bind:this={stats} {session} {models} />
        <button
          class="icon-button"
          aria-label="Export as Markdown"
          title="Export as Markdown"
          disabled={!session.items.length}
          onclick={() =>
            downloadChat(session, (id) => models.find((entry) => entry.id === id)?.label ?? id)}
          ><Download size={18} /></button
        >
        <a href={resolve('/new')} class="icon-button" aria-label="New chat"><Plus size={18} /></a>
        <button
          class="icon-button"
          class:active={chatPanel.open}
          aria-label="Chat details"
          aria-pressed={chatPanel.open}
          title="Skills, files, changes and usage"
          onclick={() => chatPanel.set(!chatPanel.open)}><PanelRight size={18} /></button
        >
      </header>
      {#if conversation.error}<div class="error-banner" role="alert">{conversation.error}</div>{/if}
      <Timeline
        items={session.items}
        {...session.branches ? { branches: session.branches } : {}}
        {actions}
        {decide}
        bind:editing
        running={session.status === 'running' || session.status === 'awaiting_approval'}
        focus={page.url.searchParams.get('item') ?? undefined}
      />
      <TerminalDrawer />
      {#key session.id}<Composer
          draftKey={workspace.draftKey(`draft:${workspace.context}:${session.id}`)}
          busy={session.status === 'running' || session.status === 'awaiting_approval'}
          connected={conversation.connected}
          {offline}
          paused={switching}
          enabled={!!model}
          {...usageOf(model)}
          editLast={() => {
            const last = session.items.findLast((item) => item.role === 'user');
            if (!last || session.status === 'running' || session.status === 'awaiting_approval')
              return false;
            editing = last.id;
            return true;
          }}
          unavailable={session.modelId.startsWith('mock-') && !mockEnabled
            ? 'Turn on test replies in Settings to continue.'
            : 'This model is not available in this workspace any more.'}
          sending={conversation.sending}
          bind:this={composer}
          send={(text, attachments) =>
            conversation.send(text, workspace.context, {
              ...(model?.effort ? { effort: effortSetting.forRequest() } : {}),
              modelId: chosen,
              projectId: project,
              attachments,
            })}
          queue={(text, attachments) =>
            conversation.queue(text, workspace.context, {
              ...(model?.effort ? { effort: effortSetting.forRequest() } : {}),
              modelId: chosen,
              projectId: project,
              attachments,
            })}
          images={!!model?.images}
          stop={() => conversation.command(`/sessions/${session.id}/stop`, workspace.context)}
          {commands}
          context={session.contextUsed
            ? {
                used: session.contextUsed,
                ...(model?.contextTokens ? { window: model.contextTokens } : {}),
                total: chatTokens,
                details: () => stats?.open(),
              }
            : undefined}
        >
          {#snippet above()}
            {@const steps = livePlan(
              session.items,
              session.status === 'running' || session.status === 'awaiting_approval',
            )}
            {#if steps}<PlanSteps {steps} docked />{/if}
            {#if session.queued?.length}<QueuedMessages
                queued={session.queued}
                busy={session.status === 'running' || session.status === 'awaiting_approval'}
                remove={(id) => conversation.unqueue(id, workspace.context)}
                edit={(message) => {
                  void conversation.unqueue(message.id, workspace.context);
                  composer?.fill(message.text);
                }}
                sendNext={() => conversation.sendQueued(workspace.context)}
              />{/if}
          {/snippet}
          {#snippet controls()}
            {#if models.length}<ModelPicker
                {models}
                bind:value={() => chosen, pickModel}
                effort={!!model?.effort}
                disabled={conversation.sending}
              />{:else}<span>Unavailable model</span>{/if}
            {#if projects.length || project}<PlacePicker
                {projects}
                bind:value={() => project, (id) => (pickedProject = id)}
                disabled={conversation.sending}
              />{/if}
          {/snippet}
        </Composer>{/key}
    </div>
    {#if chatPanel.open}<ChatPanel
        {session}
        {...model ? { model } : {}}
        {...projects.find((entry) => entry.id === session.projectId)
          ? { project: projects.find((entry) => entry.id === session.projectId) }
          : {}}
        close={() => chatPanel.set(false)}
        details={() => stats?.open()}
      />{/if}
  </div>
{:else}<div class="page-container">
    {#if conversation.error}<div class="error-banner" role="alert">{conversation.error}</div>
      <a class="back-link" href={resolve('/')}>Back to chats</a>{:else if slowLoad}<p
        class="chat-loading"
        role="status"
        aria-label="Loading chat"
      >
        <LoaderCircle size={18} class="spin" />
      </p>{/if}
  </div>{/if}
