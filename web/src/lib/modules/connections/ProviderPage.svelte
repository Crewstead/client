<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ArrowLeft } from '@lucide/svelte';
  import type { ConnectionView, ProviderInfo } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { connections } from './api.ts';
  import { money } from './format.ts';
  import ConnectionActions from './ConnectionActions.svelte';
  import ModelList from './ModelList.svelte';
  import '@crewstead/ui/settings-tabs.css';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/connections.css';
  import '@crewstead/ui/keys.css';
  import '@crewstead/ui/providers.css';
  let { id }: { id: string } = $props();
  const workspace = useWorkspace();
  const fromParam = page.url.searchParams.get('from') ?? '';
  const justConnected = page.url.searchParams.get('connected') === '1';
  // Only return to a Settings page of this app; anything else falls back to the Models tab.
  const back = fromParam.startsWith('/settings') ? fromParam : resolve('/settings?tab=models');
  let connection = $state<ConnectionView>();
  let providers = $state<ProviderInfo[]>([]);
  let loaded = $state(false);
  let limit = $state(0);
  /** Requests at once; '' for no limit. */
  let running = $state<number | ''>('');
  let busy = $state(false);
  let error = $state('');
  const share = $derived(
    connection ? Math.min(100, (connection.spentTodayUsd / connection.dailyLimitUsd) * 100) : 0,
  );
  const provider = $derived(providers.find((item) => item.id === connection?.provider));
  async function changed(view: ConnectionView) {
    connection = view;
    limit = view.dailyLimitUsd;
    running = view.maxRunning ?? '';
    await workspace.refresh();
  }
  async function saveLimit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      await changed(await connections.update(id, { dailyLimitUsd: Number(limit) }));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save the limit';
    } finally {
      busy = false;
    }
  }
  async function saveRunning(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const maxRunning = running === '' || running === null ? null : Number(running);
      await changed(await connections.update(id, { maxRunning }));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save the limit';
    } finally {
      busy = false;
    }
  }
  onMount(async () => {
    try {
      const [view, list] = await Promise.all([connections.get(id), connections.providers()]);
      providers = list;
      connection = view;
      limit = view.dailyLimitUsd;
      running = view.maxRunning ?? '';
    } catch {
      /* not found or no access: shown below */
    } finally {
      loaded = true;
    }
  });
</script>

<div class="page-container settings-page">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- validated Settings path -->
  <a class="back-link" href={back}><ArrowLeft size={15} /> Back</a>
  {#if connection}
    <header class="org-heading">
      <div>
        <h1>{connection.label}</h1>
        <p class="muted-text">
          {connection.providerLabel}{connection.address ? ` at ${connection.address}` : ''} · {connection.context ===
          'personal'
            ? 'Personal'
            : 'Organisation'}
        </p>
      </div>
    </header>
    {#if justConnected}<p class="connected-note" role="status">
        Connected. Turn on the models you want to use in chats.
      </p>{/if}
    <div class="settings-panel">
      <section class="settings-section" aria-label="Usage">
        <h2>Today</h2>
        {#if connection.billing === 'plan'}
          <div class="settings-card key-usage">
            <p class="muted-text">
              This uses your {connection.providerLabel} plan and its limits. You won’t be charged extra.
            </p>
          </div>
        {:else}<div class="settings-card key-usage">
            <div class="key-usage-figures">
              <span>{money(connection.spentTodayUsd)} spent</span>
              <span class="muted-text"
                >limit {money(connection.dailyLimitUsd)} a day, resets at 00:00 UTC</span
              >
            </div>
            <span class="spend-bar" class:full={share >= 100}
              ><span style:width={`${share}%`}></span></span
            >
            {#if connection.canManage}
              <form class="inline-form" onsubmit={saveLimit} aria-label="Daily limit">
                <label for={`${id}-limit`}>Daily spending limit ($)</label>
                <input
                  id={`${id}-limit`}
                  type="number"
                  bind:value={limit}
                  min="0.01"
                  max="1000"
                  step="0.01"
                  required
                  disabled={busy}
                />
                <button
                  type="submit"
                  class="button subtle small"
                  disabled={busy || Number(limit) === connection.dailyLimitUsd}>Save</button
                >
              </form>
            {/if}
          </div>{/if}
        {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
      </section>
      <section class="settings-section" aria-label="Requests at once">
        <h2>Requests at once</h2>
        <div class="settings-card key-usage">
          <p class="muted-text">
            Some providers allow only a few requests at the same time. Over this many, chats wait
            their turn. {connection.maxRunning
              ? `At most ${connection.maxRunning} now.`
              : 'No limit now.'}
          </p>
          {#if connection.canManage}
            <form class="inline-form" onsubmit={saveRunning} aria-label="Requests at once">
              <label for={`${id}-running`}>At most</label>
              <input
                id={`${id}-running`}
                type="number"
                bind:value={running}
                min="1"
                max="100"
                step="1"
                placeholder="No limit"
                disabled={busy}
              />
              <button
                type="submit"
                class="button subtle small"
                disabled={busy ||
                  (running === '' || running === null ? null : Number(running)) ===
                    connection.maxRunning}>Save</button
              >
            </form>
          {/if}
        </div>
      </section>
      <ModelList {connection} note={provider?.priceNote} {changed} />
      {#if connection.canManage}<ConnectionActions {connection} {back} {changed} />{/if}
    </div>
  {:else if loaded}
    <h1>Provider not found</h1>
    <p class="muted-text">It may have been disconnected, or you no longer have access to it.</p>
  {/if}
</div>
