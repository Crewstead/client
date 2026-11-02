<script lang="ts">
  import { Monitor } from '@lucide/svelte';
  import type { MachineView } from '@crewstead/core/protocol';
  import { computerProjects } from './api.ts';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  let { machine, changed }: { machine: MachineView; changed: (error?: string) => void } = $props();
  const computer = $derived(machine.computer);
  type Setting = 'enabled' | 'commands' | 'browser';
  /** Inside the Crewstead app on this very computer, which may also turn settings on. */
  const desktop = (
    globalThis as {
      crewsteadDesktop?: {
        thisComputer?: () => Promise<string | undefined>;
        computerSetting?: (key: Setting, on: boolean) => Promise<string>;
      };
    }
  ).crewsteadDesktop;
  let here = $state(false);
  $effect(() => {
    void desktop?.thisComputer?.().then((id) => (here = id === machine.id));
  });
  /** At the computer itself: on or off, done by the computer's own service. */
  async function set(key: Setting, on: boolean) {
    const problem = await desktop!.computerSetting!(key, on).catch(() => 'That did not work.');
    // The computer tells the hub a moment later.
    setTimeout(() => changed(problem || undefined), 1_200);
  }
  async function change(patch: { enabled?: false; commands?: boolean; browser?: boolean }) {
    try {
      await computerProjects.computer(machine.id, patch);
      changed();
    } catch (cause) {
      changed(cause instanceof Error ? cause.message : 'That did not work.');
    }
  }
  // Turned on only at the computer itself (here, in its own Crewstead app); from elsewhere it can
  // be narrowed or turned off.
  const items = $derived<MenuItem[]>(
    computer
      ? [
          {
            label: 'Commands',
            checked: computer.commands,
            disabled: !computer.commands && !here,
            hint: computer.commands
              ? 'Read-only ones in a sandbox; others ask, then run as you'
              : here
                ? 'Turn on: changes still ask first'
                : 'Turn on at the computer, in its Crewstead app',
            run: () => (computer.commands ? change({ commands: false }) : set('commands', true)),
          },
          {
            label: 'Browser',
            checked: computer.browser,
            disabled: !computer.browser && !here,
            hint: computer.browser
              ? 'A headless browser on that computer'
              : here
                ? 'Turn on a headless browser here'
                : 'Turn on at the computer, in its Crewstead app',
            run: () => (computer.browser ? change({ browser: false }) : set('browser', true)),
          },
          {
            label: 'Turn off whole computer',
            confirm: 'Turn off? Only the computer turns it on again',
            run: () => change({ enabled: false }),
          },
        ]
      : here
        ? [
            {
              label: 'Turn on whole computer',
              hint: 'Chats may work anywhere here, as you; every change asks first',
              run: () => set('enabled', true),
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
      >{#if computer}Anywhere, as you; every change asks first{:else if here}Off{:else}Off · turn on
        at the computer, in its Crewstead app{/if}</span
    >
  </span>
  {#if computer}
    <span class="project-allowed"
      >{['Files', computer.commands && 'commands', computer.browser && 'browser']
        .filter(Boolean)
        .join(', ')}</span
    >
    <RowMenu label="Settings for the whole computer" {items} disabled={!machine.online} />
  {:else if here}
    <RowMenu label="Settings for the whole computer" {items} />
  {/if}
</li>
