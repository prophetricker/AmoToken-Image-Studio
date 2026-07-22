import { describe, expect, it, vi } from 'vitest';
import {
  fetchAmoTokenImageQuote,
  formatAmoTokenImageQuote,
  toAmoTokenImageOperationMode,
} from '@/lib/amotoken-image-quote';

describe('AmoToken image product quotes', () => {
  it('maps Nova modes onto billable image operations', () => {
    expect(toAmoTokenImageOperationMode('text-to-image')).toBe('generation');
    expect(toAmoTokenImageOperationMode('image-to-image')).toBe('edit');
    expect(toAmoTokenImageOperationMode('multi-image-fusion')).toBe('edit');
  });

  it('requests an exact token-specific quote without caching it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      object: 'image_product_quote',
      data: {
        catalog_version: 'image-v11',
        model: 'gpt-image-2',
        display_name: 'GPT Image 2',
        mode: 'edit',
        resolution: '2K',
        size: '2048x2048',
        quality: 'high',
        count: 2,
        reference_image_count: 3,
        unit_price: 0.08,
        total_price: 0.16,
        currency: 'API_CREDIT',
        available: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const quote = await fetchAmoTokenImageQuote('sk-user-a', {
      model: 'gpt-image-2',
      mode: 'edit',
      size: '2048x2048',
      quality: 'high',
      count: 2,
      referenceImageCount: 3,
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/api/nova/image-products/quote', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-user-a',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        model: 'gpt-image-2',
        mode: 'edit',
        size: '2048x2048',
        quality: 'high',
        count: 2,
        reference_image_count: 3,
      }),
    });
    expect(formatAmoTokenImageQuote(quote)).toBe('预计消耗 $0.16 API 额度');
  });

  it('blocks submission when the selected product has no available route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      object: 'image_product_quote',
      data: { available: false },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(fetchAmoTokenImageQuote('sk-user-a', {
      model: 'gpt-image-2',
      mode: 'generation',
      size: '3840x3840',
      quality: 'high',
      count: 1,
      referenceImageCount: 0,
    }, fetchImpl)).rejects.toThrow('当前规格暂不可用');
  });
});
