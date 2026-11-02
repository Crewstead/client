<script lang="ts">
  import { ChevronDown, Pencil, RefreshCw, Trash2 } from '@lucide/svelte';
  import type { McpServer, McpToolRule } from '@crewstead/core/protocol';
  import OptionPicker from '#lib/components/OptionPicker.svelte';
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
  let confirming = $state(false);
  let checking = $state(false);
  const rules: Array<{ value: McpToolRule; label: string; hint: string }> = [
    { value: 'ask', label: 'Ask first', hint: 'Follows the chat’s approval mode' },
    { value: 'allow', label: 'Always allow', hint: 'Runs without asking' },
    { value: 'off', label: 'Off', hint: 'Models never see it' },
  ];
  const usable = $derived(server.tools.filter((tool) => tool.rule !== 'off').length);
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
        <span class="skill-row-name">{server.name}</span>
        <span class="skill-row-description" title={server.url}>{server.url}</span>
      </span>
    </button>
    <span class="mcp-server-count" class:problem={!!server.problem}
      >{server.problem ? 'Not reachable' : `${usable} of ${server.tools.length} tools`}</span
    >
    <input
      type="checkbox"
      class="switch"
      aria-label={`${server.name} on`}
      checked={server.enabled}
      onchange={(event) =>
        act(() => mcpServers.update(server.id, { enabled: event.currentTarget.checked }))}
    />
    <button
      class="icon-button"
      aria-label={`Check ${server.name} again`}
      title="List its tools again"
      disabled={checking}
      onclick={async () => {
        checking = true;
        await act(() => mcpServers.check(server.id));
        checking = false;
      }}><RefreshCw size={14} class={checking ? 'spin' : ''} /></button
    >
    <button class="icon-button" aria-label={`Edit ${server.name}`} onclick={edit}
      ><Pencil size={14} /></button
    >
    {#if confirming}<button
        class="button danger small"
        onclick={() => act(() => mcpServers.remove(server.id))}
        onblur={() => (confirming = false)}
        {@attach (node) => node.focus()}>Remove</button
      >{:else}<button
        class="icon-button"
        aria-label={`Remove ${server.name}`}
        onclick={() => (confirming = true)}><Trash2 size={14} /></button
      >{/if}
  </div>
  {#if server.problem}<p class="mcp-problem" role="status">{server.problem}</p>{/if}
  {#if open}
    {#if server.tools.length}
      <ul class="mcp-tools" aria-label={`${server.name} tools`}>
        {#each server.tools as tool (tool.name)}
          <li data-rule={tool.rule}>
            <span class="mcp-tool-text">
              <span class="skill-row-name"
                >{tool.name}{#if tool.readOnly}<span class="pill">Reads only</span>{/if}</span
              >
              <span class="mcp-tool-description">{tool.description}</span>
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
