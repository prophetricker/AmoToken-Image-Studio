import { describe, expect, it, vi } from 'vitest';
import {
  PROMPT_GALLERY_CACHE_TTL_MS,
  createPromptGalleryCache,
} from '@/lib/prompt-gallery-cache';

const prompt = {
  id: 'prompt-1',
  uniqueKey: 'source-prompt-1',
  title: '缓存测试',
  content: '测试提示词缓存。',
  images: ['https://example.com/prompt.png'],
  tags: [],
  contributor: '',
  notes: '',
  source: 'source-1',
  sourceUrl: 'https://github.com/example/prompts',
  category: '其他',
};

const meta = {
  publishedCount: 1,
  refreshedAt: '2026-07-26T00:00:00.000Z',
  nextRefreshAt: '2026-07-29T00:00:00.000Z',
  sources: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('prompt gallery shared cache', () => {
  it('uses a five-minute TTL and refreshes after expiry', async () => {
    let now = 1_000;
    const fetchPrompts = vi.fn().mockResolvedValue([prompt]);
    const fetchMeta = vi.fn().mockResolvedValue(meta);
    const cache = createPromptGalleryCache({ fetchPrompts, fetchMeta, now: () => now });

    await cache.load();
    now += PROMPT_GALLERY_CACHE_TTL_MS - 1;
    await cache.load();
    expect(fetchPrompts).toHaveBeenCalledTimes(1);
    expect(fetchMeta).toHaveBeenCalledTimes(1);

    now += 2;
    await cache.load();
    expect(fetchPrompts).toHaveBeenCalledTimes(2);
    expect(fetchMeta).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refreshes into one in-flight request', async () => {
    const promptsRequest = deferred<typeof prompt[]>();
    const metaRequest = deferred<typeof meta>();
    const fetchPrompts = vi.fn().mockReturnValue(promptsRequest.promise);
    const fetchMeta = vi.fn().mockReturnValue(metaRequest.promise);
    const cache = createPromptGalleryCache({ fetchPrompts, fetchMeta });

    const first = cache.load();
    const second = cache.load();

    expect(fetchPrompts).toHaveBeenCalledTimes(1);
    expect(fetchMeta).toHaveBeenCalledTimes(1);

    promptsRequest.resolve([prompt]);
    metaRequest.resolve(meta);

    await expect(first).resolves.toEqual({ prompts: [prompt], meta });
    await expect(second).resolves.toEqual({ prompts: [prompt], meta });
  });

  it('does not keep a failed in-flight request cached', async () => {
    const fetchPrompts = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([prompt]);
    const fetchMeta = vi.fn().mockResolvedValue(meta);
    const cache = createPromptGalleryCache({ fetchPrompts, fetchMeta });

    await expect(cache.load()).rejects.toThrow('temporary failure');
    await expect(cache.load()).resolves.toEqual({ prompts: [prompt], meta });
    expect(fetchPrompts).toHaveBeenCalledTimes(2);
  });
});
