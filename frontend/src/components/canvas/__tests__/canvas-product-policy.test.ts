import { describe, expect, it } from 'vitest';
import {
  normalizeCanvasGenerationConfig,
  resolveCanvasImageProduct,
} from '@/components/canvas/canvas-product-policy';
import type { AmoTokenImageCatalog } from '@/lib/amotoken-image-catalog';
import type { CanvasGenerationConfig } from '@/components/canvas/types';

const catalog: AmoTokenImageCatalog = {
  version: 'image-v12',
  models: [{
    id: 'gpt-image-2',
    displayName: 'GPT Image 2',
    maxCount: 4,
    maxReferenceImages: 4,
    products: [
      { mode: 'generation', resolutionTier: '1K', sizes: ['1024x1024', '1536x1024'], quality: 'auto' },
      { mode: 'generation', resolutionTier: '2K', sizes: ['2048x2048', '2048x1536'], quality: 'auto' },
    ],
  }],
};

const config: CanvasGenerationConfig = {
  model: 'amotoken-gpt-image-2',
  outputSize: '1K',
  aspectRatio: '1:1',
  temperature: 1,
  count: 1,
  gptImageQuality: 'auto',
  gptImageStyle: 'auto',
  gptImageBackground: 'auto',
};

describe('infinite canvas AmoToken product policy', () => {
  it('normalizes legacy persisted settings to the released AmoToken defaults', () => {
    expect(normalizeCanvasGenerationConfig({
      ...config,
      model: 'gemini-3-pro-image-preview',
      outputSize: 'auto',
      aspectRatio: 'auto',
      customSize: '3264x2448',
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'transparent',
    })).toEqual(config);
  });

  it('keeps text-to-image available and selects the catalog size matching the aspect ratio', () => {
    expect(resolveCanvasImageProduct({
      catalog,
      providerModel: 'gpt-image-2',
      mode: 'generation',
      config: { ...config, aspectRatio: '3:2' },
      referenceImageCount: 0,
    })).toMatchObject({
      available: true,
      model: 'gpt-image-2',
      mode: 'generation',
      resolutionTier: '1K',
      size: '1536x1024',
      aspectRatio: '3:2',
      quality: 'auto',
      count: 1,
      referenceImageCount: 0,
    });
  });

  it('reports edit as unavailable until the catalog exposes an edit product', () => {
    expect(resolveCanvasImageProduct({
      catalog,
      providerModel: 'gpt-image-2',
      mode: 'edit',
      config,
      referenceImageCount: 1,
    })).toEqual({
      available: false,
      reason: '当前模型暂不支持图生图，请移除参考图或稍后重试',
    });
  });

  it('rejects a custom size that is not listed in the selected catalog product', () => {
    expect(resolveCanvasImageProduct({
      catalog,
      providerModel: 'gpt-image-2',
      mode: 'generation',
      config: { ...config, outputSize: '2K', customSize: '2000x1400' },
      referenceImageCount: 0,
    })).toEqual({
      available: false,
      reason: '当前模型不支持这个图片尺寸',
    });
  });
});
