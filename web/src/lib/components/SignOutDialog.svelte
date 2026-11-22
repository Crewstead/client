<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import '@crewstead/ui/dialogs.css';
  let {
    server,
    busy,
    signOut,
    close,
  }: {
    /** The hub signed in to, as the account shows it. */
    server: string;
    busy: boolean;
    signOut: () => void;
    close: () => void;
  } = $props();
  const id = $props.id();
</script>

<!-- Signing out asks first: one stray click should not end the session. -->
<dialog
  {@attach closeOutside}
  {@attach (node) => node.showModal()}
  class="dialog-content"
  aria-labelledby={`${id}-title`}
  onclose={close}
>
  <h2 id={`${id}-title`} class="dialog-title">Sign out?</h2>
  <p class="dialog-description">You’ll need to sign in to {server} again on this device.</p>
  <div class="dialog-actions">
    <button class="button subtle" onclick={close}>Cancel</button>
    <button class="button danger" disabled={busy} onclick={signOut}
      >{busy ? 'Signing out…' : 'Sign out'}</button
    >
  </div>
</dialog>
