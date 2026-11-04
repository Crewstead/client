<script lang="ts">
  import PanelSection from './PanelSection.svelte';
  import { SquareTerminal } from '@lucide/svelte';
  import { useTerminals } from '#lib/terminals/terminals.svelte.ts';
  const terminals = useTerminals();
  const shells = $derived(terminals?.list.filter((entry) => entry.kind === 'shell') ?? []);
</script>

<!-- Shells opened from this chat, on its computer; and the way to open one. -->
{#if terminals && terminals.unavailable !== 'Terminals are for chats on a computer.'}
  <PanelSection
    id="terminals"
    label="Terminals"
    icon={SquareTerminal}
    count={shells.length || undefined}
    empty={!shells.length && !terminals.unavailable}
    add={terminals.typing
      ? { label: 'New terminal', run: () => terminals.open({ cols: 120, rows: 30 }) }
      : undefined}
  >
    {#if shells.length}<ul class="panel-list panel-watches">
        {#each shells as shell (shell.id)}
          <li data-working={!shell.ended || undefined}>
            <button class="panel-terminal" onclick={() => terminals.show(shell.id)}
              ><span class="panel-subagent-title">{shell.label}</span><small
                >{shell.ended ? `ended: ${shell.ended}` : 'running'}</small
              ></button
            >
          </li>
        {/each}
      </ul>{/if}
    {#if !terminals.typing && terminals.unavailable}<p class="panel-empty">
        {terminals.unavailable}
      </p>{:else if !shells.length}<p class="panel-empty">None open. + opens a shell here.</p>{/if}
  </PanelSection>
{/if}
