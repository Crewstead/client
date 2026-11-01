<script lang="ts">
  import { goto } from '$app/navigation';
  import type { ConnectionView } from '@crewstead/core/protocol';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { connections } from './api.ts';
  import '@crewstead/ui/dialogs.css';
  let {
    connection,
    back,
    changed,
  }: {
    connection: ConnectionView;
    /** Where to go after the key is removed. */
    back: string;
    changed: (view: ConnectionView) => Promise<void>;
  } = $props();
  const workspace = useWorkspace();
  const id = $props.id();
  let replacing = $state(false);
  let apiKey = $state('');
  let busy = $state('');
  let error = $state('');
  let notice = $state('');
  let dialog = $state<HTMLDialogElement>();
  async function run(action: string, work: () => Promise<void>) {
    busy = action;
    error = '';
    notice = '';
    try {
      await work();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Action failed';
    } finally {
      busy = '';
    }
  }
  const refresh = () =>
    run('refresh', async () => {
      const before = connection.models.length;
      const view = await connections.refresh(connection.id);
      await changed(view);
      const added = view.models.length - before;
      notice = added > 0 ? `${added} new model${added === 1 ? '' : 's'} found.` : 'No new models.';
    });
  const replace = (event: SubmitEvent) => {
    event.preventDefault();
    void run('replace', async () => {
      await changed(await connections.update(connection.id, { apiKey: apiKey.trim() }));
      apiKey = '';
      replacing = false;
      notice = 'API key replaced.';
    });
  };
  const renew = () =>
    run('renew', () =>
      connections.signIn({
        context: connection.context,
        provider: connection.provider,
        connectionId: connection.id,
      }),
    );
  const remove = () =>
    run('remove', async () => {
      dialog?.close();
      await connections.remove(connection.id);
      await workspace.refresh();
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- validated Settings path
      await goto(back);
    });
</script>

<section class="settings-section" aria-label="Connection">
  <h2>Connection</h2>
  <div class="settings-card">
    {#if connection.auth === 'sign_in'}
      <div class="setting-row">
        <div>
          <strong>Sign in again</strong>
          <p>Renew access at {connection.providerLabel}, for example after it expires.</p>
        </div>
        <button class="button subtle small" disabled={!!busy} onclick={renew}
          >{busy === 'renew' ? 'Opening…' : 'Sign in'}</button
        >
      </div>
    {:else}
      <div class="setting-row">
        <div>
          <strong>Replace API key</strong>
          <p>Paste a new {connection.providerLabel} API key. Its models are checked again.</p>
        </div>
        {#if !replacing}<button
            class="button subtle small"
            disabled={!!busy}
            onclick={() => (replacing = true)}>Replace</button
          >{/if}
      </div>
    {/if}
    {#if replacing}
      <form class="card-footer inline-form" onsubmit={replace} aria-label="Replace API key">
        <label for={`${id}-key`} class="sr-only">New API key</label>
        <input
          id={`${id}-key`}
          type="password"
          bind:value={apiKey}
          minlength="8"
          autocomplete="off"
          placeholder="New API key"
          required
          disabled={!!busy}
        />
        <button type="button" class="button subtle small" onclick={() => (replacing = false)}
          >Cancel</button
        >
        <button type="submit" class="button subtle small" disabled={!!busy || apiKey.length < 8}
          >{busy === 'replace' ? 'Checking…' : 'Save'}</button
        >
      </form>
    {/if}
    <div class="setting-row card-divider">
      <div>
        <strong>Refresh models</strong>
        <p>Ask {connection.providerLabel} for models added since it was connected.</p>
      </div>
      <button class="button subtle small" disabled={!!busy} onclick={refresh}
        >{busy === 'refresh' ? 'Checking…' : 'Refresh'}</button
      >
    </div>
    <div class="setting-row card-divider">
      <div>
        <strong>Disconnect</strong>
        <p>
          {connection.auth === 'sign_in'
            ? 'Signs this app out of the provider.'
            : 'Deletes the saved API key.'} Its models stop at once; past chats stay readable.
        </p>
      </div>
      <button class="button subtle small" disabled={!!busy} onclick={() => dialog?.showModal()}
        >Disconnect</button
      >
    </div>
  </div>
  {#if notice}<p class="muted-text" role="status">{notice}</p>{/if}
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>

<dialog bind:this={dialog} class="dialog-content" aria-labelledby={`${id}-remove`}>
  <h2 id={`${id}-remove`} class="dialog-title">Disconnect {connection.label}?</h2>
  <p class="dialog-description">
    The saved API key is deleted and its models stop working at once. Past chats stay readable.
  </p>
  <div class="dialog-actions">
    <button class="button subtle" onclick={() => dialog?.close()}>Cancel</button>
    <button class="button danger" disabled={!!busy} onclick={remove}>Disconnect</button>
  </div>
</dialog>
