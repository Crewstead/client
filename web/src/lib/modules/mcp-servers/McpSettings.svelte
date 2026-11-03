<script lang="ts">
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
  function startSignIn(id: string) {
    error = '';
    signIn
      .start(id, () => !!list?.find((server) => server.id === id)?.signIn?.signedIn, refresh)
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
  <div class="mcp-heading">
    <h2>MCP servers</h2>
    <button class="button subtle small" onclick={() => (editing = {})}
      ><Plus size={14} /> Add server</button
    >
  </div>
  <p class="muted-text">
    Other services’ tools for your Personal chats, through the Model Context Protocol. Models see
    each server’s tool names and read a server’s full list only when they need it. Every call asks
    first unless you allow that tool; a tool you switch off is never offered. Servers that sign you
    in through their own page (Notion, Linear and others) need no headers: add the address, then
    Sign in.
  </p>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  {#if list?.length}
    <ul class="skill-list" aria-label="Your MCP servers">
      {#each list as server (server.id)}
        <McpServerRow
          {server}
          {act}
          edit={() => (editing = { server })}
          signIn={() => startSignIn(server.id)}
          waiting={signIn.waiting === server.id}
          link={signIn.waiting === server.id ? signIn.link : ''}
        />
      {/each}
    </ul>
  {:else if list}<p class="skill-empty">No MCP servers yet.</p>{/if}
</section>
{#if editing}<McpServerDialog
    {...editing.server ? { server: editing.server } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void refresh();
    }}
  />{/if}
