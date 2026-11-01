<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useAuthentication } from './auth.svelte.ts';
  import CredentialsForm from './CredentialsForm.svelte';
  import SavedAccounts from './SavedAccounts.svelte';
  import type { SavedAccount } from './saved-accounts.ts';
  import '@crewstead/ui/sign-in.css';
  const auth = useAuthentication();
  let selected = $state<SavedAccount | null>(null);
</script>

<main class="sign-in-page" id="main">
  <div class="sign-in-content">
    <a class="sign-in-brand" href={resolve('/')}>Crewstead</a>
    <h1>Sign in</h1>
    {#key selected}
      <CredentialsForm
        server={selected?.server ?? (auth.server || location.origin)}
        login={selected?.login ?? ''}
      />
    {/key}
    <SavedAccounts
      includeCurrent
      onselect={async (account) => {
        if (await auth.switchAccount(account)) await goto(resolve('/'), { replace: true });
        else selected = account;
      }}
    />
  </div>
</main>
