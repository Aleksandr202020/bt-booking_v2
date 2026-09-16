export type CarCategory = 'passenger' | 'crossover' | 'minivan' | 'commercial';

export const PRICE_CENTS: Readonly<Record<CarCategory, number>> = {
  passenger: 2500,
  crossover: 3000,
  minivan: 3500,
  commercial: 3500,
};

export function getPriceCents(category: CarCategory): number {
  return PRICE_CENTS[category];
}
