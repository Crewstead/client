<script lang="ts">
  import { Monitor } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { computerProjects } from './api.ts';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  let { machine, changed }: { machine: MachineView; changed: (error?: string) => void } = $props();
  const computer = $derived(machine.computer);
  async function change(patch: { enabled?: false; commands?: boolean; browser?: boolean }) {
    try {
      await computerProjects.computer(machine.id, patch);
      changed();
    } catch (cause) {
      changed(cause instanceof Error ? cause.message : 'That did not work.');
    }
  }
  // Turned on only at the computer itself; from here it can be narrowed or turned off.
  const items = $derived<MenuItem[]>(
    computer
      ? [
          {
            label: 'Commands',
            checked: computer.commands,
            disabled: !computer.commands,
            hint: computer.commands
              ? 'Read-only ones in a sandbox; others ask, then run as you'
              : 'Turn on at the computer: crewstead computer commands on',
            run: () => change({ commands: false }),
          },
          {
            label: 'Browser',
            checked: computer.browser,
            disabled: !computer.browser,
            hint: computer.browser
              ? 'A headless browser on that computer'
              : 'Turn on at the computer: crewstead computer browser on',
            run: () => change({ browser: false }),
          },
          {
            label: 'Turn off whole computer',
            confirm: 'Turn off? Only the computer turns it on again',
            run: () => change({ enabled: false }),
          },
        ]
      : [],
  );
</script>

<li class="project-row whole-computer" aria-label={`Whole computer ${machine.name}`}>
  <Monitor size={15} />
  <span class="project-text">
    <span class="row-name">Whole computer</span>
    <span class="project-path"
      >{#if computer}Anywhere, as you; every change asks first{:else}Off · turn on at the computer:
        <code>crewstead computer on</code>{/if}</span
    >
  </span>
  {#if computer}
    <span class="project-allowed"
      >{['Files', computer.commands && 'commands', computer.browser && 'browser']
        .filter(Boolean)
        .join(', ')}</span
    >
    <RowMenu label="Settings for the whole computer" {items} disabled={!machine.online} />
  {/if}
</li>
