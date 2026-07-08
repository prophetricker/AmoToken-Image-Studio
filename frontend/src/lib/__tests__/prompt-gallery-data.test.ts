import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_CATEGORY, fetchStablePromptGallery, type FetchResult } from '@/lib/prompt-gallery-data';

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
