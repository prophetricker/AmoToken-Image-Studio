import type {
  AmoTokenImageCatalog,
  AmoTokenImageOperationMode,
} from '@/lib/amotoken-image-catalog';

const LEGACY_1K_SIZES = ['1024x1024', '1536x1024', '1024x1536'];

export const LEGACY_AMOTOKEN_IMAGE_CATALOG: AmoTokenImageCatalog = {
  version: 'legacy-gpt-image-2-1k-v1',
  models: [
    {
      id: 'gpt-image-2',
      displayName: 'GPT Image 2',
      maxCount: 1,
      maxReferenceImages: 1,
      products: [
        {
          mode: 'generation',
          resolutionTier: '1K',
          sizes: [...LEGACY_1K_SIZES],
          quality: 'auto',
        },
        {
          mode: 'edit',
          resolutionTier: '1K',
          sizes: [...LEGACY_1K_SIZES],
          quality: 'auto',
        },
      ],
    },
  ],
};

export interface LegacyAmoTokenImageSubmission {
  providerModel: string;
  mode: AmoTokenImageOperationMode;
  outputSize: string;
  size?: string;
  quality: string;
  count: number;
  referenceImageCount: number;
}

export function isLegacyAmoTokenImageSubmission(input: LegacyAmoTokenImageSubmission): boolean {
  const referenceCountMatchesMode = input.mode === 'generation'
    ? input.referenceImageCount === 0
    : input.referenceImageCount === 1;

  return input.providerModel === 'gpt-image-2'
    && input.outputSize === '1K'
    && typeof input.size === 'string'
    && LEGACY_1K_SIZES.includes(input.size)
    && input.quality === 'auto'
    && input.count === 1
    && referenceCountMatchesMode;
}
