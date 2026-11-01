<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { Session } from '@crewstead/core/protocol';
  import { request, scoped } from '#lib/api.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import Composer from './Composer.svelte';
  import ModelPicker from './ModelPicker.svelte';
  import PlacePicker from './PlacePicker.svelte';
  import { effortSetting } from '#lib/effort.svelte.ts';
  import { newId } from '#lib/ids.ts';
  const workspace = useWorkspace();
  let model = $state('');
  const selected = $derived(workspace.catalog?.models.find((item) => item.id === model));
  // A new chat starts in the cloud; pick a project for one that needs it.
  let project = $state('');
  const projects = $derived(workspace.catalog?.projects ?? []);
  $effect(() => {
    if (project && workspace.catalog && !projects.some((item) => item.id === project)) project = '';
  });
  let sending = $state(false);
  let error = $state('');
  let pending = $state<{
    session: Session;
    text: string;
    attachments: string[];
    requestId: string;
  }>();
  let creation: { text: string; modelId: string; projectId: string; requestId: string } | undefined;
  $effect(() => {
    const models = workspace.catalog?.models ?? [];
    if (models.some((item) => item.id === model)) return;
    // The model of the chat used last (on any device), while it is still offered; else the first.
    const recent = [...workspace.sessions]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .find((session) => models.some((item) => item.id === session.modelId));
    model = recent?.modelId ?? models[0]?.id ?? '';
  });
  async function send(text: string, attachments: string[]) {
    if (sending || !model) return false;
    if (pending && (pending.text !== text || pending.attachments.join() !== attachments.join())) {
      error = 'Retry the original message to confirm delivery, or open a new chat.';
      return false;
    }
    sending = true;
    error = '';
    try {
      if (!pending) {
        if (
          !creation ||
          creation.text !== text ||
          creation.modelId !== model ||
          creation.projectId !== project
        )
          creation = { text, modelId: model, projectId: project, requestId: newId() };
        const session = await request<Session>('/sessions', {
          method: 'POST',
          body: JSON.stringify({
            contextId: workspace.context,
            modelId: model,
            title: text.replace(/\s+/g, ' ').slice(0, 70) || 'Attached files',
            requestId: creation.requestId,
            ...(project ? { projectId: project } : {}),
          }),
        });
        pending = { session, text, attachments, requestId: newId() };
      }
      await request(scoped(`/sessions/${pending.session.id}/messages`, workspace.context), {
        method: 'POST',
        body: JSON.stringify({
          text: pending.text,
          requestId: pending.requestId,
          ...(pending.attachments.length ? { attachments: pending.attachments } : {}),
          ...(selected?.effort && effortSetting.forRequest()
            ? { effort: effortSetting.forRequest() }
            : {}),
        }),
      });
      await workspace.refresh();
      await goto(resolve('/sessions/[id]', { id: pending.session.id }));
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not start the chat';
      return false;
    } finally {
      sending = false;
    }
  }
</script>

<section class="new-conversation" aria-label="New chat">
  <div class="new-conversation-content">
    <h1>What are we working on?</h1>
    <Composer
      draftKey={workspace.draftKey(`new:${workspace.context}`)}
      busy={false}
      connected={workspace.ready}
      enabled={!!model}
      images={!!selected?.images}
      {sending}
      {send}
      stop={async () => {}}
    >
      {#snippet controls()}
        <ModelPicker
          models={workspace.catalog?.models ?? []}
          bind:value={model}
          effort={!!selected?.effort}
          disabled={sending || !!pending}
        />
        {#if projects.length}<PlacePicker
            {projects}
            bind:value={project}
            disabled={sending || !!pending}
          />{/if}
      {/snippet}
    </Composer>
    {#if error || workspace.error}<p class="error-banner" role="alert">
        {error || workspace.error}
      </p>{/if}
    {#if workspace.ready && !model}<a class="text-link" href={resolve('/settings')}
        >Turn on a model in Settings</a
      >{/if}
  </div>
</section>
