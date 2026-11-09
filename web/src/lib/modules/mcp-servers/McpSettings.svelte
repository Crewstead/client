<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import LoadingRows from '#lib/components/LoadingRows.svelte';
  import { Plus } from '@lucide/svelte';
  import type { McpServer } from '@crewstead/core/protocol';
  import { mcpServers } from './api.ts';
  import McpServerDialog from './McpServerDialog.svelte';
  import McpServerRow from './McpServerRow.svelte';
  import { McpSignIn } from './sign-in.svelte.ts';
  import '@crewstead/ui/switch.css';
  import '@crewstead/ui/skills.css';
  import '@crewstead/ui/mcp.css';
  let list = $state<McpServer[]>();
  let error = $state('');
  let editing = $state<{ server?: McpServer }>();
  async function refresh() {
    try {
      list = await mcpServers.list();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load MCP servers.';
    }
  }
  $effect(() => void refresh());
  const signIn = new McpSignIn();
  $effect(() => () => signIn.stop());
  function startSignIn(id: string, here?: boolean) {
    error = '';
    signIn
      .start(id, () => !!list?.find((server) => server.id === id)?.signIn?.signedIn, refresh, here)
      .catch((cause: unknown) => {
        error = cause instanceof Error ? cause.message : 'Could not start the sign-in.';
      });
  }
  async function act(action: () => Promise<unknown>) {
    error = '';
    try {
      await action();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    }
    await refresh();
  }
</script>

<section class="settings-section" aria-label="MCP servers">
  <SettingsHeading page title="MCP servers">
    Other services’ tools for your Personal chats, through the Model Context Protocol. Each call
    asks you first unless you allow that tool.
    {#snippet action()}<button class="button subtle small" onclick={() => (editing = {})}
        ><Plus size={14} aria-hidden="true" />Add server</button
      >{/snippet}
  </SettingsHeading>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  {#if list?.length}
    <ul class="settings-card skill-list" aria-label="Your MCP servers">
      {#each list as server (server.id)}
        <McpServerRow
          {server}
          {act}
          edit={() => (editing = { server })}
          signIn={(here) => startSignIn(server.id, here)}
          waiting={signIn.waiting === server.id}
          link={signIn.waiting === server.id ? signIn.link : ''}
        />
      {/each}
    </ul>
  {:else if list}
    <EmptyState
      text="No MCP servers yet. Add one by its address; services that sign you in on their own page, such as Notion or Linear, need nothing else."
    />
  {:else}
    <div class="settings-card"><LoadingRows label="Loading MCP servers" /></div>
  {/if}
</section>
{#if editing}<McpServerDialog
    {...editing.server ? { server: editing.server } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void refresh();
    }}
  />{/if}
