<script lang="ts">
  import { CloudOff } from '@lucide/svelte';
  import '@crewstead/ui/update-bar.css';

  interface HubBridge {
    state(): Promise<string | undefined>;
    onChange(listener: (state: string) => void): () => void;
  }
  /** The desktop app's bridge, absent in an ordinary browser. */
  const bridge = (globalThis as { crewsteadDesktop?: { hub?: HubBridge } }).crewsteadDesktop?.hub;
  let state = $state<string>();
  $effect(() => {
    if (!bridge) return;
    void bridge.state().then((now) => (state = now ?? state));
    return bridge.onChange((now) => (state = now));
  });
</script>

<!-- In the desktop app: its interface is its own, so it opens without the hub, showing saved copies. -->
{#if state === 'offline'}
  <div class="update-bar hub-offline" role="status">
    <CloudOff size={15} aria-hidden="true" />
    <span
      >Can't reach the hub. Showing what this app saved; sending and changes work again once it's
      back.</span
    >
  </div>
{/if}
