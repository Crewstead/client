<script lang="ts">
  import { onMount } from 'svelte';
  let {
    text,
    save,
    cancel,
  }: { text: string; save: (text: string) => Promise<boolean>; cancel: () => void } = $props();
  // Starts from the prompt as it was sent; the edit is sent as a new version.
  // svelte-ignore state_referenced_locally
  let draft = $state(text);
  let input: HTMLTextAreaElement;
  let saving = $state(false);
  const fit = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 320)}px`;
  };
  onMount(() => {
    fit();
    input.focus();
    input.setSelectionRange(draft.length, draft.length);
  });
  async function submit() {
    if (!draft.trim() || saving) return;
    saving = true;
    if (await save(draft.trim())) cancel();
    saving = false;
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') cancel();
    else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
  }
</script>

<form
  class="prompt-editor"
  onsubmit={(event) => {
    event.preventDefault();
    void submit();
  }}
>
  <textarea
    bind:this={input}
    bind:value={draft}
    aria-label="Edit prompt"
    rows="1"
    maxlength="8000"
    oninput={fit}
    onkeydown={keydown}></textarea>
  <div class="prompt-editor-buttons">
    <button type="button" class="button subtle small" onclick={cancel}>Cancel</button>
    <button class="button primary small" disabled={!draft.trim() || saving}>Send</button>
  </div>
</form>
