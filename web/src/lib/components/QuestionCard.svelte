<script lang="ts">
  import { Check, MessageCircleQuestion, PenLine } from '@lucide/svelte';
  import { answersText, type Question } from '@crewstead/core/protocol';
  import '@crewstead/ui/questions.css';
  let {
    questions,
    open,
    disabled = false,
    answer,
  }: {
    questions: Question[];
    /** The chat's latest item and nothing runs: the owner can answer here. */
    open: boolean;
    /** Nothing can be sent right now (not connected, sending). */
    disabled?: boolean;
    answer: (text: string) => Promise<boolean>;
  } = $props();
  // One question with one choice is answered by a click; otherwise the answers go with Send.
  const quick = $derived(questions.length === 1 && !questions[0]!.multiple);
  let picked = $state<string[][]>([]);
  let own = $state<string[]>([]);
  let busy = $state(false);
  const answers = $derived(
    questions.map((_, index) =>
      [...(picked[index] ?? []), (own[index] ?? '').trim()].filter(Boolean),
    ),
  );
  const ready = $derived(answers.every((chosen) => chosen.length > 0));
  async function send(chosen = answers) {
    if (busy || disabled || !chosen.every((entry) => entry.length)) return;
    busy = true;
    await answer(answersText(questions, chosen));
    busy = false;
  }
  function pick(index: number, label: string) {
    const question = questions[index]!;
    if (quick) return void send([[label]]);
    const current = picked[index] ?? [];
    picked[index] = question.multiple
      ? current.includes(label)
        ? current.filter((entry) => entry !== label)
        : [...current, label]
      : [label];
    // A single choice is one answer: an option or the owner's own words.
    if (!question.multiple) own[index] = '';
  }
  function write(index: number, text: string) {
    own[index] = text;
    if (text.trim() && !questions[index]!.multiple) picked[index] = [];
  }
</script>

{#if open}<article class="question-card" aria-label="Questions for you">
    {#each questions as question, index (question.question)}
      <fieldset class="question" disabled={disabled || busy}>
        <legend>{question.question}</legend>
        <div class="question-options">
          {#each question.options as option (option.label)}
            {@const chosen = picked[index]?.includes(option.label) ?? false}
            <button
              type="button"
              class="question-option"
              class:multiple={question.multiple}
              aria-pressed={chosen}
              onclick={() => pick(index, option.label)}
            >
              <span class="question-mark" aria-hidden="true"
                >{#if chosen}<Check size={11} strokeWidth={3} />{/if}</span
              >
              <span class="question-text"
                ><span>{option.label}</span>{#if option.description}<small
                    >{option.description}</small
                  >{/if}</span
              >
            </button>
          {/each}
          <label class="question-own"
            ><PenLine size={13} aria-hidden="true" /><input
              aria-label={`Your own answer: ${question.question}`}
              placeholder="Something else"
              value={own[index] ?? ''}
              oninput={(event) => write(index, event.currentTarget.value)}
              onkeydown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
                event.preventDefault();
                void send();
              }}
            /></label
          >
        </div>
      </fieldset>
    {/each}
    {#if !quick || ready}<footer>
        <button
          class="button primary small"
          disabled={!ready || busy || disabled}
          onclick={() => void send()}>Send</button
        >
      </footer>{/if}
  </article>{:else}<p class="question-asked">
    <MessageCircleQuestion size={14} /><span
      >{questions.map((question) => question.question).join(' ')}</span
    >
  </p>{/if}
