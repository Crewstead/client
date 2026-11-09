<script lang="ts">
  import type { ApprovalMode } from '@crewstead/core/protocol';
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import ChoicePicker from '#lib/components/ChoicePicker.svelte';
  import DesktopAppSettings from '#lib/desktop/DesktopAppSettings.svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { approvalModes } from '#lib/approval-modes.ts';
  import NotificationsRow from './NotificationsRow.svelte';
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
      error = cause instanceof Error ? cause.message : 'Could not change approvals.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="settings-section" aria-labelledby="general-title">
  <SettingsHeading page title="General">How chats start and how they reach you.</SettingsHeading>
  <div class="settings-card setting-lines">
    <ul>
      <li aria-label="Tool approvals">
        <span class="project-text">
          <span class="row-name">Tool approvals</span>
          <span class="row-status"
            >{current?.hint}. Applies to new chats; each chat can change its own.</span
          >
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
    </ul>
  </div>
</section>

<DesktopAppSettings />
