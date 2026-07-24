import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ackNovaTask, createNovaTask, resolveImageTaskProvider, type NovaTaskResponse } from '@/lib/ccode-task-client';
import { downloadAndStoreImages } from '@/lib/image-downloader';
import type { StoredJob } from '@/lib/job-store';
import { AMOTOKEN_IMAGE_MODEL_ID, saveAmoTokenToken } from '@/lib/nova-models';
import { bindAmoTokenImageQuote, type AmoTokenImageQuote } from '@/lib/amotoken-image-quote';
import {
  buildCompletedJobFromTask,
  finalizeCompletedServerTask,
  submitImageToImage,
  submitTextToImage,
  type SubmitActions,
  type TextToImageSubmitInput,
} from '@/lib/workspace-task-service';
vi.mock('@/lib/ccode-task-client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/ccode-task-client')>();
  return {
    ...actual,
    ackNovaTask: vi.fn(),
    createNovaTask: vi.fn(),
    resolveImageTaskProvider: vi.fn(),
  };
});

vi.mock('@/lib/image-downloader', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/image-downloader')>();
  return {
    ...actual,
    downloadAndStoreImages: vi.fn(),
  };
});

const mockedAckNovaTask = vi.mocked(ackNovaTask);
const mockedCreateNovaTask = vi.mocked(createNovaTask);
const mockedDownloadAndStoreImages = vi.mocked(downloadAndStoreImages);
const mockedResolveImageTaskProvider = vi.mocked(resolveImageTaskProvider);

type QuoteFreeTextPatch = Partial<Omit<TextToImageSubmitInput, 'prompts'>> & {
  providerModel?: string;
};

const invalidQuoteFreeTextCases: Array<[string, QuoteFreeTextPatch]> = [
  ['2K', { outputSize: '2K', customSize: '2048x2048' }],
  ['two outputs', { parallelCount: 2 }],
  ['another provider model', { providerModel: 'gpt-image-1' }],
  ['non-auto quality', { gptImageQuality: 'medium' }],
];

function makeJob(overrides: Partial<StoredJob> = {}): StoredJob {
  return {
    id: 'job-1',
    status: 'processing',
    mode: 'text-to-image',
    prompt: 'prompt',
    output_size: '1K',
    temperature: 1,
    aspect_ratio: '1:1',
    model: 'gemini-3-pro-image-preview',
    created_at: '2026-06-07T00:00:00.000Z',
    serverTaskId: 'task-1',
    ...overrides,
  };
}

function makeCompletedTask(images: string[]): NovaTaskResponse {
  return {
    id: 'task-1',
    status: 'completed',
    result: { images },
  };
}

function makeQuote(overrides: Partial<AmoTokenImageQuote> = {}): AmoTokenImageQuote {
  return bindAmoTokenImageQuote({
    catalogVersion: 'image-v11',
    model: 'gpt-image-2',
    displayName: 'GPT Image 2',
    mode: 'generation',
    resolutionTier: '1K',
    size: '1024x1024',
    quality: 'high',
    count: 1,
    referenceImageCount: 0,
    unitPrice: 0.06,
    totalPrice: 0.06,
    currency: 'API_CREDIT',
    available: true,
    ...overrides,
  }, 'test-api-key');
}

function createActions(initialJob: StoredJob): { actions: SubmitActions; getJob: () => StoredJob } {
  let currentJob = initialJob;
  const actions: SubmitActions = {
    addJob: vi.fn(),
    replaceJob: vi.fn((_jobId, updater) => {
      currentJob = updater(currentJob);
    }),
    completeJob: vi.fn(async (_jobId, job) => {
      currentJob = job;
    }),
    failJob: vi.fn(async (_jobId, error) => {
      currentJob = { ...currentJob, status: 'failed', error };
    }),
  };

  return {
    actions,
    getJob: () => currentJob,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveAmoTokenToken('test-api-key');
  mockedAckNovaTask.mockReset();
  mockedAckNovaTask.mockResolvedValue(undefined);
  mockedCreateNovaTask.mockReset();
  mockedCreateNovaTask.mockResolvedValue('task-advanced-1');
  mockedDownloadAndStoreImages.mockReset();
  mockedResolveImageTaskProvider.mockReset();
  mockedResolveImageTaskProvider.mockReturnValue({
    apiKey: 'test-api-key',
    baseUrl: 'https://api.openai.com',
    protocol: 'openai',
    modelId: 'gpt-image-2',
  });
});

describe('submitTextToImage', () => {
  it('passes GPT Image advanced params into createNovaTask payload', async () => {
    const job = makeJob();
    const { actions, getJob } = createActions(job);

    await submitTextToImage({
      prompts: ['cut out subject'],
      outputSize: '1K',
      customSize: '1024x1024',
      aspectRatio: '1:1',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'transparent',
      parallelCount: 1,
      quote: makeQuote(),
    }, actions, vi.fn());

    expect(mockedCreateNovaTask).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-api-key',
      mode: 'text-to-image',
      model: 'gpt-image-2',
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'transparent',
      imageQuote: makeQuote(),
    }));
    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'transparent',
      imageQuote: makeQuote(),
    }));
    expect(getJob().serverTaskId).toBe('task-advanced-1');
  });

  it('records local start time and the exact API-credit quote on submitted jobs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T08:00:00.000Z'));
    const job = makeJob();
    const { actions } = createActions(job);

    await submitTextToImage({
      prompts: ['complex family portrait'],
      outputSize: '2K',
      customSize: '2048x2048',
      aspectRatio: '1:1',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'opaque',
      parallelCount: 1,
      quote: makeQuote({
        resolutionTier: '2K',
        size: '2048x2048',
        totalPrice: 0.13,
        unitPrice: 0.13,
      }),
    }, actions, vi.fn());

    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      startedAt: '2026-07-06T08:00:00.000Z',
      imageQuote: expect.objectContaining({
        resolutionTier: '2K',
        totalPrice: 0.13,
        currency: 'API_CREDIT',
      }),
    }));
    expect(vi.mocked(actions.addJob).mock.calls[0][0].costEstimate).toBeUndefined();
    vi.useRealTimers();
  });

  it('accepts a strict 1K legacy submission without inventing a quote or cost', async () => {
    const { actions } = createActions(makeJob());
    const onError = vi.fn();

    const accepted = await submitTextToImage({
      prompts: ['a harbor at sunrise'],
      outputSize: '1K',
      customSize: '1024x1024',
      aspectRatio: '1:1',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'auto',
      gptImageStyle: 'auto',
      gptImageBackground: 'auto',
      parallelCount: 1,
    }, actions, onError);

    expect(accepted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(mockedCreateNovaTask).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-image-2',
      outputSize: '1K',
      customSize: '1024x1024',
      gptImageQuality: 'auto',
      parallelCount: 1,
      imageQuote: undefined,
    }));
    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      output_size: '1K',
      custom_size: '1024x1024',
      imageQuote: undefined,
    }));
    expect(vi.mocked(actions.addJob).mock.calls[0][0].costEstimate).toBeUndefined();
  });

  it.each(invalidQuoteFreeTextCases)('blocks quote-free text submission for %s', async (_label, patch) => {
    const { providerModel, ...inputPatch } = patch;
    mockedResolveImageTaskProvider.mockReturnValue({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.openai.com',
      protocol: 'openai',
      modelId: providerModel || 'gpt-image-2',
    });
    const { actions } = createActions(makeJob());
    const onError = vi.fn();

    const accepted = await submitTextToImage({
      prompts: ['a poster'],
      outputSize: '1K',
      customSize: '1024x1024',
      aspectRatio: '1:1',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'auto',
      gptImageStyle: 'auto',
      gptImageBackground: 'auto',
      parallelCount: 1,
      ...inputPatch,
    }, actions, onError);

    expect(accepted).toBe(false);
    expect(onError).toHaveBeenCalledWith('当前生图规格与报价不一致，请重新选择后再试');
    expect(actions.addJob).not.toHaveBeenCalled();
    expect(mockedCreateNovaTask).not.toHaveBeenCalled();
  });
});

describe('submitImageToImage', () => {
  it('uses the quoted catalog capability instead of a legacy four-image limit', async () => {
    const job = makeJob({ mode: 'image-to-image' });
    const { actions } = createActions(job);
    const onError = vi.fn();

    const accepted = await submitImageToImage({
      prompt: 'merge these references',
      files: [
        { id: '1', name: '1.png', dataUrl: 'data:image/png;base64,one', mimeType: 'image/png' },
        { id: '2', name: '2.png', dataUrl: 'data:image/png;base64,two', mimeType: 'image/png' },
        { id: '3', name: '3.png', dataUrl: 'data:image/png;base64,three', mimeType: 'image/png' },
        { id: '4', name: '4.png', dataUrl: 'data:image/png;base64,four', mimeType: 'image/png' },
        { id: '5', name: '5.png', dataUrl: 'data:image/png;base64,five', mimeType: 'image/png' },
      ],
      outputSize: '2K',
      customSize: '2048x2048',
      aspectRatio: '16:9',
      temperature: 1,
      model: 'amotoken-gpt-image-2',
      gptImageQuality: 'medium',
      gptImageStyle: 'auto',
      gptImageBackground: 'opaque',
      parallelCount: 1,
      quote: makeQuote({
        mode: 'edit',
        resolutionTier: '2K',
        size: '2048x2048',
        quality: 'medium',
        referenceImageCount: 5,
      }),
    }, actions, onError);

    expect(accepted).toBe(true);
    expect(mockedCreateNovaTask).toHaveBeenCalledWith(expect.objectContaining({
      images: expect.any(Array),
      imageQuote: expect.objectContaining({ referenceImageCount: 5 }),
    }));
    expect(mockedCreateNovaTask.mock.calls[0][0].images).toHaveLength(5);
    expect(actions.addJob).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('records the exact edit quote when more than one reference image is submitted', async () => {
    const job = makeJob({ mode: 'image-to-image' });
    const { actions } = createActions(job);

    await submitImageToImage({
      prompt: 'blend these references',
      files: [
        { id: '1', name: '1.png', dataUrl: 'data:image/png;base64,one', mimeType: 'image/png' },
        { id: '2', name: '2.png', dataUrl: 'data:image/png;base64,two', mimeType: 'image/png' },
      ],
      outputSize: '2K',
      customSize: '2048x2048',
      aspectRatio: '16:9',
      temperature: 1,
      model: 'amotoken-gpt-image-2',
      gptImageQuality: 'medium',
      gptImageStyle: 'auto',
      gptImageBackground: 'opaque',
      parallelCount: 1,
      quote: makeQuote({
        mode: 'edit',
        resolutionTier: '2K',
        size: '2048x2048',
        quality: 'medium',
        referenceImageCount: 2,
        unitPrice: 0.13,
        totalPrice: 0.13,
      }),
    }, actions, vi.fn());

    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      refImages: expect.arrayContaining([
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '2' }),
      ]),
      referenceImageCount: 2,
      imageQuote: expect.objectContaining({
        mode: 'edit',
        referenceImageCount: 2,
        totalPrice: 0.13,
        currency: 'API_CREDIT',
      }),
    }));
  });

  it('accepts one strict 1K edit reference without a quote', async () => {
    const { actions } = createActions(makeJob({ mode: 'image-to-image' }));
    const onError = vi.fn();

    const accepted = await submitImageToImage({
      prompt: 'add a red sail',
      files: [
        { id: '1', name: '1.png', dataUrl: 'data:image/png;base64,one', mimeType: 'image/png' },
      ],
      outputSize: '1K',
      customSize: '1536x1024',
      aspectRatio: '3:2',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'auto',
      gptImageStyle: 'auto',
      gptImageBackground: 'auto',
      parallelCount: 1,
    }, actions, onError);

    expect(accepted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(mockedCreateNovaTask).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'image-to-image',
      images: [expect.objectContaining({ mimeType: 'image/png' })],
      imageQuote: undefined,
    }));
    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      referenceImageCount: 1,
      imageQuote: undefined,
    }));
    expect(vi.mocked(actions.addJob).mock.calls[0][0].costEstimate).toBeUndefined();
  });

  it('blocks two edit references without a quote before task creation', async () => {
    const { actions } = createActions(makeJob({ mode: 'image-to-image' }));
    const onError = vi.fn();

    const accepted = await submitImageToImage({
      prompt: 'merge references',
      files: [
        { id: '1', name: '1.png', dataUrl: 'data:image/png;base64,one', mimeType: 'image/png' },
        { id: '2', name: '2.png', dataUrl: 'data:image/png;base64,two', mimeType: 'image/png' },
      ],
      outputSize: '1K',
      customSize: '1024x1024',
      aspectRatio: '1:1',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'auto',
      gptImageStyle: 'auto',
      gptImageBackground: 'auto',
      parallelCount: 1,
    }, actions, onError);

    expect(accepted).toBe(false);
    expect(onError).toHaveBeenCalledWith('当前生图规格与报价不一致，请重新选择后再试');
    expect(actions.addJob).not.toHaveBeenCalled();
    expect(mockedCreateNovaTask).not.toHaveBeenCalled();
  });

  it('blocks task creation when the submitted quote does not match the requested SKU', async () => {
    const job = makeJob();
    const { actions } = createActions(job);
    const onError = vi.fn();

    await submitTextToImage({
      prompts: ['a poster'],
      outputSize: '1K',
      customSize: '1024x1024',
      aspectRatio: '1:1',
      temperature: 1,
      model: 'gpt-image-2',
      gptImageQuality: 'high',
      gptImageStyle: 'auto',
      gptImageBackground: 'auto',
      parallelCount: 1,
      quote: makeQuote({ size: '2048x2048', resolutionTier: '2K' }),
    }, actions, onError);

    expect(onError).toHaveBeenCalledWith('当前生图规格与报价不一致，请重新选择后再试');
    expect(actions.addJob).not.toHaveBeenCalled();
    expect(mockedCreateNovaTask).not.toHaveBeenCalled();
  });

  it('blocks a quote issued for another token', async () => {
    const { actions } = createActions(makeJob());
    const onError = vi.fn();

    await submitTextToImage({
      prompts: ['a poster'],
      outputSize: '1K',
      customSize: '1024x1024',
      aspectRatio: '1:1',
      temperature: 1,
      model: 'gpt-image-2',
      gptImageQuality: 'high',
      gptImageStyle: 'auto',
      gptImageBackground: 'auto',
      parallelCount: 1,
      quote: bindAmoTokenImageQuote(makeQuote(), 'another-token'),
    }, actions, onError);

    expect(onError).toHaveBeenCalledWith('当前生图规格与报价不一致，请重新选择后再试');
    expect(actions.addJob).not.toHaveBeenCalled();
    expect(mockedCreateNovaTask).not.toHaveBeenCalled();
  });
});

describe('finalizeCompletedServerTask', () => {
  it('全部 URL 图片缓存成功后替换为 blob URL 并 ack 服务端任务', async () => {
    mockedDownloadAndStoreImages.mockImplementation(async (_jobId, _imageRefs, options) => {
      options?.onProgress?.({ index: 0, status: 'downloading', loadedBytes: 5, totalBytes: 10, percent: 50 });
      options?.onProgress?.({ index: 0, status: 'cached', loadedBytes: 10, totalBytes: 10, percent: 100 });
      return {
        successCount: 1,
        failCount: 0,
        blobUrls: ['blob:cached-0'],
        items: [{ index: 0, status: 'cached', loadedBytes: 10, totalBytes: 10, percent: 100 }],
      };
    });
    const job = makeJob();
    const { actions, getJob } = createActions(job);

    await finalizeCompletedServerTask(job, makeCompletedTask(['URL:/api/nova/images/task-1/0']), actions);

    expect(actions.completeJob).toHaveBeenCalledTimes(2);
    expect(getJob().images).toEqual(['blob:cached-0']);
    expect(getJob().serverTaskAcked).toBe(true);
    expect(getJob().imageDownloadProgress).toBeUndefined();
    expect(mockedAckNovaTask).toHaveBeenCalledWith('task-1');
  });

  it('adds elapsed time and pending billing status when a task completes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T08:00:56.000Z'));
    const job = makeJob({
      startedAt: '2026-07-06T08:00:00.000Z',
      costEstimate: { currency: 'CNY', min: 0.08, max: 0.13, source: 'gray-log-estimate' },
    });
    const { actions, getJob } = createActions(job);

    await finalizeCompletedServerTask(job, makeCompletedTask(['base64-image']), actions);

    expect(getJob()).toEqual(expect.objectContaining({
      status: 'completed',
      completedAt: '2026-07-06T08:00:56.000Z',
      elapsedMs: 56000,
      billingStatus: 'pending-newapi-check',
    }));
    vi.useRealTimers();
  });

  it('builds a failed job with failure explanation and billing ambiguity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T08:00:56.000Z'));
    const failed = buildCompletedJobFromTask(
      makeJob({ startedAt: '2026-07-06T08:00:00.000Z' }),
      { id: 'task-1', status: 'failed', error: 'API 请求失败: 502 Upstream request failed' }
    );

    expect(failed).toEqual(expect.objectContaining({
      status: 'failed',
      completedAt: '2026-07-06T08:00:56.000Z',
      elapsedMs: 56000,
      failureReason: 'upstream',
      failureStage: '生图服务',
      billingStatus: 'pending-newapi-check',
    }));
    vi.useRealTimers();
  });

  it('部分 URL 图片缓存失败时保留 URL 引用和失败进度且不 ack', async () => {
    mockedDownloadAndStoreImages.mockImplementation(async (_jobId, _imageRefs, options) => {
      options?.onProgress?.({ index: 0, status: 'cached', loadedBytes: 10, totalBytes: 10, percent: 100 });
      options?.onProgress?.({ index: 1, status: 'failed', loadedBytes: 2, totalBytes: 10, percent: 20, error: 'stream failed' });
      return {
        successCount: 1,
        failCount: 1,
        blobUrls: ['blob:cached-0', ''],
        items: [
          { index: 0, status: 'cached', loadedBytes: 10, totalBytes: 10, percent: 100 },
          { index: 1, status: 'failed', loadedBytes: 2, totalBytes: 10, percent: 20, error: 'stream failed' },
        ],
      };
    });
    const job = makeJob();
    const { actions, getJob } = createActions(job);

    await finalizeCompletedServerTask(job, makeCompletedTask([
      'URL:/api/nova/images/task-1/0',
      'URL:/api/nova/images/task-1/1',
    ]), actions);

    expect(getJob().images).toEqual([
      'blob:cached-0',
      'URL:/api/nova/images/task-1/1',
    ]);
    expect(getJob().serverTaskAcked).toBe(false);
    expect(getJob().warning).toContain('1 张图片本地缓存失败');
    expect(getJob().imageDownloadProgress?.failed).toBe(1);
    expect(mockedAckNovaTask).not.toHaveBeenCalled();
  });
});
