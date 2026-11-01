<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { X } from '@lucide/svelte';
  import { useAuthentication } from './auth.svelte.ts';
  import CredentialsForm from './CredentialsForm.svelte';
  import '@crewstead/ui/sign-in.css';
  import '@crewstead/ui/account-dialog.css';
  const auth = useAuthentication();
  const connection = auth.connecting!;
  const id = $props.id();
  let dialog: HTMLDialogElement;
  let busy = $state(false);
  function close() {
    if (!busy) auth.connecting = null;
  }
  onMount(() => {
    dialog.showModal();
    const field = connection.account.login
      ? 'input[type="password"]'
      : 'input[autocomplete="username"]';
    dialog.querySelector<HTMLInputElement>(field)?.focus();
  });
  onDestroy(() => {
    const trigger = document.querySelector<HTMLButtonElement>('.account-trigger');
    const target = trigger?.getClientRects().length
      ? trigger
      : document.querySelector<HTMLButtonElement>('.mobile-header button');
    target?.focus();
  });
</script>

<dialog
  bind:this={dialog}
  class="dialog-content account-dialog"
  aria-labelledby={`${id}-title`}
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
>
  <header>
    <h2 id={`${id}-title`}>{connection.adding ? 'Add account' : 'Sign in'}</h2>
    <button class="icon-button" aria-label="Close" disabled={busy} onclick={close}
      ><X size={18} /></button
    >
  </header>
  <CredentialsForm
    server={connection.account.server}
    login={connection.account.login}
    action={connection.adding ? 'Add account' : 'Sign in'}
    onbusy={(value) => (busy = value)}
    oncomplete={() => (auth.connecting = null)}
  />
</dialog>
