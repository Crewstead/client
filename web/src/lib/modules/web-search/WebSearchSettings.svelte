<script lang="ts">
  import type { WebSearchView } from '@crewstead/core/protocol';
  import { request } from '#lib/api.ts';
  import ChoicePicker from '#lib/components/ChoicePicker.svelte';
  import '@crewstead/ui/settings-cards.css';
  import '@crewstead/ui/providers.css';
  import '@crewstead/ui/projects.css';
  let view = $state<WebSearchView>();
  let mode = $state<WebSearchView['mode']>('off');
  let address = $state('');
  let busy = $state(false);
  let error = $state('');
  async function load() {
    try {
      view = await request<WebSearchView>('/web-search');
      mode = view.mode;
      address = view.url;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load.';
    }
  }
  $effect(() => {
    void load();
  });
  // While the hub's own search starts (its first start downloads it) or is being checked, look again.
  $effect(() => {
    if (!view?.starting && !view?.checking) return;
    const timer = setTimeout(load, 3_000);
    return () => clearTimeout(timer);
  });
  async function save(next: WebSearchView['mode']) {
    busy = true;
    error = '';
    try {
      view = await request<WebSearchView>('/web-search', {
        method: 'PATCH',
        body: JSON.stringify(
          next === 'address' ? { mode: next, url: address.trim() } : { mode: next },
        ),
      });
      mode = view.mode;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    } finally {
      busy = false;
    }
  }
  // One short line; the details (which engines refuse, and why) show on hover.
  const where = $derived(view?.mode === 'hub' ? 'On this hub' : 'At an address');
  const shown = $derived.by((): { text: string; dot: string; detail?: string } => {
    if (!view || view.mode === 'off') return { text: 'Off', dot: '' };
    if (view.starting || (busy && mode === 'hub'))
      return { text: `${where} · Starting… (the first time downloads SearXNG)`, dot: 'warning' };
    if (view.checking) return { text: `${where} · Checking…`, dot: '' };
    if (!view.working)
      return {
        text: `${where} · Not working`,
        dot: 'failed',
        detail: [view.problem, ...(view.limited ?? [])].filter(Boolean).join('\n'),
      };
    const limited = view.limited?.length ?? 0;
    if (!limited) return { text: `${where} · Working`, dot: 'online' };
    return {
      text: `${where} · Working · ${limited} engine${limited === 1 ? '' : 's'} limited`,
      dot: 'warning',
      detail: `Refusing this hub for now; others answer:\n${view.limited!.join('\n')}`,
    };
  });
</script>

{#if view}
  <li aria-label="Web search">
    <span class="project-text">
      <span
        class="row-name"
        title="Chats search through SearXNG, which asks Google, Bing, DuckDuckGo and more, and read pages as text: much cheaper than the browser. Pages load from public addresses only."
        >Web search</span
      >
      <span class="row-status" title={shown.detail}
        ><span class="status-dot {shown.dot}"></span>{shown.text}</span
      >
      {#if error}<span class="row-error" role="alert">{error}</span>{/if}
    </span>
    <ChoicePicker
      label="Where searches go"
      value={mode}
      disabled={!view.canManage || busy}
      choices={[
        {
          value: 'hub',
          label: 'Run on this hub',
          note: view.podman ? 'The hub starts SearXNG with itself' : 'Needs Podman on the server',
          disabled: !view.podman,
        },
        { value: 'address', label: 'Use an address', note: 'A SearXNG you run elsewhere' },
        { value: 'off', label: 'Off', note: 'Chats get no search tools' },
      ]}
      choose={(next) => {
        mode = next;
        if (next !== 'address') void save(next);
      }}
    />
  </li>
  {#if mode === 'address'}
    <li>
      <form
        class="address-form"
        onsubmit={(event) => {
          event.preventDefault();
          void save('address');
        }}
      >
        <input
          aria-label="SearXNG address"
          placeholder="https://search.example.com"
          bind:value={address}
          disabled={!view.canManage || busy}
        />
        <button class="button subtle small" disabled={busy || !view.canManage}>Save</button>
      </form>
    </li>
  {/if}
{/if}
