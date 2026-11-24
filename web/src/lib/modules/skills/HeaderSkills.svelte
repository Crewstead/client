<script lang="ts">
  import { resolve } from '$app/paths';
  import { Lock, Search, Settings2, Sparkles } from '@lucide/svelte';
  import { mentionedSkills, type Session } from '@crewstead/core/protocol';
  import HeaderPopover from '#lib/components/HeaderPopover.svelte';
  import { chatSkills } from './chat-skills.svelte.ts';
  import '@crewstead/ui/skills.css';
  import '@crewstead/ui/switch.css';
  let { session }: { session: Session } = $props();
  $effect(() => void chatSkills.load(session.id));
  let open = $state(false);
  let query = $state('');
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
  /**
   * Each skill with whether it is on and why. The switch adds or removes it for this chat; one on for
   * another reason (every chat, mentioned, loaded by the model) shows locked on, with that reason.
   */
  const rows = $derived(
    chatSkills.available.map((skill) => {
      const added = chosen.includes(skill.name);
      const held = [
        skill.always && 'every chat',
        mentioned.has(skill.name) && 'mentioned',
        loaded.has(skill.name) && 'loaded by the model',
      ].filter((reason): reason is string => !!reason);
      return { skill, added, held, on: added || held.length > 0 };
    }),
  );
  const count = $derived(rows.filter((row) => row.on).length);
  const words = $derived(query.trim().toLowerCase());
  const shown = $derived(
    rows.filter(
      (row) =>
        !words ||
        row.skill.name.toLowerCase().includes(words) ||
        row.skill.description.toLowerCase().includes(words),
    ),
  );
</script>

{#snippet row(entry: (typeof rows)[number])}
  {@const locked = !entry.added && entry.held.length > 0}
  <label class="menu-item skill-toggle" title={entry.skill.description}>
    <Sparkles size={14} />
    <span class="menu-text"
      ><span>{entry.skill.name}</span>{#if entry.held.length}<small>{entry.held.join(' · ')}</small
        >{/if}</span
    >
    {#if locked}<Lock size={12} class="skill-lock" />{/if}
    <input
      type="checkbox"
      role="switch"
      class="switch"
      checked={entry.on}
      disabled={locked}
      aria-label={`${entry.skill.name} in this chat`}
      onchange={(event) =>
        chatSkills.toggle(session.id, entry.skill.name, event.currentTarget.checked)}
    />
  </label>
{/snippet}

{#if chatSkills.available.length}
  <HeaderPopover
    bind:open
    label={count ? `Skills, ${count} on` : 'Skills'}
    heading="Skills in this chat"
    title={count ? `Skills in this chat: ${count} on` : 'Skills in this chat'}
  >
    {#snippet button()}<Sparkles size={17} />{#if count}<span class="header-tool-value"
          >{count}</span
        >{/if}{/snippet}
    {#if chatSkills.available.length > 6}<div class="popover-search">
        <Search size={14} />
        <!-- svelte-ignore a11y_autofocus -->
        <input aria-label="Find a skill" placeholder="Find a skill" autofocus bind:value={query} />
      </div>{/if}
    <div class="popover-body">
      {#if shown.some((entry) => entry.on)}<p class="menu-group">On in this chat</p>{/if}
      {#each shown.filter((entry) => entry.on) as entry (entry.skill.id)}{@render row(entry)}{/each}
      {#if shown.some((entry) => !entry.on)}<p class="menu-group">Off</p>{/if}
      {#each shown.filter((entry) => !entry.on) as entry (entry.skill.id)}{@render row(
          entry,
        )}{/each}
      {#if !shown.length}<p class="popover-empty">Nothing matches “{query.trim()}”.</p>{/if}
      {#if chatSkills.error}<p class="popover-empty failed" role="alert">{chatSkills.error}</p>{/if}
    </div>
    <div class="popover-foot">
      <a href={resolve('/settings?tab=skills')} onclick={() => (open = false)}
        ><Settings2 size={14} />Manage skills</a
      >
    </div>
  </HeaderPopover>
{/if}
