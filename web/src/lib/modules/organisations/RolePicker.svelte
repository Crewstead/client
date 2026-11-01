<script lang="ts">
  import type { Role } from '@crewstead/core/protocol';
  import OptionPicker from '#lib/components/OptionPicker.svelte';
  let {
    value = $bindable(),
    options,
    label,
    disabled = false,
    onchange,
  }: {
    value: Role;
    options: Role[];
    label: string;
    disabled?: boolean;
    onchange?: (role: Role) => void;
  } = $props();
  const described: Record<Role, { label: string; hint: string }> = {
    member: { label: 'Member', hint: 'Uses organisation models' },
    admin: { label: 'Admin', hint: 'Manages members and providers' },
    owner: { label: 'Owner', hint: 'Full control, including ownership' },
  };
</script>

<OptionPicker
  bind:value
  options={options.map((role) => ({ value: role, ...described[role] }))}
  {label}
  {disabled}
  {onchange}
/>
