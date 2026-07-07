import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletedJobCard } from '@/components/workspace/results/CompletedJobCard';
import type { StoredJob } from '@/lib/job-store';

function makeCompletedJob(overrides: Partial<StoredJob> = {}): StoredJob {
  return {
    id: 'job-1',
    status: 'completed',
    mode: 'text-to-image',
    prompt: '一只小鲨鱼戴上海盗帽',
    output_size: '2K',
    temperature: 1,
    aspect_ratio: '1:1',
    model: 'amotoken-gpt-image-2',
    gptImageQuality: 'high',
    gptImageStyle: 'vivid',
    gptImageBackground: 'opaque',
    parallelCount: 1,
    created_at: '2026-07-06T08:00:00.000Z',
    startedAt: '2026-07-06T08:00:00.000Z',
    completedAt: '2026-07-06T08:00:56.000Z',
    elapsedMs: 56000,
    costEstimate: { currency: 'CNY', min: 0.08, max: 0.13, source: 'gray-log-estimate' },
    billingStatus: 'pending-newapi-check',
    imageData: 'iVBORw0KGgo=',
    images: ['iVBORw0KGgo='],
    ...overrides,
  };
}

beforeEach(() => {
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

describe('CompletedJobCard v0.6 metadata', () => {
  it('shows task thumbnail actions, deduplicated inline params, elapsed time, and cost estimate', () => {
    render(
      <CompletedJobCard
        job={makeCompletedJob()}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText(/一只小鲨鱼戴上海盗帽/)).toBeInTheDocument();
    expect(screen.getByText('文生图')).toBeInTheDocument();
    expect(screen.getByText('耗时 56 秒')).toBeInTheDocument();
    expect(screen.getByText('约 ¥0.08-0.13')).toBeInTheDocument();
    expect(screen.getByText('实际扣费待爱词元记录核对')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /复制提示词/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下载/ })).toBeInTheDocument();
    expect(screen.queryByText('完整参数')).not.toBeInTheDocument();
    expect(screen.queryByText(/^模型：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^尺寸：/)).not.toBeInTheDocument();
    expect(screen.getByText('比例：1:1')).toBeInTheDocument();
    expect(screen.getByText('质量：高')).toBeInTheDocument();
    expect(screen.getByText('风格：鲜明')).toBeInTheDocument();
    expect(screen.getByText('背景：不透明')).toBeInTheDocument();
    expect(screen.getByText('数量：1')).toBeInTheDocument();
    expect(screen.queryByText('1.00')).not.toBeInTheDocument();
  });

  it('keeps the full prompt available on hover when the visible row is truncated', () => {
    const longPrompt = '一个很长的成功任务提示词，包含角色、场景、构图、镜头、服装、材质、光影、色彩、背景和后期处理细节，卡片上只应该占一行但悬停可看完整内容。';

    render(
      <CompletedJobCard
        job={makeCompletedJob({ prompt: longPrompt })}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByTestId('completed-job-prompt-summary')).toHaveAttribute('title', longPrompt);
  });

  it('opens the full completed prompt in a selectable dialog', () => {
    const longPrompt = '一个很长的成功任务提示词，需要在任务卡里只显示一行，点击后弹出完整内容，并允许用户框选部分复制。';

    render(
      <CompletedJobCard
        job={makeCompletedJob({ prompt: longPrompt })}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看完整提示词' }));

    expect(screen.getByRole('dialog', { name: '完整提示词' })).toBeInTheDocument();
    const promptText = screen.getByRole('textbox', { name: '完整提示词内容' });
    expect(promptText).toHaveValue(longPrompt);
    expect(promptText).toHaveAttribute('readonly');
  });

  it('labels persisted multi-reference image jobs as fusion', () => {
    render(
      <CompletedJobCard
        job={makeCompletedJob({
          mode: 'image-to-image',
          referenceImageCount: 2,
          refImages: undefined,
        })}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('多图融合')).toBeInTheDocument();
    expect(screen.getByText('参考图：2')).toBeInTheDocument();
  });

  it('shows four generated images as a vertical thumbnail column', () => {
    render(
      <CompletedJobCard
        job={makeCompletedJob({
          images: ['image-1', 'image-2', 'image-3', 'image-4'],
          parallelCount: 4,
        })}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByTestId('completed-job-thumbnail-rail')).toHaveClass('flex-col');
    expect(screen.getAllByAltText(/生成的图像/)).toHaveLength(4);
  });
});
