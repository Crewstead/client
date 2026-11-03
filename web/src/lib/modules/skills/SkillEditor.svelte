<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { FileUp } from '@lucide/svelte';
  import { parseSkillFile, type Skill, type SkillScope } from '@crewstead/core/protocol';
  import { skills, type SkillFields } from './api.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/switch.css';
  import '@crewstead/ui/skills.css';
  let {
    skill,
    scope,
    close,
  }: {
    /** The skill to change; a new one when absent. */
    skill?: Skill;
    scope: SkillScope;
    /** Called when the editor closes; `saved` after a change was saved. */
    close: (saved: boolean) => void;
  } = $props();
  const id = $props.id();
  // The form starts from the skill being edited; later prop changes do not reset what was typed.
  const initial = (): SkillFields => ({
    name: skill?.name ?? '',
    description: skill?.description ?? '',
    instructions: skill?.instructions ?? '',
    enabled: skill?.enabled ?? true,
    always: skill?.always ?? false,
  });
  let fields = $state(initial());
  let busy = $state(false);
  let error = $state('');
  let saved = false;
  let picker: HTMLInputElement;
  /** Fills the form from a SKILL.md, keeping what the file does not say. */
  async function load(file: File | undefined) {
    if (!file) return;
    const parsed = parseSkillFile(await file.text());
    fields = {
      ...fields,
      name: parsed.name || fields.name || file.name.replace(/\.md$/i, '').toLowerCase(),
      description: parsed.description || fields.description,
      instructions: parsed.instructions,
    };
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      if (skill) await skills.update(skill.id, fields);
      else await skills.create(scope, fields);
      saved = true;
      (event.target as HTMLElement).closest('dialog')?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save the skill.';
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  {@attach closeOutside}
  class="dialog-content skill-editor"
  aria-labelledby={`${id}-title`}
  {@attach (node) => node.showModal()}
  onclose={() => close(saved)}
>
  <form onsubmit={submit}>
    <h2 id={`${id}-title`} class="dialog-title">
      <span
        >{skill
          ? `Edit ${skill.name}`
          : scope === 'global'
            ? 'New skill for everyone'
            : 'New skill'}</span
      >
      <button type="button" class="button subtle small" onclick={() => picker.click()}
        ><FileUp size={14} /> Import SKILL.md</button
      >
    </h2>
    <input
      bind:this={picker}
      type="file"
      accept=".md,text/markdown,text/plain"
      hidden
      onchange={(event) => {
        void load(event.currentTarget.files?.[0]);
        event.currentTarget.value = '';
      }}
    />
    <label class="skill-field"
      >Name
      <input
        bind:value={fields.name}
        required
        maxlength="64"
        pattern="[a-z0-9][a-z0-9\-]*"
        placeholder="write-tests"
        autocomplete="off"
        spellcheck="false"
        disabled={busy}
      />
      <small
        >Lowercase letters, digits and dashes. Mention it in a message as @{fields.name ||
          'name'}.</small
      >
    </label>
    <label class="skill-field"
      >When to use it
      <textarea
        bind:value={fields.description}
        required
        rows="2"
        maxlength="1000"
        placeholder="Write unit tests for new code. Use when adding or changing functions."
        disabled={busy}></textarea>
      <small>Models read only this to decide when to load the skill, so say when it applies.</small>
    </label>
    <label class="skill-field"
      >Instructions
      <textarea
        class="skill-instructions"
        bind:value={fields.instructions}
        required
        maxlength="60000"
        placeholder="# How to write tests here&#10;&#10;1. …"
        disabled={busy}></textarea>
    </label>
    <div class="skill-switches">
      <label class="skill-switch"
        ><input type="checkbox" class="switch" bind:checked={fields.enabled} disabled={busy} /> On</label
      >
      <label class="skill-switch" title="Load it into every chat instead of when it is needed"
        ><input type="checkbox" class="switch" bind:checked={fields.always} disabled={busy} /> In every
        chat</label
      >
    </div>
    {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button
        type="button"
        class="button subtle"
        disabled={busy}
        onclick={(event) => event.currentTarget.closest('dialog')?.close()}>Cancel</button
      >
      <button type="submit" class="button primary" disabled={busy}
        >{busy ? 'Saving…' : skill ? 'Save' : 'Add skill'}</button
      >
    </div>
  </form>
</dialog>
