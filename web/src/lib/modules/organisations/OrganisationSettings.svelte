<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ChevronRight } from '@lucide/svelte';
  import type { Organisation } from '@crewstead/core/protocol';
  import { organisations } from './api.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/connections.css';
  import '@crewstead/ui/settings-cards.css';
  const workspace = useWorkspace();
  const id = $props.id();
  let list = $state<Organisation[]>([]);
  let loaded = $state(false);
  let name = $state('');
  let busy = $state(false);
  let error = $state('');
  const plural = (count: number) => `${count} ${count === 1 ? 'member' : 'members'}`;
  async function load() {
    try {
      list = await organisations.list();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load organisations';
    } finally {
      loaded = true;
    }
  }
  /** A new organisation becomes the current workspace and opens its page. */
  async function create(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      const created = await organisations.create(name.trim());
      name = '';
      await workspace.changeContext(`org:${created.id}`);
      await goto(resolve('/settings/[section]/[id]', { section: 'organisations', id: created.id }));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not create organisation';
    } finally {
      busy = false;
    }
  }
  onMount(load);
</script>

<section class="settings-section" aria-label="Organisations">
  <SettingsHeading title="Your organisations"
    >Shared workspaces with their own members and models.</SettingsHeading
  >
  <div class="settings-card">
    <ul aria-label="Your organisations">
      {#each list as org (org.id)}
        <li class="link-row">
          <a href={resolve('/settings/[section]/[id]', { section: 'organisations', id: org.id })}>
            <span class="row-name">{org.name}</span>
            <span class="row-meta"
              ><span class="role-tag">{org.role}</span><span>{plural(org.memberCount)}</span></span
            >
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        </li>
      {:else}
        {#if loaded}<li>
            <p class="muted-text empty-note">You are not in any organisation yet.</p>
          </li>{/if}
      {/each}
    </ul>
    <form class="card-footer inline-form" onsubmit={create} aria-label="Create organisation">
      <label for={`${id}-name`} class="sr-only">New organisation</label>
      <input
        id={`${id}-name`}
        bind:value={name}
        required
        maxlength="80"
        placeholder="New organisation name"
      />
      <button type="submit" class="button subtle small" disabled={busy || !name.trim()}
        >Create</button
      >
    </form>
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>
