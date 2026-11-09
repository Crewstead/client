<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import LoadingRows from '#lib/components/LoadingRows.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ChevronRight } from '@lucide/svelte';
  import type { ConnectionView, ContextId, ProviderInfo } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
  import { activeModules, connectOptionsFor } from '#lib/modules/registry.ts';
  import type { ConnectOption } from '#lib/modules/types.ts';
  import { connections } from './api.ts';
  import ConnectProvider from './ConnectProvider.svelte';
  import { money, priceSummary } from './format.ts';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/keys.css';
  import '@crewstead/ui/providers.css';
  let {
    context,
    title,
    note,
    canManage = true,
  }: { context: ContextId; title: string; note: string; canManage?: boolean } = $props();
  const workspace = useWorkspace();
  let list = $state<ConnectionView[]>([]);
  let providers = $state<ProviderInfo[]>([]);
  let connecting = $state(false);
  // Personal models can also come from other modules (e.g. Claude Code on the user's computer).
  const personal = $derived(context === 'personal');
  const extra = $derived(
    personal ? connectOptionsFor(activeModules(workspace.catalog?.modules)) : [],
  );
  let setup = $state<ConnectOption>();
  let loaded = $state(false);
  // A sign-in that failed at the provider comes back here with its reason.
  let error = $state(page.url.searchParams.get('signin_error') ?? '');
  // A provider's page links back here, wherever "here" is (the Models tab or a workspace page).
  const from = $derived(encodeURIComponent(page.url.pathname + page.url.search));
  const manage = (id: string) =>
    `${resolve('/settings/[section]/[id]', { section: 'providers', id })}?from=${from}`;
  const share = (connection: ConnectionView) =>
    Math.min(100, (connection.spentTodayUsd / connection.dailyLimitUsd) * 100);
  async function load() {
    try {
      [list, providers] = await Promise.all([connections.list(context), connections.providers()]);
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load providers';
    } finally {
      loaded = true;
    }
  }
  async function connected() {
    connecting = false;
    await Promise.all([load(), workspace.refresh()]);
  }
  onMount(load);
</script>

<section class="settings-section" aria-label={title}>
  <SettingsHeading {title}
    >{note}{#snippet action()}{#if canManage}<button
          class="button subtle small"
          onclick={() => (connecting = true)}>Connect provider</button
        >{/if}{/snippet}</SettingsHeading
  >
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  {#if !loaded}
    <div class="settings-card"><LoadingRows label={`Loading ${title}`} /></div>
  {/if}
  {#if loaded && (list.length || personal)}
    <div class="settings-card provider-groups">
      {#each list as connection (connection.id)}
        <div class="provider-group" role="group" aria-label={connection.label}>
          <div class="provider-head">
            <span class="key-mark" aria-hidden="true"
              >{connection.providerLabel.slice(0, 1).toUpperCase()}</span
            >
            <span class="row-text"
              ><strong>{connection.label}</strong
              >{#if connection.providerLabel !== connection.label}<small
                  >{connection.providerLabel}</small
                >{/if}</span
            >
            {#if connection.billing === 'plan'}
              <span class="row-meta">Uses your plan</span>
            {:else}
              <span
                class="row-meta"
                title="Spent today of the daily limit, which resets at 00:00 UTC"
              >
                <span class="spend-bar" class:full={share(connection) >= 100}
                  ><span style:width={`${share(connection)}%`}></span></span
                >
                {money(connection.spentTodayUsd)} / {money(connection.dailyLimitUsd)} today
              </span>
            {/if}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- manage() is resolved -->
            <a
              class="manage-link"
              href={manage(connection.id)}
              aria-label={`Manage ${connection.label}`}
              >Manage <ChevronRight size={14} aria-hidden="true" /></a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          </div>
          <ul aria-label={`Models from ${connection.label}`}>
            {#each connection.models.filter((model) => model.enabled) as model (model.id)}
              <li>
                <span class="row-name">{model.label}</span><span class="row-meta"
                  >{connection.billing === 'plan' ? '' : priceSummary(model)}</span
                >
              </li>
            {:else}
              <li class="provider-empty">
                No models on yet.
                {#if connection.canManage}
                  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- manage() is resolved -->
                  <a href={manage(connection.id)}>Choose models</a>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
      {#if personal}<ModuleSlot slot="personal-providers" props={{ changed: connected }} />{/if}
    </div>
  {/if}
  {#if loaded}
    <EmptyState
      text={`No providers connected yet.${canManage ? ' Connect one, such as OpenAI or Anthropic, or Claude Code on your computer, to use its models.' : ''}`}
    />
  {/if}
</section>

{#if connecting}
  <ConnectProvider
    {context}
    {providers}
    {extra}
    pick={(option) => {
      connecting = false;
      setup = option;
    }}
    done={connected}
    close={() => (connecting = false)}
  />
{/if}
{#if setup}
  {#await setup.load() then loaded}
    <loaded.default
      close={() => {
        setup = undefined;
        void connected();
      }}
    />
  {/await}
{/if}
