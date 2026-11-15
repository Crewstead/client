import type { Effort } from '@crewstead/core/protocol';

const KEY = 'crewstead-effort';
export type EffortChoice = Effort | 'auto';
export const efforts: Array<{ value: EffortChoice; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const choices = efforts.map((option) => option.value);

function saved(): EffortChoice {
  try {
    const value = localStorage.getItem(KEY) as EffortChoice | null;
    return value && choices.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** The effort chosen in the composer, remembered on this device and used for every chat. */
class EffortSetting {
  value = $state<EffortChoice>(saved());
  set(next: EffortChoice) {
    this.value = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Without storage the choice lasts for this page only.
    }
  }
  /** What to send with a message: nothing for "auto", so the provider uses its default. */
  forRequest(): Effort | undefined {
    return this.value === 'auto' ? undefined : this.value;
  }
}

export const effortSetting = new EffortSetting();
