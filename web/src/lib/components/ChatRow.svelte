<script lang="ts">
  import { resolve } from '$app/paths';
  import { Pin, PinOff, Archive, FolderInput, Ellipsis } from '@lucide/svelte';
  import MoveChat from './MoveChat.svelte';
  import ChatActionsSheet from './ChatActionsSheet.svelte';
  import { tick } from 'svelte';
  import type { Session } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/chat-row.css';
  let {
    session,
    selected,
    close,
    drag,
  }: {
    session: Omit<Session, 'items'>;
    selected: boolean;
    close: () => void;
    /** Tells the list a drag of this chat started (true) or ended (false), to show where it can go. */
    drag?: (dragging: boolean) => void;
  } = $props();
  let moving = $state(false);
  /** On touch screens the actions live behind one button, so titles keep the row's width. */
  let menu = $state(false);
  const workspace = useWorkspace();
  /** How its last reply ended, when that happened while another chat was open. */
  const ending = $derived(workspace.unseen.get(session.id));
  let busy = $state(false);
  let error = $state('');
  let pinButton = $state<HTMLButtonElement>();
  async function update(patch: Partial<Pick<Session, 'pinned' | 'archived'>>) {
    busy = true;
    error = '';
    try {
      await workspace.setPreferences(session.id, patch);
      busy = false;
      if (patch.pinned !== undefined) {
        await tick();
        pinButton?.focus();
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not update chat';
    } finally {
      busy = false;
    }
  }
</script>

<div class="chat-row" class:selected aria-label={session.title}>
  <a
    class="chat-link"
    class:pinned={session.pinned}
    href={resolve('/sessions/[id]', { id: session.id })}
    onclick={close}
    title={session.title}
    aria-label={session.title}
    ondragstart={(event) => {
      event.dataTransfer?.setData('application/x-crewstead-chat', session.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      drag?.(true);
    }}
    ondragend={() => drag?.(false)}
  >
    <span>{session.title}</span>
    {#if session.pinned}<Pin size={12} class="pin-marker" aria-label="Pinned" />{/if}
    {#if session.status === 'running'}<i class="chat-state working" title="Working"
        ><span class="sr-only">Working</span></i
      >{:else if session.status === 'awaiting_approval'}<i
        class="chat-state waiting"
        title="Waiting for your approval"><span class="sr-only">Waiting for your approval</span></i
      >{:else if ending}<i
        class="chat-state"
        class:done={ending === 'done'}
        class:failed={ending === 'failed'}
        title={ending === 'done' ? 'New reply' : 'The reply failed'}
        ><span class="sr-only">{ending === 'done' ? 'New reply' : 'The reply failed'}</span></i
      >{/if}
  </a>
  <div class="chat-actions">
    <button
      bind:this={pinButton}
      aria-label={session.pinned ? 'Unpin chat' : 'Pin chat'}
      aria-pressed={session.pinned}
      title={session.pinned ? 'Unpin chat' : 'Pin chat'}
      disabled={busy}
      onclick={() => update({ pinned: !session.pinned })}
    >
      {#if session.pinned}<PinOff size={14} />{:else}<Pin size={14} />{/if}
    </button>
    <button
      aria-label="Move chat"
      title="Move to another project or the cloud"
      disabled={busy}
      onclick={() => (moving = true)}><FolderInput size={14} /></button
    >
    <button
      aria-label="Archive chat"
      title="Archive chat"
      disabled={busy}
      onclick={() => update({ archived: true })}><Archive size={14} /></button
    >
    <button
      class="chat-more"
      aria-label={`Actions for ${session.title}`}
      aria-haspopup="dialog"
      onclick={() => (menu = true)}><Ellipsis size={16} /></button
    >
  </div>
</div>
{#if menu}<ChatActionsSheet
    title={session.title}
    pinned={session.pinned}
    pin={() => void update({ pinned: !session.pinned })}
    move={() => (moving = true)}
    archive={() => void update({ archived: true })}
    close={() => (menu = false)}
  />{/if}
{#if error}<p class="chat-error" role="alert">{error}</p>{/if}
{#if moving}<MoveChat {session} close={() => (moving = false)} />{/if}
