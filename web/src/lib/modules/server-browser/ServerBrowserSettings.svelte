<script lang="ts">
  import type { ServerBrowserView } from '@crewstead/core/protocol';
  import { request } from '#lib/api.ts';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/switch.css';
  import '@crewstead/ui/providers.css';
  import '@crewstead/ui/projects.css';
  let view = $state<ServerBrowserView>();
  let busy = $state(false);
  let error = $state('');
  $effect(() => {
    void request<ServerBrowserView>('/server-browser')
      .then((value) => (view = value))
      .catch((cause) => (error = cause instanceof Error ? cause.message : 'Could not load.'));
  });
  async function set(enabled: boolean) {
    busy = true;
    error = '';
    try {
      view = await request<ServerBrowserView>('/server-browser', {
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

{#if view}
  <li aria-label="Browser on the server">
    <span class="project-text">
      <span
        class="row-name"
        title="A chat with a project uses its computer’s browser; any other chat gets its own browser on this hub. Public websites only, never this server or private networks. Opening pages and clicking still ask."
        >Browser on the server</span
      >
      <span class="row-status"
        ><span class="status-dot" class:online={view.enabled && view.installed}></span>For chats
        without a project · {!view.installed
          ? 'not installed: run pnpm install-browser on the server'
          : view.enabled
            ? `on, ${view.sessions} of ${view.limit} in use`
            : 'off'}</span
      >
      {#if error}<span class="row-error" role="alert">{error}</span>{/if}
    </span>
    <input
      type="checkbox"
      class="switch"
      aria-label="Browser on the server"
      checked={view.enabled}
      disabled={!view.canManage || busy || !view.installed}
      onchange={(event) => set(event.currentTarget.checked)}
    />
  </li>
{/if}
