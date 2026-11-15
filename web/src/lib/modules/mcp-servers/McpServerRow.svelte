<script lang="ts">
  import { ChevronDown, LogIn } from '@lucide/svelte';
  import type { McpServer, McpToolRule } from '@crewstead/core/protocol';
  import OptionPicker from '#lib/components/OptionPicker.svelte';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  import { mcpServers } from './api.ts';
  import { catalog } from './catalog/index.ts';
  import McpIcon from './McpIcon.svelte';
  let {
    server,
    edit,
    act,
    signIn,
    waiting,
    link,
  }: {
    server: McpServer;
    edit: () => void;
    /** Runs a change, then reloads the list (showing any error). */
    act: (action: () => Promise<unknown>) => Promise<void>;
    /** Opens the server's own sign-in page, for servers that sign their users in. */
    signIn: () => void;
    /** A sign-in is open in another window and being waited for. */
    waiting: boolean;
    /** The sign-in page, when it could not be opened in a new tab. */
    link: string;
  } = $props();
  const needsSignIn = $derived(!!server.signIn && !server.signIn.signedIn);
  let open = $state(false);
  let checking = $state(false);
  const rules: Array<{ value: McpToolRule; label: string; hint?: string }> = [
    { value: 'ask', label: 'Ask first', hint: 'Follows the chat’s approval mode' },
    { value: 'allow', label: 'Always allow' },
    { value: 'off', label: 'Off' },
  ];
  let filter = $state('');
  const shownTools = $derived.by(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return server.tools.filter((tool) =>
      words.every((word) => `${tool.name} ${tool.description}`.toLowerCase().includes(word)),
    );
  });
  /** The service's host: the whole address is in its tooltip. */
  const host = $derived.by(() => {
    try {
      return new URL(server.url).host;
    } catch {
      return server.url;
    }
  });
  const usable = $derived(server.tools.filter((tool) => tool.rule !== 'off').length);
  const items: MenuItem[] = $derived([
    {
      label: server.enabled ? 'Turn off' : 'Turn on',
      run: () => act(() => mcpServers.update(server.id, { enabled: !server.enabled })),
    },
    {
      label: checking ? 'Refreshing…' : 'Refresh',
      disabled: checking,
      run: async () => {
        checking = true;
        await act(() => mcpServers.check(server.id));
        checking = false;
      },
    },
    ...(server.signIn
      ? server.signIn.signedIn
        ? [
            { label: 'Sign in again', run: () => signIn() },
            { label: 'Sign out', run: () => act(() => mcpServers.signOut(server.id)) },
          ]
        : [{ label: 'Sign in', run: () => signIn() }]
      : []),
    { label: 'Edit', run: edit },
    {
      label: 'Remove',
      confirm: 'Remove? Click again to confirm.',
      run: () => act(() => mcpServers.remove(server.id)),
    },
  ]);
</script>

<li class="mcp-server" data-enabled={server.enabled}>
  <div class="mcp-server-head">
    <button
      class="mcp-server-toggle"
      aria-expanded={open}
      aria-label={`${server.name} tools`}
      onclick={() => (open = !open)}
    >
      <ChevronDown size={14} />
      <McpIcon
        entry={catalog.find((entry) => entry.url === server.url)}
        name={server.name}
        size={18}
      />
      <span class="mcp-server-text">
        <span class="mcp-server-name"
          >{server.name}{#if !server.enabled}<span class="pill">Off</span>{/if}</span
        >
        <span class="mcp-server-host" title={server.url}>{host}</span>
        <span class="mcp-server-count" class:problem={!!server.problem && !needsSignIn}
          >{needsSignIn
            ? waiting
              ? 'Waiting for the sign-in…'
              : 'Sign in to use it'
            : server.problem
              ? 'Not reachable'
              : `${server.signIn ? 'Signed in · ' : ''}${
                  server.enabled
                    ? `${usable} of ${server.tools.length} tools in use`
                    : `${server.tools.length} tools`
                }`}</span
        >
      </span>
    </button>
    {#if needsSignIn}<button
        class="button small mcp-sign-in"
        disabled={waiting}
        onclick={() => signIn()}><LogIn size={14} /> {waiting ? 'Waiting…' : 'Sign in'}</button
      >{/if}
    <RowMenu label={`Settings for ${server.name}`} title={server.name} {items} />
  </div>
  {#if link}<p class="mcp-problem" role="status">
      Your browser blocked the new tab.
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the service's own page -->
      <a href={link} target="_blank" rel="noopener">Open the sign-in page</a>.
    </p>
  {:else if server.problem && !(needsSignIn && server.problem === 'Sign in to use this server.')}<p
      class="mcp-problem"
      role="status"
    >
      {server.problem}
    </p>{/if}
  {#if open}
    {#if server.tools.length}
      {#if server.tools.length > 8}<label class="mcp-tool-filter">
          <span class="sr-only">Filter {server.name} tools</span>
          <input type="search" bind:value={filter} placeholder="Filter tools" />
        </label>{/if}
      <ul class="mcp-tools" aria-label={`${server.name} tools`}>
        {#each shownTools as tool (tool.name)}
          <li data-rule={tool.rule}>
            <span class="mcp-tool-text">
              <span class="skill-row-name">{tool.name}</span>
              <span class="mcp-tool-description"
                >{#if tool.readOnly}<span class="mcp-tag">Reads only</span
                  >{/if}{tool.description}</span
              >
            </span>
            <OptionPicker
              value={tool.rule}
              options={rules}
              label={`${tool.name} use`}
              onchange={(rule) =>
                act(() => mcpServers.update(server.id, { rules: { [tool.name]: rule } }))}
            />
          </li>
        {:else}<li class="mcp-tools-empty">No tool matches.</li>
        {/each}
      </ul>
    {:else}<p class="mcp-problem">No tools listed yet.</p>{/if}
  {/if}
</li>
