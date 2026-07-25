import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GifGenerationWorkspace } from '@/components/GifGenerationWorkspace';
import { GifParametersPanel } from '@/components/gif/GifParametersPanel';
import { GifReviewPanel } from '@/components/gif/GifReviewPanel';
import type { ActiveGifJob } from '@/lib/gif-job-store';
import { saveAmoTokenToken } from '@/lib/nova-models';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

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

  it('shows a live API-credit quote without implying local GIF encoding is charged', async () => {
    saveAmoTokenToken('sk-gif-user');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/api/nova/image-products/quote') {
        return new Response('{}', { status: 404 });
      }
      return new Response(JSON.stringify({
        data: {
          catalog_version: 'image-v12',
          model: 'gpt-image-2',
          display_name: 'GPT Image 2',
          mode: 'edit',
          resolution: '2K',
          size: '2048x1536',
          quality: 'auto',
          count: 1,
          reference_image_count: 1,
          unit_price: 0.6,
          total_price: 0.6,
          currency: 'API_CREDIT',
          available: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <GifGenerationWorkspace
        hasApiKey
        onConfigureApiKey={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(await screen.findByText(/预计消耗 \$0\.60 API 额度/)).toBeInTheDocument();
    expect(screen.getByText(/网格图价格/)).toHaveTextContent('GIF 合成在浏览器本地完成，不额外扣费');
    expect(screen.getByText(/实际以爱词元记录为准/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/¥|4K 灰测|支持 4K|上游|NewAPI|Upstream/);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const quoteCall = fetchMock.mock.calls.find(call => String(call[0]) === '/api/nova/image-products/quote');
    expect(JSON.parse(String(quoteCall?.[1]?.body))).toMatchObject({
      model: 'gpt-image-2',
      mode: 'edit',
      size: '2048x1536',
      quality: 'auto',
      count: 1,
      reference_image_count: 1,
    });
  });

  it('refreshes GIF models and pricing when a token is configured after mount', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/api/nova/image-products/quote') {
        return new Response('{}', { status: 404 });
      }
      return new Response(JSON.stringify({
        data: {
          catalog_version: 'image-v12',
          model: 'gpt-image-2',
          display_name: 'GPT Image 2',
          mode: 'edit',
          resolution: '2K',
          size: '2048x1536',
          quality: 'auto',
          count: 1,
          reference_image_count: 1,
          unit_price: 0.6,
          total_price: 0.6,
          currency: 'API_CREDIT',
          available: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <GifGenerationWorkspace
        hasApiKey={false}
        onConfigureApiKey={vi.fn()}
        onError={vi.fn()}
      />,
    );

    act(() => {
      saveAmoTokenToken('sk-gif-late-user');
      window.dispatchEvent(new Event('nova-model-registry-updated'));
      view.rerender(
        <GifGenerationWorkspace
          hasApiKey
          onConfigureApiKey={vi.fn()}
          onError={vi.fn()}
        />,
      );
    });

    expect(await screen.findByText(/预计消耗 \$0\.60 API 额度/)).toBeInTheDocument();
    expect(screen.queryByText('没有可用的 GIF 模型')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/nova/image-products/quote', expect.any(Object));
  });

  it('does not show a hard-coded price before the token is configured', async () => {
    const { container } = render(
      <GifGenerationWorkspace
        hasApiKey={false}
        onConfigureApiKey={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(await screen.findByText(/粘贴令牌后显示实时价格/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/¥0\.10|¥0\.13|支持 4K/);
  });

  it('lets the GIF parameter card grow instead of forcing an inner scrollbar', () => {
    render(<GifParametersPanel {...emptyParameterProps} disabled={false} model="amotoken-gpt-image-2-4k-gray" modelOptions={[{ value: 'amotoken-gpt-image-2-4k-gray', label: 'AmoToken GPT Image 2 4K 灰测' }]} />);

    const panel = screen.getByTestId('gif-parameters-panel');
    const scrollRegion = screen.getByTestId('gif-parameters-body');

    expect(panel.className).not.toContain('md:h-[');
    expect(scrollRegion.className).not.toContain('md:overflow-y-auto');
  });
});
