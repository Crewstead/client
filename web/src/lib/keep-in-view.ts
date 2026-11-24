/** Window edge gap for menus, matching the page's narrow-screen gutter. */
const GAP = 12;

/**
 * Keeps a dropdown's panel in the window when it opens: shifted sideways rather than past an edge
 * (which would add scrollbars), and turned the other way (`opens-up`, `opens-down`) when it runs out of
 * room where it opens and there is more on the other side. Attach to the `<details>` element.
 */
export function keepInView(details: HTMLDetailsElement, selector = '.dropdown-panel') {
  const place = () => {
    const menu = details.querySelector<HTMLElement>(selector);
    if (!menu || !details.open) return;
    menu.style.translate = '';
    menu.classList.remove('opens-up', 'opens-down');
    const trigger = details.getBoundingClientRect();
    const room = { above: trigger.top, below: window.innerHeight - trigger.bottom };
    const fitted = menu.getBoundingClientRect();
    if (fitted.bottom > window.innerHeight - GAP && room.above > room.below)
      menu.classList.add('opens-up');
    else if (fitted.top < GAP && room.below > room.above) menu.classList.add('opens-down');
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
