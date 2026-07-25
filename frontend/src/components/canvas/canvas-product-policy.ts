import type { AspectRatio, OutputSize } from '@/lib/job-store';
import type {
  AmoTokenImageCatalog,
  AmoTokenImageOperationMode,
} from '@/lib/amotoken-image-catalog';
import { AMOTOKEN_IMAGE_MODEL_ID } from '@/lib/nova-models';
import type { GptImageQuality, ParallelCount } from '@/lib/model-capabilities';
import type { CanvasGenerationConfig } from './types';

const KNOWN_ASPECT_RATIOS = new Set<AspectRatio>([
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5',
  '5:4', '8:1', '9:16', '16:9', '21:9',
]);

export type CanvasProductResolution = {
  available: true;
  catalogVersion: string;
  model: string;
  displayName: string;
  mode: AmoTokenImageOperationMode;
  resolutionTier: OutputSize;
  size: string;
  aspectRatio: AspectRatio;
  quality: GptImageQuality;
  count: number;
  referenceImageCount: number;
  maxReferenceImages: number;
} | {
  available: false;
  reason: string;
};

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

export function getCanvasAspectRatioForSize(size: string): AspectRatio {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return '1:1';
  const width = Number(match[1]);
  const height = Number(match[2]);
  const divisor = greatestCommonDivisor(width, height);
  const candidate = `${width / divisor}:${height / divisor}` as AspectRatio;
  return KNOWN_ASPECT_RATIOS.has(candidate) ? candidate : '1:1';
}

function normalizeOutputSize(value: OutputSize): OutputSize {
  return value === '1K' || value === '2K' || value === '4K' ? value : '1K';
}

function normalizeCount(value: number): ParallelCount {
  return Math.min(4, Math.max(1, Math.trunc(value || 1))) as ParallelCount;
}

function isGptImageQuality(value: string): value is GptImageQuality {
  return value === 'auto' || value === 'high' || value === 'medium' || value === 'low';
}

export function normalizeCanvasGenerationConfig(config: CanvasGenerationConfig): CanvasGenerationConfig {
  return {
    ...config,
    model: AMOTOKEN_IMAGE_MODEL_ID,
    outputSize: normalizeOutputSize(config.outputSize),
    aspectRatio: config.aspectRatio === 'auto' ? '1:1' : config.aspectRatio,
    customSize: undefined,
    count: normalizeCount(config.count),
    gptImageQuality: 'auto',
    gptImageStyle: 'auto',
    gptImageBackground: 'auto',
  };
}

export function resolveCanvasImageProduct(input: {
  catalog: AmoTokenImageCatalog;
  providerModel: string;
  mode: AmoTokenImageOperationMode;
  config: CanvasGenerationConfig;
  referenceImageCount: number;
}): CanvasProductResolution {
  const model = input.catalog.models.find(item => item.id === input.providerModel);
  if (!model) return { available: false, reason: '当前模型暂不可用，请稍后重试' };
  if (input.referenceImageCount > model.maxReferenceImages) {
    return { available: false, reason: `当前模型最多支持 ${model.maxReferenceImages} 张参考图` };
  }

  const resolutionTier = normalizeOutputSize(input.config.outputSize);
  const tierProducts = model.products.filter(product => (
    product.mode === input.mode && product.resolutionTier === resolutionTier
  ));
  if (tierProducts.length === 0) {
    return {
      available: false,
      reason: input.mode === 'edit'
        ? '当前模型暂不支持图生图，请移除参考图或稍后重试'
        : '当前模型暂不支持所选分辨率',
    };
  }

  const requestedQuality = input.config.gptImageQuality;
  const quality = tierProducts.some(product => product.quality === requestedQuality)
    ? requestedQuality
    : tierProducts.some(product => product.quality === 'auto')
      ? 'auto'
      : tierProducts.find(product => isGptImageQuality(product.quality))?.quality;
  if (!quality || !isGptImageQuality(quality)) {
    return { available: false, reason: '当前模型不支持所选质量' };
  }
  const sizes = Array.from(new Set(tierProducts
    .filter(product => product.quality === quality)
    .flatMap(product => product.sizes)));
  const size = input.config.customSize
    ? sizes.find(candidate => candidate === input.config.customSize)
    : sizes.find(candidate => getCanvasAspectRatioForSize(candidate) === input.config.aspectRatio) || sizes[0];
  if (!size) return { available: false, reason: '当前模型不支持这个图片尺寸' };

  return {
    available: true,
    catalogVersion: input.catalog.version,
    model: model.id,
    displayName: model.displayName,
    mode: input.mode,
    resolutionTier,
    size,
    aspectRatio: getCanvasAspectRatioForSize(size),
    quality,
    count: Math.min(model.maxCount, normalizeCount(input.config.count)),
    referenceImageCount: input.referenceImageCount,
    maxReferenceImages: model.maxReferenceImages,
  };
}
