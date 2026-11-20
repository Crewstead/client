<script lang="ts">
  import { Check, ChevronRight, MessageSquare, RotateCcw, TriangleAlert } from '@lucide/svelte';
  import type { Finding, PlanSection } from '@crewstead/core/plans';
  import type { ReviewFinding } from './api.ts';
  import Markdown from '#lib/markdown/Markdown.svelte';
  import { detailRows } from './details.ts';
  import ItemComments from './ItemComments.svelte';
  import PlanNote from './PlanNote.svelte';
  import { useReview } from './review.ts';
  import { badgeOf } from './sections.ts';
  import '@crewstead/ui/plan-items.css';
  let {
    section,
    item,
    findings = [],
    settled = [],
  }: {
    section: PlanSection;
    item: { id: string; title: string; short: string; full?: string } & Record<string, unknown>;
    /** Open: the checks' and the review's undecided findings. */
    findings?: (Finding & { still?: string })[];
    /** Review findings the chat's model settled, with why. */
    settled?: ReviewFinding[];
  } = $props();
  const OUTCOMES = { fixed: 'Fixed', wrong: 'Wrong', not_needed: 'Not needed', later: 'Later' };
  const outcome = (f: ReviewFinding) =>
    f.decision!.outcome === 'fixed' && !f.decision!.confirmed
      ? 'Fixed, waiting for a re-check'
      : OUTCOMES[f.decision!.outcome];
  const rows = $derived(detailRows(section, item));
  const badge = $derived(badgeOf(section, item));
  const review = useReview();
  const open = $derived(
    review?.comments.filter((comment) => comment.item === item.id && !comment.resolved).length ?? 0,
  );
  // Everything opens when it can be commented on; else only what has more to show.
  const more = $derived(
    !!review || !!item.full || rows.length > 0 || findings.length > 0 || settled.length > 0,
  );
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

{#snippet head()}
  <span class="plan-id">{item.id}</span>
  <span class="plan-item-text"
    ><span class="plan-item-title">{item.title}</span><span class="plan-short">{item.short}</span
    ></span
  >
  {#if findings.length}<span
      class="plan-flag"
      data-severity={findings[0]!.severity}
      title={findings.map((f) => f.message).join('\n')}
      ><TriangleAlert size={13} /><span class="sr-only">Findings:</span>{findings.length}</span
    >{/if}
  {#if open}<span class="plan-flag comments" title={`${open} open comment${open === 1 ? '' : 's'}`}
      ><MessageSquare size={13} /><span class="sr-only">Open comments:</span>{open}</span
    >{/if}
  {#if badge}<span class="plan-badge" data-tone={badge.tone} title={badge.text}
      ><span class="plan-badge-text">{badge.text}</span></span
    >{/if}
{/snippet}

{#if more}<details class="plan-item" id={item.id}>
    <summary><ChevronRight size={14} class="plan-chevron" />{@render head()}</summary>
    <div class="plan-item-body">
      {#if findings.length}<ul class="plan-findings">
          {#each findings as finding (finding.message)}
            <li data-severity={finding.severity}>
              {finding.message}{#if finding.still}<small
                  >Not settled by the fix: {finding.still}</small
                >{/if}
            </li>
          {/each}
        </ul>{/if}
      {#if settled.length}<ul class="plan-findings settled">
          {#each settled as finding (finding.id)}
            <li data-outcome={finding.decision!.outcome}>
              <span><strong>{outcome(finding)}:</strong> {finding.decision!.why}</span>
              <small>{finding.message}</small>
              {#if review}<button class="link-button" onclick={() => review.reopen(finding.id)}
                  ><RotateCcw size={12} /> Reopen</button
                >{/if}
            </li>
          {/each}
        </ul>{/if}
      {#if item.full}<div class="markdown plan-full"><Markdown text={item.full} /></div>{/if}
      {#if rows.length}<dl class="plan-details">
          {#each rows as row, index (index)}
            <dt>{row.label}</dt>
            <dd>
              {#if row.kind === 'text'}{row.text}
              {:else if row.kind === 'refs'}<span class="plan-refs"
                  >{#each row.refs as ref (ref)}<a class="plan-id" href={`#${ref}`}>{ref}</a
                    >{/each}</span
                >
              {:else if row.kind === 'code'}{#each row.lines as line, index (index)}<code
                    >{line}</code
                  >{/each}
              {:else if row.kind === 'options'}<ul class="plan-options">
                  {#each row.options as option (option.label)}
                    <li class:chosen={option.chosen}>
                      <span class="plan-option-mark"
                        >{#if option.chosen}<Check size={12} strokeWidth={3} />{/if}</span
                      ><span
                        ><strong>{option.label}</strong> — {option.short}{#if option.cons}<small
                            >{option.cons}</small
                          >{/if}</span
                      >
                    </li>
                  {/each}
                </ul>
              {:else if row.kind === 'steps'}{#if row.when}<span class="plan-when">{row.when}</span
                  >{/if}
                <ol class="plan-steps">
                  {#each row.steps as step, index (index)}
                    <li>
                      <span
                        ><em>{step.screen}</em>{#if step.control}: “{step.control}”{/if} — {step.action}</span
                      ><small
                        >{step.result}{#if step.source}<code>{step.source}</code>{/if}</small
                      >
                    </li>
                  {/each}
                </ol>
              {:else if row.kind === 'cases'}<ul class="plan-cases">
                  {#each row.cases as entry (entry.name)}
                    <li>
                      <strong>{entry.name}</strong>{#if entry.given}<span>{entry.given}</span
                        >{/if}<small>{entry.expect}</small>
                    </li>
                  {/each}
                </ul>
              {:else if row.kind === 'note'}<PlanNote file={row.file} />
              {:else if row.kind === 'evidence'}<ul class="plan-evidence">
                  {#each row.evidence as proof (proof.id)}
                    <li data-passed={proof.passed}>
                      {proof.summary}<small>{proof.kind} · {when(proof.at)}</small>
                    </li>
                  {/each}
                </ul>{/if}
            </dd>
          {/each}
        </dl>{/if}
      <ItemComments item={item.id} />
    </div>
  </details>{:else}<div class="plan-item plain" id={item.id}>{@render head()}</div>{/if}
