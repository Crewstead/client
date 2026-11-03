<script lang="ts">
  import PanelSection from '#lib/components/panel/PanelSection.svelte';
  import { Sparkles, X } from '@lucide/svelte';
  import AddSkillDialog from './AddSkillDialog.svelte';
  import { resolve } from '$app/paths';
  import { mentionedSkills, type Session } from '@crewstead/core/protocol';
  import { chatSkills } from './chat-skills.svelte.ts';
  import '@crewstead/ui/skills.css';
  let { session }: { session: Session } = $props();
  $effect(() => void chatSkills.load(session.id));
  const chosen = $derived(chatSkills.chosen[session.id] ?? []);
  const mentioned = $derived(
    new Set(
      session.items.flatMap((item) => (item.role === 'user' ? mentionedSkills(item.text) : [])),
    ),
  );
  // Skills the model loaded itself, with use_skill.
  const loaded = $derived(
    new Set(
      session.items.flatMap((item) => {
        if (item.toolName !== 'use_skill' || item.status !== 'completed') return [];
        try {
          return [String(JSON.parse(item.arguments ?? '{}').name)];
        } catch {
          return [];
        }
      }),
    ),
  );
  /** Active skills with why each is active; the others can be added to this chat. */
  const active = $derived(
    chatSkills.available.flatMap((skill) => {
      const reasons = [
        skill.always && 'Every chat',
        chosen.includes(skill.name) && 'Added to this chat',
        mentioned.has(skill.name) && 'Mentioned',
        loaded.has(skill.name) && 'Loaded by the model',
      ].filter((reason): reason is string => !!reason);
      return reasons.length ? [{ skill, reasons }] : [];
    }),
  );
  let adding = $state(false);
</script>

<PanelSection
  id="skills"
  label="Active skills"
  icon={Sparkles}
  count={active.length || undefined}
  empty={!active.length}
  add={{ label: 'Add skill', run: () => (adding = true) }}
>
  {#if active.length}
    <!-- A long list scrolls within its section. -->
    <ul class="panel-list panel-skill-list" aria-label="Active skills in this chat">
      {#each active as { skill, reasons } (skill.id)}
        <li class="panel-skill" title={skill.description}>
          <span class="panel-skill-text"
            ><code>{skill.name}</code><small>{reasons.join(' · ')}</small></span
          >
          {#if chosen.includes(skill.name)}<button
              class="icon-button"
              aria-label={`Remove ${skill.name} from this chat`}
              title="Remove from this chat"
              onclick={() => chatSkills.toggle(session.id, skill.name, false)}
              ><X size={13} /></button
            >{/if}
        </li>
      {/each}
    </ul>
  {:else}<p class="panel-empty">
      None yet. Add one here or mention it as @name; others load when the model needs them.
    </p>{/if}
  {#if chatSkills.error}<p class="panel-empty failed" role="alert">{chatSkills.error}</p>{/if}
  <div class="panel-actions">
    <a class="panel-link" href={resolve('/settings?tab=skills')}>Manage skills</a>
  </div>
</PanelSection>
{#if adding}<AddSkillDialog
    skills={chatSkills.available}
    added={chosen}
    always={chatSkills.available.filter((skill) => skill.always).map((skill) => skill.name)}
    add={(name) => chatSkills.toggle(session.id, name, true)}
    remove={(name) => chatSkills.toggle(session.id, name, false)}
    close={() => (adding = false)}
  />{/if}
