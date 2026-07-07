import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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
    billingStatus: 'pending-newapi-check',
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
    expect(screen.getByText('完整参数')).toBeInTheDocument();
    expect(screen.getByText(/模型：amotoken-gpt-image-2/)).toBeInTheDocument();
    expect(screen.getByText(/质量：自动/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制完整提示词' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText(/失败阶段/)).not.toBeInTheDocument();
    expect(screen.queryByText(/爱词元记录/)).not.toBeInTheDocument();
  });

  it('keeps long failed prompts readable with full hover access', () => {
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
    expect(promptSummary).toHaveClass('break-words');

    expect(screen.getByRole('button', { name: '复制完整提示词' })).toBeInTheDocument();
    expect(screen.queryByText('错误详情')).not.toBeInTheDocument();
  });
});
