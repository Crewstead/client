<script lang="ts">
  import { Check, ChevronDown, Cloud, Folder, FolderX, Laptop, Monitor } from '@lucide/svelte';
  import type { Project } from '@crewstead/core/protocol';
  import { keepInView } from '#lib/keep-in-view.ts';
  import '@crewstead/ui/model-picker.css';
  let {
    projects,
    value = $bindable(),
    disabled = false,
  }: {
    projects: Project[];
    /** The project id, or '' for the cloud. */
    value: string;
    disabled?: boolean;
  } = $props();
  const id = $props.id();
  const chosen = $derived(projects.find((project) => project.id === value));
  // A chat's project whose computer is offline is not in the list; it still shows, marked.
  // The computer comes first: "MAIN-PC / Crewstead", "MAIN-PC / Whole computer".
  const label = $derived(
    chosen ? `${chosen.machine} / ${chosen.name}` : value ? 'Project offline' : 'Cloud',
  );
  /** Projects under the computer they are on, computers in the order their projects come. */
  const computers = $derived(
    projects.reduce<{ name: string; projects: Project[] }[]>((list, project) => {
      const computer = list.find((entry) => entry.name === project.machine);
      if (computer) computer.projects.push(project);
      else list.push({ name: project.machine, projects: [project] });
      return list;
    }, []),
  );
  let details = $state<HTMLDetailsElement>();
  let trigger = $state<HTMLElement>();
  function close(focus = false) {
    if (!details?.open) return;
    details.open = false;
    if (focus) trigger?.focus();
  }
  function choose(next: string) {
    value = next;
    close(true);
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (event.target instanceof Node && !details?.contains(event.target)) close();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') close(true);
  }}
/>
<!-- Where the chat works: the cloud (the hub only), or a project on one of the owner's computers. -->
{#if disabled}
  <span class="model-label">{label}</span>
{:else}
  <details
    class="model-picker project-picker"
    class:offline={value && !chosen}
    bind:this={details}
    use:keepInView
  >
    <summary bind:this={trigger} aria-label={`Where: ${label}`} title={`Where: ${label}`}
      >{#if !value}<Cloud size={13} />{:else if !chosen}<FolderX
          size={13}
        />{:else if chosen.kind === 'computer'}<Monitor size={13} />{:else}<Folder
          size={13}
        />{/if}<span class="picker-label">{label}</span><ChevronDown size={12} /></summary
    >
    <fieldset class="model-options place-options">
      <legend class="sr-only">Where the chat works</legend>
      <label
        ><input type="radio" name={id} checked={!value} onchange={() => choose('')} />
        <span class="effort-option"
          ><span><Cloud size={13} /> Cloud</span><small
            >On the hub only: talk, skills and a browser for public websites</small
          ></span
        >{#if !value}<Check size={14} />{/if}
      </label>
      {#each computers as computer (computer.name)}
        <p class="place-computer"><Laptop size={12} /> {computer.name}</p>
        {#each computer.projects as project (project.id)}
          <label title={project.path}
            ><input
              type="radio"
              name={id}
              checked={value === project.id}
              onchange={() => choose(project.id)}
            />
            <span class="effort-option"
              ><span
                >{#if project.kind === 'computer'}<Monitor size={13} />{:else}<Folder
                    size={13}
                  />{/if}
                {project.name}</span
              ><small
                >{project.kind === 'computer'
                  ? 'Anywhere, as you; changes ask first'
                  : `${project.path}${project.sandbox ? '' : ' · no commands'}`}</small
              ></span
            >{#if value === project.id}<Check size={14} />{/if}
          </label>
        {/each}
      {/each}
    </fieldset>
  </details>
{/if}
