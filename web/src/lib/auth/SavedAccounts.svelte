<script lang="ts">
  import { X } from '@lucide/svelte';
  import { useAuthentication } from './auth.svelte.ts';
  import type { SavedAccount } from './saved-accounts.ts';
  import '@crewstead/ui/saved-accounts.css';
  let {
    includeCurrent = false,
    onselect,
  }: {
    includeCurrent?: boolean;
    onselect: (account: SavedAccount) => void;
  } = $props();
  const auth = useAuthentication();
  const accounts = $derived(
    auth.accounts.filter(
      (account) =>
        includeCurrent || account.server !== auth.server || account.login !== auth.user?.login,
    ),
  );
</script>

{#if accounts.length}
  <section class="saved-accounts" aria-label="Saved accounts">
    <h2>Saved accounts</h2>
    <ul>
      {#each accounts as account (`${account.server}:${account.login}`)}
        <li>
          <button
            class="saved-account"
            onclick={() => onselect(account)}
            aria-label={`Sign in as ${account.login} on ${account.server}`}
          >
            <span class="saved-account-avatar" aria-hidden="true"
              >{account.login[0]?.toUpperCase()}</span
            >
            <span class="saved-account-name"
              ><strong>{account.login}</strong>
              <span title={account.server}>{new URL(account.server).host}</span></span
            >
          </button>
          <button
            class="forget-account"
            aria-label={`Forget ${account.login} on ${account.server}`}
            title="Forget saved account"
            onclick={() => auth.forgetAccount(account)}><X size={14} /></button
          >
        </li>
      {/each}
    </ul>
  </section>
{/if}
