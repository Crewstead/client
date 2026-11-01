<script lang="ts">
  import { keepInView } from '#lib/keep-in-view.ts';
  import { Check, ChevronDown, ShieldAlert, ShieldCheck, ShieldQuestion } from '@lucide/svelte';
  import type { ApprovalMode } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { approvalModes } from '#lib/approval-modes.ts';
  import '@crewstead/ui/model-picker.css';
  let { failed }: { failed: (message: string) => void } = $props();
  const workspace = useWorkspace();
  const id = $props.id();
  // One account-wide setting, shared by every chat.
  const mode = $derived(workspace.catalog?.preferences.approvalMode ?? 'ask');
  const chosen = $derived(approvalModes.find((option) => option.value === mode)!);
  const icons = { ask: ShieldQuestion, auto: ShieldCheck, all: ShieldAlert };
  const Icon = $derived(icons[mode]);
  let details = $state<HTMLDetailsElement>();
  let trigger = $state<HTMLElement>();
  function close(focus = false) {
    if (!details?.open) return;
    details.open = false;
    if (focus) trigger?.focus();
  }
  async function choose(value: ApprovalMode) {
    close(true);
    if (value === mode) return;
    try {
      await workspace.setApprovalMode(value);
    } catch (cause) {
      failed(cause instanceof Error ? cause.message : 'Could not change approvals');
    }
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (event.target instanceof Node && !details?.contains(event.target)) close();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') close(true);
  }}
/>
<details class="model-picker approval-picker" data-mode={mode} bind:this={details} use:keepInView>
  <summary
    bind:this={trigger}
    aria-label={`Approvals: ${chosen.label}`}
    title={`Approvals: ${chosen.label}`}
    ><Icon size={13} /><span class="picker-label">{chosen.label}</span><ChevronDown
      size={12}
    /></summary
  >
  <fieldset class="model-options">
    <legend class="sr-only">Tool approvals</legend>
    {#each approvalModes as option (option.value)}
      <label
        ><input
          type="radio"
          name={id}
          checked={mode === option.value}
          onchange={() => choose(option.value)}
        />
        <span class="effort-option"><span>{option.label}</span><small>{option.hint}</small></span
        >{#if mode === option.value}<Check size={14} />{/if}
      </label>
    {/each}
  </fieldset>
</details>
