import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageGenerationWorkbench } from '../ImageGenerationWorkbench';
import { AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID, AMOTOKEN_IMAGE_MODEL_ID, saveAmoTokenToken } from '@/lib/nova-models';
import { CANDIDATE_MODES_STORAGE_KEY } from '@/lib/candidate-capabilities';
import { syncDynamicModelExports } from '@/lib/gemini-config';

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

function mockPromptFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/nova/prompts') {
      return {
        ok: true,
        json: async () => quickPrompts,
      };
    }
    return {
      ok: false,
      json: async () => ({}),
    };
  }));
}

describe('ImageGenerationWorkbench AmoToken setup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    syncDynamicModelExports();
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

    expect(await screen.findByRole('button', { name: /AmoToken GPT Image 2/ })).toBeInTheDocument();
  });

  it('shows estimated cost and local sensitive prompt warning before submit', async () => {
    saveAmoTokenToken('sk-test-token');
    render(
      <ImageGenerationWorkbench
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
        initialData={{ model: AMOTOKEN_IMAGE_MODEL_ID }}
      />,
    );

    expect(await screen.findByText(/预估费用/)).toHaveTextContent('约 ¥0.03-0.06');

    fireEvent.change(screen.getByPlaceholderText('描述你想要生成的图像...'), {
      target: { value: '生成色情裸露写真' },
    });

    expect(screen.getByText(/可能触发内容限制/)).toBeInTheDocument();
  });

  it('uses the fusion estimate when multiple reference images are loaded', async () => {
    saveAmoTokenToken('sk-test-token');
    render(
      <ImageGenerationWorkbench
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
        initialData={{
          model: AMOTOKEN_IMAGE_MODEL_ID,
          outputSize: '2K',
          refImages: [
            { id: 'ref-1', name: 'ref-1.png', dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png' },
            { id: 'ref-2', name: 'ref-2.png', dataUrl: 'data:image/png;base64,BBBB', mimeType: 'image/png' },
          ],
        }}
      />,
    );

    await screen.findByAltText('ref-1.png');
    expect(screen.getByText(/预估费用/)).toHaveTextContent('约 ¥0.12-0.13');
  });

  it('exposes the 4K gray-test model and 4K size only after candidate modes are enabled', async () => {
    saveAmoTokenToken('sk-test-token');
    localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');
    syncDynamicModelExports();

    render(
      <ImageGenerationWorkbench
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
        initialData={{
          model: AMOTOKEN_IMAGE_MODEL_ID,
          outputSize: '2K',
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /模型：AmoToken GPT Image 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'AmoToken GPT Image 2 4K 灰测' }));

    expect(await screen.findByRole('button', { name: /模型：AmoToken GPT Image 2 4K 灰测/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2K' }));

    expect(screen.getByRole('button', { name: '4K' })).toBeInTheDocument();
    expect(localStorage.getItem('nova-model-registry')).not.toContain(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID);
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
    expect(screen.getByText(/知名角色、品牌、影视动漫作品名/)).toBeInTheDocument();
    expect(screen.getByText(/生图服务繁忙、网络波动或连接中断/)).toBeInTheDocument();
    expect(screen.getByText(/失败通常不扣费/)).toBeInTheDocument();
  });

  it('keeps the main workbench compact without scene template cards', async () => {
    saveAmoTokenToken('sk-test-token');
    mockPromptFetch();
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
