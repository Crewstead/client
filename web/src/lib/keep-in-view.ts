/** Window edge gap for menus, matching the page's narrow-screen gutter. */
const GAP = 12;

/**
 * Shifts a picker's menu sideways when it opens so it never runs past the window edge, which would
 * otherwise add scrollbars. Attach to the `<details>` element; the menu is its `.model-options`.
 */
export function keepInView(details: HTMLDetailsElement) {
  const place = () => {
    const menu = details.querySelector<HTMLElement>('.model-options');
    if (!menu || !details.open) return;
    menu.style.translate = '';
    const box = menu.getBoundingClientRect();
    const overRight = box.right - (window.innerWidth - GAP);
    const shift =
      overRight > 0 ? -Math.min(overRight, box.left - GAP) : Math.max(0, GAP - box.left);
    if (shift) menu.style.translate = `${shift}px 0`;
  };
  details.addEventListener('toggle', place);
  window.addEventListener('resize', place);
  return {
    destroy() {
      details.removeEventListener('toggle', place);
      window.removeEventListener('resize', place);
    },
  };
}
