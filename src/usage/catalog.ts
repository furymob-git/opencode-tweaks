import type { ModelPrice } from "./cost"

/** A catalog entry, narrowed to the fields the model card reads. */
export interface CatalogModel {
  readonly id: string
  readonly modelID: string
  readonly providerID: string
  readonly name: string
  readonly cost: readonly ModelPrice[]
}

/** Whether a price list charges anything at any of its rates. */
export function charged(prices: readonly ModelPrice[]): boolean {
  return prices.some((price) => price.input > 0 || price.output > 0 || price.cache.read > 0)
}

/**
 * The paid entry behind a free promo. Providers name the promo after the model
 * it borrows, so dropping a trailing `Free` and matching the same provider
 * finds the price the model lists at when it is not on the house.
 */
export function paidSibling(
  models: readonly CatalogModel[],
  selected: CatalogModel,
): CatalogModel | undefined {
  const base = selected.name.replace(/\s*\(?free\)?$/i, "").trim()
  if (base.length === 0 || base === selected.name) return undefined

  const candidates = models.filter(
    (candidate) =>
      candidate.providerID === selected.providerID &&
      candidate.id !== selected.id &&
      charged(candidate.cost) &&
      (candidate.name === base || candidate.name.startsWith(`${base} `)),
  )

  candidates.sort(
    (a, b) => Number(b.name === base) - Number(a.name === base) || a.name.length - b.name.length,
  )
  return candidates[0]
}
