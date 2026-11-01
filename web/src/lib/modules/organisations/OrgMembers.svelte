<script lang="ts">
  import { onMount } from 'svelte';
  import type { Member, Role } from '@crewstead/core/protocol';
  import { organisations } from './api.ts';
  import { useAuthentication } from '#lib/auth/auth.svelte.ts';
  import RolePicker from './RolePicker.svelte';
  let { orgId, role }: { orgId: string; role: Role } = $props();
  const auth = useAuthentication();
  const id = $props.id();
  const roles: Role[] = ['member', 'admin', 'owner'];
  let members = $state<Member[]>([]);
  let login = $state('');
  let newRole = $state<Role>('member');
  let busy = $state(false);
  let error = $state('');
  const manager = $derived(role !== 'member');
  const assignable = $derived(roles.filter((option) => role === 'owner' || option !== 'owner'));
  /** Admins manage members and admins; only owners touch ownership. */
  const editable = (member: Member) =>
    manager && member.userId !== auth.user?.id && (role === 'owner' || member.role !== 'owner');
  async function run(action: () => Promise<unknown>) {
    busy = true;
    error = '';
    try {
      const result = await action();
      if (Array.isArray(result)) members = result as Member[];
      else members = await organisations.members(orgId);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Action failed';
    } finally {
      busy = false;
    }
  }
  async function add(event: SubmitEvent) {
    event.preventDefault();
    await run(() => organisations.addMember(orgId, login.trim(), newRole));
    if (!error) login = '';
  }
  onMount(() => run(() => organisations.members(orgId)));
</script>

<section class="settings-section" aria-label="Members">
  <div class="section-heading">
    <div>
      <h2>Members</h2>
      <p class="muted-text">Admins manage members. Only owners can change ownership.</p>
    </div>
  </div>
  <div class="settings-card">
    <ul>
      {#each members as member (member.userId)}
        <li>
          <span class="row-name"
            >{member.login}{member.userId === auth.user?.id ? ' (you)' : ''}</span
          >
          {#if editable(member)}
            <RolePicker
              label={`Role for ${member.login}`}
              value={member.role}
              options={assignable}
              disabled={busy}
              onchange={(next) => run(() => organisations.changeRole(orgId, member.userId, next))}
            />
            <button
              class="button subtle small"
              disabled={busy}
              onclick={() => run(() => organisations.remove(orgId, member.userId))}
              aria-label={`Remove ${member.login}`}>Remove</button
            >
          {:else}<span class="role-tag">{member.role}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if manager}
      <form class="card-footer inline-form" onsubmit={add} aria-label="Add member">
        <label for={`${id}-login`} class="sr-only">Username</label>
        <input
          id={`${id}-login`}
          bind:value={login}
          required
          maxlength="64"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Username"
        />
        <RolePicker label="Role" bind:value={newRole} options={assignable} />
        <button type="submit" class="button subtle small" disabled={busy || !login.trim()}
          >Add member</button
        >
      </form>
    {/if}
  </div>
  {#if error}<p class="error-banner" role="alert">{error}</p>{/if}
</section>
