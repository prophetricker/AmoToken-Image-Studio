import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNovaTask, resolveImageTaskProvider } from '@/lib/ccode-task-client';
import { saveAmoTokenToken } from '@/lib/nova-models';
import { clearAmoTokenImageCatalogCache, fetchAmoTokenImageCatalog } from '@/lib/amotoken-image-catalog';

describe('createNovaTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearAmoTokenImageCatalogCache();
  });

  it('uses user-facing wording when task creation response has no task id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    await expect(createNovaTask({
      apiKey: 'sk-test',
      baseUrl: 'https://amotoken.cc/v1',
      protocol: 'openai',
      mode: 'text-to-image',
      prompt: '一只小鲨鱼',
      outputSize: '1K',
      aspectRatio: '1:1',
      temperature: 1,
      model: 'gpt-image-2',
      parallelCount: 1,
      images: [],
    })).rejects.toThrow('创建任务失败：生图服务未返回任务编号');
  });

  it('rejects an unknown image model that is not in the current token catalog', () => {
    saveAmoTokenToken('sk-catalog-token');

    expect(() => resolveImageTaskProvider('gpt-image-lite')).toThrow('未找到图片模型配置: gpt-image-lite');
  });

  it('uses the saved AmoToken connection for a model in the current token catalog', async () => {
    saveAmoTokenToken('sk-catalog-token');
    await fetchAmoTokenImageCatalog('sk-catalog-token', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      catalog_version: 'image-v11',
      data: [{
        model: 'gpt-image-lite',
        display_name: 'GPT Image Lite',
        mode: 'generation',
        resolution_tier: '1K',
        sizes: ['1024x1024'],
        quality: 'low',
        max_count: 1,
        max_reference_images: 1,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    expect(resolveImageTaskProvider('gpt-image-lite')).toEqual({
      apiKey: 'sk-catalog-token',
      baseUrl: 'https://amotoken.cc',
      protocol: 'openai',
      modelId: 'gpt-image-lite',
    });
  });

  it('keeps the current catalog model authorized after the request cache expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T00:00:00.000Z'));
    saveAmoTokenToken('sk-catalog-token');
    await fetchAmoTokenImageCatalog('sk-catalog-token', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      catalog_version: 'image-v11',
      data: [{
        model: 'gpt-image-lite', display_name: 'GPT Image Lite', mode: 'generation',
        resolution_tier: '1K', sizes: ['1024x1024'], quality: 'low',
        max_count: 1, max_reference_images: 1,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    vi.advanceTimersByTime(31_000);

    expect(resolveImageTaskProvider('gpt-image-lite').modelId).toBe('gpt-image-lite');
    vi.useRealTimers();
  });
});
