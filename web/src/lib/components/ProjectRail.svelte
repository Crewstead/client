<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { flip } from 'svelte/animate';
  import { Cloud, Monitor } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import AddProject from './AddProject.svelte';
  import type { PlaceReorder } from './place-reorder.svelte.ts';
  import {
    CLOUD,
    groupsOf,
    hueOf,
    initials,
    placeState,
    rearranged,
    type Place,
  } from './sidebar-places.ts';
  import '@crewstead/ui/chat-row.css';
  import '@crewstead/ui/project-rail.css';
  let {
    places,
    chosen,
    choose,
    over,
    drop,
    reorder,
    added,
    problem,
    close,
  }: {
    places: Place[];
    /** The place whose chats show beside the bar. */
    chosen: string;
    choose: (id: string) => void;
    /** The place a dragged chat is over. */
    over: string;
    /** Takes a chat dropped on a place. */
    drop: (id: string) => Attachment<HTMLElement>;
    reorder: PlaceReorder;
    /** A project was added: open it. */
    added: (id: string) => void;
    problem: (text: string) => void;
    close: () => void;
  } = $props();
  const workspace = useWorkspace();
  // While a tile is dragged, its computer's places show in the order it would leave.
  const shown = $derived.by(() => {
    const live = reorder.live;
    if (!live) return places;
    const order = rearranged(
      places.map((place) => place.id),
      live,
    );
    return order.flatMap((id) => places.filter((place) => place.id === id));
  });
  const groups = $derived(groupsOf(shown));
  const label = (place: Place) =>
    `${place.name}${place.machine ? ` on ${place.machine}` : ''}${place.offline ? ' (offline)' : ''}, ` +
    `${place.chats.length} ${place.chats.length === 1 ? 'chat' : 'chats'}`;
</script>

<!--
  The projects bar: the cloud, then each computer's projects as tiles, like a chat app's servers. A tile
  opens its chats beside the bar, takes a chat dropped on it, and moves among its computer's by dragging.
-->
<nav class="project-rail" aria-label="Projects">
  {#each groups as group (group.machine ?? CLOUD)}
    {@const ids = group.places.map((place) => place.id)}
    <section
      class="rail-group"
      aria-label={group.machine ? `Projects on ${group.machine}` : 'Cloud'}
    >
      {#each group.places as place (place.id)}
        {@const state = placeState(place, workspace.unseen)}
        {@const movable = !!group.machine && ids.length > 1}
        <div
          class="rail-item"
          class:chosen={place.id === chosen}
          class:moving={reorder.moving === place.id}
          data-place={place.id}
          animate:flip={{ duration: 150 }}
        >
          <span class="rail-pill" class:new={state?.kind === 'done'} aria-hidden="true"></span>
          <button
            class="rail-tile"
            class:offline={place.offline}
            class:drop-over={over === place.id}
            class:plain={place.kind !== 'project'}
            data-hue={place.kind === 'project' ? hueOf(place.name) : undefined}
            aria-label={label(place)}
            aria-current={place.id === chosen ? 'true' : undefined}
            title={place.kind === 'computer'
              ? `Whole computer · ${place.machine}`
              : `${place.name}${place.machine ? ` · ${place.machine}` : ''}${place.offline ? ' · offline' : ''}`}
            onclick={() => choose(place.id)}
            onpointerdown={movable
              ? (event) =>
                  reorder.press(
                    event,
                    place.id,
                    ids,
                    (event.currentTarget as HTMLElement).closest('.rail-group')!,
                  )
              : undefined}
            onkeydown={movable ? (event) => reorder.key(event, place.id, ids) : undefined}
            {@attach drop(place.id)}
          >
            {#if place.kind === 'cloud'}<Cloud
                size={18}
              />{:else if place.kind === 'computer'}<Monitor size={18} />{:else}{initials(
                place.name,
              )}{/if}
            {#if state && state.kind !== 'done'}<i
                class="chat-state {state.kind}"
                title={state.text}><span class="sr-only">{state.text}</span></i
              >{/if}
          </button>
        </div>
      {/each}
    </section>
  {/each}
  <div class="rail-add"><AddProject {added} {problem} {close} tile /></div>
</nav>
