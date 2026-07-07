import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuickPromptDialog } from '../QuickPromptDialog';

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

describe('QuickPromptDialog compact template picker', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockPromptFetch();
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  });

  it('shows a compact title-only picker for the active mode', async () => {
    render(
      <QuickPromptDialog
        open
        onOpenChange={vi.fn()}
        currentMode="text-to-image"
        currentPrompt=""
        onSelect={vi.fn()}
      />,
    );

    expect(await screen.findByText('学术论文白板讲解')).toBeInTheDocument();
    expect(screen.getAllByText('文生图').length).toBeGreaterThan(0);
    expect(screen.queryByText(/将论文内容转换为中文教授白板讲解图/)).not.toBeInTheDocument();
    expect(screen.queryByText('图片去水印')).not.toBeInTheDocument();
  });

  it('asks before overwriting the current prompt from the template library', async () => {
    const onSelect = vi.fn();
    render(
      <QuickPromptDialog
        open
        onOpenChange={vi.fn()}
        currentMode="image-to-image"
        currentPrompt="已有提示词"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /图片去水印/ }));

    expect(screen.getByText('覆盖提示词')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
