<script lang="ts">
  import { useAuthentication } from './auth.svelte.ts';
  import '@crewstead/ui/sign-in.css';
  const auth = useAuthentication();
  const id = $props.id();
  let current = $state('');
  let password = $state('');
  let again = $state('');
  let busy = $state(false);
  let error = $state('');
  const mismatch = $derived(!!again && again !== password);
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || mismatch) return;
    busy = true;
    error = '';
    try {
      await auth.changePassword(current, password);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not change the password.';
    } finally {
      busy = false;
    }
  }
</script>

<!-- The hub's owner asked this account for a new password: it opens nothing else until then. -->
<main class="sign-in-page" id="main">
  <div class="sign-in-content">
    <p class="sign-in-brand">Crewstead</p>
    <h1>Choose a new password</h1>
    <p class="muted-text">
      Signed in as {auth.user?.login}. This account needs a new password before you continue; your
      other sign-ins end when it changes.
    </p>
    <form class="credentials-form" onsubmit={submit}>
      <input type="text" autocomplete="username" value={auth.user?.login} hidden readonly />
      <label for={`${id}-current`}>Current password</label>
      <input
        id={`${id}-current`}
        type="password"
        bind:value={current}
        required
        maxlength="1024"
        autocomplete="current-password"
        disabled={busy}
      />
      <label for={`${id}-new`}>New password</label>
      <input
        id={`${id}-new`}
        type="password"
        bind:value={password}
        required
        minlength="10"
        maxlength="1024"
        autocomplete="new-password"
        disabled={busy}
      />
      <label for={`${id}-again`}>New password again</label>
      <input
        id={`${id}-again`}
        type="password"
        bind:value={again}
        required
        maxlength="1024"
        autocomplete="new-password"
        aria-invalid={mismatch}
        disabled={busy}
      />
      {#if mismatch || error}<p class="sign-in-error" role="alert">
          {mismatch ? 'The two new passwords differ.' : error}
        </p>{/if}
      <button
        type="submit"
        class="button primary"
        disabled={busy || !current || password.length < 10 || again !== password}
        >{busy ? 'Saving…' : 'Save new password'}</button
      >
      <button
        type="button"
        class="button subtle"
        disabled={busy}
        onclick={() => void auth.signOut()}>Sign out</button
      >
    </form>
  </div>
</main>
