<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { Check, Plus, Search, User, Users, X } from '@lucide/svelte';
  import type { Skill } from '@crewstead/core/protocol';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/skills.css';
  let {
    skills,
    added,
    always,
    add,
    remove,
    close,
  }: {
    /** Skills that can be added to the chat. */
    skills: Skill[];
    /** Names added to this chat. */
    added: string[];
    /** Names on in every chat (Settings → Skills); not removed here. */
    always: string[];
    add: (name: string) => void;
    remove: (name: string) => void;
    close: () => void;
  } = $props();
  const id = $props.id();
  let query = $state('');
  let active = $state(0);
  let list = $state<HTMLUListElement>();
  const found = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (
      skills
        .filter((skill) => {
          const text = `${skill.name} ${skill.description}`.toLowerCase();
          return words.every((word) => text.includes(word));
        })
        // Personal first, then for everyone; rows stay put as skills are added or removed.
        .sort((a, b) => Number(a.scope === 'global') - Number(b.scope === 'global'))
    );
  });
  const groups = $derived(
    [
      {
        title: 'Personal',
        icon: User,
        skills: found.filter((skill) => skill.scope === 'personal'),
      },
      {
        title: 'For everyone',
        icon: Users,
        skills: found.filter((skill) => skill.scope === 'global'),
      },
    ].filter((group) => group.skills.length),
  );
  const on = (name: string) => added.includes(name) || always.includes(name);
  const addedHere = $derived(skills.filter((skill) => on(skill.name)).length);
  /** Enter, or the row's button: adds a skill, or removes one added here. */
  function choose(skill: Skill) {
    if (always.includes(skill.name)) return;
    if (added.includes(skill.name)) remove(skill.name);
    else add(skill.name);
  }
  $effect(() => {
    void query;
    active = 0;
  });
  function move(step: number) {
    if (!found.length) return;
    active = (active + step + found.length) % found.length;
    queueMicrotask(() =>
      list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }),
    );
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const skill = found[active];
      if (skill) choose(skill);
    }
  }
</script>

<dialog
  {@attach closeOutside}
  class="dialog-content add-skill-dialog"
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-note`}
  {@attach (node) => node.showModal()}
  onclose={close}
>
  <header class="add-skill-header">
    <div>
      <h2 id={`${id}-title`} class="dialog-title">Add skills</h2>
      <p id={`${id}-note`} class="dialog-description">
        Added skills go with every reply in this chat.
      </p>
    </div>
    <button
      class="icon-button"
      aria-label="Close"
      onclick={(event) => event.currentTarget.closest('dialog')?.close()}><X size={16} /></button
    >
  </header>
  <label class="skill-search">
    <Search size={15} />
    <span class="sr-only">Search skills</span>
    <input
      type="search"
      bind:value={query}
      onkeydown={keydown}
      placeholder="Search skills by name or purpose…"
      autocomplete="off"
      aria-controls={`${id}-results`}
      aria-activedescendant={found[active] ? `${id}-${found[active].id}` : undefined}
      {@attach (node) => node.focus()}
    />
    <span class="skill-search-count">{found.length} of {skills.length}</span>
  </label>
  <ul class="skill-results" id={`${id}-results`} aria-label="Skills" bind:this={list}>
    {#each groups as group (group.title)}
      <li class="skill-group" aria-hidden="true"><group.icon size={12} />{group.title}</li>
      {#each group.skills as skill (skill.id)}
        {@const index = found.indexOf(skill)}
        <li
          id={`${id}-${skill.id}`}
          class="skill-result"
          class:active={index === active}
          data-index={index}
          onpointermove={() => (active = index)}
        >
          <span class="skill-result-text"
            ><code>{skill.name}</code><small>{skill.description}</small></span
          >
          {#if always.includes(skill.name)}<span class="skill-added" title="On in every chat"
              >Every chat</span
            >{:else if added.includes(skill.name)}<button
              class="icon-button skill-toggle skill-on"
              aria-label={`Remove ${skill.name}`}
              title="Added · click to remove"
              onclick={() => choose(skill)}
              ><Check size={15} class="when-idle" /><X size={15} class="when-hover" /></button
            >{:else}<button
              class="icon-button skill-toggle"
              aria-label={`Add ${skill.name}`}
              title="Add to this chat"
              onclick={() => choose(skill)}><Plus size={15} /></button
            >{/if}
        </li>
      {/each}
    {:else}
      <li class="skill-none">
        <Search size={20} />
        <strong>No skill matches “{query}”</strong>
        <span>Try other words, or create one in Settings → Skills.</span>
      </li>
    {/each}
  </ul>
  <footer class="add-skill-footer">
    <span
      >{addedHere
        ? `${addedHere} skill${addedHere === 1 ? '' : 's'} active here`
        : 'None active here yet'}</span
    >
    <button
      class="button subtle small"
      onclick={(event) => event.currentTarget.closest('dialog')?.close()}>Done</button
    >
  </footer>
</dialog>
