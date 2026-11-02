<script lang="ts">
  import { onMount } from 'svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import type { SlotProps } from '../types.ts';
  import { Plus } from '@lucide/svelte';
  import type { ClaudeAccount } from '@crewstead/core/protocol';
  import { machines } from './api.ts';
  import ClaudeAccountDialog from './ClaudeAccountDialog.svelte';
  import ClaudeAccountRow from './ClaudeAccountRow.svelte';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/projects.css';
  import '@crewstead/ui/claude-accounts.css';
  let { changed }: SlotProps['personal-providers'] = $props();
  const id = $props.id();
  let list = $state<MachineView[]>([]);
  let error = $state('');
  let removing = $state<MachineView>();
  let dialog = $state<HTMLDialogElement>();
  /** The account dialog: adding one on a computer, or renaming one. */
  let editing = $state<{ machine: MachineView; account?: ClaudeAccount }>();
  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    }
    await Promise.all([load(), changed()]);
  }
  async function load() {
    try {
      list = await machines.list();
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load Claude Code computers';
    }
  }
  async function remove() {
    const target = removing;
    dialog?.close();
    if (!target) return;
    try {
      await machines.remove(target.id);
      await Promise.all([load(), changed()]);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not disconnect';
    }
  }
  const status = (machine: MachineView) =>
    !machine.online
      ? 'Offline'
      : machine.claudeCode
        ? `Online · version ${machine.claudeCode.version.split(' ')[0]}`
        : 'Online · Claude Code not installed';
  onMount(() => {
    void load();
    // Online state changes when Crewstead starts or stops on a computer; a sign-in in progress is
    // checked more often, so its models appear soon after it is finished.
    let ticks = 0;
    const timer = setInterval(() => {
      const waiting = list.some((machine) =>
        machine.claudeCode?.accounts?.some((account) => account.signingIn),
      );
      if (waiting || ++ticks % 4 === 0)
        void load().then(() => {
          if (waiting) void changed();
        });
    }, 2_500);
    return () => clearInterval(timer);
  });
</script>

<!-- One group per computer, styled like the provider connections around it. -->
{#each list as machine (machine.id)}
  <div class="provider-group" role="group" aria-label={`Claude Code on ${machine.name}`}>
    <div class="provider-head">
      <span class="key-mark" aria-hidden="true">C</span>
      <span class="row-text"><strong>Claude Code</strong><small>on {machine.name}</small></span>
      <span class="row-meta"
        ><span class="status-dot" class:online={machine.online}></span>{status(machine)}</span
      >
      <button
        class="link-button manage-link"
        aria-label={`Disconnect Claude Code on ${machine.name}`}
        onclick={() => {
          removing = machine;
          dialog?.showModal();
        }}>Disconnect</button
      >
    </div>
    <ul aria-label={`Claude accounts on ${machine.name}`}>
      {#if machine.online && machine.claudeCode?.accounts}
        {#each machine.claudeCode.accounts as account (account.id)}
          <ClaudeAccountRow
            {machine}
            {account}
            {act}
            rename={() => (editing = { machine, account })}
          />
        {:else}
          <li class="provider-empty">No Claude accounts added on this computer.</li>
        {/each}
        <li class="claude-account-add">
          <button class="button subtle small" onclick={() => (editing = { machine })}
            ><Plus size={14} /> Add account</button
          >
        </li>
      {:else if machine.online && machine.claudeCode}
        {#each machine.claudeCode.models as model (model.id)}
          <li>
            <span class="row-name">Claude Code {model.label}</span><span class="row-meta"
              >Uses your Claude plan</span
            >
          </li>
        {/each}
      {:else}
        <li class="provider-empty">
          {machine.online
            ? 'Install Claude Code on this computer and sign in to use it here.'
            : 'Start Crewstead on this computer to use its Claude Code.'}
        </li>
      {/if}
    </ul>
  </div>
{/each}
{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
{#if editing}<ClaudeAccountDialog
    machine={editing.machine}
    {...editing.account ? { account: editing.account } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void Promise.all([load(), changed()]);
    }}
  />{/if}

<dialog bind:this={dialog} class="dialog-content" aria-labelledby={`${id}-remove`}>
  <h2 id={`${id}-remove`} class="dialog-title">Disconnect Claude Code on {removing?.name}?</h2>
  <p class="dialog-description">
    The computer is disconnected at once and its Claude Code models stop working here. Chats stay
    readable. Claude Code itself is not changed.
  </p>
  <div class="dialog-actions">
    <button class="button subtle" onclick={() => dialog?.close()}>Cancel</button>
    <button class="button danger" onclick={remove}>Disconnect</button>
  </div>
</dialog>
