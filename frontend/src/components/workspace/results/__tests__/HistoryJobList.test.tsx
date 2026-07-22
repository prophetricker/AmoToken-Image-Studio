import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryJobList } from '@/components/workspace/results/HistoryJobList';
import type { StoredJob } from '@/lib/job-store';

function makeJob(overrides: Partial<StoredJob> = {}): StoredJob {
  return {
    id: 'job-1',
    status: 'failed',
    mode: 'text-to-image',
    prompt: '海贼王全家福',
    output_size: '1K',
    temperature: 1,
    aspect_ratio: '1:1',
    model: 'amotoken-gpt-image-2',
    created_at: '2026-07-06T08:00:00.000Z',
    error: 'API 请求失败: 502 Upstream request failed',
    failureReason: 'upstream',
    failureStage: '上游生成',
    imageQuote: {
      catalogVersion: 'image-v11',
      model: 'gpt-image-2',
      displayName: 'GPT Image 2',
      mode: 'generation',
      resolutionTier: '1K',
      size: '1024x1024',
      quality: 'medium',
      count: 1,
      referenceImageCount: 0,
      unitPrice: 0.06,
      totalPrice: 0.06,
      currency: 'API_CREDIT',
      available: true,
    },
    ...overrides,
  };
}

beforeEach(() => {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
  });
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('HistoryJobList v0.6 task cards', () => {
  it('keeps failed tasks concise with retry and prompt copy actions', () => {
    render(
      <HistoryJobList
        active
        title="生图任务"
        mode="text-to-image"
        jobs={[makeJob()]}
        loadedImages={new Set()}
        checkingJobIds={new Set()}
        cooldowns={new Map()}
        onRetry={vi.fn()}
        onClear={vi.fn()}
        onClearAll={vi.fn()}
        onCancel={vi.fn()}
        onCheckStatus={vi.fn()}
      />
    );

    expect(screen.getByText('生图失败')).toBeInTheDocument();
    expect(screen.queryByText('完整参数')).not.toBeInTheDocument();
    expect(screen.queryByText(/^模型：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^尺寸：/)).not.toBeInTheDocument();
    expect(screen.getByText(/质量：自动/)).toBeInTheDocument();
    expect(screen.getByText(/风格：自动/)).toBeInTheDocument();
    expect(screen.getByText(/背景：自动/)).toBeInTheDocument();
    expect(screen.getByText(/数量：1/)).toBeInTheDocument();
    expect(screen.getByText('预计消耗 $0.06 API 额度')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制完整提示词' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText(/失败阶段/)).not.toBeInTheDocument();
    expect(screen.queryByText(/爱词元记录/)).not.toBeInTheDocument();
  });

  it('keeps long failed prompts compact with full hover access', () => {
    const longPrompt = [
      '一个极其复杂的电影级长提示词，包含大量人物、背景、动作、材质、色彩、镜头、光影、情绪和后期细节。',
      '第二行继续描述更多复杂内容，确保卡片内只显示摘要，但悬停时仍能看到完整提示词，方便用户截取复制。',
    ].join('\n');

    render(
      <HistoryJobList
        active
        title="生图任务"
        mode="text-to-image"
        jobs={[makeJob({ prompt: longPrompt, elapsedMs: 126000 })]}
        loadedImages={new Set()}
        checkingJobIds={new Set()}
        cooldowns={new Map()}
        onRetry={vi.fn()}
        onClear={vi.fn()}
        onClearAll={vi.fn()}
        onCancel={vi.fn()}
        onCheckStatus={vi.fn()}
      />
    );

    const promptSummary = screen.getByTestId('failed-job-prompt-summary');
    expect(promptSummary).toHaveAttribute('title', longPrompt);
    expect(promptSummary.textContent?.length).toBeLessThan(longPrompt.length);
    expect(promptSummary).toHaveClass('truncate');

    expect(screen.getByRole('button', { name: '复制完整提示词' })).toBeInTheDocument();
    expect(screen.queryByText('错误详情')).not.toBeInTheDocument();
  });

  it('uses equal height task cards for queued, failed, and completed jobs', () => {
    const jobs = [
      makeJob({
        id: 'queued-job',
        status: 'queued',
        prompt: '排队中的任务',
      }),
      makeJob({
        id: 'failed-job',
        status: 'failed',
        prompt: '失败的任务',
      }),
      makeJob({
        id: 'completed-job',
        status: 'completed',
        prompt: '完成的任务',
        imageData: 'iVBORw0KGgo=',
        images: ['iVBORw0KGgo='],
      }),
    ];

    render(
      <HistoryJobList
        active
        title="生图任务"
        mode="text-to-image"
        jobs={jobs}
        loadedImages={new Set(['completed-job'])}
        checkingJobIds={new Set()}
        cooldowns={new Map()}
        onRetry={vi.fn()}
        onClear={vi.fn()}
        onClearAll={vi.fn()}
        onCancel={vi.fn()}
        onCheckStatus={vi.fn()}
      />
    );

    const cards = screen.getAllByTestId('history-job-card');
    expect(cards).toHaveLength(3);
    cards.forEach(card => {
      expect(card).toHaveClass('h-64');
      expect(card).toHaveClass('overflow-hidden');
    });
  });

  it('opens the full failed prompt in a selectable dialog', () => {
    const longPrompt = '一个很长的失败提示词，需要在卡片里截断，但点击后弹出完整内容，用户可以只选中其中一小段复制。';

    render(
      <HistoryJobList
        active
        title="生图任务"
        mode="text-to-image"
        jobs={[makeJob({ prompt: longPrompt })]}
        loadedImages={new Set()}
        checkingJobIds={new Set()}
        cooldowns={new Map()}
        onRetry={vi.fn()}
        onClear={vi.fn()}
        onClearAll={vi.fn()}
        onCancel={vi.fn()}
        onCheckStatus={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看完整提示词' }));

    expect(screen.getByRole('dialog', { name: '完整提示词' })).toBeInTheDocument();
    const promptText = screen.getByRole('textbox', { name: '完整提示词内容' });
    expect(promptText).toHaveValue(longPrompt);
    expect(promptText).toHaveAttribute('readonly');
  });
});
