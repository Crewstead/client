import type { ModelEntryView } from '@crewstead/core/protocol';

/** Spending amounts: cents normally, "<$0.01" for tiny non-zero sums. */
export function money(value: number) {
  if (value > 0 && value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

/** A per-million-token price: cents from $1 up, three significant digits below ($0.294, $0.20). */
export function perMillion(value: number) {
  const text = value >= 1 ? value.toFixed(2) : String(Number(value.toPrecision(3)));
  const [whole, decimals = ''] = text.split('.');
  return `$${whole}.${decimals.padEnd(2, '0')}`;
}

export const isPriced = (model: ModelEntryView) =>
  model.inputUsd !== null && model.cachedInputUsd !== null && model.outputUsd !== null;

/** "$0.50 in · $1.50 out" for the model lists; full detail lives in the price dialog. */
export function priceSummary(model: ModelEntryView) {
  if (!isPriced(model)) return '';
  if (!model.inputUsd && !model.cachedInputUsd && !model.outputUsd) return 'Free';
  const sale =
    model.priceSource === 'listed' && model.listed?.discount
      ? ` · ${Math.round(model.listed.discount * 100)}% off`
      : '';
  return `${perMillion(model.inputUsd!)} in · ${perMillion(model.outputUsd!)} out${sale}`;
}

export const modelsOn = (models: ModelEntryView[]) =>
  models.filter((model) => model.enabled).length;

type Listed = NonNullable<ModelEntryView['listed']>;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/** The listed prices with the current promotion applied, when there is one. */
export function discounted(listed: Listed) {
  if (!listed.discount) return undefined;
  const pay = 1 - listed.discount;
  return {
    inputUsd: round6(listed.inputUsd * pay),
    cachedInputUsd: round6(listed.cachedInputUsd * pay),
    outputUsd: round6(listed.outputUsd * pay),
  };
}

/** True when the model's prices match neither the provider's full nor its discounted prices. */
export function differsFromListed(model: ModelEntryView) {
  const listed = model.listed;
  if (!listed || !isPriced(model)) return false;
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, b * 0.005);
  const matches = (prices: Omit<Listed, 'discount'>) =>
    near(model.inputUsd!, prices.inputUsd) &&
    near(model.cachedInputUsd!, prices.cachedInputUsd) &&
    near(model.outputUsd!, prices.outputUsd);
  const sale = discounted(listed);
  return !matches(listed) && !(sale && matches(sale));
}

/** "$0.20 in · $0.006 cached · $0.60 out" for the price dialog. */
export function fullPrices(prices: {
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
}) {
  return `${perMillion(prices.inputUsd)} in · ${perMillion(prices.cachedInputUsd)} cached · ${perMillion(prices.outputUsd)} out`;
}
