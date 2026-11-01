<script lang="ts">
  import { ArrowUp, ListEnd, Paperclip, Square } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import ApprovalPicker from './ApprovalPicker.svelte';
  import ContextMeter from './ContextMeter.svelte';
  import CommandMenu from './CommandMenu.svelte';
  import AttachmentTray from './attachments/AttachmentTray.svelte';
  import { matchCommand, suggestCommands, type Command } from '#lib/commands.ts';
  import { insertMention, mentionAt } from '#lib/mentions.ts';
  import { activeModules, mentionsFor } from '#lib/modules/registry.ts';
  import type { Mention } from '#lib/modules/types.ts';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import { PendingFiles } from '#lib/pending-files.svelte.ts';
  import '@crewstead/ui/composer.css';
  let {
    draftKey,
    busy,
    connected,
    enabled,
    sending,
    send,
    stop,
    controls,
    modelLabel = 'Test model',
    unavailable = 'Turn on test replies in Settings to continue.',
    context,
    commands = [],
    images = true,
    offline = !connected,
    paused = false,
    queue,
    above,
  }: {
    draftKey: string;
    busy: boolean;
    connected: boolean;
    enabled: boolean;
    sending: boolean;
    /** Sends the text and the ids of files attached to it. */
    send: (text: string, attachments: string[]) => Promise<boolean>;
    stop: () => Promise<void>;
    controls?: Snippet;
    modelLabel?: string;
    /** Placeholder shown when sending is not possible. */
    unavailable?: string;
    /** How full the model's context is, once a reply has reported it. */
    context?: {
      used: number;
      window?: number;
      /** All tokens this chat has used so far, over every model. */
      total?: number;
      /** Opens the chat's statistics. */
      details?: () => void;
    };
    /** Slash commands offered while typing "/". */
    commands?: Command[];
    /** The model reads images; otherwise it gets their names only. */
    images?: boolean;
    /** Shows the "Connecting…" note; by default whenever not connected. */
    offline?: boolean;
    /** Holds sending without changing the placeholder, e.g. while the next chat loads. */
    paused?: boolean;
    /** Sends a message once the running reply ends; without it, nothing is sent while one runs. */
    queue?: (text: string, attachments: string[]) => Promise<boolean>;
    /** Shown just above the box, e.g. the messages waiting to be sent. */
    above?: Snippet;
  } = $props();
  /** Puts text in the box, e.g. a waiting message taken back to edit. */
  export function fill(value: string) {
    text = value;
    queueMicrotask(() => input?.focus());
  }
  let text = $state('');
  let failure = $state('');
  let initialized = $state(false);
  let input: HTMLTextAreaElement;
  const pending = new PendingFiles();
  let picker: HTMLInputElement;
  let dragging = $state(false);
  const hasImages = $derived(pending.files.some((file) => file.preview));
  const ready = $derived(
    (!!text.trim() || pending.ids.length > 0) && !pending.uploading && !pending.failed,
  );
  function attach(files: Iterable<File>) {
    failure = pending.add(files);
    input?.focus();
  }
  function paste(event: ClipboardEvent) {
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    attach(files);
  }
  function drop(event: DragEvent) {
    dragging = false;
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    attach(event.dataTransfer.files);
  }
  const menuId = $props.id();
  let active = $state(0);
  let dismissed = $state('');
  const suggestions = $derived(text === dismissed ? [] : suggestCommands(text, commands));
  // "@name" anywhere in the message mentions something modules offer, e.g. a skill.
  const workspace = useWorkspace();
  const sources = $derived(activeModules(workspace.catalog?.modules));
  const sourceKey = $derived(sources.map((module) => module.id).join());
  let mentions = $state<Mention[]>([]);
  let caret = $state(0);
  $effect(() => {
    void sourceKey;
    let live = true;
    void mentionsFor(sources).then((list) => live && (mentions = list));
    return () => void (live = false);
  });
  const mention = $derived(text === dismissed ? undefined : mentionAt(text, caret));
  const options: Command[] = $derived(
    suggestions.length
      ? suggestions
      : mention
        ? mentions.filter((entry) => entry.name.startsWith(mention.query)).slice(0, 8)
        : [],
  );
  $effect(() => {
    void options.length;
    active = 0;
  });
  const track = () => (caret = input?.selectionStart ?? text.length);
  function complete(command: Command) {
    if (!suggestions.length && mention) {
      const next = insertMention(text, mention, caret, command.name);
      text = next.text;
      caret = next.caret;
      queueMicrotask(() => input?.setSelectionRange(next.caret, next.caret));
    } else text = `/${command.name}${command.args ? ' ' : ''}`;
    input?.focus();
  }
  onMount(() => {
    text = sessionStorage.getItem(draftKey) ?? '';
    initialized = true;
  });
  $effect(() => {
    if (initialized && typeof sessionStorage !== 'undefined')
      sessionStorage.setItem(draftKey, text);
  });
  $effect(() => {
    void text;
    if (initialized)
      queueMicrotask(() => {
        if (!input?.isConnected) return;
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
      });
  });
  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    // Commands that act in the app run here, even while a reply is being written.
    const invoked = matchCommand(text, commands);
    if (invoked?.command.run) {
      if (invoked.command.args && !invoked.argument) {
        failure = `Add ${invoked.command.args} after /${invoked.command.name}.`;
        return;
      }
      failure = '';
      const original = text;
      await invoked.command.run(invoked.argument);
      if (text === original) text = '';
      return;
    }
    if (!ready || (busy && !queue) || !connected || !enabled || paused || sending) return;
    const original = text;
    // While a reply runs, the message waits for it to end.
    const deliver = busy && queue ? queue : send;
    if (await deliver(original.trim(), pending.ids)) {
      if (text === original) text = '';
      pending.clear();
      // A new chat opens another page, so this composer may be gone: clear the saved draft directly.
      if (sessionStorage.getItem(draftKey) === original) sessionStorage.removeItem(draftKey);
      if (input?.isConnected) input.focus();
    }
  }
  function keydown(event: KeyboardEvent) {
    if (options.length && !event.isComposing) {
      const chosen = options[active]!;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        active = (active + step + options.length) % options.length;
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissed = text;
        return;
      }
      // Tab or Enter completes the name; Enter on a finished name without arguments runs it.
      const finished = !!suggestions.length && text === `/${chosen.name}` && !chosen.args;
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey && !finished)) {
        event.preventDefault();
        complete(chosen);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
  }
</script>

<div class="composer-area">
  {#if above}{@render above()}{/if}
  <form
    class="composer"
    class:dragging
    onsubmit={submit}
    ondragover={(event) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      dragging = true;
    }}
    ondragleave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dragging = false;
    }}
    ondrop={drop}
  >
    {#if options.length}<CommandMenu
        id={menuId}
        commands={options}
        prefix={suggestions.length ? '/' : '@'}
        bind:active
        choose={complete}
      />{/if}
    {#if pending.files.length}<AttachmentTray {pending} />{/if}
    <label class="sr-only" for="message">Message</label><textarea
      id="message"
      role="combobox"
      aria-expanded={options.length > 0}
      aria-controls={menuId}
      aria-autocomplete="list"
      aria-activedescendant={options.length ? `${menuId}-${options[active]?.name}` : undefined}
      bind:this={input}
      bind:value={text}
      onkeydown={keydown}
      oninput={track}
      onkeyup={track}
      onclick={track}
      onpaste={paste}
      rows="1"
      maxlength="8000"
      placeholder={enabled ? 'Ask anything, or describe a task…' : unavailable}></textarea>
    <div class="composer-toolbar">
      <div class="composer-model">
        <input
          bind:this={picker}
          type="file"
          multiple
          hidden
          onchange={(event) => {
            attach(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
          }}
        /><button
          type="button"
          class="icon-button composer-attach"
          aria-label="Attach files"
          title="Attach images or text files (or paste, or drop them here)"
          disabled={!enabled}
          onclick={() => picker.click()}><Paperclip size={16} /></button
        >
        {#if controls}{@render controls()}{:else}<span>{modelLabel}</span>{/if}
        <ApprovalPicker failed={(message) => (failure = message)} />
      </div>
      <div class="composer-send">
        {#if context?.used}<ContextMeter {...context} used={context.used} />{/if}
        {#if busy && queue && ready}<button
            class="send-button"
            type="submit"
            aria-label="Queue message"
            title="Send when the reply ends"
            disabled={!connected || !enabled || paused || sending}><ListEnd size={17} /></button
          >{/if}
        {#if busy}<button
            class="send-button stop"
            type="button"
            aria-label="Stop reply"
            onclick={stop}><Square size={13} fill="currentColor" /></button
          >{:else}<button
            class="send-button"
            type="submit"
            aria-label="Send message"
            disabled={!ready || !connected || !enabled || paused || sending}
            ><ArrowUp size={18} /></button
          >{/if}
      </div>
    </div>
  </form>
  {#if failure}<p class="composer-caption failed" role="alert">{failure}</p>{/if}
  {#if hasImages && !images}<p class="composer-caption" role="status">
      This model can’t see images; it gets their names only.
    </p>{/if}
  {#if offline}<p class="composer-caption" role="status">Connecting… Your draft is saved.</p>{/if}
</div>
