<script lang="ts">
  import { KeyRound } from '@lucide/svelte';
  import type { PasswordPrompt } from '@crewstead/core/protocol';
  import { request } from '#lib/api.ts';
  import '@crewstead/ui/sudo-password.css';
  let { prompt }: { prompt: PasswordPrompt } = $props();
  let password = $state('');
  let sending = $state(false);
  let error = $state('');
  const bytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  /** Sealed with the computer's one-time key: the hub passes on what it cannot read. */
  async function seal(text: string) {
    const key = await crypto.subtle.importKey(
      'spki',
      bytes(prompt.key),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(text)),
    );
    return btoa(String.fromCharCode(...sealed));
  }
  async function answer(give: boolean) {
    sending = true;
    error = '';
    try {
      const sealed = give ? await seal(password) : null;
      password = '';
      await request('/passwords', {
        method: 'POST',
        body: JSON.stringify({ promptId: prompt.id, sealed }),
      });
    } catch (failure) {
      error = failure instanceof Error ? failure.message : 'It did not go through.';
    } finally {
      sending = false;
    }
  }
</script>

<!-- sudo in a running command waits for the owner's password. -->
<form
  class="sudo-password"
  onsubmit={(event) => {
    event.preventDefault();
    void answer(true);
  }}
>
  <label>
    <KeyRound size={14} />
    <span>{prompt.text}</span>
    <input type="password" autocomplete="off" spellcheck="false" bind:value={password} />
  </label>
  <button type="submit" class="button primary small" disabled={sending || !password}>Send</button>
  <button type="button" class="button subtle small" disabled={sending} onclick={() => answer(false)}
    >Decline</button
  >
  {#if error}<p class="sudo-password-error" role="alert">{error}</p>{/if}
</form>
