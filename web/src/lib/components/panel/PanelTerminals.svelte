<script lang="ts">
  import PanelSection from './PanelSection.svelte';
  import { Plus, SquareTerminal } from '@lucide/svelte';
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
  >
    {#if shells.length}<ul class="panel-list panel-watches">
        {#each shells as shell (shell.id)}
          <li>
            <button class="panel-terminal" onclick={() => terminals.show(shell.id)}
              ><span class="panel-subagent-title">{shell.label}</span><small
                >{shell.ended ? `ended: ${shell.ended}` : 'running'}</small
              ></button
            >
          </li>
        {/each}
      </ul>{/if}
    {#if terminals.typing}<button
        class="button subtle small"
        onclick={() => terminals.open({ cols: 120, rows: 30 })}
        ><Plus size={14} /> New terminal</button
      >{:else if terminals.unavailable}<p class="panel-empty">{terminals.unavailable}</p>{/if}
  </PanelSection>
{/if}
