<script lang="ts">
  import type { Snippet } from 'svelte';
  /** A ranked list where each row's bar shows its share of the largest. */
  let {
    title,
    rows,
    empty = 'Nothing yet.',
    extra,
  }: {
    title: string;
    rows: {
      key: string;
      label: string;
      value: number;
      shown: string;
      detail?: string;
      colour?: string;
      href?: string;
    }[];
    empty?: string;
    extra?: Snippet;
  } = $props();
  const largest = $derived(Math.max(...rows.map((row) => row.value), 1));
</script>

<section class="usage-card" aria-label={title}>
  <h2 class="usage-card-title">{title}</h2>
  {#if rows.length}
    <ol class="bar-list">
      {#each rows as row (row.key)}
        <li>
          <span
            class="bar-fill"
            style:width={`${(row.value / largest) * 100}%`}
            style:background={row.colour}
          ></span>
          {#if row.href}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the caller -->
            <a class="bar-label" href={row.href} title={row.label}>{row.label}</a>
          {:else}<span class="bar-label" title={row.label}>{row.label}</span>{/if}
          {#if row.detail}<span class="bar-detail">{row.detail}</span>{/if}
          <span class="bar-value">{row.shown}</span>
        </li>
      {/each}
    </ol>
  {:else}<p class="usage-empty">{empty}</p>{/if}
  {@render extra?.()}
</section>
