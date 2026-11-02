<script lang="ts">
  import { Plus, X } from '@lucide/svelte';
  import type { McpServer } from '@crewstead/core/protocol';
  import { mcpServers } from './api.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/skills.css';
  import '@crewstead/ui/mcp.css';
  let {
    server,
    close,
  }: {
    /** The server to change; a new one when absent. */
    server?: McpServer;
    /** Called when the dialog closes; `saved` after a change was saved. */
    close: (saved: boolean) => void;
  } = $props();
  const id = $props.id();
  // The form starts from the server being edited; later prop changes do not reset what was typed.
  const initial = () => ({ name: server?.name ?? '', url: server?.url ?? '' });
  let fields = $state(initial());
  // Saved header values are never shown again: editing replaces all of them, or keeps them.
  const headerCount = () => server?.headerNames.length ?? 0;
  let keep = $state(headerCount() > 0);
  let headers = $state(headerCount() ? [] : [{ name: 'Authorization', value: '' }]);
  let busy = $state(false);
  let error = $state('');
  let saved = false;
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    const filled = headers.filter((header) => header.name.trim() && header.value.trim());
    try {
      if (server)
        await mcpServers.update(server.id, {
          ...(fields.name !== server.name ? { name: fields.name } : {}),
          ...(fields.url !== server.url ? { url: fields.url } : {}),
          ...(keep ? {} : { headers: filled }),
        });
      else await mcpServers.create({ ...fields, headers: filled });
      saved = true;
      (event.target as HTMLElement).closest('dialog')?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save the server.';
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  class="dialog-content mcp-dialog"
  aria-labelledby={`${id}-title`}
  {@attach (node) => node.showModal()}
  onclose={() => close(saved)}
>
  <form onsubmit={submit}>
    <h2 id={`${id}-title`} class="dialog-title">
      {server ? `Edit ${server.name}` : 'Add an MCP server'}
    </h2>
    <label class="skill-field"
      >Name
      <input
        bind:value={fields.name}
        required
        maxlength="24"
        pattern="[a-z][a-z0-9_]*"
        placeholder="github"
        autocomplete="off"
        spellcheck="false"
        disabled={busy}
      />
      <small>Lowercase letters, digits and underscores. Models see the server by this name.</small>
    </label>
    <label class="skill-field"
      >Address
      <input
        bind:value={fields.url}
        required
        type="url"
        placeholder="https://example.com/mcp"
        autocomplete="off"
        spellcheck="false"
        disabled={busy}
      />
      <small
        >A Streamable HTTP MCP server on the internet. The hub connects to it, not this device.</small
      >
    </label>
    <fieldset class="mcp-headers" disabled={busy}>
      <legend>Headers</legend>
      {#if keep}
        <p class="mcp-kept">
          Sent with every request: {server?.headerNames.join(', ')}. Their values stay hidden.
          <button type="button" class="button subtle small" onclick={() => (keep = false)}
            >Replace</button
          >
        </p>
      {:else}
        {#each headers as header, index (index)}
          <div class="mcp-header-row">
            <input
              bind:value={header.name}
              aria-label="Header name"
              placeholder="Authorization"
              autocomplete="off"
              spellcheck="false"
            />
            <input
              bind:value={header.value}
              type="password"
              aria-label={`Value of ${header.name || 'header'}`}
              placeholder="Bearer …"
              autocomplete="off"
            />
            <button
              type="button"
              class="icon-button"
              aria-label={`Remove ${header.name || 'header'}`}
              onclick={() => headers.splice(index, 1)}><X size={14} /></button
            >
          </div>
        {/each}
        {#if headers.length < 5}<button
            type="button"
            class="button subtle small"
            onclick={() => headers.push({ name: '', value: '' })}><Plus size={14} /> Header</button
          >{/if}
        <small
          >For a server that needs a token, e.g. <code>Authorization: Bearer …</code>. Kept on the
          hub, never shown again, never given to models.</small
        >
      {/if}
    </fieldset>
    {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button
        type="button"
        class="button subtle"
        disabled={busy}
        onclick={(event) => event.currentTarget.closest('dialog')?.close()}>Cancel</button
      >
      <button type="submit" class="button primary" disabled={busy}
        >{busy ? 'Connecting…' : server ? 'Save' : 'Add server'}</button
      >
    </div>
  </form>
</dialog>
