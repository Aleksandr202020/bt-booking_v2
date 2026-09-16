import { describe, expect, it } from 'vitest';
import { getPriceCents } from './pricing';

describe('pricing', () => {
  it('uses the fixed passenger price', () => {
    expect(getPriceCents('passenger')).toBe(2500);
  });

  it('uses the fixed crossover price', () => {
    expect(getPriceCents('crossover')).toBe(3000);
  });

  it('uses 35 euro for minivan and commercial', () => {
    expect(getPriceCents('minivan')).toBe(3500);
    expect(getPriceCents('commercial')).toBe(3500);
  });
});
