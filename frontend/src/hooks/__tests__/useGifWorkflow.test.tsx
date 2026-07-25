import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGifWorkflow } from '@/hooks/useGifWorkflow';
import { saveActiveGifJob, type ActiveGifJob } from '@/lib/gif-job-store';
import { encodeFramesToGif, encodeGifFromGrid, triggerGifDownload } from '@/lib/gif-encoder';
import { createNovaTask, resolveImageTaskProvider } from '@/lib/ccode-task-client';
import { fetchAmoTokenImageQuote, type AmoTokenImageQuote } from '@/lib/amotoken-image-quote';

vi.mock('@/lib/ccode-task-client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/ccode-task-client')>();
  return {
    ...actual,
    createNovaTask: vi.fn(),
    resolveImageTaskProvider: vi.fn(),
  };
});

vi.mock('@/lib/amotoken-image-quote', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/amotoken-image-quote')>();
  return {
    ...actual,
    fetchAmoTokenImageQuote: vi.fn(),
  };
});

vi.mock('@/lib/gif-job-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/gif-job-store')>();
  return {
    ...actual,
    loadGifTemplate: vi.fn(async () => ({ data: 'template-base64', mimeType: 'image/png' })),
  };
});

vi.mock('@/lib/ccode-task-socket', () => ({
  novaTaskSocket: {
    subscribeTask: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@/lib/gif-encoder', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/gif-encoder')>();
  return {
    ...actual,
    encodeFramesToGif: vi.fn(),
    encodeGifFromGrid: vi.fn(),
    triggerGifDownload: vi.fn(),
  };
});

vi.mock('@/lib/image-downloader', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/image-downloader')>();
  return {
    ...actual,
    resolveStoredImageRef: vi.fn(async () => ({ image: 'blob:grid-image', blobUrl: 'blob:grid-image' })),
    revokeBlobUrls: vi.fn(),
  };
});

const mockedEncodeGifFromGrid = vi.mocked(encodeGifFromGrid);
const mockedEncodeFramesToGif = vi.mocked(encodeFramesToGif);
const mockedTriggerGifDownload = vi.mocked(triggerGifDownload);
const mockedCreateNovaTask = vi.mocked(createNovaTask);
const mockedResolveImageTaskProvider = vi.mocked(resolveImageTaskProvider);
const mockedFetchAmoTokenImageQuote = vi.mocked(fetchAmoTokenImageQuote);

const gifQuote: AmoTokenImageQuote = {
  catalogVersion: 'image-v12',
  model: 'gpt-image-2',
  displayName: 'GPT Image 2',
  mode: 'edit',
  resolutionTier: '2K',
  size: '2048x1536',
  quality: 'auto',
  count: 1,
  referenceImageCount: 2,
  unitPrice: 0.6,
  totalPrice: 0.6,
  currency: 'API_CREDIT',
  available: true,
};

const reviewJob: ActiveGifJob = {
  id: 'gif-job-encode',
  status: 'review_grid',
  prompt: '小鲨鱼眨眼',
  loop: true,
  closedLoop: false,
  model: 'amotoken-gpt-image-2-4k-gray',
  refImages: [],
  gridImageRef: 'IDB:0',
  frameDelayMs: 120,
  loopCount: 0,
  framePadding: 1.5,
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:01:00.000Z',
};

describe('useGifWorkflow', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedEncodeGifFromGrid.mockReset();
    mockedEncodeFramesToGif.mockReset();
    mockedTriggerGifDownload.mockReset();
    mockedCreateNovaTask.mockReset();
    mockedResolveImageTaskProvider.mockReset();
    mockedFetchAmoTokenImageQuote.mockReset();
  });

  it('quotes the released 2K edit grid immediately before task creation', async () => {
    mockedResolveImageTaskProvider.mockReturnValue({
      apiKey: 'sk-image-user',
      baseUrl: 'https://amotoken.cc',
      protocol: 'openai',
      modelId: 'gpt-image-2',
    });
    mockedFetchAmoTokenImageQuote.mockResolvedValue(gifQuote);
    mockedCreateNovaTask.mockResolvedValue('task-gif-grid');

    const { result } = renderHook(() => useGifWorkflow());

    await act(async () => {
      await result.current.submitGrid({
        prompt: '小鲨鱼挥手',
        loop: true,
        closedLoop: false,
        model: 'amotoken-gpt-image-2',
        gptImageQuality: 'auto',
        gptImageStyle: 'auto',
        gptImageBackground: 'auto',
        refImages: [{
          id: 'ref-1',
          name: 'shark.png',
          dataUrl: 'data:image/png;base64,user-ref-base64',
          mimeType: 'image/png',
        }],
        frameDelayMs: 120,
        loopCount: 0,
        framePadding: 1.5,
      });
    });

    expect(mockedFetchAmoTokenImageQuote).toHaveBeenCalledWith('sk-image-user', {
      model: 'gpt-image-2',
      mode: 'edit',
      size: '2048x1536',
      quality: 'auto',
      count: 1,
      referenceImageCount: 2,
    });
    expect(mockedCreateNovaTask).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'image-to-image',
      model: 'gpt-image-2',
      outputSize: '2K',
      customSize: '2048x1536',
      images: [
        { data: 'template-base64', mimeType: 'image/png' },
        { data: 'user-ref-base64', mimeType: 'image/png' },
      ],
      imageQuote: gifQuote,
    }));
  });

  it('cleans internal wording when GIF encoding fails', async () => {
    saveActiveGifJob(reviewJob);
    mockedEncodeGifFromGrid.mockRejectedValue(new Error('API 请求失败: 502 Upstream request failed'));

    const { result } = renderHook(() => useGifWorkflow());

    await waitFor(() => expect(result.current.job?.status).toBe('review_grid'));

    await act(async () => {
      await result.current.encodeGif({
        loop: true,
        frameDelayMs: 120,
        loopCount: 0,
        framePadding: 1.5,
      });
    });

    expect(result.current.job?.status).toBe('failed');
    expect(result.current.job?.error).toContain('生图失败');
    expect(result.current.job?.error).not.toMatch(/API|Upstream|NewAPI|上游/);
    expect(mockedTriggerGifDownload).not.toHaveBeenCalled();
  });

  it('cleans internal wording when tuned GIF encoding fails', async () => {
    saveActiveGifJob(reviewJob);
    mockedEncodeFramesToGif.mockImplementation(() => {
      throw new Error('所有图片生成失败: 上游连接提前中断或超时，请稍后重试。');
    });

    const { result } = renderHook(() => useGifWorkflow());

    await waitFor(() => expect(result.current.job?.status).toBe('review_grid'));

    act(() => {
      result.current.encodeTunedGif(
        [{ width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData],
        {
          loop: true,
          frameDelayMs: 120,
          loopCount: 0,
          framePadding: 1.5,
        },
      );
    });

    expect(result.current.job?.status).toBe('failed');
    expect(result.current.job?.error).toContain('生图失败');
    expect(result.current.job?.error).not.toMatch(/API|Upstream|NewAPI|上游/);
    expect(mockedTriggerGifDownload).not.toHaveBeenCalled();
  });
});
