import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ackNovaTask, createNovaTask, resolveImageTaskProvider, type NovaTaskResponse } from '@/lib/ccode-task-client';
import { downloadAndStoreImages } from '@/lib/image-downloader';
import type { StoredJob } from '@/lib/job-store';
import { AMOTOKEN_IMAGE_MODEL_ID, saveAmoTokenToken } from '@/lib/nova-models';
import {
  buildCompletedJobFromTask,
  finalizeCompletedServerTask,
  submitImageToImage,
  submitTextToImage,
  type SubmitActions,
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
      aspectRatio: '1:1',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'transparent',
      parallelCount: 1,
    }, actions, vi.fn());

    expect(mockedCreateNovaTask).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-api-key',
      mode: 'text-to-image',
      model: 'gpt-image-2',
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'transparent',
    }));
    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'transparent',
    }));
    expect(getJob().serverTaskId).toBe('task-advanced-1');
  });

  it('records local start time and estimated cost on submitted jobs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T08:00:00.000Z'));
    const job = makeJob();
    const { actions } = createActions(job);

    await submitTextToImage({
      prompts: ['complex family portrait'],
      outputSize: '2K',
      aspectRatio: '1:1',
      temperature: 1,
      model: AMOTOKEN_IMAGE_MODEL_ID,
      gptImageQuality: 'high',
      gptImageStyle: 'vivid',
      gptImageBackground: 'opaque',
      parallelCount: 1,
    }, actions, vi.fn());

    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      startedAt: '2026-07-06T08:00:00.000Z',
      costEstimate: expect.objectContaining({
        min: 0.08,
        max: 0.13,
        currency: 'CNY',
      }),
      billingStatus: 'unverified',
    }));
    vi.useRealTimers();
  });
});

describe('submitImageToImage', () => {
  it('limits AmoToken multi-image fusion to four input images', async () => {
    const job = makeJob({ mode: 'image-to-image' });
    const { actions } = createActions(job);
    const onError = vi.fn();

    await submitImageToImage({
      prompt: 'merge these references',
      files: [
        { id: '1', name: '1.png', dataUrl: 'data:image/png;base64,one', mimeType: 'image/png' },
        { id: '2', name: '2.png', dataUrl: 'data:image/png;base64,two', mimeType: 'image/png' },
        { id: '3', name: '3.png', dataUrl: 'data:image/png;base64,three', mimeType: 'image/png' },
        { id: '4', name: '4.png', dataUrl: 'data:image/png;base64,four', mimeType: 'image/png' },
        { id: '5', name: '5.png', dataUrl: 'data:image/png;base64,five', mimeType: 'image/png' },
      ],
      outputSize: '2K',
      aspectRatio: '16:9',
      temperature: 1,
      model: 'amotoken-gpt-image-2',
      gptImageQuality: 'medium',
      gptImageStyle: 'auto',
      gptImageBackground: 'opaque',
      parallelCount: 1,
    }, actions, onError);

    expect(mockedCreateNovaTask).not.toHaveBeenCalled();
    expect(actions.addJob).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('多图融合最多支持 4 张参考图');
  });

  it('records fusion cost estimates when more than one reference image is submitted', async () => {
    const job = makeJob({ mode: 'image-to-image' });
    const { actions } = createActions(job);

    await submitImageToImage({
      prompt: 'blend these references',
      files: [
        { id: '1', name: '1.png', dataUrl: 'data:image/png;base64,one', mimeType: 'image/png' },
        { id: '2', name: '2.png', dataUrl: 'data:image/png;base64,two', mimeType: 'image/png' },
      ],
      outputSize: '2K',
      aspectRatio: '16:9',
      temperature: 1,
      model: 'amotoken-gpt-image-2',
      gptImageQuality: 'medium',
      gptImageStyle: 'auto',
      gptImageBackground: 'opaque',
      parallelCount: 1,
    }, actions, vi.fn());

    expect(actions.addJob).toHaveBeenCalledWith(expect.objectContaining({
      refImages: expect.arrayContaining([
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '2' }),
      ]),
      referenceImageCount: 2,
      costEstimate: expect.objectContaining({
        min: 0.12,
        max: 0.13,
        currency: 'CNY',
      }),
    }));
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
