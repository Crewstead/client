<script lang="ts">
  let {
    tabs,
    active,
    change,
  }: {
    tabs: { id: string; label: string }[];
    active: string;
    change: (id: string) => Promise<void>;
  } = $props();
  function keydown(event: KeyboardEvent, id: string) {
    const index = tabs.findIndex((tab) => tab.id === id);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const button = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    button?.focus();
    void change(tabs[next].id);
  }
</script>

<div class="settings-tabs" role="tablist" aria-label="Settings categories">
  {#each tabs as tab (tab.id)}
    <button
      class="settings-tab"
      role="tab"
      id={`settings-tab-${tab.id}`}
      aria-selected={active === tab.id}
      aria-controls={`settings-panel-${tab.id}`}
      tabindex={active === tab.id ? 0 : -1}
      onclick={() => change(tab.id)}
      onkeydown={(event) => keydown(event, tab.id)}>{tab.label}</button
    >
  {/each}
</div>
