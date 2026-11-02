<script lang="ts">
  import { Check, Search } from '@lucide/svelte';
  import type { Model } from '@crewstead/core/protocol';
  import { effortSetting, efforts } from '#lib/effort.svelte.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/search.css';
  import '@crewstead/ui/place-dialog.css';
  let {
    models,
    value,
    effort,
    choose,
    close,
  }: {
    models: Model[];
    value: string;
    /** The chosen model accepts an effort setting: the dialog offers it below the models. */
    effort: boolean;
    choose: (id: string) => void;
    close: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let query = $state('');
  let active = $state(0);
  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (model: Model) =>
    words.every((word) =>
      [model.label, model.group ?? '', model.connection ?? ''].some((text) =>
        text.toLowerCase().includes(word),
      ),
    );
  /** Matching models under their heading (a provider key, or Claude Code on a computer). */
  const groups = $derived(
    models.filter(matches).reduce<{ name: string; models: Model[] }[]>((list, model) => {
      const name = model.group ?? model.connection ?? '';
      const group = list.find((entry) => entry.name === name);
      if (group) group.models.push(model);
      else list.push({ name, models: [model] });
      return list;
    }, []),
  );
  const shown = $derived(groups.flatMap((group) => group.models));
  // Starts on the current model, and keeps the highlight on something shown while typing.
  $effect(() => {
    const at = shown.findIndex((model) => model.id === value);
    active = query ? 0 : Math.max(at, 0);
  });
  function pick(id: string) {
    choose(id);
    dialog.close();
  }
  function keys(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!shown.length) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      queueMicrotask(() =>
        dialog.querySelector('.place-choice.active')?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (event.key === 'Enter' && shown[active]) {
      event.preventDefault();
      pick(shown[active]!.id);
    }
  }
</script>

<!-- Which model answers, chosen from a list grouped by where each comes from. -->
<dialog
  class="dialog-content place-dialog"
  aria-label="Choose a model"
  bind:this={dialog}
  {@attach (node) => node.showModal()}
  onclose={close}
  onclick={(event) => {
    if (event.target === event.currentTarget) dialog.close();
  }}
>
  <div class="search-field">
    <Search size={16} aria-hidden="true" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      aria-label="Find a model"
      placeholder="Find a model, provider or computer"
      autocomplete="off"
      autofocus
      bind:value={query}
      onkeydown={keys}
    />
  </div>
  <div class="place-choices" role="listbox" aria-label="Models">
    {#each groups as group (group.name)}
      {#if group.name}<p class="place-heading">{group.name}</p>{/if}
      {#each group.models as model (model.id)}
        <button
          class="place-choice model-choice"
          class:active={shown[active]?.id === model.id}
          role="option"
          aria-selected={value === model.id}
          aria-label={model.label}
          title={model.label}
          onclick={() => pick(model.id)}
          onmouseenter={() => (active = shown.indexOf(model))}
        >
          <span><strong>{group.name ? (model.short ?? model.label) : model.label}</strong></span>
          {#if value === model.id}<Check size={15} />{/if}
        </button>
      {/each}
    {/each}
    {#if !shown.length}<p class="place-empty">Nothing matches “{query.trim()}”.</p>{/if}
  </div>
  {#if effort}
    <div class="model-effort" role="group" aria-label="Effort">
      <span>Effort</span>
      {#each efforts as option (option.value)}
        <button
          aria-pressed={effortSetting.value === option.value}
          title={option.hint}
          onclick={() => effortSetting.set(option.value)}>{option.label}</button
        >
      {/each}
    </div>
  {/if}
</dialog>
