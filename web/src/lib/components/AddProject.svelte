<script lang="ts">
  import { closeOutside } from '#lib/close-outside.ts';
  import { resolve } from '$app/paths';
  import { LoaderCircle, Plus } from '@lucide/svelte';
  import { useWorkspace } from '#lib/workspace.svelte.ts';
  import '@crewstead/ui/dialogs.css';
  import '@crewstead/ui/place-dialog.css';
  import '@crewstead/ui/add-project.css';
  let {
    added,
    problem,
    close,
  }: {
    /** A project was added and the hub lists it: open it. */
    added: (id: string) => void;
    /** What went wrong, or '' once it is fine again. */
    problem: (text: string) => void;
    /** Closes the panel on a phone, when a link leaves it. */
    close: () => void;
  } = $props();
  const workspace = useWorkspace();
  /** Inside the Crewstead app, which can pick a folder on this computer; absent in a browser. */
  const desktop = (globalThis as { crewsteadDesktop?: { addProject?: () => Promise<string> } })
    .crewsteadDesktop;
  let adding = $state(false);
  let explaining = $state(false);
  let dialog = $state<HTMLDialogElement>();

  /** In the app: picks a folder on this computer, then opens the project once the hub lists it. */
  async function add() {
    if (!desktop?.addProject) {
      explaining = true;
      return;
    }
    adding = true;
    problem('');
    const before = new Set((workspace.catalog?.projects ?? []).map((project) => project.id));
    const answer = await desktop.addProject().catch(() => 'Could not add that folder.');
    if (answer) {
      if (answer !== 'cancelled') problem(answer);
      adding = false;
      return;
    }
    // The computer tells the hub about it a moment later.
    for (let attempt = 0; attempt < 12; attempt++) {
      await workspace.refresh();
      const found = workspace.catalog?.projects.find((project) => !before.has(project.id));
      if (found) {
        adding = false;
        return added(found.id);
      }
      await new Promise((done) => setTimeout(done, 500));
    }
    adding = false;
    problem('Added. It will show here once the computer reports it.');
  }
</script>

<button
  class="new-session"
  aria-label="Add project"
  title={desktop?.addProject ? 'Add project: pick a folder on this computer' : 'Add project'}
  disabled={adding}
  onclick={add}
  >{#if adding}<LoaderCircle size={16} class="place-spin" />{:else}<Plus size={16} />{/if}</button
>

{#if explaining}
  <!-- In a browser: projects are folders on a computer, so they are added there. -->
  <dialog
    {@attach closeOutside}
    class="dialog-content add-project-dialog"
    aria-labelledby="add-project-title"
    bind:this={dialog}
    {@attach (node) => node.showModal()}
    onclose={() => (explaining = false)}
  >
    <h2 class="dialog-title" id="add-project-title">Add a project</h2>
    <p class="dialog-description">
      A project is a folder on one of your computers, so it is added there. Open the Crewstead app
      on that computer and press <strong>+</strong> next to Projects to pick a folder.
    </p>
    <p class="muted-text">Or, in a terminal on that computer:</p>
    <pre><code>crewstead add &lt;folder&gt; [name]</code></pre>
    <div class="dialog-actions">
      <a
        class="button subtle"
        href="https://github.com/Crewstead/client/releases/latest"
        target="_blank"
        rel="noreferrer">Get the app</a
      >
      <a
        class="button subtle"
        href={resolve('/settings?tab=projects')}
        onclick={() => {
          dialog?.close();
          close();
        }}>Project settings</a
      >
      <button class="button" onclick={() => dialog?.close()}>OK</button>
    </div>
  </dialog>
{/if}
