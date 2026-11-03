<script lang="ts">
  /** Messages by weekday (Monday first) and hour, as a grid of cells shaded by count. */
  let { hours }: { hours: number[][] } = $props();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const most = $derived(Math.max(...hours.flat(), 1));
  const busiest = $derived.by(() => {
    let best = { day: -1, hour: -1, count: 0 };
    hours.forEach((row, day) =>
      row.forEach((count, hour) => {
        if (count > best.count) best = { day, hour, count };
      }),
    );
    return best;
  });
</script>

<section class="usage-card heatmap-card" aria-label="When you chat">
  <h2 class="usage-card-title">When you chat</h2>
  <div
    class="heatmap"
    role="img"
    aria-label={busiest.count
      ? `Busiest: ${days[busiest.day]} at ${busiest.hour}:00`
      : 'No messages yet'}
  >
    {#each hours as row, day (day)}
      <span class="heatmap-day">{days[day]}</span>
      {#each row as count, hour (hour)}
        <i
          style:opacity={count ? 0.18 + (count / most) * 0.82 : 1}
          class:none={!count}
          title={`${days[day]} ${String(hour).padStart(2, '0')}:00 · ${count} ${count === 1 ? 'message' : 'messages'}`}
        ></i>
      {/each}
    {/each}
    <span></span>
    {#each [0, 6, 12, 18] as hour (hour)}<span
        class="heatmap-hour"
        style:grid-column={`${hour + 2} / span 6`}>{hour}:00</span
      >{/each}
  </div>
  {#if busiest.count}<p class="usage-note">
      Busiest: {days[busiest.day]} around {busiest.hour}:00.
    </p>{/if}
</section>
