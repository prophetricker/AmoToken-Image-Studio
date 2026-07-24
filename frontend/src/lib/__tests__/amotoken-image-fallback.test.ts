import { describe, expect, it } from 'vitest';
import {
  LEGACY_AMOTOKEN_IMAGE_CATALOG,
  isLegacyAmoTokenImageSubmission,
  type LegacyAmoTokenImageSubmission,
} from '@/lib/amotoken-image-fallback';

const invalidLegacySubmissions: Array<[
  string,
  Partial<LegacyAmoTokenImageSubmission>,
]> = [
  ['another model', { providerModel: 'gpt-image-1' }],
  ['2K output tier', { outputSize: '2K', size: '2048x2048' }],
  ['unsupported size', { size: '2048x2048' }],
  ['non-auto quality', { quality: 'medium' }],
  ['two outputs', { count: 2 }],
  ['two references', { mode: 'edit', referenceImageCount: 2 }],
  ['a reference for generation', { referenceImageCount: 1 }],
  ['no reference for edit', { mode: 'edit', referenceImageCount: 0 }],
];

describe('legacy AmoToken image fallback', () => {
  it('exposes only the quote-free GPT Image 2 1K contract', () => {
    expect(LEGACY_AMOTOKEN_IMAGE_CATALOG.models).toEqual([
      {
        id: 'gpt-image-2',
        displayName: 'GPT Image 2',
        maxCount: 1,
        maxReferenceImages: 1,
        products: [
          {
            mode: 'generation',
            resolutionTier: '1K',
            sizes: ['1024x1024', '1536x1024', '1024x1536'],
            quality: 'auto',
          },
          {
            mode: 'edit',
            resolutionTier: '1K',
            sizes: ['1024x1024', '1536x1024', '1024x1536'],
            quality: 'auto',
          },
        ],
      },
    ]);
  });

  it.each([
    ['generation', 0],
    ['edit', 1],
  ] as const)('allows a strict 1K %s submission', (mode, referenceImageCount) => {
    expect(isLegacyAmoTokenImageSubmission({
      providerModel: 'gpt-image-2',
      mode,
      outputSize: '1K',
      size: '1024x1024',
      quality: 'auto',
      count: 1,
      referenceImageCount,
    })).toBe(true);
  });

  it.each(invalidLegacySubmissions)('rejects %s without a quote', (_label, patch) => {
    expect(isLegacyAmoTokenImageSubmission({
      providerModel: 'gpt-image-2',
      mode: 'generation',
      outputSize: '1K',
      size: '1024x1024',
      quality: 'auto',
      count: 1,
      referenceImageCount: 0,
      ...patch,
    })).toBe(false);
  });
});
