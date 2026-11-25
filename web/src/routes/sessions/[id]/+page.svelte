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
  } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { downloadChat } from '#lib/components/chat-export.ts';
  import { Conversation } from '#lib/conversation.svelte.ts';
  import { delayed } from '#lib/delayed.svelte.ts';
  import Timeline from '#lib/components/Timeline.svelte';
  import Composer from '#lib/components/Composer.svelte';
  import ModelPicker from '#lib/components/ModelPicker.svelte';
  import PlacePicker from '#lib/components/PlacePicker.svelte';
  import ChatTitle from '#lib/components/ChatTitle.svelte';
  import ChatStats from '#lib/components/ChatStats.svelte';
  import type { Command } from '#lib/commands.ts';
  import { goto } from '$app/navigation';
  import ChatPanel from '#lib/components/panel/ChatPanel.svelte';
  import { chatPanel } from '#lib/chat-panel.svelte.ts';
  import type { ChatActions } from '#lib/components/versions/chat-actions.ts';
  import QueuedMessages from '#lib/components/QueuedMessages.svelte';
  import PlanSteps from '#lib/components/PlanSteps.svelte';
  import { livePlan } from '#lib/components/timeline-entries.ts';
  import { ChatTerminals, provideTerminals } from '#lib/terminals/terminals.svelte.ts';
  import TerminalDrawer from '#lib/terminals/TerminalDrawer.svelte';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
  import { ChatPictures, providePictures } from '#lib/markdown/pictures.ts';
  import '@crewstead/ui/conversation.css';
  import '@crewstead/ui/tools.css';
  import '@crewstead/ui/composer.css';
  import { usageOf } from '#lib/components/plan-usage.ts';
  /** The message being edited in the timeline (Up in an empty message box opens the last one). */
  let editing = $state<string>();
  const workspace = useWorkspace();
  const conversation = new Conversation();
  const terminals = provideTerminals(new ChatTerminals());
  providePictures(new ChatPictures(() => conversation.session?.id));
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
   * A model picked here becomes the chat's model at once, so its scheduled tasks use it too; the hub
   * adds the "Switched to" divider with the next message, not on picking. A pick during a reply is
   * saved once the reply ends, or goes with the next message.
   */
  function pickModel(id: string) {
    picked = id;
  }
  let saved = '';
  $effect(() => {
    const session = conversation.session;
    const pick = `${session?.id} ${picked}`;
    if (!picked || !session || picked === session.modelId || pick === saved) return;
    if (session.status === 'running' || session.status === 'awaiting_approval') return;
    saved = pick;
    void workspace.setPreferences(session.id, { modelId: picked }).catch(() => {});
  });
  // The project for the next message, likewise: '' is none, undefined keeps the chat's own.
  let pickedProject = $state<string>();
  const project = $derived(pickedProject ?? conversation.session?.projectId ?? '');
  // A place picked here moves the chat at once (its notice waits for the next message); during a
  // reply, or when the move fails, it goes with the next message instead.
  async function pickPlace(id: string) {
    const session = conversation.session;
    if (!session || id === (session.projectId ?? '')) return (pickedProject = undefined);
    pickedProject = id;
    if (session.status === 'running' || session.status === 'awaiting_approval') return;
    await workspace.move(session.id, id || null).catch(() => {});
  }
  const projects = $derived(workspace.catalog?.projects ?? []);
  let stats = $state<ReturnType<typeof ChatStats>>();
  let composer = $state<ReturnType<typeof Composer>>();
  const commands: Command[] = [
    { name: 'compact', hint: 'Summarize earlier messages to free up the model’s context' },
    { name: 'continue', hint: 'Carry on where the last reply stopped' },
    { name: 'stats', run: () => stats?.open() },
    {
      name: 'rename',
      args: '<name>',
      run: async (title) => {
        if (conversation.session)
          await workspace.setPreferences(conversation.session.id, { title: title.slice(0, 100) });
      },
    },
    { name: 'new', run: () => goto(resolve('/new')) },
  ];
  /** The model and place picked below, for messages, retries and edits alike. */
  const choices = () => ({
    modelId: chosen,
    projectId: project,
  });
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
      conversation.again(itemId, workspace.context, { ...(text ? { text } : {}), ...choices() }),
    answer: (text) => conversation.send(text, workspace.context, choices()),
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
  // The moment between a new address and its chat opening: the old chat is never shown under it.
  const switching = $derived(!!conversation.session && conversation.session.id !== page.params.id);
  // "Reconnecting…" only once an open chat's live connection has really been down a moment: never while
  // a chat loads (a long one takes a while) or on a switch.
  const offline = delayed(
    () => !conversation.connected && !switching && !!conversation.session,
    1_500,
  );
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
    // Approving everything in this chat also approves what it is waiting on.
    if (decision === 'approve-all') return approveAll();
    return conversation.accepted(
      `/sessions/${conversation.session.id}/approvals/${id}`,
      workspace.context,
      { decision },
    );
  }
  async function approveAll() {
    try {
      await workspace.setPreferences(conversation.session!.id, { approvalMode: 'all' });
      return true;
    } catch (cause) {
      conversation.error = cause instanceof Error ? cause.message : 'Could not change approvals';
      return false;
    }
  }
</script>

{#if conversation.session && !switching}
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
          <span class:sr-only={!offline.value} role="status" aria-label="Connection status"
            >{offline.value
              ? 'Reconnecting…'
              : conversation.connected
                ? 'Connected'
                : 'Connecting…'}</span
          >
        </div>
        <ChatStats
          bind:this={stats}
          {session}
          {models}
          loadAll={() => conversation.loadEarlier()}
        />
        <span class="header-tools"
          ><ModuleSlot slot="chat-header" props={{ session, extras: conversation.extras }} /></span
        >
        <button
          class="icon-button"
          aria-label="Export as Markdown"
          title="Export as Markdown"
          disabled={!session.items.length}
          onclick={async () => {
            await conversation.loadEarlier();
            downloadChat(session, (id) => models.find((entry) => entry.id === id)?.label ?? id);
          }}><Download size={18} /></button
        >
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
      <!-- Each chat starts drawn from its latest messages. -->
      {#key session.id}<Timeline
          items={session.items}
          earlier={conversation.earlier}
          loadEarlier={(count) => conversation.loadEarlier(count)}
          {...session.branches ? { branches: session.branches } : {}}
          {actions}
          {decide}
          bind:editing
          running={session.status === 'running' || session.status === 'awaiting_approval'}
          focus={page.url.searchParams.get('item') ?? undefined}
        />{/key}
      <TerminalDrawer />
      {#key session.id}<Composer
          draftKey={workspace.draftKey(`draft:${workspace.context}:${session.id}`)}
          busy={session.status === 'running' || session.status === 'awaiting_approval'}
          connected={conversation.connected}
          paused={switching}
          enabled={!!model}
          {...usageOf(model)}
          chat={{ id: session.id, mode: session.approvalMode, reviewer: session.reviewModelId }}
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
            conversation.send(text, workspace.context, { ...choices(), attachments })}
          queue={(text, attachments) =>
            conversation.queue(text, workspace.context, { ...choices(), attachments })}
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
                sendOne={(id) => conversation.sendQueued(workspace.context, id)}
              />{/if}
          {/snippet}
          {#snippet controls()}
            {#if models.length}<ModelPicker
                {models}
                bind:value={() => chosen, pickModel}
                effort={!!model?.effort}
                bind:effortChoice={
                  () => session.effort ?? 'auto', (to) => workspace.pickEffort(session.id, to)
                }
                disabled={conversation.sending}
              />{:else}<span>Unavailable model</span>{/if}
          {/snippet}
          {#snippet place()}
            {#if projects.length || project}<PlacePicker
                {projects}
                bind:value={() => project, (id) => void pickPlace(id)}
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
        loadAll={() => conversation.loadEarlier()}
        close={() => chatPanel.set(false)}
        details={() => stats?.open()}
      />{/if}
  </div>
{:else}<div class="page-container">
    {#if conversation.error}<div class="error-banner" role="alert">{conversation.error}</div>
      <a class="back-link" href={resolve('/')}>Back to chats</a>{:else}<p
        class="chat-loading"
        role="status"
        aria-label="Loading chat"
      >
        <LoaderCircle size={18} class="spin" />
      </p>{/if}
  </div>{/if}
