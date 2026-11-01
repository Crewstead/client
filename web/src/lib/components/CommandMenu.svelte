<script lang="ts">
  import type { Command } from '#lib/commands.ts';
  let {
    id,
    commands,
    active = $bindable(),
    choose,
    prefix = '/',
  }: {
    id: string;
    commands: Command[];
    /** "/" for commands, "@" for mentions. */
    prefix?: string;
    active: number;
    choose: (command: Command) => void;
  } = $props();
</script>

<!-- Suggestions while a command is typed; the prompt keeps focus and the arrow keys move here. -->
<ul class="command-menu" {id} role="listbox" aria-label={prefix === '@' ? 'Mentions' : 'Commands'}>
  {#each commands as command, index (command.name)}
    <li
      id={`${id}-${command.name}`}
      role="option"
      aria-selected={index === active}
      class:active={index === active}
      onpointermove={() => (active = index)}
      onpointerdown={(event) => {
        // Keep focus in the prompt while choosing with the mouse.
        event.preventDefault();
        choose(command);
      }}
    >
      <span class="command-name"
        >{prefix}{command.name}{#if command.args}<small>{command.args}</small>{/if}</span
      ><span class="command-hint">{command.hint}</span>
    </li>
  {/each}
</ul>
