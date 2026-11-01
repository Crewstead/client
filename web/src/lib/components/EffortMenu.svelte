<script lang="ts">
  import { Check, ChevronRight } from '@lucide/svelte';
  import { effortSetting, efforts } from '#lib/effort.svelte.ts';
  /** Called after a choice, to close the whole model menu. */
  let { chosen }: { chosen: () => void } = $props();
  const id = $props.id();
  const current = $derived(efforts.find((option) => option.value === effortSetting.value)!);
  let open = $state(false);
  let row = $state<HTMLButtonElement>();
  let menu = $state<HTMLElement>();
  /** Beside the model menu, like Claude desktop: right if it fits, else left, else over it. */
  let side = $state<'right' | 'left' | 'over'>('right');
  let leaving: ReturnType<typeof setTimeout> | undefined;
  function show(focus = false) {
    clearTimeout(leaving);
    if (open) return;
    open = true;
    queueMicrotask(() => {
      if (!menu || !row) return;
      const parent = row.closest('.model-options')!.getBoundingClientRect();
      const width = menu.offsetWidth;
      side =
        parent.right + 4 + width <= window.innerWidth - 8
          ? 'right'
          : parent.left - 4 - width >= 8
            ? 'left'
            : 'over';
      if (focus) menu.querySelector<HTMLInputElement>('input:checked')?.focus();
    });
  }
  function hide(focus = false) {
    clearTimeout(leaving);
    open = false;
    if (focus) row?.focus();
  }
  /** Left arrow or Escape go back to the model menu, as in other desktop menus. */
  function back(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    hide(true);
  }
  // Moving from the row to the side menu crosses a small gap; wait a moment before closing.
  const later = () => (leaving = setTimeout(() => hide(), 200));
</script>

<div
  class="effort-menu"
  role="presentation"
  onpointerenter={(event) => event.pointerType === 'mouse' && show()}
  onpointerleave={(event) => event.pointerType === 'mouse' && later()}
>
  <button
    bind:this={row}
    type="button"
    class="menu-row"
    aria-haspopup="true"
    aria-expanded={open}
    onclick={() => show()}
    onkeydown={(event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(true);
      }
    }}
    ><span>Effort</span><span class="menu-row-value">{current.label}</span><ChevronRight
      size={14}
    /></button
  >
  {#if open}
    <fieldset bind:this={menu} class="effort-flyout" data-side={side}>
      <legend class="sr-only">Effort</legend>
      {#each efforts as option (option.value)}
        <label
          ><input
            type="radio"
            name={id}
            checked={effortSetting.value === option.value}
            onkeydown={back}
            onchange={() => {
              effortSetting.set(option.value);
              chosen();
            }}
          />
          <span class="effort-option"><span>{option.label}</span><small>{option.hint}</small></span
          >{#if effortSetting.value === option.value}<Check size={14} />{/if}
        </label>
      {/each}
    </fieldset>
  {/if}
</div>
