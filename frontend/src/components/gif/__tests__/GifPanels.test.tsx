import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GifGenerationWorkspace } from '@/components/GifGenerationWorkspace';
import { GifParametersPanel } from '@/components/gif/GifParametersPanel';
import { GifReviewPanel } from '@/components/gif/GifReviewPanel';
import type { ActiveGifJob } from '@/lib/gif-job-store';

const emptyParameterProps = {
  prompt: '',
  onPromptChange: vi.fn(),
  model: '',
  modelOptions: [],
  modelPopoverOpen: false,
  onModelPopoverOpenChange: vi.fn(),
  onModelChange: vi.fn(),
  gptImageAdvancedParams: { quality: 'auto', style: 'auto', background: 'auto' } as const,
  onGptImageAdvancedParamsChange: vi.fn(),
  closedLoop: false,
  onClosedLoopToggle: vi.fn(),
  refFiles: [],
  onRemoveRef: vi.fn(),
  maxedOut: false,
  isDragOver: false,
  uploading: false,
  uploadError: null,
  onDrop: vi.fn(),
  onDragOver: vi.fn(),
  onDragLeave: vi.fn(),
  onFileSelect: vi.fn(),
  generating: false,
  canSubmit: false,
  onSubmit: vi.fn(),
  onConfigureApiKey: vi.fn(),
  onOptimize: vi.fn(),
  onClear: vi.fn(),
};

const failedJob: ActiveGifJob = {
  id: 'gif-job-1',
  status: 'failed',
  prompt: '一只小鲨鱼挥手',
  loop: true,
  closedLoop: false,
  model: 'amotoken-gpt-image-2-4k-gray',
  refImages: [],
  frameDelayMs: 120,
  loopCount: 0,
  framePadding: 1.5,
  error: 'API 请求失败: 502 Upstream request failed',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:01:00.000Z',
};

describe('GIF gray-test panels', () => {
  it('asks users to paste an AmoToken token when GIF is disabled by missing credentials', () => {
    render(<GifParametersPanel {...emptyParameterProps} disabled />);

    expect(screen.getByText('需要先配置 AmoToken 令牌')).toBeInTheDocument();
    expect(screen.getByText('请先粘贴 AmoToken 令牌，保存后即可使用动图生成功能。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '粘贴令牌' })).toBeInTheDocument();
    expect(screen.queryByText(/Nova API 密钥|API 密钥/)).not.toBeInTheDocument();
  });

  it('uses concise user-facing wording for failed GIF generation', () => {
    const { container } = render(
      <GifReviewPanel
        status="failed"
        job={failedJob}
        gridImageUrl={null}
        gifBlob={null}
        elapsedSeconds={0}
        gifReady={false}
        loop
        onLoopToggle={vi.fn()}
        frameDelayMs={120}
        onFrameDelayChange={vi.fn()}
        loopCount={0}
        onLoopCountChange={vi.fn()}
        framePadding={1.5}
        onFramePaddingChange={vi.fn()}
        onOpenPreview={vi.fn()}
        onEncodeGif={vi.fn()}
        onDownloadAgain={vi.fn()}
        onRetryRegenerate={vi.fn()}
        onReset={vi.fn()}
        onRefreshFromServer={vi.fn()}
        isSyncing={false}
        refreshCooldownActive={false}
        onBackToReview={vi.fn()}
      />,
    );

    expect(screen.getByText('生图失败')).toBeInTheDocument();
    expect(screen.queryByText('任务失败')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/上游|NewAPI|Upstream/);
  });

  it('explains GIF grid cost without implying local GIF encoding is charged', () => {
    const { container } = render(
      <GifGenerationWorkspace
        hasApiKey={false}
        onConfigureApiKey={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getByText(/预估费用/)).toHaveTextContent('网格图');
    expect(screen.getByText(/预估费用/)).toHaveTextContent('GIF 合成在浏览器本地完成，不额外扣费');
    expect(screen.getByText(/实际以爱词元记录为准/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/上游|NewAPI|Upstream/);
  });
});
