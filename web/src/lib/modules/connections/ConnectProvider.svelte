<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { onMount, untrack } from 'svelte';
  import type { ConnectionView, ContextId, ProviderInfo } from '@crewstead/core/protocol';
  import type { ConnectOption } from '#lib/modules/types.ts';
  import OptionPicker from '#lib/components/OptionPicker.svelte';
  import { connections } from './api.ts';
  import ChooseModels, { type Choice } from './ChooseModels.svelte';
  import { isPriced } from './format.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/connections.css';
  import '@crewstead/ui/providers.css';
  let {
    context,
    providers,
    extra = [],
    pick = () => {},
    done,
    close,
  }: {
    context: ContextId;
    providers: ProviderInfo[];
    /** Choices other modules add, set up by their own dialog (`pick` hands over to it). */
    extra?: ConnectOption[];
    pick?: (option: ConnectOption) => void;
    /** Called after the provider is connected and the chosen models are on. */
    done: () => Promise<void>;
    close: () => void;
  } = $props();
  const id = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let provider = $state(untrack(() => providers[0]?.id ?? ''));
  let label = $state('');
  let apiKey = $state('');
  let limit = $state(5);
  let view = $state<ConnectionView>();
  let choices = $state<Record<string, Choice>>({});
  let busy = $state(false);
  let error = $state('');
  const selected = $derived(providers.find((item) => item.id === provider));
  const other = $derived(extra.find((option) => `extra:${option.id}` === provider));
  // Providers that offer sign-in lead with it; some (ChatGPT) cannot use an API key at all.
  let useKey = $state(false);
  const keyMode = $derived(!selected?.signIn || (useKey && selected.apiKey));
  const plan = $derived(selected?.billing === 'plan');
  async function signIn() {
    busy = true;
    error = '';
    try {
      await connections.signIn({
        context,
        provider,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(plan ? {} : { dailyLimitUsd: Number(limit) }),
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not start sign-in';
      busy = false;
    }
  }
  const chosen = $derived(
    Object.entries(choices).filter(([, choice]) => choice.on) as Array<[string, Choice]>,
  );
  async function connect(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      view = await connections.create(context, {
        provider,
        label: label.trim() || (selected?.label ?? provider),
        apiKey: apiKey.trim(),
        dailyLimitUsd: Number(limit),
      });
      apiKey = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not connect';
    } finally {
      busy = false;
    }
  }
  async function finish(event: SubmitEvent) {
    event.preventDefault();
    if (!view) return;
    busy = true;
    error = '';
    try {
      for (const [modelId, choice] of chosen) {
        const model = view.models.find((entry) => entry.id === modelId)!;
        await connections.updateModel(view.id, modelId, {
          enabled: true,
          ...(isPriced(model) ? {} : choice.prices),
        });
      }
      await done();
      dialog?.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not turn the models on';
    } finally {
      busy = false;
    }
  }
  onMount(() => dialog?.showModal());
</script>

<dialog
  {@attach closeOutside}
  bind:this={dialog}
  class="dialog-content wide-dialog"
  aria-labelledby={`${id}-title`}
  onclose={() => (view ? void done() : close())}
>
  {#if !view}
    <form
      onsubmit={(event) => {
        if (!other) return keyMode ? connect(event) : (event.preventDefault(), void signIn());
        event.preventDefault();
        pick(other);
      }}
      aria-label="Connect provider"
    >
      <h2 id={`${id}-title`} class="dialog-title">Connect a provider</h2>
      <p class="dialog-description">
        {#if other}
          {other.description}
        {:else if keyMode}
          Your API key is checked with the provider, then kept on this server only and never shown
          again. Use is billed to that provider account.
        {:else if plan}
          You sign in at {selected?.label} and approve access. It uses your plan and its limits; you won’t
          be charged extra.
        {:else}
          You sign in at {selected?.label} and approve access. Use is billed to your {selected?.label}
          account.
        {/if}
      </p>
      <div class="field-grid dialog-fields">
        <span class="field-label" aria-hidden="true">Provider</span>
        <OptionPicker
          bind:value={provider}
          options={[
            ...providers.map((item) => ({
              value: item.id,
              label: item.label,
              hint: item.description,
            })),
            ...extra.map((option) => ({
              value: `extra:${option.id}`,
              label: option.label,
              hint: option.hint,
            })),
          ]}
          label="Provider"
          disabled={busy}
          wide
          onchange={(next) => {
            provider = next;
            useKey = false;
          }}
        />
        {#if other}<!-- Set up in the next step. -->{:else}{#if keyMode}<label for={`${id}-key`}
              >API key</label
            >
            <input
              id={`${id}-key`}
              type="password"
              bind:value={apiKey}
              required
              minlength="8"
              maxlength="512"
              autocomplete="off"
              spellcheck="false"
              disabled={busy}
            />{/if}
          <label for={`${id}-label`}>Name</label>
          <input
            id={`${id}-label`}
            bind:value={label}
            maxlength="60"
            placeholder={selected?.label ?? 'Provider'}
            disabled={busy}
          />
          {#if !plan}<label for={`${id}-limit`}>Daily spending limit ($)</label>
            <input
              id={`${id}-limit`}
              type="number"
              bind:value={limit}
              required
              min="0.01"
              max="1000"
              step="0.01"
              disabled={busy}
            />{/if}{/if}
      </div>
      {#if !other && selected?.connectNote}<p class="form-note connect-note">
          {selected.connectNote}
        </p>{/if}
      {#if selected && keyMode}
        <p class="form-note">
          <!-- External provider page, not an app route. -->
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={selected.keyUrl} target="_blank" rel="noopener noreferrer"
            >Get your {selected.label} API key</a
          >
        </p>
      {/if}
      {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
      <div class="dialog-actions">
        {#if other}
          <button type="button" class="button subtle" onclick={() => dialog?.close()}>Cancel</button
          >
          <button type="submit" class="button primary">Continue</button>
        {:else if keyMode}
          {#if selected?.signIn}<button
              type="button"
              class="link-button dialog-switch"
              onclick={() => (useKey = false)}>Sign in instead</button
            >{/if}
          <button
            type="button"
            class="button subtle"
            onclick={() => dialog?.close()}
            disabled={busy}>Cancel</button
          >
          <button type="submit" class="button primary" disabled={busy || apiKey.trim().length < 8}
            >{busy ? 'Checking…' : 'Continue'}</button
          >
        {:else}
          {#if selected?.apiKey}<button
              type="button"
              class="link-button dialog-switch"
              onclick={() => (useKey = true)}>Use an API key instead</button
            >{/if}
          <button
            type="button"
            class="button subtle"
            onclick={() => dialog?.close()}
            disabled={busy}>Cancel</button
          >
          <button type="submit" class="button primary" disabled={busy}
            >{busy ? 'Opening…' : `Sign in with ${selected?.label}`}</button
          >
        {/if}
      </div>
    </form>
  {:else}
    <form onsubmit={finish} aria-label="Choose models">
      <h2 id={`${id}-title`} class="dialog-title">Choose {view.label} models</h2>
      <p class="dialog-description">
        Connected. Tick the models to use in chats; you can change this later. Prices are in US
        dollars per million tokens and count towards the daily spending limit.
      </p>
      <ChooseModels models={view.models} bind:choices disabled={busy} />
      {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
      <div class="dialog-actions">
        <button type="button" class="button subtle" onclick={() => dialog?.close()} disabled={busy}
          >Skip for now</button
        >
        <button type="submit" class="button primary" disabled={busy || !chosen.length}
          >{busy
            ? 'Turning on…'
            : `Turn on ${chosen.length || ''} model${chosen.length === 1 ? '' : 's'}`}</button
        >
      </div>
    </form>
  {/if}
</dialog>
