<script lang="ts">
  import { ChevronRight, Search } from '@lucide/svelte';
  import type { ProviderInfo } from '@crewstead/core/protocol';
  import type { ConnectOption } from '#lib/modules/types.ts';
  import '@crewstead/ui/skills.css';
  let {
    providers,
    extra,
    choose,
  }: {
    providers: ProviderInfo[];
    /** Choices other modules add (Claude Code). */
    extra: ConnectOption[];
    /** A provider's id, or `extra:<id>` for another module's choice. */
    choose: (value: string) => void;
  } = $props();
  interface Row {
    value: string;
    label: string;
    description: string;
  }
  let query = $state('');
  let active = $state(0);
  let list = $state<HTMLUListElement>();
  const byLabel = (a: Row, b: Row) => a.label.localeCompare(b.label);
  const row = (item: ProviderInfo): Row => ({
    value: item.id,
    label: item.label,
    description: item.description,
  });
  // Plans first (no key to find), then APIs by name, then any API by its address.
  const all = $derived([
    {
      title: 'Subscriptions',
      rows: [
        ...extra.map((option) => ({
          value: `extra:${option.id}`,
          label: option.label,
          description: option.hint,
        })),
        ...providers.filter((item) => item.billing === 'plan').map(row),
      ].sort(byLabel),
    },
    {
      title: 'API keys',
      rows: providers
        .filter((item) => item.billing !== 'plan' && !item.address)
        .map(row)
        .sort(byLabel),
    },
    { title: 'By address', rows: providers.filter((item) => item.address).map(row) },
  ]);
  const groups = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (item: Row) =>
      words.every((word) => `${item.label} ${item.description}`.toLowerCase().includes(word));
    return all
      .map((group) => ({ ...group, rows: group.rows.filter(match) }))
      .filter((group) => group.rows.length);
  });
  const found = $derived(groups.flatMap((group) => group.rows));
  $effect(() => {
    void query;
    active = 0;
  });
  function keydown(event: KeyboardEvent) {
    if (event.isComposing || !found.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length;
      queueMicrotask(() =>
        list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = found[active];
      if (chosen) choose(chosen.value);
    }
  }
</script>

<label class="skill-search">
  <Search size={15} />
  <span class="sr-only">Search providers</span>
  <!-- svelte-ignore a11y_autofocus -->
  <input type="search" bind:value={query} onkeydown={keydown} placeholder="Search" autofocus />
</label>
<ul class="skill-results provider-results" bind:this={list} aria-label="Providers">
  {#each groups as group (group.title)}
    <li class="skill-group" aria-hidden="true">{group.title}</li>
    {#each group.rows as item (item.value)}
      {@const index = found.indexOf(item)}
      <li>
        <button
          type="button"
          class="skill-result provider-result"
          class:active={index === active}
          data-index={index}
          onclick={() => choose(item.value)}
          onpointerenter={() => (active = index)}
          ><span class="skill-result-text"
            ><strong>{item.label}</strong><small>{item.description}</small></span
          ><ChevronRight size={14} aria-hidden="true" /></button
        >
      </li>
    {/each}
  {:else}
    <li class="place-empty">No provider matches “{query.trim()}”.</li>
  {/each}
</ul>
