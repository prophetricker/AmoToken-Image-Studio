import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPromptGallery,
  fetchPromptGalleryMeta,
} from '@/lib/prompt-gallery-client';

const validPrompt = {
  id: ' prompt-1 ',
  uniqueKey: ' source-prompt-1 ',
  title: ' 海报构图 ',
  content: ' 设计一张清晰的产品海报。 ',
  images: [' https://example.com/poster.png ', '', 42],
  tags: [' 海报 ', 7],
  contributor: ' AmoToken ',
  notes: ' 示例 ',
  source: ' source-1 ',
  sourceUrl: ' https://github.com/example/prompts ',
  category: ' 海报 ',
};

const validMeta = {
  publishedCount: 1000,
  refreshedAt: '2026-07-26T00:00:00.000Z',
  nextRefreshAt: '2026-07-29T00:00:00.000Z',
  sources: [{
    id: 'source-1',
    label: 'Example prompts',
    sourceUrl: 'https://github.com/example/prompts',
    license: 'MIT',
    status: 'healthy',
    candidateCount: 120,
    lastSuccessAt: '2026-07-26T00:00:00.000Z',
  }],
};

function response(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue('private service response'),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchPromptGallery', () => {
  it('loads and normalizes image-backed records from the same-origin snapshot only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([validPrompt]));
    vi.stubGlobal('fetch', fetchMock);

    const prompts = await fetchPromptGallery();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/nova/prompts', { cache: 'no-store' });
    expect(fetchMock.mock.calls.flat().join(' ')).not.toMatch(/github\.com|raw\.githubusercontent|x\.com|proxy\.ccode\.vip|blacklist/i);
    expect(prompts).toEqual([{
      id: 'prompt-1',
      uniqueKey: 'source-prompt-1',
      title: '海报构图',
      content: '设计一张清晰的产品海报。',
      images: ['https://example.com/poster.png'],
      tags: ['海报'],
      contributor: 'AmoToken',
      notes: '示例',
      source: 'source-1',
      sourceUrl: 'https://github.com/example/prompts',
      category: '海报/广告',
    }]);
  });

  it.each([
    ['empty snapshot', []],
    ['non-array payload', { prompts: [validPrompt] }],
    ['record without an image', [{ ...validPrompt, images: [] }]],
    ['record without content', [{ ...validPrompt, content: '' }]],
  ])('rejects %s with a user-safe error', async (_name, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));

    await expect(fetchPromptGallery()).rejects.toThrow('提示词广场暂不可用');
  });

  it('hides HTTP response details and does not attempt an external fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ secret: 'upstream details' }, false));
    vi.stubGlobal('fetch', fetchMock);

    const rejection = fetchPromptGallery();

    await expect(rejection).rejects.toThrow('提示词广场暂不可用');
    await expect(rejection).rejects.not.toThrow(/secret|upstream|private service response/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchPromptGalleryMeta', () => {
  it('loads validated source metadata from the same-origin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validMeta));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPromptGalleryMeta()).resolves.toEqual(validMeta);
    expect(fetchMock).toHaveBeenCalledWith('/api/nova/prompts/meta', { cache: 'no-store' });
    expect(fetchMock.mock.calls.flat().join(' ')).not.toMatch(/github\.com|raw\.githubusercontent|x\.com|proxy\.ccode\.vip|blacklist/i);
  });

  it.each([
    ['HTTP failure', validMeta, false],
    ['invalid source status', { ...validMeta, sources: [{ ...validMeta.sources[0], status: 'unknown' }] }, true],
    ['invalid count', { ...validMeta, publishedCount: -1 }, true],
    ['invalid timestamp', { ...validMeta, refreshedAt: 123 }, true],
  ])('rejects %s with a user-safe error', async (_name, body, ok) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body, ok)));

    await expect(fetchPromptGalleryMeta()).rejects.toThrow('来源信息暂不可用');
  });
});
