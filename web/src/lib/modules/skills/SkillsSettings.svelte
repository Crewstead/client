<script lang="ts">
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import LoadingRows from '#lib/components/LoadingRows.svelte';
  import { Plus } from '@lucide/svelte';
  import RowMenu, { type MenuItem } from '#lib/components/RowMenu.svelte';
  import type { Skill, SkillScope, SkillsView } from '@crewstead/core/protocol';
  import { skills } from './api.ts';
  import SkillEditor from './SkillEditor.svelte';
  import '@crewstead/ui/switch.css';
  import '@crewstead/ui/skills.css';
  let view = $state<SkillsView>();
  let error = $state('');
  let editing = $state<{ scope: SkillScope; skill?: Skill }>();
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
    await refresh();
  }
  const menu = (skill: Skill): MenuItem[] => [
    {
      label: 'On',
      checked: skill.enabled,
      hint: 'Offered in chats',
      run: () => act(() => skills.update(skill.id, { enabled: !skill.enabled })),
    },
    {
      label: 'Edit',
      hint: 'Name, description and instructions',
      run: () => (editing = { scope: skill.scope, skill }),
    },
    {
      label: 'Delete',
      confirm: 'Delete? Click again to confirm.',
      run: () => act(() => skills.remove(skill.id)),
    },
  ];
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

<SettingsHeading page title="Skills">
  Instructions for particular kinds of work, which models load when a task needs them. Mention one
  as
  <code>@name</code> in a message, or keep it on for a chat from the prompt box.
</SettingsHeading>
{#if error}<p class="error-banner" role="alert">{error}</p>{/if}
{#each sections as section (section.scope)}
  <section class="settings-section" aria-label={section.title}>
    <SettingsHeading title={section.title}
      >{section.note}{#snippet action()}{#if section.canAdd}<button
            class="button subtle small"
            onclick={() => (editing = { scope: section.scope })}
            ><Plus size={14} aria-hidden="true" />New skill</button
          >{/if}{/snippet}</SettingsHeading
    >
    {#if !view}
      <div class="settings-card"><LoadingRows label={`Loading ${section.title}`} /></div>
    {:else if section.list.length}
      <ul class="settings-card skill-list" aria-label={section.title}>
        {#each section.list as skill (skill.id)}
          <li class="skill-row" data-enabled={skill.enabled}>
            <span class="skill-row-text">
              <span class="skill-row-name"
                >{skill.name}{#if skill.always}<span class="pill">Every chat</span
                  >{/if}{#if !skill.enabled && skill.editable}<span class="pill">Off</span
                  >{/if}</span
              >
              <span class="skill-row-description" title={skill.description}
                >{skill.description}</span
              >
            </span>
            {#if skill.editable}
              <RowMenu
                label={`Settings for ${skill.name}`}
                title={skill.name}
                items={menu(skill)}
              />
            {:else if !skill.enabled}<span class="pill">Off</span>{/if}
          </li>
        {/each}
      </ul>
    {:else}<EmptyState
        text={section.canAdd ? 'No skills yet. New skill writes one.' : 'No skills here yet.'}
      />{/if}
  </section>
{/each}
{#if editing}<SkillEditor
    scope={editing.scope}
    {...editing.skill ? { skill: editing.skill } : {}}
    close={(saved) => {
      editing = undefined;
      if (saved) void refresh();
    }}
  />{/if}
