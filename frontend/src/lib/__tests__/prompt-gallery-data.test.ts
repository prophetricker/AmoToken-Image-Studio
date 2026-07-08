import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_CATEGORY,
  fetchStablePromptGallery,
  filterPromptGalleryPrompts,
  getPromptCategories,
  isPromptBlockedByKeywords,
  normalizePromptCategory,
  type FetchResult,
} from '@/lib/prompt-gallery-data';

const serverPrompt = {
  id: 'server-1',
  title: 'Stable poster prompt',
  content: 'Create a clean poster composition.',
  images: ['https://example.com/poster.png'],
  tags: ['poster'],
  contributor: 'AmoToken',
  notes: '',
  source: 'local',
  sourceUrl: 'https://example.com/source',
  category: 'poster',
};

function mockJsonFetch(value: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(value),
  }));
}

describe('fetchStablePromptGallery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses local server prompts before external prompt sources', async () => {
    const fallback = vi.fn<() => Promise<FetchResult>>().mockResolvedValue({
      prompts: [],
      categories: [ALL_CATEGORY],
    });
    mockJsonFetch([serverPrompt]);

    const result = await fetchStablePromptGallery(fallback);

    expect(fetch).toHaveBeenCalledWith('/api/nova/prompts', expect.objectContaining({ cache: 'no-store' }));
    expect(fallback).not.toHaveBeenCalled();
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]).toMatchObject({
      title: serverPrompt.title,
      content: serverPrompt.content,
      uniqueKey: 'server-local-server-1-0',
    });
    expect(result.categories).toContain(ALL_CATEGORY);
    expect(result.categories).toContain('poster');
  });

  it('falls back to external prompt sources when the local server snapshot is empty', async () => {
    const fallbackPrompt = {
      ...serverPrompt,
      id: 'fallback-1',
      uniqueKey: 'fallback-1',
      title: 'Fallback prompt',
    };
    const fallback = vi.fn<() => Promise<FetchResult>>().mockResolvedValue({
      prompts: [fallbackPrompt],
      categories: [ALL_CATEGORY, 'fallback'],
    });
    mockJsonFetch([]);

    const result = await fetchStablePromptGallery(fallback);

    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.prompts[0].title).toBe('Fallback prompt');
  });
});

describe('prompt gallery filtering helpers', () => {
  it('does not match short latin blacklist words inside safe words or metadata', () => {
    expect(isPromptBlockedByKeywords({
      ...serverPrompt,
      title: 'Brand portrait poster',
      content: 'A polished product brand image with portrait lighting.',
      tags: ['portrait', 'brand'],
      contributor: '@berryxia_ai',
    }, ['bra', 'tor', 'xi'])).toBe(false);

    expect(isPromptBlockedByKeywords({
      ...serverPrompt,
      title: 'Unsafe exact word',
      content: 'This prompt mentions bra as a standalone word.',
    }, ['bra'])).toBe(true);
  });

  it('normalizes long-tail categories and only returns categories with prompts', () => {
    expect(normalizePromptCategory('图像模板 - 产品海报')).toBe('图像模板');
    expect(normalizePromptCategory('视频模板 - 动画')).toBe('视频模板');
    expect(normalizePromptCategory('角色肖像')).toBe('人像/角色');

    const categories = getPromptCategories([
      { ...serverPrompt, category: '图像模板 - 产品海报', uniqueKey: 'a' },
      { ...serverPrompt, category: '视频模板 - 动画', uniqueKey: 'b' },
      { ...serverPrompt, category: '角色肖像', uniqueKey: 'c' },
    ]);

    expect(categories).toEqual([ALL_CATEGORY, '人像/角色', '图像模板', '视频模板']);
  });

  it('filters prompts consistently before building visible category chips', () => {
    const prompts = [
      { ...serverPrompt, title: 'Brand portrait poster', content: '产品海报提示词', category: '海报/广告', uniqueKey: 'a' },
      { ...serverPrompt, title: 'English only prompt', content: 'No Chinese text here.', category: '产品/电商', uniqueKey: 'b' },
      { ...serverPrompt, title: 'Exact unsafe word', content: '这里包含 bra 作为独立词', category: '人像/角色', uniqueKey: 'c' },
    ];

    const filtered = filterPromptGalleryPrompts(prompts, {
      blacklist: ['bra', 'tor', 'xi'],
      searchQuery: '',
      selectedCategory: ALL_CATEGORY,
    });

    expect(filtered.map(prompt => prompt.uniqueKey)).toEqual(['a']);
    expect(getPromptCategories(filtered)).toEqual([ALL_CATEGORY, '海报/广告']);
  });
});
