<script lang="ts">
  import Dropdown from './Dropdown.svelte';
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
  /** A pick shown at once, until the chat (its live updates) says the same, or the hub refuses it. */
  let picked = $state<{ chat?: string; mode?: ApprovalMode; reviewer?: string | null }>({});
  $effect(() => {
    if (!picked.chat) return;
    const settled =
      (picked.mode === undefined || picked.mode === chat?.mode) &&
      (picked.reviewer === undefined || picked.reviewer === (chat?.reviewer ?? null));
    if (picked.chat !== chat?.id || settled) picked = {};
  });
  // Chats from before per-chat modes follow the one set last.
  const mode = $derived(
    picked.mode ?? chat?.mode ?? workspace.catalog?.preferences.approvalMode ?? 'ask',
  );
  const chosen = $derived(approvalModes.find((option) => option.value === mode)!);
  const icons = { ask: ShieldQuestion, auto: ShieldCheck, all: ShieldAlert };
  const Icon = $derived(icons[mode]);
  const models = $derived(workspace.catalog?.models ?? []);
  // A reviewer no longer offered here is left out: the chat's own model reviews instead.
  const reviewer = $derived(
    models.find(
      (model) => model.id === (picked.reviewer === undefined ? chat?.reviewer : picked.reviewer),
    ),
  );
  /** The menu shows the modes, or the models to review with. */
  let view = $state<'modes' | 'reviewer'>('modes');
  let open = $state(false);
  // Each opening starts on the modes.
  $effect(() => {
    if (!open) view = 'modes';
  });
  async function save(patch: { approvalMode?: ApprovalMode; reviewModelId?: string | null }) {
    if (chat)
      picked = {
        ...picked,
        chat: chat.id,
        ...(patch.approvalMode ? { mode: patch.approvalMode } : {}),
        ...(patch.reviewModelId !== undefined ? { reviewer: patch.reviewModelId } : {}),
      };
    try {
      if (chat) await workspace.setPreferences(chat.id, patch);
      else if (patch.approvalMode) await workspace.setApprovalMode(patch.approvalMode);
    } catch (cause) {
      picked = {};
      failed(cause instanceof Error ? cause.message : 'Could not change approvals');
    }
  }
  /** Auto-review keeps the menu open in a chat, so its reviewer can be picked next. */
  function choose(value: ApprovalMode, close: (focus?: boolean) => void) {
    if (!(chat && value === 'auto')) close(true);
    if (value !== mode) void save({ approvalMode: value });
  }
  function review(modelId: string | null, close: (focus?: boolean) => void) {
    close(true);
    if (modelId !== (reviewer?.id ?? null)) void save({ reviewModelId: modelId });
  }
</script>

<!-- How this chat's tool calls are approved; under Auto-review, which model reviews them. -->
<Dropdown
  class="model-picker approval-picker mode-{mode}"
  up
  role="menu"
  panelLabel="Tool approvals"
  label={`Approvals: ${chosen.label}${mode === 'auto' && reviewer ? `, reviewed by ${reviewer.label}` : ''}`}
  title={`Approvals: ${chosen.label}${mode === 'auto' && reviewer ? ` · reviewed by ${reviewer.label}` : ''}`}
  bind:open
>
  {#snippet trigger()}<Icon size={13} /><span class="picker-label"
      >{chosen.label}{#if mode === 'auto' && reviewer}<span class="picker-aside">
          · {reviewer.label}</span
        >{/if}</span
    ><ChevronDown size={12} />{/snippet}
  {#snippet children(close)}
    {#if view === 'modes'}
      {#each approvalModes as option (option.value)}
        {@const OptionIcon = icons[option.value]}
        <button
          type="button"
          class="menu-item"
          role="menuitemradio"
          aria-checked={mode === option.value}
          onclick={() => choose(option.value, close)}
          ><OptionIcon size={14} /><span class="menu-text"><span>{option.label}</span></span
          >{#if mode === option.value}<Check class="menu-check" size={14} />{/if}</button
        >
      {/each}
      {#if chat && mode === 'auto'}
        <hr class="menu-separator" />
        <button type="button" class="menu-item" role="menuitem" onclick={() => (view = 'reviewer')}
          ><ScanEye size={14} /><span class="menu-text"><span>Reviewer</span></span><span
            class="menu-value">{reviewer?.label ?? 'Same as chat'}</span
          ><ChevronRight size={14} /></button
        >
      {/if}
    {:else}
      <button type="button" class="menu-item reviewer-back" onclick={() => (view = 'modes')}
        ><ChevronLeft size={14} /><span class="menu-text"><span>Reviewer</span></span></button
      >
      <hr class="menu-separator" />
      <button
        type="button"
        class="menu-item"
        role="menuitemradio"
        aria-checked={!reviewer}
        onclick={() => review(null, close)}
        ><span class="menu-text"><span>Same as chat</span></span>{#if !reviewer}<Check
            class="menu-check"
            size={14}
          />{/if}</button
      >
      <hr class="menu-separator" />
      <div class="reviewer-models">
        {#each models as model (model.id)}
          <button
            type="button"
            class="menu-item"
            role="menuitemradio"
            aria-checked={reviewer?.id === model.id}
            onclick={() => review(model.id, close)}
            ><span class="menu-text"><span>{model.label}</span></span
            >{#if reviewer?.id === model.id}<Check class="menu-check" size={14} />{/if}</button
          >
        {/each}
      </div>
    {/if}
  {/snippet}
</Dropdown>
