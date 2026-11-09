<script lang="ts">
  let { rows = 2, label = 'Loading' }: { rows?: number; label?: string } = $props();
</script>

<!-- Stand-in rows of a settings card while its data loads: the same height as the real rows, so
     nothing moves when they arrive. -->
<ul class="loading-rows" aria-busy="true" aria-label={label}>
  {#each { length: rows }, index (index)}
    <li aria-hidden="true">
      <span class="loading-text"
        ><span class="loading-bar"></span><span class="loading-bar short"></span></span
      >
      <span class="loading-bar control"></span>
    </li>
  {/each}
</ul>
