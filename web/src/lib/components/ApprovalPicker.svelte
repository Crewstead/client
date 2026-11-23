<script lang="ts">
  import { keepInView } from '#lib/keep-in-view.ts';
  import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ScanEye,
    ShieldAlert,
    ShieldCheck,
    ShieldQuestion,
  } from '@lucide/svelte';
  import type { ApprovalMode } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { approvalModes } from '#lib/approval-modes.ts';
  import '@crewstead/ui/model-picker.css';
  let {
    failed,
    chat,
  }: {
    failed: (message: string) => void;
    /**
     * The open chat, which keeps its own mode and reviewer; without one, the mode a new chat starts
     * with (a reviewer is chosen per chat).
     */
    chat?: { id: string; mode?: ApprovalMode | undefined; reviewer?: string | undefined };
  } = $props();
  const workspace = useWorkspace();
  // Chats from before per-chat modes follow the one set last.
  const mode = $derived(chat?.mode ?? workspace.catalog?.preferences.approvalMode ?? 'ask');
  const chosen = $derived(approvalModes.find((option) => option.value === mode)!);
  const icons = { ask: ShieldQuestion, auto: ShieldCheck, all: ShieldAlert };
  const Icon = $derived(icons[mode]);
  const models = $derived(workspace.catalog?.models ?? []);
  // A reviewer no longer offered here is left out: the chat's own model reviews instead.
  const reviewer = $derived(models.find((model) => model.id === chat?.reviewer));
  let details = $state<HTMLDetailsElement>();
  let trigger = $state<HTMLElement>();
  /** The menu shows the modes, or the models to review with. */
  let view = $state<'modes' | 'reviewer'>('modes');
  function close(focus = false) {
    if (!details?.open) return;
    details.open = false;
    view = 'modes';
    if (focus) trigger?.focus();
  }
  async function save(patch: { approvalMode?: ApprovalMode; reviewModelId?: string | null }) {
    try {
      if (chat) await workspace.setPreferences(chat.id, patch);
      else if (patch.approvalMode) await workspace.setApprovalMode(patch.approvalMode);
    } catch (cause) {
      failed(cause instanceof Error ? cause.message : 'Could not change approvals');
    }
  }
  function choose(value: ApprovalMode) {
    close(true);
    if (value !== mode) void save({ approvalMode: value });
  }
  function review(modelId: string | null) {
    close(true);
    if (modelId !== (reviewer?.id ?? null)) void save({ reviewModelId: modelId });
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
    aria-label={`Approvals: ${chosen.label}${mode === 'auto' && reviewer ? `, reviewed by ${reviewer.label}` : ''}`}
    title={`Approvals: ${chosen.label}${mode === 'auto' && reviewer ? ` · reviewed by ${reviewer.label}` : ''}`}
    ><Icon size={13} /><span class="picker-label"
      >{chosen.label}{#if mode === 'auto' && reviewer}<span class="picker-aside">
          · {reviewer.label}</span
        >{/if}</span
    ><ChevronDown size={12} /></summary
  >
  <div class="model-options approval-options">
    {#if view === 'modes'}
      <div role="menu" aria-label="Tool approvals">
        {#each approvalModes as option (option.value)}
          {@const OptionIcon = icons[option.value]}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === option.value}
            onclick={() => choose(option.value)}
            ><OptionIcon size={14} /><span>{option.label}</span>{#if mode === option.value}<Check
                class="option-check"
                size={14}
              />{/if}</button
          >
        {/each}
        {#if chat && mode === 'auto'}
          <hr />
          <button type="button" role="menuitem" onclick={() => (view = 'reviewer')}
            ><ScanEye size={14} /><span>Reviewer</span><small
              >{reviewer?.label ?? 'Same as chat'}</small
            ><ChevronRight class="option-more" size={14} /></button
          >
        {/if}
      </div>
    {:else}
      <div role="menu" aria-label="Reviewer">
        <button type="button" class="option-back" onclick={() => (view = 'modes')}
          ><ChevronLeft size={14} /><span>Reviewer</span></button
        >
        <hr />
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!reviewer}
          onclick={() => review(null)}
          ><span>Same as chat</span>{#if !reviewer}<Check
              class="option-check"
              size={14}
            />{/if}</button
        >
        <hr />
        <div class="option-list">
          {#each models as model (model.id)}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={reviewer?.id === model.id}
              onclick={() => review(model.id)}
              ><span>{model.label}</span>{#if reviewer?.id === model.id}<Check
                  class="option-check"
                  size={14}
                />{/if}</button
            >
          {/each}
        </div>
      </div>
    {/if}
  </div>
</details>
