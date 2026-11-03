<script lang="ts">
  import { Plus, SquareTerminal, X } from '@lucide/svelte';
  import { useTerminals } from './terminals.svelte.ts';
  import TerminalView from './TerminalView.svelte';
  import '@crewstead/ui/terminals.css';
  const terminals = useTerminals();
  /** Why each shown terminal ended, as its stream says (sooner than the list). */
  let ended = $state<Record<string, string | undefined>>({});
  const active = $derived(terminals?.active ? terminals.find(terminals.active) : undefined);
</script>

<!-- The chat's terminals the owner opened, under the chat: one in front, the others as tabs. -->
{#if terminals && terminals.shown.length}
  <section class="terminal-drawer" aria-label="Terminals">
    <header>
      <div class="terminal-tabs" role="tablist" aria-label="Open terminals">
        {#each terminals.shown as id (id)}
          {@const info = terminals.find(id)}
          <span class="terminal-tab" class:active={terminals.active === id}
            ><button
              role="tab"
              aria-selected={terminals.active === id}
              onclick={() => (terminals.active = id)}
              ><SquareTerminal size={13} />{info?.label ?? id}{#if ended[id] ?? info?.ended}<small
                  >ended</small
                >{/if}</button
            ><button
              class="terminal-tab-close"
              aria-label={`Hide ${info?.label ?? id}`}
              title="Hide (it keeps running)"
              onclick={() => terminals.hide(id)}><X size={12} /></button
            ></span
          >
        {/each}
      </div>
      {#if terminals.typing}<button
          class="icon-button"
          aria-label="New terminal"
          title="New terminal"
          onclick={() => terminals.open({ cols: 120, rows: 30 })}><Plus size={15} /></button
        >{/if}
      {#if active && !(ended[active.id] ?? active.ended)}<button
          class="button subtle small"
          onclick={() => terminals.close(active.id)}
          >{active.kind === 'watch' ? 'Stop command' : 'End terminal'}</button
        >{/if}
    </header>
    {#if !terminals.typing}<p class="terminal-note">
        Watching only. {terminals.unavailable}
      </p>{/if}
    {#if terminals.error}<p class="terminal-note failed" role="alert">{terminals.error}</p>{/if}
    {#each terminals.shown as id (id)}
      <div class="terminal-pane" hidden={terminals.active !== id}>
        <TerminalView {id} typing={terminals.typing} bind:ended={ended[id]} />
      </div>
    {/each}
  </section>
{/if}
