<script lang="ts">
  import type { CloudSandboxView } from '@crewstead/core/protocol';
  import { request } from '#lib/api.ts';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/providers.css';
  import '@crewstead/ui/switch.css';
  import '@crewstead/ui/projects.css';
  let view = $state<CloudSandboxView>();
  let busy = $state(false);
  let error = $state('');
  $effect(() => {
    void request<CloudSandboxView>('/cloud-sandbox')
      .then((value) => (view = value))
      .catch((cause) => (error = cause instanceof Error ? cause.message : 'Could not load.'));
  });
  async function set(enabled: boolean) {
    busy = true;
    error = '';
    try {
      view = await request<CloudSandboxView>('/cloud-sandbox', {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    } finally {
      busy = false;
    }
  }
</script>

<!-- Drawn at once, so the row never appears late; its state fills in when it arrives. -->
{#if !view}
  <li aria-label="Code sandbox on the server" aria-busy="true">
    <span class="project-text">
      <span class="row-name">Code sandbox</span>
      <span class="row-status"><span class="status-dot"></span>Checking…</span>
      {#if error}<span class="row-error" role="alert">{error}</span>{/if}
    </span>
    <span class="loading-bar control" aria-hidden="true"></span>
  </li>
{:else}
  <li aria-label="Code sandbox on the server">
    <span class="project-text">
      <span
        class="row-name"
        title={`A throwaway Linux container per chat without a project, to write files and run code: gVisor’s kernel, no access to this server or your computers, public websites only. About ${view.memoryMb / 1024} GB each, deleted after a day unused; turning it off deletes them all.`}
        >Code sandbox</span
      >
      <span class="row-status"
        ><span
          class="status-dot"
          class:online={view.enabled && !view.missing.length}
          class:failed={view.enabled && view.missing.length > 0}
        ></span>{busy && !view.enabled
          ? 'Setting up (the first time downloads gVisor)'
          : view.enabled && view.missing.length
            ? `On, but not working: needs ${view.missing.join(', ')} on the server`
            : view.enabled
              ? `On · ${view.sandboxes} of ${view.limit} in use`
              : view.missing.length
                ? `Needs ${view.missing.join(', ')} on the server`
                : 'Off'} · for chats without a project</span
      >
      {#if error}<span class="row-error" role="alert">{error}</span>{/if}
    </span>
    <input
      type="checkbox"
      class="switch"
      aria-label="Code sandbox on the server"
      checked={view.enabled}
      disabled={!view.canManage || busy || (!view.enabled && view.missing.length > 0)}
      onchange={(event) => set(event.currentTarget.checked)}
    />
  </li>
{/if}
