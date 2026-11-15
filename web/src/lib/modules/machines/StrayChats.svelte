<script lang="ts">
  import type { MachineView, Project } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  let { list }: { list: MachineView[] } = $props();
  const workspace = useWorkspace();
  let moving = $state('');
  let error = $state('');
  const machineOf = (projectId: string) => projectId.slice(0, projectId.indexOf(':'));
  /** The same place on another computer: its project of the same name, or its whole computer. */
  const twin = (projects: Project[], projectId: string, name: string | undefined) =>
    projects.find((project) =>
      projectId.endsWith(':computer') ? project.kind === 'computer' : project.name === name,
    );
  /**
   * Chats on a computer that is offline or gone (e.g. one connected again under a new id), with the
   * connected computer that has the most of their places: moving them is their owner's choice.
   */
  const strays = $derived.by(() => {
    const projects = workspace.catalog?.projects ?? [];
    const groups: Record<string, typeof workspace.sessions> = {};
    for (const chat of workspace.sessions) {
      if (!chat.projectId || projects.some((project) => project.id === chat.projectId)) continue;
      const machine = machineOf(chat.projectId);
      if (list.find((entry) => entry.id === machine)?.online) continue;
      groups[machine] = [...(groups[machine] ?? []), chat];
    }
    const targets = [...new Set(projects.map((project) => machineOf(project.id)))];
    return Object.entries(groups).flatMap(([machine, chats]) => {
      const best = targets
        .map((target) => {
          const there = projects.filter((project) => machineOf(project.id) === target);
          const moves = chats.flatMap((chat) => {
            const to = twin(there, chat.projectId!, chat.projectName);
            return to ? [{ chat: chat.id, to: to.id }] : [];
          });
          return { target, name: there[0]?.machine ?? 'a computer', moves };
        })
        .sort((a, b) => b.moves.length - a.moves.length)[0];
      if (!best?.moves.length) return [];
      const from = list.find((entry) => entry.id === machine)?.name;
      return [{ machine, from, count: chats.length, ...best }];
    });
  });
  async function move(stray: (typeof strays)[number]) {
    moving = stray.machine;
    error = '';
    try {
      for (const { chat, to } of stray.moves) await workspace.move(chat, to);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not move every chat.';
    } finally {
      moving = '';
    }
  }
</script>

{#each strays as stray (stray.machine)}
  <div class="settings-card stray-chats" role="group" aria-label="Chats on an offline computer">
    <p>
      {stray.count}
      {stray.count === 1 ? 'chat is' : 'chats are'} on {stray.from
        ? `${stray.from}, which is offline`
        : 'a computer that is no longer connected'}.
      {stray.moves.length === stray.count ? 'All' : stray.moves.length} of them have the same place on
      {stray.name}.
    </p>
    <button class="button primary small" disabled={!!moving} onclick={() => void move(stray)}
      >{moving === stray.machine ? 'Moving…' : `Move them to ${stray.name}`}</button
    >
  </div>
{/each}
{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
