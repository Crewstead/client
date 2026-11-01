<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { ChevronsUpDown, Settings2, LogOut, Check, Plus } from '@lucide/svelte';
  import { useAuthentication } from '#lib/auth/auth.svelte.ts';
  import SavedAccounts from '#lib/auth/SavedAccounts.svelte';
  import '@crewstead/ui/account-menu.css';
  let { close }: { close: () => void } = $props();
  const auth = useAuthentication();
  const id = $props.id();
  let menu = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let placement = $state({ left: 8, bottom: 8, width: 224 });
  const initial = $derived(auth.user?.login.slice(0, 1).toUpperCase() ?? '');
  const serverLabel = $derived(auth.server ? new URL(auth.server).host : '');
  let expanded = $state(false);
  let busy = $state(false);
  let error = $state('');
  async function signOut() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await auth.signOut();
      await goto(resolve('/'), { replace: true });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not sign out.';
    } finally {
      busy = false;
    }
  }
  function positionMenu() {
    if (!trigger || !trigger.getClientRects().length) {
      menu?.hidePopover();
      return;
    }
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(bounds.width, window.innerWidth - 16);
    placement = {
      width,
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
      bottom: window.innerHeight - bounds.top + 8,
    };
  }
  function settings() {
    menu?.hidePopover();
    close();
  }
</script>

<svelte:window
  onresize={() => {
    if (expanded) positionMenu();
  }}
/>

<button
  bind:this={trigger}
  class="account-trigger"
  onclick={positionMenu}
  popovertarget={id}
  aria-haspopup="dialog"
  aria-expanded={expanded}
  aria-label={`Account: ${auth.user?.login}`}
>
  <span class="account-avatar" aria-hidden="true">{initial}</span>
  <span class="account-trigger-name">{auth.user?.login}</span>
  <ChevronsUpDown size={15} />
</button>
<div
  bind:this={menu}
  popover="auto"
  {id}
  class="account-popover"
  style:left={`${placement.left}px`}
  style:bottom={`${placement.bottom}px`}
  style:width={`${placement.width}px`}
  style:max-height={`calc(100dvh - ${placement.bottom}px - 8px)`}
  role="dialog"
  aria-label="Account"
  ontoggle={() => (expanded = !!menu?.matches(':popover-open'))}
>
  <a
    class="account-popover-identity"
    href={resolve('/settings?tab=accounts')}
    aria-label="Account settings"
    onclick={settings}
  >
    <span class="account-identity-text"
      ><strong>{auth.user?.login}</strong><span title={auth.server}>{serverLabel}</span></span
    >
    <Check size={14} aria-hidden="true" />
  </a>
  <SavedAccounts
    onselect={(account) => {
      settings();
      void auth.chooseAccount(account);
    }}
  />
  <div class="account-menu-divider"></div>
  <button
    class="account-menu-action"
    onclick={() => {
      settings();
      auth.openAccount();
    }}><Plus size={16} />Add account</button
  >
  <a class="account-menu-action" href={resolve('/settings')} onclick={settings}
    ><Settings2 size={16} />Settings</a
  >
  <button class="account-menu-action" onclick={signOut} disabled={busy}
    ><LogOut size={15} />{busy ? 'Signing out…' : 'Sign out'}</button
  >
  {#if error}<p class="account-menu-error" role="alert">{error}</p>{/if}
</div>
