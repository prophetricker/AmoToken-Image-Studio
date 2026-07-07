import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageGenerationWorkbench } from '../ImageGenerationWorkbench';
import { AMOTOKEN_IMAGE_MODEL_ID, saveAmoTokenToken } from '@/lib/nova-models';
import { syncDynamicModelExports } from '@/lib/gemini-config';

describe('ImageGenerationWorkbench AmoToken setup', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
