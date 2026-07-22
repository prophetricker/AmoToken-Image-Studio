import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletedJobCard } from '@/components/workspace/results/CompletedJobCard';
import type { StoredJob } from '@/lib/job-store';

const assetStoreMocks = vi.hoisted(() => ({
  addTextAsset: vi.fn(),
}));

vi.mock('@/lib/asset-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/asset-store')>();
  return {
    ...actual,
    addTextAsset: assetStoreMocks.addTextAsset,
  };
});

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
    imageQuote: {
      catalogVersion: 'image-v11',
      model: 'gpt-image-2',
      displayName: 'GPT Image 2',
      mode: 'generation',
      resolutionTier: '2K',
      size: '2048x2048',
      quality: 'high',
      count: 1,
      referenceImageCount: 0,
      unitPrice: 0.13,
      totalPrice: 0.13,
      currency: 'API_CREDIT',
      available: true,
    },
    imageData: 'iVBORw0KGgo=',
    images: ['iVBORw0KGgo='],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assetStoreMocks.addTextAsset.mockResolvedValue({
    id: 'text-asset-1',
    kind: 'text',
    hash: 'text-hash-1',
    name: 'saved prompt',
    content: 'saved prompt',
    sizeBytes: 12,
    tags: [],
    note: '',
    sourceKind: 'text-to-image',
    sourceLabel: '生图任务提示词',
    createdAt: 1772800000000,
    updatedAt: 1772800000000,
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

describe('CompletedJobCard v0.6 metadata', () => {
  it('shows task thumbnail actions, deduplicated inline params, elapsed time, and exact API-credit quote', () => {
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
    expect(screen.getByText('预计消耗 $0.13 API 额度')).toBeInTheDocument();
    expect(screen.queryByText(/¥|实际扣费待/)).not.toBeInTheDocument();
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

  it('keeps the legacy cost estimate visible when an old job has no exact quote', () => {
    render(
      <CompletedJobCard
        job={makeCompletedJob({
          imageQuote: undefined,
          costEstimate: { currency: 'CNY', min: 0.08, max: 0.13, source: 'gray-log-estimate' },
          billingStatus: 'pending-newapi-check',
        })}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('约 ¥0.08-0.13')).toBeInTheDocument();
    expect(screen.getByText('实际扣费待爱词元记录核对')).toBeInTheDocument();
  });

  it('uses the quoted display name for a dynamic catalog model', () => {
    render(
      <CompletedJobCard
        job={makeCompletedJob({
          model: 'catalog-image-premium',
          imageQuote: {
            ...makeCompletedJob().imageQuote!,
            model: 'catalog-image-premium',
            displayName: 'AmoToken Image Premium',
          },
        })}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent?.startsWith('AmoToken Image Premium·2K') === true)).toBeInTheDocument();
    expect(screen.queryByText('catalog-image-premium')).not.toBeInTheDocument();
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

  it('saves the completed prompt and generation parameters as a text asset', async () => {
    render(
      <CompletedJobCard
        job={makeCompletedJob()}
        onClear={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '保存提示词素材' }));

    expect(assetStoreMocks.addTextAsset).toHaveBeenCalledWith(expect.objectContaining({
      sourceKind: 'text-to-image',
      sourceLabel: '生图任务提示词',
      sourceRef: 'job-1',
    }));
    expect(assetStoreMocks.addTextAsset.mock.calls[0][0].content).toContain('一只小鲨鱼戴上海盗帽');
    expect(assetStoreMocks.addTextAsset.mock.calls[0][0].content).toContain('模型：GPT Image 2');
    expect(assetStoreMocks.addTextAsset.mock.calls[0][0].content).toContain('尺寸：2K');
    expect(assetStoreMocks.addTextAsset.mock.calls[0][0].content).toContain('质量：高');
  });
});
