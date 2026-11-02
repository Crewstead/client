<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import type { McpServer, McpToolRule } from '@crewstead/core/protocol';
  import OptionPicker from '#lib/components/OptionPicker.svelte';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  import { mcpServers } from './api.ts';
  let {
    server,
    edit,
    act,
  }: {
    server: McpServer;
    edit: () => void;
    /** Runs a change, then reloads the list (showing any error). */
    act: (action: () => Promise<unknown>) => Promise<void>;
  } = $props();
  let open = $state(false);
  let checking = $state(false);
  const rules: Array<{ value: McpToolRule; label: string; hint: string }> = [
    { value: 'ask', label: 'Ask first', hint: 'Follows the chat’s approval mode' },
    { value: 'allow', label: 'Always allow', hint: 'Runs without asking' },
    { value: 'off', label: 'Off', hint: 'Models never see it' },
  ];
  const usable = $derived(server.tools.filter((tool) => tool.rule !== 'off').length);
  const items: MenuItem[] = $derived([
    {
      label: 'On',
      checked: server.enabled,
      hint: 'Offered in your Personal chats',
      run: () => act(() => mcpServers.update(server.id, { enabled: !server.enabled })),
    },
    {
      label: checking ? 'Refreshing…' : 'Refresh',
      disabled: checking,
      hint: 'List its tools again',
      run: async () => {
        checking = true;
        await act(() => mcpServers.check(server.id));
        checking = false;
      },
    },
    { label: 'Edit', hint: 'Name, address and headers', run: edit },
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
      <span class="mcp-server-text">
        <span class="skill-row-name"
          >{server.name}{#if !server.enabled}<span class="pill">Off</span>{/if}</span
        >
        <span class="skill-row-description" title={server.url}>{server.url}</span>
        <span class="mcp-server-count" class:problem={!!server.problem}
          >{server.problem
            ? 'Not reachable'
            : `${usable} of ${server.tools.length} tools in use`}</span
        >
      </span>
    </button>
    <RowMenu label={`Settings for ${server.name}`} title={server.name} {items} />
  </div>
  {#if server.problem}<p class="mcp-problem" role="status">{server.problem}</p>{/if}
  {#if open}
    {#if server.tools.length}
      <ul class="mcp-tools" aria-label={`${server.name} tools`}>
        {#each server.tools as tool (tool.name)}
          <li data-rule={tool.rule}>
            <span class="mcp-tool-text">
              <span class="skill-row-name">{tool.name}</span>
              <span class="mcp-tool-description"
                >{#if tool.readOnly}<span class="mcp-tool-reads">Reads only</span
                  >{#if tool.description}&nbsp;·&#32;{/if}{/if}{tool.description}</span
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
        {/each}
      </ul>
    {:else}<p class="mcp-problem">No tools listed yet.</p>{/if}
  {/if}
</li>
