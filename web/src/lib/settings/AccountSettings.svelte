<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import DesktopAppSettings from '#lib/desktop/DesktopAppSettings.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useAuthentication } from '#lib/auth/auth.svelte.ts';
  import { sameAccount } from '#lib/auth/saved-accounts.ts';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/account-settings.css';
  const auth = useAuthentication();
  const login = $derived(auth.user?.login ?? '');
  const others = $derived(
    auth.accounts.filter((account) => !sameAccount(account, { server: auth.server, login })),
  );
  const host = (server: string) => {
    try {
      return new URL(server).host;
    } catch {
      return server;
    }
  };
  let busy = $state(false);
  let error = $state('');
  async function signOut() {
    busy = true;
    error = '';
    try {
      await auth.signOut();
      await goto(resolve('/'), { replace: true });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not sign out.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="settings-section" aria-label="Account">
  <SettingsHeading title="Signed in as" />
  <div class="settings-card profile-card">
    <span class="profile-avatar" aria-hidden="true">{login[0]?.toUpperCase()}</span>
    <dl>
      <div>
        <dt class="sr-only">Username</dt>
        <dd class="profile-login">{login}</dd>
      </div>
      <div>
        <dt class="sr-only">Server</dt>
        <dd class="muted-text" title={auth.server}>{auth.server}</dd>
      </div>
    </dl>
    <button class="button subtle small" onclick={signOut} disabled={busy}
      >{busy ? 'Signing out…' : 'Sign out'}</button
    >
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>

<section class="settings-section" aria-label="Other accounts">
  <div class="section-heading">
    <div>
      <h2>Other accounts</h2>
      <p class="muted-text">
        Accounts you have used on this device. Switching is instant while an account is still signed
        in.
      </p>
    </div>
    <button class="button subtle small" onclick={() => auth.openAccount()}>Add account</button>
  </div>
  {#if others.length}
    <div class="settings-card">
      <ul aria-label="Saved accounts">
        {#each others as account (`${account.server}:${account.login}`)}
          <li>
            <span class="profile-avatar small" aria-hidden="true"
              >{account.login[0]?.toUpperCase()}</span
            >
            <span class="row-name"
              >{account.login}<small class="muted-text">{host(account.server)}</small></span
            >
            <button
              class="button subtle small"
              aria-label={`Sign in as ${account.login} on ${account.server}`}
              onclick={() => auth.chooseAccount(account)}>Switch</button
            >
            <button
              class="link-button"
              aria-label={`Forget ${account.login} on ${account.server}`}
              onclick={() => auth.forgetAccount(account)}>Forget</button
            >
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <p class="muted-text empty-note">No other accounts yet.</p>
  {/if}
</section>

<DesktopAppSettings />
