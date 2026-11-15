<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { ChevronRight, Copy, Search } from '@lucide/svelte';
  import type { CreateMcpServer, McpServer } from '@crewstead/core/protocol';
  import { apiUrl } from '#lib/auth/connection.ts';
  import { mcpServers } from './api.ts';
  import { CATEGORIES, catalog, type CatalogEntry } from './catalog/index.ts';
  import McpIcon from './McpIcon.svelte';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/skills.css';
  import '@crewstead/ui/mcp.css';
  import '@crewstead/ui/providers.css';
  let {
    taken,
    custom,
    close,
  }: {
    /** Names of the servers already added. */
    taken: string[];
    /** Opens the form for a server by its address. */
    custom: () => void;
    /** `added` is set when one was added; `signIn` when it needs its owner to sign in now. */
    close: (added?: McpServer, signIn?: boolean) => void;
  } = $props();
  const id = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let query = $state('');
  let chosen = $state<CatalogEntry>();
  let key = $state('');
  let clientId = $state('');
  let clientSecret = $state('');
  let busy = $state(false);
  let error = $state('');
  let copied = $state(false);
  /** Where a service sends the owner back; given when setting up their own client. */
  const returnAddress = new URL(apiUrl('/mcp-oauth/callback'), window.location.href).toString();
  const groups = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = catalog.filter((entry) =>
      words.every((word) =>
        `${entry.name} ${entry.description} ${entry.category}`.toLowerCase().includes(word),
      ),
    );
    return CATEGORIES.map((title) => ({
      title,
      entries: found
        .filter((entry) => entry.category === title)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.entries.length);
  });
  /** Its catalog id, or the first free variant of it. */
  function nameFor(entry: CatalogEntry) {
    if (!taken.includes(entry.id)) return entry.id;
    for (let n = 2; ; n++) if (!taken.includes(`${entry.id}_${n}`)) return `${entry.id}_${n}`;
  }
  const ready = $derived(
    !chosen ||
      (chosen.auth.kind === 'key' && key.trim().length > 0) ||
      (chosen.auth.kind === 'own-client' && clientId.trim().length > 0) ||
      chosen.auth.kind === 'oauth' ||
      chosen.auth.kind === 'none',
  );
  async function connect(event: SubmitEvent) {
    event.preventDefault();
    if (!chosen) return;
    const auth = chosen.auth;
    const input: CreateMcpServer = {
      name: nameFor(chosen),
      url: chosen.url,
      ...(auth.kind === 'key'
        ? { headers: [{ name: auth.header, value: `${auth.prefix}${key.trim()}` }] }
        : {}),
      ...(auth.kind === 'own-client'
        ? {
            client: {
              id: clientId.trim(),
              ...(clientSecret.trim() ? { secret: clientSecret.trim() } : {}),
            },
          }
        : {}),
    };
    busy = true;
    error = '';
    try {
      const added = await mcpServers.create(input);
      key = clientSecret = '';
      close(added, !!added.signIn && !added.signIn.signedIn);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not add it.';
    } finally {
      busy = false;
    }
  }
  async function copy() {
    await navigator.clipboard.writeText(returnAddress);
    copied = true;
    setTimeout(() => (copied = false), 1_500);
  }
</script>

<dialog
  {@attach closeOutside}
  {@attach (node) => node.showModal()}
  bind:this={dialog}
  class="dialog-content wide-dialog"
  aria-labelledby={`${id}-title`}
  onclose={() => close()}
>
  {#if !chosen}
    <div class="provider-pick" role="group" aria-label="Choose a service">
      <h2 id={`${id}-title`} class="dialog-title">Add an MCP server</h2>
      <label class="skill-search">
        <Search size={15} />
        <span class="sr-only">Search services</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="search" bind:value={query} placeholder="Search" autofocus />
      </label>
      <ul class="skill-results provider-results" aria-label="Services">
        {#each groups as group (group.title)}
          <li class="skill-group" aria-hidden="true">{group.title}</li>
          {#each group.entries as entry (entry.id)}
            <li>
              <button
                type="button"
                class="skill-result provider-result"
                onclick={() => {
                  chosen = entry;
                  error = '';
                }}
                ><McpIcon {entry} name={entry.name} /><span class="skill-result-text"
                  ><strong
                    >{entry.name}{#if entry.preview}<span class="mcp-tag">Preview</span
                      >{/if}</strong
                  ><small>{entry.description}</small></span
                ><ChevronRight size={14} aria-hidden="true" /></button
              >
            </li>
          {/each}
        {/each}
        <li class="skill-group" aria-hidden="true">Other</li>
        <li>
          <button
            type="button"
            class="skill-result provider-result"
            onclick={() => {
              dialog?.close();
              custom();
            }}
            ><McpIcon name="+" /><span class="skill-result-text"
              ><strong>Custom server</strong><small>Any MCP server by its address</small></span
            ><ChevronRight size={14} aria-hidden="true" /></button
          >
        </li>
      </ul>
      <div class="dialog-actions">
        <button type="button" class="button subtle" onclick={() => dialog?.close()}>Cancel</button>
      </div>
    </div>
  {:else}
    <form onsubmit={connect} aria-label={`Connect ${chosen.name}`}>
      <h2 id={`${id}-title`} class="dialog-title mcp-connect-title">
        <McpIcon entry={chosen} name={chosen.name} size={22} />Connect {chosen.name}
      </h2>
      {#if chosen.auth.kind === 'own-client'}
        <p class="dialog-description">
          {chosen.name} needs your own app.
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the vendor's page -->
          <a href={chosen.docs} target="_blank" rel="noopener noreferrer">Create one</a> with this
          return address{chosen.category === 'Google'
            ? ' and “Use this client for an AI-powered agent” ticked'
            : ''}.
        </p>
        <div class="copy-line">
          <code>{returnAddress}</code>
          <button
            type="button"
            class="icon-button"
            aria-label="Copy the return address"
            onclick={copy}><Copy size={14} /></button
          >{#if copied}<span class="mcp-copied" role="status">Copied</span>{/if}
        </div>
      {/if}
      {#if chosen.auth.kind === 'key' || chosen.auth.kind === 'own-client'}
        <div class="field-grid dialog-fields">
          {#if chosen.auth.kind === 'key'}
            <label for={`${id}-key`}>{chosen.auth.label}</label>
            <input
              id={`${id}-key`}
              type="password"
              bind:value={key}
              autocomplete="off"
              disabled={busy}
            />
          {:else}
            <label for={`${id}-client`}>Client ID</label>
            <input id={`${id}-client`} bind:value={clientId} autocomplete="off" disabled={busy} />
            <label for={`${id}-secret`}>Client secret</label>
            <input
              id={`${id}-secret`}
              type="password"
              bind:value={clientSecret}
              autocomplete="off"
              disabled={busy}
            />
          {/if}
        </div>
      {/if}
      {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
      <div class="dialog-actions">
        <button
          type="button"
          class="link-button dialog-back"
          onclick={() => {
            chosen = undefined;
            error = '';
          }}
          disabled={busy}>Back</button
        >
        <button type="button" class="button subtle" onclick={() => dialog?.close()} disabled={busy}
          >Cancel</button
        >
        <button type="submit" class="button primary" disabled={busy || !ready}
          >{busy ? 'Connecting…' : 'Connect'}</button
        >
      </div>
    </form>
  {/if}
</dialog>
