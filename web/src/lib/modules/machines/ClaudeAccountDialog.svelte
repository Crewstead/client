<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import type { ClaudeAccount, MachineView } from '@crewstead/core/protocol';
  import { claudeAccounts } from './api.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/skills.css';
  import '@crewstead/ui/claude-accounts.css';
  let {
    machine,
    account,
    close,
  }: {
    machine: MachineView;
    /** The account to rename; adding a new one when absent. */
    account?: ClaudeAccount;
    close: (saved: boolean) => void;
  } = $props();
  const id = $props.id();
  // The form starts from the props it opened with; later changes do not reset what was typed.
  const start = () => ({
    name: account?.name ?? '',
    usualTaken: !!machine.claudeCode?.accounts?.some((entry) => entry.usual),
  });
  const initial = start();
  let name = $state(initial.name);
  let mode = $state<'usual' | 'new'>(initial.usualTaken ? 'new' : 'usual');
  let busy = $state(false);
  let error = $state('');
  let saved = false;
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      if (account) await claudeAccounts.rename(machine.id, account.id, name);
      else await claudeAccounts.add(machine.id, name, mode);
      saved = true;
      (event.target as HTMLElement).closest('dialog')?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  {@attach closeOutside}
  class="dialog-content claude-account-dialog"
  aria-labelledby={`${id}-title`}
  {@attach (node) => node.showModal()}
  onclose={() => close(saved)}
>
  <form onsubmit={submit}>
    <h2 id={`${id}-title`} class="dialog-title">
      {account ? `Rename ${account.name}` : `Add a Claude account on ${machine.name}`}
    </h2>
    <label class="skill-field"
      >Name
      <input
        bind:value={name}
        required
        maxlength="40"
        placeholder={mode === 'usual' ? 'Personal' : 'Work'}
        autocomplete="off"
        disabled={busy}
      />
      <small>Shown with its models, e.g. “Claude Code Opus · {name || 'Work'}”.</small>
    </label>
    {#if !account}
      <fieldset class="claude-account-modes" disabled={busy}>
        <legend>Account</legend>
        <label class:disabled={initial.usualTaken}
          ><input type="radio" bind:group={mode} value="usual" disabled={initial.usualTaken} />
          <span
            ><strong>The one already signed in there</strong><small
              >{initial.usualTaken
                ? 'Already added.'
                : 'The Claude Code sign-in this computer uses in a terminal.'}</small
            ></span
          ></label
        >
        <label
          ><input type="radio" bind:group={mode} value="new" />
          <span
            ><strong>Sign in to another account</strong><small
              >Kept apart from the others. The sign-in page opens in the browser on {machine.name},
              so finish it there.</small
            ></span
          ></label
        >
      </fieldset>
    {/if}
    {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button
        type="button"
        class="button subtle"
        disabled={busy}
        onclick={(event) => event.currentTarget.closest('dialog')?.close()}>Cancel</button
      >
      <button type="submit" class="button primary" disabled={busy}
        >{account ? 'Rename' : mode === 'new' ? 'Add and sign in' : 'Add account'}</button
      >
    </div>
  </form>
</dialog>
