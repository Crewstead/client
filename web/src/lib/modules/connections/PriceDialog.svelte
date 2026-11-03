<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import type { ModelEntryView } from '@crewstead/core/protocol';
  import { discounted, fullPrices } from './format.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/keys.css';
  type Prices = Pick<ModelEntryView, 'inputUsd' | 'cachedInputUsd' | 'outputUsd'>;
  let {
    model,
    note,
    provider,
    turnOn,
    save,
    follow,
    close,
  }: {
    /** The model being priced; the dialog is open while this is set. */
    model: ModelEntryView | null;
    note?: string;
    /** Provider name for "Use DeepInfra's prices". */
    provider: string;
    /** Opened by switching on an unpriced model: saving also turns it on. */
    turnOn: boolean;
    save: (prices: Prices, enable: boolean) => Promise<void>;
    /** Switch the model to follow the provider's listed price. */
    follow: (enable: boolean) => Promise<void>;
    close: () => void;
  } = $props();
  const id = $props.id();
  const fields = [
    ['inputUsd', 'Input', 'Text you send, including the chat so far'],
    ['cachedInputUsd', 'Cached input', 'Repeated input the provider has cached'],
    ['outputUsd', 'Output', 'Text the model writes, including its reasoning'],
  ] as const;
  let dialog = $state<HTMLDialogElement>();
  let prices = $state<Record<keyof Prices, number | null>>({
    inputUsd: null,
    cachedInputUsd: null,
    outputUsd: null,
  });
  let busy = $state(false);
  let error = $state('');
  $effect(() => {
    if (!model || !dialog) return;
    prices = {
      inputUsd: model.inputUsd,
      cachedInputUsd: model.cachedInputUsd,
      outputUsd: model.outputUsd,
    };
    error = '';
    if (!dialog.open) dialog.showModal();
  });
  async function followListed() {
    busy = true;
    error = '';
    try {
      await follow(turnOn);
      dialog?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not update prices';
    } finally {
      busy = false;
    }
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      await save(
        {
          inputUsd: Number(prices.inputUsd),
          cachedInputUsd: Number(prices.cachedInputUsd),
          outputUsd: Number(prices.outputUsd),
        },
        turnOn,
      );
      dialog?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save prices';
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  {@attach closeOutside}
  bind:this={dialog}
  class="dialog-content"
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-note`}
  onclose={close}
>
  <form onsubmit={submit}>
    <h2 id={`${id}-title`} class="dialog-title">Prices for {model?.label}</h2>
    <p id={`${id}-note`} class="dialog-description">
      US dollars per million tokens, from the provider’s pricing page. Daily limits are counted with
      these prices.
    </p>
    {#if model?.listed}
      {@const listed = model.listed}
      {@const sale = discounted(listed)}
      <div class="listed-prices">
        <span
          >{provider} lists {fullPrices(listed)}{#if sale}, {Math.round(listed.discount! * 100)}%
            off now:
            {fullPrices(sale)}{/if}.</span
        >
        {#if model.priceSource === 'listed'}
          <span class="muted-text">Following {provider}’s prices; checked every 6 hours.</span>
        {:else}
          <button type="button" class="button primary small" disabled={busy} onclick={followListed}
            >Follow {provider}’s prices</button
          >
        {/if}
        <button
          type="button"
          class="button subtle small"
          disabled={busy}
          onclick={() => (prices = { ...listed })}>Use full prices</button
        >
        <p class="form-note">
          Following uses {provider}’s current price, including discounts, and updates when it
          changes. Your own prices stay fixed.
        </p>
      </div>
    {/if}
    {#if note}<p class="form-note">{note}</p>{/if}
    <div class="price-fields">
      {#each fields as [key, label, hint] (key)}
        <label for={`${id}-${key}`} title={hint}>{label}</label>
        <input
          id={`${id}-${key}`}
          type="number"
          inputmode="decimal"
          bind:value={prices[key]}
          min="0"
          max="1000"
          step="any"
          placeholder="0.00"
          required
          disabled={busy}
        />
      {/each}
    </div>
    {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button type="button" class="button subtle" onclick={() => dialog?.close()} disabled={busy}
        >Cancel</button
      >
      <button type="submit" class="button primary" disabled={busy}
        >{busy ? 'Saving…' : turnOn ? 'Save and turn on' : 'Save prices'}</button
      >
    </div>
  </form>
</dialog>
