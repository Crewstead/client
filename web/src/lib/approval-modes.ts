import type { ApprovalMode } from '@crewstead/core/protocol';

/** The three ways tool calls are approved, as the prompt box and Settings describe them. */
export const approvalModes: Array<{ value: ApprovalMode; label: string; hint: string }> = [
  { value: 'ask', label: 'Ask first', hint: 'You approve each tool use' },
  {
    value: 'auto',
    label: 'Auto-review',
    hint: 'A reviewer checks each action against the chat; asks you if unsure',
  },
  { value: 'all', label: 'Approve all', hint: 'Everything runs, with no checks' },
];
