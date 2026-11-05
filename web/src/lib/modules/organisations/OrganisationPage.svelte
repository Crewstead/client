<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ArrowLeft } from '@lucide/svelte';
  import type { Organisation } from '@crewstead/core/protocol';
  import { organisations } from './api.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { useAuthentication } from '#lib/auth/auth.svelte.ts';
  import ModuleSlot from '../ModuleSlot.svelte';
  import OrgMembers from './OrgMembers.svelte';
  import ChatTitle from '#lib/components/ChatTitle.svelte';
  import '@crewstead/ui/connections.css';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/switch.css';
  let { id: orgId }: { id: string } = $props();
  const workspace = useWorkspace();
  const auth = useAuthentication();
  const back = resolve('/settings?tab=organisations');
  let org = $state<Organisation>();
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state('');
  let leaveError = $state('');
  const current = $derived(workspace.context === `org:${orgId}`);
  const manager = $derived(org !== undefined && org.role !== 'member');
  async function load() {
    org = (await organisations.list()).find((candidate) => candidate.id === orgId);
    loaded = true;
  }
  async function setPolicy(patch: { allowPersonal?: boolean; shareModels?: boolean }) {
    busy = true;
    error = '';
    try {
      org = await organisations.update(orgId, patch);
      // Sharing changes Personal's models too, wherever this page was opened from.
      if (current || patch.shareModels !== undefined) await workspace.refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save';
    } finally {
      busy = false;
    }
  }
  async function leave() {
    busy = true;
    leaveError = '';
    try {
      await organisations.remove(orgId, auth.user!.id);
      if (current) await workspace.changeContext('personal');
      await goto(back);
    } catch (cause) {
      leaveError = cause instanceof Error ? cause.message : 'Could not leave';
    } finally {
      busy = false;
    }
  }
  onMount(() => load().catch(() => (loaded = true)));
</script>

<div class="page-container settings-page">
  <a class="back-link" href={back}><ArrowLeft size={15} /> Organisations</a>
  {#if org}
    <header class="org-heading">
      <div>
        {#if manager}<!-- Owners and admins rename it here; the hub checks the role. -->
          <ChatTitle
            what="organisation"
            title={org.name}
            rename={async (name) => {
              org = await organisations.update(orgId, { name });
              // The workspace menu lists it by name.
              await workspace.refresh();
            }}
          />{:else}<h1>{org.name}</h1>{/if}
        <p class="muted-text">
          <span class="role-tag">{org.role}</span>
        </p>
      </div>
      {#if !current}<button
          class="button subtle small"
          onclick={() => workspace.changeContext(`org:${orgId}`)}>Switch to workspace</button
        >{/if}
    </header>
    <div class="settings-panel">
      <section class="settings-section" aria-label="Organisation policy">
        <SettingsHeading title="Permissions" />
        <div class="settings-card">
          <label class="setting-row"
            ><div>
              <strong>Allow personal models</strong>
              <p>Members may use their personal models for {org.name} work.</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              checked={org.allowPersonal}
              disabled={busy || !manager}
              onchange={(event) =>
                setPolicy({ allowPersonal: (event.target as HTMLInputElement).checked })}
            /></label
          >
          <label class="setting-row"
            ><div>
              <strong>Share models with Personal</strong>
              <p>
                Members may use {org.name}’s models in their own Personal chats. {org.name} pays within
                its limits and sees only spending, never those chats.
              </p>
            </div>
            <input
              type="checkbox"
              class="switch"
              checked={org.shareModels}
              disabled={busy || !manager}
              onchange={(event) =>
                setPolicy({ shareModels: (event.target as HTMLInputElement).checked })}
            /></label
          >
        </div>
        {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
      </section>
      <OrgMembers {orgId} role={org.role} />
      <ModuleSlot
        slot="workspace"
        props={{ context: `org:${orgId}`, name: org.name, canManage: manager }}
      />
      <section class="settings-section" aria-label="Leave organisation">
        <div class="settings-card setting-row">
          <div>
            <strong>Leave organisation</strong>
            <p>You lose access to {org.name} chats and shared models.</p>
          </div>
          <button class="button subtle small" disabled={busy} onclick={leave}>Leave</button>
        </div>
        {#if leaveError}<p class="error-banner" role="alert">{leaveError}</p>{/if}
      </section>
    </div>
  {:else if loaded}
    <h1>Organisation not found</h1>
    <p class="muted-text">It may have been removed, or you are no longer a member.</p>
  {/if}
</div>
