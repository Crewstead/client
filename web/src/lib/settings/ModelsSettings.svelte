<script lang="ts">
  import type { Model } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
  import SettingsHeading from '#lib/components/SettingsHeading.svelte';
  import EmptyState from '#lib/components/EmptyState.svelte';
  import { activeModules, panelsFor } from '#lib/modules/registry.ts';
  import '@crewstead/ui/settings-cards.css';
  const workspace = useWorkspace();
  const org = $derived(workspace.current?.kind === 'organisation' ? workspace.current : undefined);
  // Test models from the mock provider are for development; Settings lists real models only.
  const orgModels = $derived(
    (workspace.catalog?.models ?? []).filter(
      (model) => model.scope === 'org' && model.provider !== 'mock',
    ),
  );
  const allowed = $derived(workspace.catalog?.policy.allowPersonal ?? false);
  const personalSetup = $derived(
    panelsFor(activeModules(workspace.catalog?.modules), 'personal-models').length > 0,
  );
  const note = $derived(
    !org
      ? 'Your own providers and computers, for your Personal chats. Only you can use them.'
      : allowed
        ? `Your own models. ${org.label} allows using them here too.`
        : `Your own models, for your Personal workspace. ${org.label} does not allow them here.`,
  );
  // The hub labels provider models "name · connection"; the connection is shown on the right.
  const name = (model: Model) =>
    model.connection && model.label.endsWith(` · ${model.connection}`)
      ? model.label.slice(0, -` · ${model.connection}`.length)
      : model.label;
</script>

<SettingsHeading page title="Models"
  >The models your chats can use{org ? ` in ${org.label}` : ''}, and where they come from.</SettingsHeading
>

{#if org}
  <section class="settings-section" aria-label="Available organisation models">
    <SettingsHeading title={`Available in ${org.label}`} />
    <div class="settings-card">
      <ul aria-label="Available organisation models">
        {#each orgModels as model (model.id)}<li>
            <span class="row-name">{name(model)}</span><span class="row-meta"
              >{model.connection ?? model.provider}</span
            >
          </li>{:else}<li class="provider-empty">No models in {org.label} yet.</li>{/each}
      </ul>
    </div>
  </section>
{/if}

{#if personalSetup}
  <ModuleSlot slot="personal-models" props={{ note }} />
{:else}
  <section class="settings-section" aria-label="Personal models">
    <SettingsHeading title="Personal models" />
    <EmptyState text="Personal models are turned off on this hub." />
  </section>
{/if}

{#if !org && orgModels.length}
  <!-- Organisation models offered here because their organisation shares them; it pays for them. -->
  <section class="settings-section" aria-label="Shared by your organisations">
    <SettingsHeading title="Shared by your organisations"
      >Yours to use in Personal chats. Your organisations pay within their limits and see only
      spending, never your chats.</SettingsHeading
    >
    <div class="settings-card">
      <ul aria-label="Shared organisation models">
        {#each orgModels as model (model.id)}<li>
            <span class="row-name">{name(model)}</span><span class="row-meta"
              >{model.group ?? model.connection ?? model.provider}</span
            >
          </li>{/each}
      </ul>
    </div>
  </section>
{/if}

<ModuleSlot slot="models" props={{}} />
