import { describe, expect, it } from 'vitest';
import {
  estimateImageCost,
  formatCostEstimate,
  getBillingStatusLabel,
} from '@/lib/image-cost-estimator';

describe('image cost estimates', () => {
  it('estimates text generation cost by size and quality without claiming exact billing', () => {
    const estimate = estimateImageCost({
      mode: 'text-to-image',
      outputSize: '2K',
      quality: 'high',
      count: 1,
    });

    expect(estimate).toEqual({
      currency: 'CNY',
      min: 0.08,
      max: 0.13,
      source: 'gray-log-estimate',
    });
    expect(formatCostEstimate(estimate)).toBe('约 ¥0.08-0.13');
  });

  it('treats edit and fusion as a higher cost estimate than generation', () => {
    const generation = estimateImageCost({
      mode: 'text-to-image',
      outputSize: '1K',
      quality: 'auto',
      count: 1,
    });
    const edit = estimateImageCost({
      mode: 'image-to-image',
      outputSize: '1K',
      quality: 'auto',
      count: 1,
    });

    expect(edit.min).toBeGreaterThan(generation.min);
    expect(edit.max).toBeGreaterThan(generation.max);
  });

  it('uses the fusion estimate table when image editing has multiple reference images', () => {
    const singleEdit = estimateImageCost({
      mode: 'image-to-image',
      outputSize: '2K',
      quality: 'auto',
      count: 1,
      referenceImageCount: 1,
    });
    const fusion = estimateImageCost({
      mode: 'image-to-image',
      outputSize: '2K',
      quality: 'auto',
      count: 1,
      referenceImageCount: 3,
    });

    expect(singleEdit).toMatchObject({ min: 0.1, max: 0.13 });
    expect(fusion).toMatchObject({ min: 0.12, max: 0.13 });
  });

  it('labels actual billing as pending NewAPI verification by default', () => {
    expect(getBillingStatusLabel('pending-newapi-check')).toBe('实际扣费待 NewAPI 后台核对');
    expect(getBillingStatusLabel('unverified')).toContain('待 NewAPI 后台核对');
  });
});
