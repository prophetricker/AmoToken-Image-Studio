import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageGenerationWorkbench } from '../ImageGenerationWorkbench';

describe('ImageGenerationWorkbench AmoToken setup', () => {
  it('uses AmoToken token wording when generation is disabled', () => {
    render(
      <ImageGenerationWorkbench
        disabled
        onSubmitText={vi.fn()}
        onSubmitImage={vi.fn()}
      />,
    );

    expect(screen.getByText('AmoToken 令牌未配置')).toBeInTheDocument();
    expect(screen.getByText('请先在设置中粘贴 AmoToken 令牌，保存后即可开始生成图片。')).toBeInTheDocument();
    expect(screen.queryByText(/Nova API 密钥/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '配置' }));

    expect(screen.getByText('请先粘贴 AmoToken 令牌')).toBeInTheDocument();
    expect(screen.getByText('AmoToken v0.5 已预置可用模型，粘贴专用令牌后即可生成或转换图片。')).toBeInTheDocument();
  });
});
