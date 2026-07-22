import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAmoTokenImageCatalogCache,
  fetchAmoTokenImageCatalog,
  getAmoTokenImageModeCapabilities,
  getAmoTokenImageModelOptions,
  normalizeAmoTokenCatalogModelId,
  normalizeAmoTokenImageCatalog,
} from '@/lib/amotoken-image-catalog';

const catalogPayload = {
  object: 'list',
  catalog_version: 'image-v11',
  data: [
    {
      model: 'gpt-image-2',
      display_name: 'GPT Image 2',
      mode: 'generation',
      resolution_tier: '1K',
      sizes: ['1024x1024', '1536x1024'],
      quality: 'medium',
      max_count: 4,
      max_reference_images: 4,
    },
    {
      model: 'gpt-image-2',
      display_name: 'GPT Image 2',
      mode: 'edit',
      resolution_tier: '2K',
      sizes: ['2048x2048'],
      quality: 'high',
      max_count: 4,
      max_reference_images: 4,
    },
  ],
};

describe('AmoToken image product catalog', () => {
  beforeEach(() => {
    clearAmoTokenImageCatalogCache();
  });

  it('groups flattened product rows into one logical model', () => {
    expect(normalizeAmoTokenImageCatalog(catalogPayload)).toEqual({
      version: 'image-v11',
      models: [
        {
          id: 'gpt-image-2',
          displayName: 'GPT Image 2',
          maxCount: 4,
          maxReferenceImages: 4,
          products: [
            {
              mode: 'generation',
              resolutionTier: '1K',
              sizes: ['1024x1024', '1536x1024'],
              quality: 'medium',
            },
            {
              mode: 'edit',
              resolutionTier: '2K',
              sizes: ['2048x2048'],
              quality: 'high',
            },
          ],
        },
      ],
    });
  });

  it('derives generation and edit capabilities from the current catalog rows', () => {
    const catalog = normalizeAmoTokenImageCatalog({
      ...catalogPayload,
      data: [
        ...catalogPayload.data,
        {
          model: 'gpt-image-2',
          display_name: 'GPT Image 2',
          mode: 'generation',
          resolution_tier: '1K',
          sizes: ['1024x1024'],
          quality: 'high',
          max_count: 4,
          max_reference_images: 4,
        },
      ],
    });

    expect(getAmoTokenImageModeCapabilities(catalog, 'gpt-image-2', 'generation')).toEqual({
      model: 'gpt-image-2',
      displayName: 'GPT Image 2',
      mode: 'generation',
      maxCount: 4,
      maxReferenceImages: 4,
      resolutionTiers: [
        {
          value: '1K',
          sizes: ['1024x1024', '1536x1024'],
          qualities: ['medium', 'high'],
        },
      ],
    });
    expect(getAmoTokenImageModeCapabilities(catalog, 'gpt-image-2', 'edit')?.resolutionTiers).toEqual([
      { value: '2K', sizes: ['2048x2048'], qualities: ['high'] },
    ]);
  });

  it('recommends the first mode-compatible model while keeping all catalog models switchable', () => {
    const catalog = normalizeAmoTokenImageCatalog({
      ...catalogPayload,
      data: [
        ...catalogPayload.data,
        {
          model: 'second-image-model',
          display_name: '第二个生图模型',
          mode: 'generation',
          resolution_tier: '1K',
          sizes: ['1024x1024'],
          quality: 'medium',
          max_count: 2,
          max_reference_images: 1,
        },
      ],
    });

    expect(getAmoTokenImageModelOptions(catalog, 'generation')).toEqual([
      { value: 'gpt-image-2', label: 'GPT Image 2', recommended: true },
      { value: 'second-image-model', label: '第二个生图模型', recommended: false },
    ]);
  });

  it('migrates legacy aliases to the catalog model without exposing aliases or unsupported 4K', () => {
    const catalog = normalizeAmoTokenImageCatalog(catalogPayload);

    expect(normalizeAmoTokenCatalogModelId('amotoken-gpt-image-2-1k-backup', catalog, 'generation')).toBe('gpt-image-2');
    expect(normalizeAmoTokenCatalogModelId('amotoken-gpt-image-2-4k-gray', catalog, 'generation')).toBe('gpt-image-2');
    expect(getAmoTokenImageModelOptions(catalog, 'generation').map(option => option.value)).toEqual(['gpt-image-2']);
    expect(getAmoTokenImageModeCapabilities(catalog, 'gpt-image-2', 'generation')?.resolutionTiers.map(tier => tier.value)).not.toContain('4K');
  });

  it('blocks use when the catalog has no usable products', () => {
    expect(() => normalizeAmoTokenImageCatalog({
      object: 'list',
      catalog_version: 'disabled-v1',
      data: [],
    })).toThrow('当前没有可用的生图模型');
  });

  it('forwards the token to the same-origin catalog proxy and caches only for that token', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify(catalogPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const first = await fetchAmoTokenImageCatalog('sk-user-a', fetchImpl);
    const second = await fetchAmoTokenImageCatalog('sk-user-a', fetchImpl);
    await fetchAmoTokenImageCatalog('sk-user-b', fetchImpl);

    expect(first).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/nova/image-products/catalog', {
      method: 'GET',
      headers: { Authorization: 'Bearer sk-user-a' },
      cache: 'no-store',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/nova/image-products/catalog', {
      method: 'GET',
      headers: { Authorization: 'Bearer sk-user-b' },
      cache: 'no-store',
    });
  });
});
