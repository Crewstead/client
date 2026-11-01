<script lang="ts">
  import { Pencil, Plus, Trash2 } from '@lucide/svelte';
  import type { Skill, SkillScope, SkillsView } from '@crewstead/core/protocol';
  import { skills } from './api.ts';
  import SkillEditor from './SkillEditor.svelte';
  import '@crewstead/ui/switch.css';
  import '@crewstead/ui/skills.css';
  let view = $state<SkillsView>();
  let error = $state('');
  let editing = $state<{ scope: SkillScope; skill?: Skill }>();
  let confirming = $state('');
  async function refresh() {
    try {
      view = await skills.list();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load skills.';
    }
  }
  $effect(() => void refresh());
  async function act(action: () => Promise<unknown>) {
    error = '';
    try {
      await action();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That did not work.';
    }
    confirming = '';
    await refresh();
  }
  const sections = $derived([
    {
      scope: 'global' as const,
      title: 'For everyone on this hub',
      note: view?.canManageGlobal
        ? 'You own this hub, so you set these up for every account.'
        : 'Set up by the hub’s owner. A personal skill with the same name replaces one of these for you.',
      list: view?.skills.filter((skill) => skill.scope === 'global') ?? [],
      canAdd: !!view?.canManageGlobal,
    },
    {
      scope: 'personal' as const,
      title: 'Personal',
      note: 'Only you have these, in all your chats.',
      list: view?.skills.filter((skill) => skill.scope === 'personal') ?? [],
      canAdd: true,
    },
  ]);
</script>

<section class="settings-section" aria-label="Skills">
  <h2>Skills</h2>
  <p class="muted-text">
    Instructions for particular kinds of work. Models see each skill’s name and when to use it, and
    load the whole skill when a task needs it. Mention one as <code>@name</code> in a message, or turn
    it on for a chat from the prompt box, to keep it in use there.
  </p>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
  {#each sections as section (section.scope)}
    <div class="skill-section-header">
      <div>
        <h3>{section.title}</h3>
        <p>{section.note}</p>
      </div>
      {#if section.canAdd}<button
          class="button subtle small"
          onclick={() => (editing = { scope: section.scope })}><Plus size={14} /> New skill</button
        >{/if}
    </div>
    {#if section.list.length}
      <ul class="skill-list" aria-label={section.title}>
        {#each section.list as skill (skill.id)}
          <li class="skill-row" data-enabled={skill.enabled}>
            <span class="skill-row-text">
              <span class="skill-row-name"
                >{skill.name}{#if skill.always}<span class="pill">Every chat</span>{/if}</span
              >
              <span class="skill-row-description" title={skill.description}
                >{skill.description}</span
              >
            </span>
            {#if skill.editable}
              <input
                type="checkbox"
                class="switch"
                aria-label={`${skill.name} on`}
                checked={skill.enabled}
                onchange={(event) =>
                  act(() => skills.update(skill.id, { enabled: event.currentTarget.checked }))}
              />
              <button
                class="icon-button"
                aria-label={`Edit ${skill.name}`}
                onclick={() => (editing = { scope: skill.scope, skill })}
                ><Pencil size={14} /></button
              >
              {#if confirming === skill.id}<button
                  class="button danger small"
                  onclick={() => act(() => skills.remove(skill.id))}
                  onblur={() => (confirming = '')}
                  {@attach (node) => node.focus()}>Delete</button
                >{:else}<button
                  class="icon-button"
                  aria-label={`Delete ${skill.name}`}
                  onclick={() => (confirming = skill.id)}><Trash2 size={14} /></button
                >{/if}
            {:else if !skill.enabled}<span class="pill">Off</span>{/if}
          </li>
        {/each}
      </ul>
    {:else}<p class="skill-empty">No skills yet.</p>{/if}
  {/each}
</section>
{#if editing}<SkillEditor
    scope={editing.scope}
    {...editing.skill ? { skill: editing.skill } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void refresh();
    }}
  />{/if}
