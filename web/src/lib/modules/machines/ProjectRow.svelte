<script lang="ts">
  import { Folder } from '@lucide/svelte';
  import type { MachineProject, ProjectRules } from '@crewstead/core/protocol';
  import { computerProjects } from './api.ts';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  let {
    machineId,
    project,
    sandbox,
    browser,
    online,
    changed,
  }: {
    machineId: string;
    project: MachineProject;
    /** Commands can run on that computer at all. */
    sandbox: boolean;
    /** A browser is installed on that computer. */
    browser: boolean;
    online: boolean;
    changed: (error?: string) => void;
  } = $props();
  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      changed();
    } catch (cause) {
      changed(cause instanceof Error ? cause.message : 'That did not work.');
    }
  }
  const setRule = (rule: keyof ProjectRules, value: boolean) =>
    act(() => computerProjects.update(machineId, project.id, { rules: { [rule]: value } }));
  const commands = $derived(project.rules.commands);
  const browsing = $derived(browser && project.rules.browser);
  const network = $derived(project.rules.network && (commands || browsing));
  const git = $derived(commands && !!project.rules.git);
  /** What the project allows, as quiet text: "Files, commands, Git, browser, network". */
  const allowed = $derived(
    ['Files', commands && 'commands', git && 'Git', browsing && 'browser', network && 'network']
      .filter(Boolean)
      .join(', '),
  );
  // Without a sandbox on that computer (no bubblewrap) commands run as the owner, each one approved.
  const items = $derived<MenuItem[]>([
    {
      label: 'Commands',
      checked: project.rules.commands,
      hint: sandbox
        ? 'In the sandbox, each one approved or reviewed'
        : 'No sandbox: as you, each approved by you',
      run: () => setRule('commands', !project.rules.commands),
    },
    {
      label: 'Git',
      checked: git,
      disabled: !commands,
      hint: !commands
        ? 'Turn on commands first'
        : sandbox
          ? 'Commands may commit and branch; hooks and Git config stay read-only'
          : 'Commands may commit and branch',
      run: () => setRule('git', !project.rules.git),
    },
    ...(browser
      ? [
          {
            label: 'Browser',
            checked: project.rules.browser,
            run: () => setRule('browser', !project.rules.browser),
          },
        ]
      : []),
    {
      label: 'Network',
      checked: network,
      disabled: !(commands || browsing),
      hint:
        commands || browsing
          ? 'Reach other computers; without it only localhost'
          : 'Turn on commands or the browser first',
      run: () => setRule('network', !project.rules.network),
    },
    {
      label: 'Remove project',
      confirm: 'Remove? Its files stay',
      run: () => act(() => computerProjects.remove(machineId, project.id)),
    },
  ]);
</script>

<li class="project-row">
  <Folder size={15} />
  <span class="project-text">
    <span class="row-name">{project.name}</span>
    <span class="project-path" title={project.path}>{project.path}</span>
  </span>
  <span class="project-allowed">{allowed}</span>
  <RowMenu label={`Settings for ${project.name}`} {items} disabled={!online} />
</li>
