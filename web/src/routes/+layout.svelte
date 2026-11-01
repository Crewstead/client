<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import { Authentication } from '#lib/auth/auth.svelte.ts';
  import SignIn from '#lib/auth/SignIn.svelte';
  import NewPassword from '#lib/auth/NewPassword.svelte';
  import AccountDialog from '#lib/auth/AccountDialog.svelte';
  import AppShell from '#lib/components/AppShell.svelte';
  import '@crewstead/ui/typography.css';
  import '@crewstead/ui/tokens.css';
  import '@crewstead/ui/base.css';
  import '@crewstead/ui/sidebar.css';
  import '@crewstead/ui/home.css';
  import '@crewstead/ui/forms.css';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/responsive.css';
  let { children }: { children: Snippet } = $props();
  const auth = setContext('authentication', new Authentication());
  onMount(() => {
    void auth.initialize();
    const expire = () => auth.expire();
    window.addEventListener('hub-auth-expired', expire);
    return () => window.removeEventListener('hub-auth-expired', expire);
  });
</script>

<svelte:head
  ><title>Crewstead · Local preview</title><meta
    name="description"
    content="A local prototype of the Crewstead workbench. Mock provider; no paid model calls."
  /></svelte:head
>
<a class="skip-link" href="#main">Skip to content</a>
{#if !auth.ready}<main id="main" class="sign-in-page">
    <p class="muted-text" role="status">Connecting…</p>
  </main>
{:else if !auth.user}<SignIn />
{:else if auth.user.mustChangePassword}<NewPassword />
{:else}{#key auth.scope}<AppShell {children} />{/key}{/if}
{#if auth.connecting}<AccountDialog />{/if}
