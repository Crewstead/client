<script lang="ts">
  import type { ApprovalMode } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { approvalModes } from '#lib/approval-modes.ts';
  import ArchivedChats from '#lib/components/ArchivedChats.svelte';
  import ChoicePicker from '#lib/components/ChoicePicker.svelte';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
  import NotificationsRow from './NotificationsRow.svelte';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/projects.css';
  const workspace = useWorkspace();
  const mode = $derived(workspace.catalog?.preferences.approvalMode ?? 'ask');
  const current = $derived(approvalModes.find((option) => option.value === mode));
  let busy = $state(false);
  let error = $state('');
  async function choose(value: ApprovalMode) {
    busy = true;
    error = '';
    try {
      await workspace.setApprovalMode(value);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not change approvals';
    } finally {
      busy = false;
    }
  }
</script>

<!-- What chats can do, one row each; optional modules add their rows (search, server browser, sandbox). -->
<section class="settings-section" aria-label="Chat tools">
  <h2>Tools in chats</h2>
  <div class="settings-card setting-lines">
    <ul>
      <li aria-label="Tool approvals">
        <span class="project-text">
          <span
            class="row-name"
            title="Auto-review asks the chat’s own model, so each check uses a little of its allowance."
            >Tool approvals</span
          >
          <span class="row-status">{current?.hint} · all your chats</span>
          {#if error}<span class="row-error" role="alert">{error}</span>{/if}
        </span>
        <ChoicePicker
          label="How tool calls are approved"
          value={mode}
          disabled={busy}
          choices={approvalModes.map((option) => ({
            value: option.value,
            label: option.label,
            note: option.hint,
          }))}
          {choose}
        />
      </li>
      <NotificationsRow />
      <ModuleSlot slot="chats" props={{}} />
    </ul>
  </div>
</section>

<ArchivedChats />
