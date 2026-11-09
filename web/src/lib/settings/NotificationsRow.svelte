<script lang="ts">
  import { notifier } from '#lib/notifications.svelte.ts';
  import '@crewstead/ui/switch.css';
  const status = $derived(
    notifier.permission === 'unsupported'
      ? 'Not available at this address: open the app at http://127.0.0.1 on this computer, or over https.'
      : notifier.permission === 'denied'
        ? 'Blocked for this site in the browser’s settings; allow notifications there to turn them on.'
        : 'In this browser, when a chat finishes, fails or waits for approval while you are elsewhere.',
  );
</script>

<!-- System notifications for chats' replies, kept per browser like its permission. -->
<li aria-label="Notifications">
  <span class="project-text">
    <span class="row-name">Notifications</span>
    <span class="row-status">{status}</span>
  </span>
  {#if notifier.permission !== 'unsupported' && notifier.permission !== 'denied'}<input
      type="checkbox"
      class="switch"
      aria-label="Notifications on"
      checked={notifier.on}
      onchange={(event) =>
        event.currentTarget.checked ? void notifier.turnOn() : notifier.turnOff()}
    />{/if}
</li>
