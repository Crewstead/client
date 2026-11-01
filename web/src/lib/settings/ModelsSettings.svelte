<script lang="ts">
  import type { Model } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import ModuleSlot from '#lib/modules/ModuleSlot.svelte';
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
      ? 'Your own models. Anyone can connect a provider and use them in their Personal workspace.'
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

{#if org}
  <section class="settings-section" aria-label="Available organisation models">
    <h2>Available in {org.label}</h2>
    <div class="settings-card">
      <ul aria-label="Available organisation models">
        {#each orgModels as model (model.id)}<li>
            <span class="row-name">{name(model)}</span><span class="row-meta"
              >{model.connection ?? model.provider}</span
            >
          </li>{:else}<li>
            <p class="muted-text empty-note">No models in {org.label} yet.</p>
          </li>{/each}
      </ul>
    </div>
  </section>
{/if}

{#if personalSetup}
  <ModuleSlot slot="personal-models" props={{ note }} />
{:else}
  <section class="settings-section" aria-label="Personal models">
    <h2>Personal models</h2>
    <p class="muted-text">Personal models are turned off on this server.</p>
  </section>
{/if}

<ModuleSlot slot="models" props={{}} />
