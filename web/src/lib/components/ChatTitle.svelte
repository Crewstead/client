<script lang="ts">
  import { tick } from 'svelte';
  let {
    title,
    rename,
  }: {
    title: string;
    rename: (title: string) => Promise<void>;
  } = $props();
  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement>();
  let error = $state('');
  async function start() {
    draft = title;
    error = '';
    editing = true;
    await tick();
    input?.select();
  }
  async function save() {
    if (!editing) return;
    editing = false;
    const next = draft.trim().slice(0, 100);
    if (!next || next === title) return;
    try {
      await rename(next);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not rename the chat';
    }
  }
</script>

<!-- Click the name to rename the chat; Enter saves, Escape keeps the old name. The box takes
     exactly the name's place, so nothing around it moves. -->
<h1>
  {#if editing}<!-- A hidden copy of the text sizes the box to the name. --><span
      class="chat-title-edit"
      data-value={draft || ' '}
      ><input
        bind:this={input}
        class="chat-title-input"
        aria-label="Chat name"
        size="1"
        maxlength="100"
        bind:value={draft}
        onblur={save}
        onkeydown={(event) => {
          if (event.key === 'Enter') void save();
          else if (event.key === 'Escape') editing = false;
        }}
      /></span
    >{:else}<button class="chat-title" title="Rename chat" onclick={start}>{title}</button>{/if}
</h1>
{#if error}<span class="error-text" role="alert">{error}</span>{/if}
