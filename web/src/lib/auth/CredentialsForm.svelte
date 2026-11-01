<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, untrack } from 'svelte';
  import { useAuthentication } from './auth.svelte.ts';
  let {
    server: initialServer,
    login: initialLogin = '',
    action = 'Sign in',
    oncomplete = () => {},
    onbusy = () => {},
  }: {
    server: string;
    login?: string;
    action?: string;
    oncomplete?: () => void;
    onbusy?: (busy: boolean) => void;
  } = $props();
  const auth = useAuthentication();
  const id = $props.id();
  let server = $state(untrack(() => initialServer));
  let login = $state(untrack(() => initialLogin));
  let password = $state('');
  let passwordInput: HTMLInputElement;
  let busy = $state(false);
  let error = $state('');
  onMount(() => {
    if (initialLogin) passwordInput?.focus();
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    onbusy(true);
    error = '';
    try {
      await auth.signIn(server, login.trim(), password);
      password = '';
      await goto(resolve('/'), { replace: true });
      oncomplete();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not connect to this server.';
    } finally {
      busy = false;
      onbusy(false);
    }
  }
</script>

<form class="credentials-form" onsubmit={submit}>
  <label for={`${id}-server`}>Server address</label>
  <input
    id={`${id}-server`}
    type="url"
    bind:value={server}
    required
    autocomplete="url"
    spellcheck="false"
    disabled={busy}
  />
  <label for={`${id}-login`}>Username</label>
  <input
    id={`${id}-login`}
    bind:value={login}
    required
    maxlength="64"
    autocomplete="username"
    autocapitalize="none"
    spellcheck="false"
    disabled={busy}
  />
  <label for={`${id}-password`}>Password</label>
  <input
    id={`${id}-password`}
    bind:this={passwordInput}
    type="password"
    bind:value={password}
    required
    maxlength="1024"
    autocomplete="current-password"
    disabled={busy}
  />
  {#if error || (!auth.user && auth.error)}
    <p class="sign-in-error" role="alert">{error || auth.error}</p>
  {/if}
  <button type="submit" class="button primary" disabled={busy || !login.trim() || !password}
    >{busy ? 'Signing in…' : action}</button
  >
</form>
