<script lang="ts">
  import '@crewstead/ui/walkthrough.css';
  import '@crewstead/ui/walkthrough-code.css';
  import '@crewstead/ui/walkthrough-slide.css';
  import '@crewstead/ui/walkthrough-seq.css';
  import { onMount, tick, untrack } from 'svelte';
  import { MessageCircleQuestion, X } from '@lucide/svelte';
  import type { WalkthroughArguments } from '@crewstead/core/protocol';
  import { liveOf } from './live.ts';
  import { calm, CodeStage, OUT } from './moves.ts';
  import { rowsAt } from './rows.ts';
  import { isCode, WalkState, type Place } from './walk-state.svelte.ts';
  import WalkSequence from './WalkSequence.svelte';
  import WalkSlide from './WalkSlide.svelte';
  import WalkStrip from './WalkStrip.svelte';
  import WalkText from './WalkText.svelte';

  let {
    data,
    store,
    close,
  }: {
    data: WalkthroughArguments;
    /** Where this walkthrough's place is remembered in the browser. */
    store: string;
    close: () => void;
  } = $props();
  const reader = untrack(() => new WalkState(data, store));
  const walk = reader.walk;
  const actors = walk.actors ?? [];

  /** What the stage shows. It trails `reader` by the time the old things take to leave. */
  let shown = $state.raw<Place>(untrack(() => reader.place));
  let leaving = $state(false);
  /** Between a slide and code the whole stage changes, not only its text. */
  let turning = $state(false);
  /** A term's explanation; with no text, the diagram (a phone has no room for it beside the code). */
  let sheet = $state<{ title: string; text?: string }>();
  let dialog: HTMLDialogElement;
  let stageEl: HTMLElement;
  let lines: HTMLElement;
  let scroller: HTMLElement;
  let liveBox = $state<HTMLElement>();
  let stage: CodeStage | undefined;
  let waiting: { place: Place; had: Set<string>; timer: ReturnType<typeof setTimeout> } | undefined;

  const code = $derived(isCode(shown.step));
  const liveShown = $derived(code ? liveOf(walk, shown.step) : undefined);
  const liveNext = $derived(liveOf(walk, reader.step));
  // The same diagram moves its highlight at once; another one waits for the old to leave.
  const live = $derived(liveShown && liveNext?.key === liveShown.key ? liveNext : liveShown);
  const unnamed = $derived(
    actors
      .filter((actor) => {
        const from = reader.list.findIndex((step) => step.id === actor.subFrom);
        return from >= 0 && reader.i < from;
      })
      .map((actor) => actor.id),
  );

  /** Puts a place on the stage. With `had`, whatever is new in the code opens row by row. */
  async function put(place: Place, had: Set<string> | null) {
    const hidden = !code;
    shown = place;
    leaving = turning = false;
    if (!isCode(place.step)) return void (stageEl.scrollTop = 0);
    // A panel that was hidden has no sizes to open rows from until it is drawn.
    if (hidden) await tick();
    if (shown === place) stage?.show(rowsAt(reader, place), had, place.sub === 0);
  }
  /**
   * Goes to where `reader` now is. A move has two parts: first what leaves or changes does so
   * (notes close, highlights fade, the old text goes), then what is new opens.
   */
  function move(smooth = true) {
    if (waiting) {
      clearTimeout(waiting.timer);
      void put(waiting.place, null);
      waiting = undefined;
    }
    const place = reader.place;
    if (!smooth || calm() || shown.file !== place.file) return void put(place, null);
    const had = stage?.keys() ?? new Set<string>();
    const toCode = isCode(place.step);
    let busy = shown.step.id !== place.step.id;
    leaving = busy;
    turning = code !== toCode;
    if (code && toCode && stage?.leave(rowsAt(reader, place))) busy = true;
    if (!busy) return void put(place, had);
    const timer = setTimeout(() => {
      waiting = undefined;
      void put(place, had);
    }, OUT);
    waiting = { place, had, timer };
  }
  const turn = (how: 'next' | 'back') => {
    reader[how]();
    move();
  };

  function keys(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest('input, .walk-code')) return;
    if (event.key === 'ArrowRight') turn('next');
    else if (event.key === 'ArrowLeft') turn('back');
  }
  function clicks(event: MouseEvent) {
    const term = (event.target as HTMLElement).closest<HTMLElement>('[data-term]');
    if (!term) return;
    const entry = walk.glossary?.[term.dataset.term ?? ''];
    sheet = { title: entry?.[0] ?? term.textContent ?? '', text: entry?.[1] ?? '' };
  }
  /** Fills the chat's message box with this step's title, for a question about it. */
  function ask() {
    window.dispatchEvent(
      new CustomEvent('crewstead:compose', { detail: `«${shown.step.title}»: ` }),
    );
    dialog.close();
  }

  onMount(() => {
    dialog.showModal();
    stage = new CodeStage(lines, scroller);
    if (code) stage.show(rowsAt(reader, shown), null);
    void reader.paint().then(() => {
      if (isCode(shown.step) && !waiting) stage?.show(rowsAt(reader, shown), null, false, false);
    });
    return () => clearTimeout(waiting?.timer);
  });
  // The diagram beside the code keeps the row being written in view.
  $effect(() => {
    void live?.now;
    const row = liveBox?.querySelector<HTMLElement>('.walk-seq-row.now');
    if (!row || !liveBox) return;
    const top =
      row.getBoundingClientRect().top - liveBox.getBoundingClientRect().top + liveBox.scrollTop;
    liveBox.scrollTo({ top: Math.max(0, top - liveBox.clientHeight / 2), behavior: 'smooth' });
  });
</script>

{#snippet diagram()}
  {#if live}
    <p class="walk-hint">
      Blue is what we write now. Dim is someone else’s part, or not written yet.
    </p>
    <WalkSequence {actors} rows={live.rows} plain={live.plain} now={live.now} done={live.done} />
  {/if}
{/snippet}

<!-- A walkthrough, over the whole window. Esc or the close button closes it. -->
<dialog
  class="walk-viewer"
  aria-label={walk.title}
  bind:this={dialog}
  onclose={close}
  oncancel={(event) => {
    if (!sheet) return;
    event.preventDefault();
    sheet = undefined;
  }}
  onkeydown={keys}
  onclick={clicks}
>
  <header class="walk-top">
    <div class="walk-bar">
      <strong>{walk.title}</strong>
      <button
        class="icon-button"
        title="Ask about this step"
        aria-label="Ask about this step"
        onclick={ask}><MessageCircleQuestion size={16} /></button
      >
      <button class="icon-button" aria-label="Close" onclick={() => dialog.close()}
        ><X size={16} /></button
      >
    </div>
    <div class="walk-progress">
      {#each reader.list as item, index (item.id)}
        <button
          class="walk-seg"
          class:done={index < reader.i}
          class:cur={index === reader.i}
          title={item.title}
          aria-label={item.title}
          onclick={() => {
            reader.go(index);
            move();
          }}
        ></button>
      {/each}
    </div>
    {#if actors.length}<WalkStrip {actors} flow={reader.step.flow ?? []} waiting={unnamed} />{/if}
    <p class="walk-says walk-fade" class:leaving>{shown.step.says ?? ''}</p>
  </header>

  <main
    class="walk-stage walk-fade"
    class:concept={!code}
    class:leaving={turning}
    bind:this={stageEl}
  >
    <section class="walk-text">
      <div class="walk-fade" class:leaving>
        {#if code}
          <p class="walk-eyebrow">Code <span>{reader.code.steps.get(shown.step.id)?.file}</span></p>
          <h2>{shown.step.title}</h2>
          <p class="walk-lead"><WalkText text={shown.step.lead ?? ''} /></p>
        {:else}
          <WalkSlide
            {walk}
            step={shown.step}
            known={reader.known}
            know={(key, yes) => {
              reader.know(key, yes);
              move(false);
            }}
          />
        {/if}
      </div>
      {#if live}
        <div
          class="walk-live walk-fade"
          class:leaving={leaving && liveNext?.key !== live.key}
          bind:this={liveBox}
        >
          <h3>{live.title}</h3>
          {@render diagram()}
        </div>
      {/if}
    </section>
    <section class="walk-panel">
      <div class="walk-tabs">
        {#each Object.keys(reader.files) as name (name)}
          <button
            class="walk-tab"
            class:on={name === shown.file}
            onclick={() => {
              reader.file = name;
              move(false);
            }}><b>{name}</b><small>{walk.files?.[name] ?? ''}</small></button
          >
        {/each}
        {#if live}
          <button class="walk-tab scheme" onclick={() => (sheet = { title: live.title })}
            >Diagram</button
          >
        {/if}
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="walk-code" tabindex="0" bind:this={scroller}>
        <div class="walk-lines" bind:this={lines}></div>
      </div>
    </section>
  </main>

  <footer class="walk-nav">
    <button class="button subtle" disabled={reader.atStart} onclick={() => turn('back')}
      >Back</button
    >
    <div class="walk-where">
      <span>{reader.i + 1} of {reader.list.length}</span>
      <span class="walk-dots">
        {#if reader.groups(reader.step) > 1}
          {#each { length: reader.groups(reader.step) } as _, at (at)}<i class:on={at <= reader.sub}
            ></i>{/each}
        {/if}
      </span>
    </div>
    <button class="button primary" disabled={reader.atEnd} onclick={() => turn('next')}
      >{reader.i === 0 ? 'Start' : 'Next'}</button
    >
  </footer>

  {#if sheet}
    <button class="walk-veil" aria-label="Close the explanation" onclick={() => (sheet = undefined)}
    ></button>
    <div class="walk-sheet" role="dialog" aria-label={sheet.title}>
      <h3>{sheet.title}</h3>
      {#if sheet.text !== undefined}<p>
          <WalkText text={sheet.text} />
        </p>{:else}{@render diagram()}{/if}
      <button class="button subtle small" onclick={() => (sheet = undefined)}>Got it</button>
    </div>
  {/if}
</dialog>
