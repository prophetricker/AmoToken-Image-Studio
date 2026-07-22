import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageGenerationWorkbench } from '../ImageGenerationWorkbench';
import { AMOTOKEN_IMAGE_MODEL_ID, saveAmoTokenToken } from '@/lib/nova-models';
import { syncDynamicModelExports } from '@/lib/gemini-config';
import { clearAmoTokenImageCatalogCache } from '@/lib/amotoken-image-catalog';

const imageCatalog = {
  object: 'list',
  catalog_version: 'image-v11',
  data: [
    {
      model: 'gpt-image-2', display_name: 'GPT Image 2', mode: 'generation',
      resolution_tier: '1K', sizes: ['1024x1024', '1536x1024'], quality: 'medium',
      max_count: 2, max_reference_images: 2,
    },
    {
      model: 'gpt-image-2', display_name: 'GPT Image 2', mode: 'edit',
      resolution_tier: '2K', sizes: ['2048x2048'], quality: 'high',
      max_count: 2, max_reference_images: 2,
    },
    {
      model: 'gpt-image-lite', display_name: 'GPT Image Lite', mode: 'generation',
      resolution_tier: '1K', sizes: ['1024x1024'], quality: 'low',
      max_count: 1, max_reference_images: 1,
    },
    {
      model: 'gpt-image-lite', display_name: 'GPT Image Lite', mode: 'edit',
      resolution_tier: '1K', sizes: ['1024x1024'], quality: 'low',
      max_count: 1, max_reference_images: 1,
    },
  ],
};

const quickPrompts = [
  {
    title: '学术论文白板讲解',
    content: '将论文内容转换为中文教授白板讲解图，保留核心公式、流程和结论。',
    type: 1,
  },
  {
    title: '图片去水印',
    content: '去除画面中的水印和覆盖文字，自然补全被遮挡区域。',
    type: 2,
  },
] as const;

function mockCatalogAndQuoteFetch(options: {
  available?: boolean;
  totalPrice?: number;
  quoteSequence?: Array<number | 'error'>;
  catalog?: unknown;
} = {}) {
  let quoteIndex = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/nova/image-products/catalog') {
      return new Response(JSON.stringify(options.catalog ?? imageCatalog), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(input) === '/api/nova/image-products/quote') {
      const quoteResult = options.quoteSequence?.[quoteIndex] ?? options.totalPrice ?? 0.12;
      quoteIndex += 1;
      if (quoteResult === 'error') {
        return new Response(JSON.stringify({ error: '暂时无法获取生图报价' }), { status: 503 });
      }
      const body = JSON.parse(String(init?.body || '{}')) as {
        model: string; mode: string; size: string; quality: string; count: number; reference_image_count: number;
      };
      return new Response(JSON.stringify({
        object: 'image_product_quote',
        data: options.available === false ? { available: false } : {
          catalog_version: 'image-v11',
          model: body.model,
          display_name: body.model === 'gpt-image-lite' ? 'GPT Image Lite' : 'GPT Image 2',
          mode: body.mode,
          resolution: body.size.startsWith('2048') ? '2K' : '1K',
          size: body.size,
          quality: body.quality,
          count: body.count,
          reference_image_count: body.reference_image_count,
           unit_price: quoteResult / body.count,
           total_price: quoteResult,
          currency: 'API_CREDIT',
          available: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(input) === '/api/nova/prompts') {
      return {
        ok: true,
        json: async () => quickPrompts,
      } as Response;
    }
    return {
      ok: false,
      json: async () => ({}),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ImageGenerationWorkbench AmoToken setup', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAmoTokenImageCatalogCache();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    syncDynamicModelExports();
    mockCatalogAndQuoteFetch();
  });

  it('uses AmoToken token wording when generation is disabled', () => {
    render(
      <ImageGenerationWorkbench
        disabled
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
      />,
    );

    expect(screen.getByText('AmoToken 令牌未配置')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '先粘贴 AmoToken 令牌' })).toBeInTheDocument();
    expect(screen.getByText('请先粘贴 AmoToken 令牌，保存后选择模型，就可以开始第一张图。')).toBeInTheDocument();
    expect(screen.queryByText(/Nova API 密钥/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '先粘贴 AmoToken 令牌' }));

    expect(screen.getByText('请先粘贴 AmoToken 令牌')).toBeInTheDocument();
    expect(screen.getByText('AmoToken v0.6 已预置可用模型，粘贴专用令牌后即可生成或转换图片。')).toBeInTheDocument();
  });

  it('shows model selection as an explicit labeled control', async () => {
    render(
      <ImageGenerationWorkbench
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: /模型：/ })).toBeInTheDocument();
  });

  it('selects the AmoToken default model after token setup enables the workbench', async () => {
    const props = {
      onSubmitText: vi.fn(),
      onSubmitImage: vi.fn(),
    };

    const { rerender } = render(<ImageGenerationWorkbench {...props} disabled />);

    expect(screen.getByRole('button', { name: '先粘贴 AmoToken 令牌' })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('nova-image-generation-settings')).toContain('"model":""'));

    saveAmoTokenToken('sk-test-token');
    syncDynamicModelExports();
    rerender(<ImageGenerationWorkbench {...props} />);

    expect(await screen.findByRole('button', { name: /模型：GPT Image 2/ })).toBeInTheDocument();
  });

  it('loads the token catalog, recommends its first model, and still allows model switching', async () => {
    saveAmoTokenToken('sk-test-token');
    render(
      <ImageGenerationWorkbench
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
      />,
    );

    const modelButton = await screen.findByRole('button', { name: /模型：GPT Image 2/ });
    fireEvent.click(modelButton);
    expect(screen.getByRole('button', { name: 'GPT Image 2（推荐）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GPT Image Lite' })).toBeInTheDocument();
    expect(screen.queryByText(/1K 备用|4K 灰测|gpt-image-2-1k-backup/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'GPT Image Lite' }));
    expect(await screen.findByRole('button', { name: /模型：GPT Image Lite/ })).toBeInTheDocument();
  });

  it('blocks submission with concise states while the catalog is loading, failed, or empty', async () => {
    saveAmoTokenToken('sk-test-token');
    let resolveCatalog!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/nova/image-products/catalog') {
        return new Promise<Response>(resolve => { resolveCatalog = resolve; });
      }
      return Promise.reject(new Error('unexpected request'));
    }));
    const { unmount } = render(<ImageGenerationWorkbench onSubmitText={vi.fn()} onSubmitImage={vi.fn()} />);
    fireEvent.change(await screen.findByPlaceholderText('描述你想要生成的图像...'), { target: { value: '生成一张海报' } });
    expect(screen.getByText('正在读取生图目录…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按文生图提交' })).toBeDisabled();
    unmount();
    resolveCatalog(new Response(JSON.stringify(imageCatalog), { status: 200 }));

    clearAmoTokenImageCatalogCache();
    mockCatalogAndQuoteFetch({ catalog: { object: 'list', catalog_version: 'empty-v1', data: [] } });
    const emptyView = render(<ImageGenerationWorkbench onSubmitText={vi.fn()} onSubmitImage={vi.fn()} />);
    expect(await screen.findByText('当前没有可用的生图模型')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按文生图提交' })).toBeDisabled();
    emptyView.unmount();

    clearAmoTokenImageCatalogCache();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    render(<ImageGenerationWorkbench onSubmitText={vi.fn()} onSubmitImage={vi.fn()} />);
    expect(await screen.findByText('暂时无法读取生图模型，请稍后重试')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按文生图提交' })).toBeDisabled();
  });

  it('uses generation catalog capabilities and shows an exact API-credit quote', async () => {
    saveAmoTokenToken('sk-test-token');
    const fetchMock = mockCatalogAndQuoteFetch({ totalPrice: 0.12 });
    render(<ImageGenerationWorkbench onSubmitText={vi.fn()} onSubmitImage={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('描述你想要生成的图像...'), {
      target: { value: '生成一张电影海报' },
    });

    expect(await screen.findByText('预计消耗 $0.12 API 额度')).toBeInTheDocument();
    expect(screen.queryByText(/¥|预估费用/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '按文生图提交' })).toBeEnabled());

    const quoteCall = fetchMock.mock.calls.find(call => String(call[0]) === '/api/nova/image-products/quote');
    expect(JSON.parse(String(quoteCall?.[1]?.body))).toEqual({
      model: 'gpt-image-2', mode: 'generation', size: '1024x1024', quality: 'medium',
      count: 1, reference_image_count: 0,
    });

    fireEvent.click(screen.getByRole('button', { name: '1K' }));
    expect(screen.queryByRole('button', { name: '4K' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'x1' }));
    expect(screen.getByRole('button', { name: '生成 2 张' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成 3 张' })).not.toBeInTheDocument();
  });

  it('re-quotes on submit and forwards the latest complete quote snapshot', async () => {
    saveAmoTokenToken('sk-test-token');
    const onSubmitText = vi.fn();
    const fetchMock = mockCatalogAndQuoteFetch({ quoteSequence: [0.12, 0.14] });
    render(<ImageGenerationWorkbench onSubmitText={onSubmitText} onSubmitImage={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('描述你想要生成的图像...'), {
      target: { value: '生成一张航海海报' },
    });
    const submitButton = screen.getByRole('button', { name: '按文生图提交' });
    await waitFor(() => expect(submitButton).toBeEnabled());

    fireEvent.click(submitButton);

    await waitFor(() => expect(onSubmitText).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-image-2',
      quote: expect.objectContaining({
        catalogVersion: 'image-v11',
        model: 'gpt-image-2',
        mode: 'generation',
        resolutionTier: '1K',
        size: '1024x1024',
        quality: 'medium',
        count: 1,
        referenceImageCount: 0,
        unitPrice: 0.14,
        totalPrice: 0.14,
        currency: 'API_CREDIT',
      }),
    })));
    expect(fetchMock.mock.calls.filter(call => String(call[0]) === '/api/nova/image-products/quote')).toHaveLength(2);
  });

  it('locks prompt and model controls while confirming the submission quote', async () => {
    saveAmoTokenToken('sk-test-token');
    let quoteCallCount = 0;
    let resolveSubmissionQuote!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/nova/image-products/catalog') {
        return new Response(JSON.stringify(imageCatalog), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(input) === '/api/nova/image-products/quote') {
        quoteCallCount += 1;
        const body = JSON.parse(String(init?.body || '{}'));
        const response = new Response(JSON.stringify({
          data: {
            catalog_version: 'image-v11', model: body.model, display_name: 'GPT Image 2',
            mode: body.mode, resolution: '1K', size: body.size, quality: body.quality,
            count: body.count, reference_image_count: body.reference_image_count,
            unit_price: 0.12, total_price: 0.12, currency: 'API_CREDIT', available: true,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (quoteCallCount === 1) return response;
        return new Promise<Response>(resolve => { resolveSubmissionQuote = resolve; });
      }
      return new Response('{}', { status: 404 });
    }));

    const onSubmitText = vi.fn().mockResolvedValue(true);
    render(<ImageGenerationWorkbench onSubmitText={onSubmitText} onSubmitImage={vi.fn()} />);
    const promptInput = await screen.findByPlaceholderText('描述你想要生成的图像...');
    fireEvent.change(promptInput, { target: { value: '生成一张航海海报' } });
    const submitButton = screen.getByRole('button', { name: '按文生图提交' });
    await waitFor(() => expect(submitButton).toBeEnabled());

    fireEvent.click(submitButton);

    await waitFor(() => expect(screen.getByText('正在确认本次生图报价…')).toBeInTheDocument());
    expect(promptInput).toBeDisabled();
    expect(screen.getByRole('button', { name: /模型：GPT Image 2/ })).toBeDisabled();
    expect(onSubmitText).not.toHaveBeenCalled();
    const uploadArea = screen.getByText('参考图（可选）').closest('div');
    expect(uploadArea).not.toBeNull();
    fireEvent.dragOver(uploadArea!);
    expect(uploadArea).not.toHaveClass('border-primary');

    resolveSubmissionQuote(new Response(JSON.stringify({
      data: {
        catalog_version: 'image-v11', model: 'gpt-image-2', display_name: 'GPT Image 2',
        mode: 'generation', resolution: '1K', size: '1024x1024', quality: 'medium',
        count: 1, reference_image_count: 0, unit_price: 0.14, total_price: 0.14,
        currency: 'API_CREDIT', available: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await waitFor(() => expect(onSubmitText).toHaveBeenCalledTimes(1));
  });

  it('keeps the draft and blocks task creation when the submit-time quote fails', async () => {
    saveAmoTokenToken('sk-test-token');
    const onSubmitText = vi.fn();
    mockCatalogAndQuoteFetch({ quoteSequence: [0.12, 'error'] });
    render(<ImageGenerationWorkbench onSubmitText={onSubmitText} onSubmitImage={vi.fn()} />);

    const promptInput = await screen.findByPlaceholderText('描述你想要生成的图像...');
    fireEvent.change(promptInput, { target: { value: '生成一张航海海报' } });
    const submitButton = screen.getByRole('button', { name: '按文生图提交' });
    await waitFor(() => expect(submitButton).toBeEnabled());

    fireEvent.click(submitButton);

    expect(await screen.findByText('暂时无法获取生图报价，请稍后重试')).toBeInTheDocument();
    expect(onSubmitText).not.toHaveBeenCalled();
    expect(promptInput).toHaveValue('生成一张航海海报');
  });

  it('keeps the draft when the task service rejects the confirmed quote', async () => {
    saveAmoTokenToken('sk-test-token');
    const onSubmitText = vi.fn().mockResolvedValue(false);
    const onDraftConsumed = vi.fn();
    mockCatalogAndQuoteFetch({ quoteSequence: [0.12, 0.14] });
    render(
      <ImageGenerationWorkbench
        onSubmitText={onSubmitText}
        onSubmitImage={vi.fn()}
        onDraftConsumed={onDraftConsumed}
      />,
    );

    const promptInput = await screen.findByPlaceholderText('描述你想要生成的图像...');
    fireEvent.change(promptInput, { target: { value: '生成一张航海海报' } });
    const submitButton = screen.getByRole('button', { name: '按文生图提交' });
    await waitFor(() => expect(submitButton).toBeEnabled());

    fireEvent.click(submitButton);

    await waitFor(() => expect(onSubmitText).toHaveBeenCalledTimes(1));
    expect(promptInput).toHaveValue('生成一张航海海报');
    expect(onDraftConsumed).not.toHaveBeenCalled();
  });

  it('switches to edit capabilities when reference images are present', async () => {
    saveAmoTokenToken('sk-test-token');
    const fetchMock = mockCatalogAndQuoteFetch();
    render(
      <ImageGenerationWorkbench
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
        initialData={{
          model: AMOTOKEN_IMAGE_MODEL_ID,
          refImages: [{ id: 'ref-1', name: 'ref.png', dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png' }],
        }}
      />,
    );

    expect(await screen.findByText('预计消耗 $0.12 API 额度')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 张')).toBeInTheDocument();
    const quoteCalls = fetchMock.mock.calls.filter(call => String(call[0]) === '/api/nova/image-products/quote');
    expect(quoteCalls.some(call => {
      const body = JSON.parse(String(call[1]?.body));
      return body.mode === 'edit' && body.size === '2048x2048' && body.quality === 'high' && body.reference_image_count === 1;
    })).toBe(true);
  });

  it('keeps quote-unavailable specifications blocked', async () => {
    saveAmoTokenToken('sk-test-token');
    mockCatalogAndQuoteFetch({ available: false });
    render(<ImageGenerationWorkbench onSubmitText={vi.fn()} onSubmitImage={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('描述你想要生成的图像...'), {
      target: { value: '生成一张海报' },
    });

    expect(await screen.findByText('当前规格暂不可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按文生图提交' })).toBeDisabled();
  });

  it('keeps the local sensitive prompt warning before submit', async () => {
    saveAmoTokenToken('sk-test-token');
    render(<ImageGenerationWorkbench onSubmitText={vi.fn()} onSubmitImage={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('描述你想要生成的图像...'), {
      target: { value: '生成色情裸露写真' },
    });

    expect(screen.getByText(/可能触发内容限制/)).toBeInTheDocument();
  });

  it('shows wide mode generation guidance outside failed cards', async () => {
    saveAmoTokenToken('sk-test-token');
    render(
      <ImageGenerationWorkbench
        wideMode
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
        initialData={{ model: AMOTOKEN_IMAGE_MODEL_ID }}
      />,
    );

    expect(await screen.findByText('生图建议')).toBeInTheDocument();
    expect(screen.getByText(/复杂画面、角色过多/)).toBeInTheDocument();
    expect(screen.getByText(/品牌标志\/logo/)).toBeInTheDocument();
    expect(screen.getByText(/真人肖像/)).toBeInTheDocument();
    expect(screen.getByText(/生图服务繁忙、网络波动或连接中断/)).toBeInTheDocument();
    expect(screen.getByText(/失败通常不扣费/)).toBeInTheDocument();
  });

  it('keeps the main workbench compact without scene template cards', async () => {
    saveAmoTokenToken('sk-test-token');
    mockCatalogAndQuoteFetch();
    render(
      <ImageGenerationWorkbench
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
        initialData={{ model: AMOTOKEN_IMAGE_MODEL_ID }}
      />,
    );

    expect(await screen.findByPlaceholderText('描述你想要生成的图像...')).toBeInTheDocument();
    expect(screen.queryByText('场景模板')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /学术论文白板讲解/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /更多/ })).not.toBeInTheDocument();
  });
});
