<script lang="ts">
  import { SquareTerminal } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { computerProjects } from './api.ts';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  let { machine, changed }: { machine: MachineView; changed: (error?: string) => void } = $props();
  /** Inside the Crewstead app on this very computer, which may also turn terminals on. */
  const desktop = (
    globalThis as {
      crewsteadDesktop?: {
        thisComputer?: () => Promise<string | undefined>;
        computerSetting?: (key: 'terminals', on: boolean) => Promise<string>;
      };
    }
  ).crewsteadDesktop;
  let here = $state(false);
  $effect(() => {
    void desktop?.thisComputer?.().then((id) => (here = id === machine.id));
  });
  async function turnOn() {
    const problem = await desktop!.computerSetting!('terminals', true).catch(
      () => 'That did not work.',
    );
    // The computer tells the hub a moment later.
    setTimeout(() => changed(problem || undefined), 1_200);
  }
  async function turnOff() {
    try {
      await computerProjects.computer(machine.id, { terminals: false });
      changed();
    } catch (cause) {
      changed(cause instanceof Error ? cause.message : 'That did not work.');
    }
  }
  // Like the whole computer: on only at the computer itself, off from anywhere.
  const items = $derived<MenuItem[]>(
    machine.terminals
      ? [
          {
            label: 'Turn off terminals',
            confirm: 'Turn off? Only the computer turns them on again',
            run: turnOff,
          },
        ]
      : here
        ? [
            {
              label: 'Turn on terminals',
              hint: 'Open shells here from any device: in projects (sandboxed) and the whole computer (as you)',
              run: turnOn,
            },
          ]
        : [],
  );
</script>

<li class="project-row whole-computer" aria-label={`Terminals on ${machine.name}`}>
  <SquareTerminal size={15} />
  <span class="project-text">
    <span class="row-name">Terminals</span>
    <span class="project-path"
      >{#if machine.terminals}On: open shells and type into commands from any device{:else if here}Off{:else}Off
        · turn on at the computer, in its Crewstead app{/if}</span
    >
  </span>
  {#if items.length}<RowMenu label="Settings for terminals" {items} />{/if}
</li>
