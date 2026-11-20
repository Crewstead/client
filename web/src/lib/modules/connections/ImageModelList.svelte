<script lang="ts">
  import type { ConnectionView, ImageModelView } from '@crewstead/core/protocol';
  import { connections } from './api.ts';
  import '@crewstead/ui/switch.css';
  let {
    connection,
    changed,
  }: { connection: ConnectionView; changed: (view: ConnectionView) => Promise<void> } = $props();
  const models = $derived(connection.imageModels ?? []);
  let busy = $state('');
  let error = $state('');
  const price = (model: ImageModelView) =>
    model.usdPerImage == null ? '' : `$${model.usdPerImage.toFixed(3)} / picture`;
  async function toggle(model: ImageModelView, input: HTMLInputElement) {
    busy = model.id;
    error = '';
    try {
      await changed(await connections.updateImageModel(connection.id, model.id, input.checked));
    } catch (cause) {
      input.checked = model.enabled;
      error = cause instanceof Error ? cause.message : 'Could not update the model';
    } finally {
      busy = '';
    }
  }
</script>

<!-- Models that make pictures: chats call the ones that are on with image_generate. -->
<section class="settings-section" aria-label="Image models">
  <div class="section-heading">
    <div>
      <h2>Image models</h2>
      <p class="muted-text">
        {models.filter((m) => m.enabled).length} of {models.length} on. Chats can make pictures with them.
      </p>
    </div>
  </div>
  <div class="settings-card">
    <ul aria-label={`Image models from ${connection.label}`}>
      {#each models as model (model.id)}
        <li class="model-row">
          <span class="row-text"
            ><strong>{model.label}</strong>{#if model.providerModel !== model.label}<small
                >{model.providerModel}</small
              >{/if}</span
          >
          {#if price(model)}<span class="row-meta">{price(model)}</span>{/if}
          <input
            type="checkbox"
            class="switch"
            checked={model.enabled}
            disabled={!connection.canManage || busy === model.id}
            aria-label={`Use ${model.label}`}
            onchange={(event) => void toggle(model, event.currentTarget)}
          />
        </li>
      {:else}
        <li><p class="muted-text empty-note">This connection lists no image models.</p></li>
      {/each}
    </ul>
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>
