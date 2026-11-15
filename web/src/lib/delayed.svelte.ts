/**
 * True once `condition` has held for `ms` without a break, false as soon as it stops: for states
 * shown only when they last a moment (a slow load, a dropped connection), never on every blip.
 */
export function delayed(condition: () => boolean, ms: number) {
  let shown = $state(false);
  $effect(() => {
    if (!condition()) {
      shown = false;
      return;
    }
    const timer = setTimeout(() => (shown = true), ms);
    return () => clearTimeout(timer);
  });
  return {
    get value() {
      return shown;
    },
  };
}
