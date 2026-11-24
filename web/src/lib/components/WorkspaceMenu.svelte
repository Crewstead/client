<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Check, ChevronsUpDown, Layers, Plus } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { activeModules } from '#lib/modules/registry.ts';
  import '@crewstead/ui/dropdown.css';
  import '@crewstead/ui/workspace-menu.css';
  let { close }: { close: () => void } = $props();
  const workspace = useWorkspace();
  const id = $props.id();
  const contexts = $derived(workspace.contexts);
  const current = $derived(workspace.current);
  const actions = $derived(
    activeModules(workspace.catalog?.modules).flatMap((module) => module.workspaceActions ?? []),
  );
  const initial = (label: string) => label.trim().slice(0, 1).toUpperCase();
  let menu = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let expanded = $state(false);
  let placement = $state({ left: 8, top: 56, width: 232 });
  function position() {
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    placement = { left: bounds.left, top: bounds.bottom + 6, width: bounds.width };
  }
  async function choose(context: string) {
    menu?.hidePopover();
    close();
    if (context === workspace.context) return;
    // The page changes at once; the workspace's lists fill in as they load.
    const changing = workspace.changeContext(context);
    await goto(resolve('/'));
    await changing;
  }
</script>

<svelte:window onresize={() => expanded && position()} />

<button
  bind:this={trigger}
  class="workspace-trigger"
  popovertarget={id}
  onclick={position}
  aria-haspopup="dialog"
  aria-expanded={expanded}
  aria-label={`Workspace: ${current?.label ?? 'Personal'}`}
>
  <span class="workspace-mark" aria-hidden="true"
    >{#if !current || current.kind === 'personal'}<Layers size={15} />{:else}{initial(
        current.label,
      )}{/if}</span
  >
  <span class="workspace-name">{current?.kind === 'organisation' ? current.label : 'Personal'}</span
  >
  <ChevronsUpDown size={14} />
</button>

<div
  bind:this={menu}
  popover="auto"
  {id}
  class="workspace-popover menu-surface"
  style:left={`${placement.left}px`}
  style:top={`${placement.top}px`}
  style:width={`${placement.width}px`}
  role="dialog"
  aria-label="Workspaces"
  ontoggle={() => (expanded = !!menu?.matches(':popover-open'))}
>
  <p class="menu-group">Workspaces</p>
  {#each contexts as context (context.id)}
    <button
      class="menu-item"
      aria-current={context.id === workspace.context ? 'true' : undefined}
      onclick={() => choose(context.id)}
      onpointerenter={() => workspace.warm(context.id)}
    >
      <span class="workspace-mark small" aria-hidden="true"
        >{#if context.kind === 'personal'}<Layers size={12} />{:else}{initial(
            context.label,
          )}{/if}</span
      >
      <span class="workspace-option-text"
        ><span>{context.kind === 'personal' ? 'Personal' : context.label}</span
        >{#if context.role}<small>{context.role}</small>{/if}</span
      >
      {#if context.id === workspace.context}<Check class="menu-check" size={14} />{/if}
    </button>
  {/each}
  {#if actions.length}<hr class="menu-separator" />{/if}
  {#each actions as action (action.href)}
    <a
      class="menu-item"
      href={resolve(action.href as '/')}
      onclick={() => {
        menu?.hidePopover();
        close();
      }}
      ><span class="workspace-mark small ghost" aria-hidden="true"><Plus size={12} /></span
      >{action.label}</a
    >
  {/each}
</div>
