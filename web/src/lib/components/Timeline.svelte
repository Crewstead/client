<script lang="ts">
  import { tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { ArrowDown, Bot, ChevronRight, Clock, Cloud, Folder, Sparkles } from '@lucide/svelte';
  import {
    QUESTION_TOOL,
    questionsOf,
    type ChatBranch,
    type TimelineItem,
  } from '@crewstead/core/protocol';
  import Markdown from '#lib/markdown/Markdown.svelte';
  import ToolItem from './ToolItem.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import Attachments from './attachments/Attachments.svelte';
  import ExploredGroup from './ExploredGroup.svelte';
  import ChangedFiles from './ChangedFiles.svelte';
  import PlanSteps from './PlanSteps.svelte';
  import WorkedFor from './WorkedFor.svelte';
  import { timelineEntries } from './timeline-entries.ts';
  import { watchReport } from './watch-report.ts';
  import WatchNotice from './WatchNotice.svelte';
  import PromptActions from './versions/PromptActions.svelte';
  import PromptEditor from './versions/PromptEditor.svelte';
  import TurnActions from './versions/TurnActions.svelte';
  import type { ChatActions, Versions } from './versions/chat-actions.ts';
  import '@crewstead/ui/message-actions.css';
  import '@crewstead/ui/scheduled-run.css';
  let {
    items,
    branches,
    actions,
    decide,
    running = false,
    focus,
    editing = $bindable(),
    earlier = 0,
    loadEarlier,
  }: {
    items: TimelineItem[];
    /** Other versions of the chat from its prompts on. */
    branches?: Record<string, ChatBranch>;
    /** Copying, editing, retrying, versions and forks; absent where the chat is read-only. */
    actions?: ChatActions;
    /** The last turn is still going; its summary of changed files waits until it ends. */
    running?: boolean;
    /** A message to scroll to and mark once, e.g. one a search found. */
    focus?: string | undefined;
    decide: (id: string, decision: 'approve' | 'reject' | 'approve-all') => Promise<boolean>;
    /** The prompt being edited. */
    editing?: string | undefined;
    /** Messages before `items` that the hub has not sent yet. */
    earlier?: number;
    /** Loads earlier messages: `count` of them, or all. */
    loadEarlier?: (count?: number) => Promise<void>;
  } = $props();
  let viewport: HTMLDivElement;
  // A long chat draws its latest entries first and earlier ones as the reader nears the top: drawing
  // hundreds of replies at once took seconds. Past the loaded messages, earlier ones are loaded.
  const FIRST = 40;
  const MORE = 40;
  const entries = $derived(timelineEntries(items, running));
  let drawn = $state(FIRST);
  const shown = $derived(entries.length > drawn ? entries.slice(-drawn) : entries);
  let top = $state<HTMLDivElement>();
  let fetching = false;
  function more() {
    if (drawn >= entries.length) {
      if (!earlier || !loadEarlier || fetching) return;
      fetching = true;
      const had = items.length;
      void loadEarlier(200).then(() => {
        fetching = false;
        if (items.length > had) void tick().then(more);
      });
      return;
    }
    // What is on screen stays where it is while entries are added above it.
    const fromBottom = viewport.scrollHeight - viewport.scrollTop;
    drawn += MORE;
    void tick().then(() => {
      viewport.scrollTop = viewport.scrollHeight - fromBottom;
      if (viewport.scrollTop < viewport.clientHeight) more();
    });
  }
  $effect(() => {
    if (!top) return;
    const watcher = new IntersectionObserver(
      (seen) => seen.some((entry) => entry.isIntersecting) && more(),
      { root: viewport, rootMargin: '800px 0px 0px 0px' },
    );
    watcher.observe(top);
    return () => watcher.disconnect();
  });
  // A message asked for further up is drawn, with what follows it.
  $effect(() => {
    if (!focus) return;
    if (earlier && !items.some((item) => item.id === focus)) void loadEarlier?.();
    const at = entries.findIndex((entry) =>
      entry.kind === 'item'
        ? entry.item.id === focus
        : entry.kind === 'explored' && entry.items.some((item) => item.id === focus),
    );
    if (at >= 0 && entries.length - at > drawn) drawn = entries.length - at + 5;
  });
  // Each prompt that has versions: the first prompt after where they are kept (notices come first).
  const versions = $derived.by(() => {
    const found: Record<string, Versions> = {};
    for (const [anchor, branch] of Object.entries(branches ?? {})) {
      const start = anchor ? items.findIndex((item) => item.id === anchor) + 1 : 0;
      if (branch.versions.length < 2 || (anchor && !start)) continue;
      const prompt = items.find((item, at) => at >= start && item.role === 'user');
      if (prompt)
        found[prompt.id] = { anchor, active: branch.active, count: branch.versions.length };
    }
    return found;
  });
  const lastTurn = $derived(items.at(-1)?.id);
  let nearBottom = $state(true);
  function scroll() {
    nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 90;
  }
  function bottom() {
    viewport.scrollTop = viewport.scrollHeight;
    nearBottom = true;
  }
  // Shows the message asked for once it is drawn, instead of the newest messages.
  let focused = '';
  $effect(() => {
    if (!focus || focused === focus || !items.some((item) => item.id === focus)) return;
    focused = focus;
    nearBottom = false;
    setTimeout(() => {
      const node = viewport?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(focus)}"]`);
      if (!node) return;
      node.scrollIntoView({ block: 'center' });
      // The message's own bubble is marked, not the whole row.
      const marked = node.querySelector<HTMLElement>('.message-content, summary') ?? node;
      marked.classList.add('found-item');
      setTimeout(() => marked.classList.remove('found-item'), 2_400);
    }, 60);
  });
  $effect(() => {
    const length = items.length;
    const tail = items.at(-1)?.text;
    // Also when the reply ends: what it ended with may grow then (its questions open).
    void running;
    if ((length || tail) && nearBottom && viewport)
      queueMicrotask(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
  });
</script>

<div
  class="timeline"
  bind:this={viewport}
  onscroll={scroll}
  role="log"
  aria-label="Chat history"
  aria-live="polite"
>
  <div class="timeline-content">
    {#if shown.length < entries.length || earlier}<div
        class="timeline-earlier"
        bind:this={top}
      ></div>{/if}
    {#if !items.length}<div class="conversation-welcome">
        <h2>Start a chat</h2>
      </div>{/if}
    {#each shown as entry (entry.kind === 'item' ? entry.item.id : entry.id)}
      {#if entry.kind === 'explored'}<div class="tool-row">
          <ExploredGroup items={entry.items} />
        </div>
      {:else if entry.kind === 'worked'}
        {#if entry.turn && actions}<div
            class="turn-footer"
            class:latest={entry.turn.lastId === lastTurn}
          >
            <!-- The time first, so the buttons that show on hover never move it. -->
            <WorkedFor
              {...entry.ms !== undefined ? { ms: entry.ms } : {}}
              {...entry.tokensPerSecond ? { speed: entry.tokensPerSecond } : {}}
            />
            <TurnActions text={entry.turn.answer} lastId={entry.turn.lastId} {actions} />
          </div>
        {:else}<WorkedFor
            {...entry.ms !== undefined ? { ms: entry.ms } : {}}
            {...entry.since ? { since: entry.since } : {}}
            {...entry.tokensPerSecond ? { speed: entry.tokensPerSecond } : {}}
          />{/if}
      {:else if entry.kind === 'plan'}<div class="tool-row">
          <PlanSteps steps={entry.steps} />
        </div>
      {:else if entry.kind === 'changes'}<div class="tool-row">
          <ChangedFiles files={entry.files} />
        </div>
      {:else}
        {@const item = entry.item}
        {@const asked = item.toolName === QUESTION_TOOL ? questionsOf(item.arguments) : undefined}
        {#if asked}<div class="tool-row">
            <QuestionCard
              questions={asked}
              open={!!actions && !running && item.id === lastTurn}
              disabled={actions?.disabled}
              answer={(text) => actions?.answer(text) ?? Promise.resolve(false)}
            />
          </div>
        {:else if item.role === 'tool'}<div class="tool-row"><ToolItem {item} {decide} /></div>
        {:else if item.role === 'notice' && item.notice}
          <!-- Another model or another place from here on: what changed, and from what. -->
          <p class="summary-divider moved-divider" title={item.text}>
            <span
              >{#if item.notice.kind === 'model'}<Sparkles size={12} />Switched to {item.notice
                  .to}{:else if item.notice.to === 'Cloud'}<Cloud size={12} />Moved to Cloud{:else}<Folder
                  size={12}
                />Moved to {item.notice.to}{/if}<small>from {item.notice.from}</small></span
            >
          </p>
        {:else if item.role === 'user' && item.scheduled}
          <!-- A scheduled task's prompt, the same each time: one line, opened to read it. -->
          <details class="summary-divider scheduled-divider" data-item-id={item.id}>
            <summary
              ><Clock size={12} aria-hidden="true" /><span
                >Scheduled task · {item.scheduled.title}<small
                  >{new Date(item.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}</small
                ></span
              ></summary
            >
            <div class="summary-text scheduled-prompt">{item.text}</div>
          </details>
        {:else if item.role === 'summary' && item.status !== 'completed'}
          <!-- While the model writes the summary, and if it could not. -->
          <p
            class="summary-divider summary-state"
            data-status={item.status}
            role={item.status === 'streaming' ? 'status' : undefined}
          >
            <span class:pulsing={item.status === 'streaming'}
              >{item.status === 'streaming'
                ? 'Summarizing earlier messages to save context…'
                : item.status === 'interrupted'
                  ? 'Summarizing was stopped; the chat continues in full.'
                  : `Could not summarize earlier messages${item.result ? `: ${item.result}` : ''}. The chat continues in full.`}</span
            >
          </p>
        {:else if item.role === 'summary'}
          <!-- Everything above stays readable; the model continues from this summary. -->
          <details class="summary-divider">
            <summary
              ><ChevronRight size={13} aria-hidden="true" /><span
                >Earlier messages summarized to save context</span
              ></summary
            >
            <div class="summary-text markdown"><Markdown text={item.text} /></div>
          </details>
        {:else if watchReport(item)}{@const report = watchReport(item)!}<WatchNotice {report} />
        {:else}<article
            data-item-id={item.id}
            class="message"
            class:user-message={item.role === 'user'}
            aria-label={item.role === 'user'
              ? item.sentBy
                ? `Sent by ${item.sentBy.model}`
                : 'You'
              : 'Assistant'}
          >
            {#if item.sentBy}
              <!-- Another chat's model wrote this, not the owner. -->
              <p class="sent-by">
                <Bot size={12} />Sent by {item.sentBy.model} from
                <a href={resolve('/sessions/[id]', { id: item.sentBy.chatId })}
                  >{item.sentBy.chatTitle}</a
                >
              </p>
            {/if}
            <!-- Pictures and files sit above the message, like the attachments of a post. -->
            {#if item.role === 'user' && item.attachments?.length}<Attachments
                files={item.attachments}
                align="end"
              />{/if}
            {#if editing === item.id && actions}<PromptEditor
                text={item.text}
                save={(text) => actions.again(item.id, text)}
                cancel={() => (editing = undefined)}
              />
            {:else if item.role === 'assistant' || item.text || item.result || item.status === 'interrupted'}<div
                class="message-content"
              >
                {#if item.role === 'assistant'}
                  {#if item.reasoning}
                    {@const thinking = item.status === 'streaming' && !item.text}
                    <details class="thinking">
                      <summary
                        ><ChevronRight size={14} aria-hidden="true" /><span class:pulsing={thinking}
                          >{thinking ? 'Thinking…' : 'Thought'}</span
                        ></summary
                      >
                      <div class="thinking-text">{item.reasoning}</div>
                    </details>
                  {/if}
                  {#if item.text}<div class="message-text markdown">
                      <Markdown text={item.text} />
                    </div>{/if}
                {:else if item.text}<div class="message-text">{item.text}</div>{/if}
                {#if item.status === 'interrupted'}<small class="muted-text">Stopped</small
                  >{/if}{#if item.result}<div class="error-banner" role="alert">
                    {item.result}
                  </div>{/if}
              </div>{/if}
            {#if item.role === 'user' && actions && editing !== item.id}<PromptActions
                {item}
                {actions}
                {...versions[item.id] ? { versions: versions[item.id] } : {}}
                edit={() => (editing = item.id)}
              />{/if}
          </article>{/if}
      {/if}
    {/each}
  </div>
</div>
{#if !nearBottom}<button class="jump-button button subtle" onclick={bottom}
    ><ArrowDown size={14} /> Latest messages</button
  >{/if}
