import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptGallery } from '@/components/PromptGallery';
import { PromptCard } from '@/components/prompt-gallery/PromptGallerySubcomponents';
import { fetchPromptGallery, fetchPromptGalleryMeta } from '@/lib/prompt-gallery-client';

vi.mock('@/lib/prompt-gallery-client', () => ({
  fetchPromptGallery: vi.fn(),
  fetchPromptGalleryMeta: vi.fn(),
}));

const prompt = {
  id: 'prompt-1',
  uniqueKey: 'source-prompt-1',
  title: '去水印修复',
  content: '去除画面中的水印并自然补全背景。',
  images: ['https://example.com/demo.png'],
  tags: ['修复', '图生图'],
  contributor: 'AmoToken',
  notes: '',
  source: 'manual',
  sourceUrl: 'https://example.com/source',
  category: '修复',
};

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
  vi.mocked(fetchPromptGallery).mockReset();
  vi.mocked(fetchPromptGalleryMeta).mockReset();
});

describe('PromptCard v0.8 reuse actions', () => {
  it('can import a prompt gallery card into the image workbench', () => {
    const onUsePrompt = vi.fn();
    render(
      <PromptCard
        prompt={prompt}
        onShowDetail={vi.fn()}
        onShowImages={vi.fn()}
        imageCache={new Set(prompt.images)}
        onImageLoad={vi.fn()}
        onUsePrompt={onUsePrompt}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '用于生图' }));

    expect(onUsePrompt).toHaveBeenCalledWith(prompt.content);
  });
});

describe('PromptGallery API-only loading', () => {
  it('keeps prompt cards usable when source metadata is unavailable', async () => {
    vi.mocked(fetchPromptGallery).mockResolvedValue([prompt]);
    vi.mocked(fetchPromptGalleryMeta).mockRejectedValue(new Error('private metadata response'));

    render(<PromptGallery />);

    expect(await screen.findByText(prompt.title)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索提示词、标题或作者...')).toBeInTheDocument();

    fireEvent.click(screen.getByText('提示词来源'));

    expect(await screen.findByText('来源信息暂不可用')).toBeInTheDocument();
    expect(screen.queryByText('private metadata response')).not.toBeInTheDocument();
    expect(fetchPromptGallery).toHaveBeenCalledTimes(1);
    expect(fetchPromptGalleryMeta).toHaveBeenCalledTimes(1);
  });

  it('renders metadata sources without reloading or clearing prompt cards', async () => {
    vi.mocked(fetchPromptGallery).mockResolvedValue([prompt]);
    vi.mocked(fetchPromptGalleryMeta).mockResolvedValue({
      publishedCount: 1,
      refreshedAt: '2026-07-26T00:00:00.000Z',
      nextRefreshAt: '2026-07-29T00:00:00.000Z',
      sources: [{
        id: 'manual',
        label: '示例提示词库',
        sourceUrl: 'https://github.com/example/prompts',
        license: 'MIT',
        status: 'healthy',
        candidateCount: 1,
        lastSuccessAt: '2026-07-26T00:00:00.000Z',
      }],
    });

    render(<PromptGallery />);

    expect(await screen.findByText(prompt.title)).toBeInTheDocument();
    fireEvent.click(screen.getByText('提示词来源'));
    expect(await screen.findByText('示例提示词库')).toBeInTheDocument();
    expect(screen.getByText(prompt.title)).toBeInTheDocument();
  });

  it('shows only the safe compact error when prompts fail', async () => {
    vi.mocked(fetchPromptGallery).mockRejectedValue(new Error('secret response body'));
    vi.mocked(fetchPromptGalleryMeta).mockResolvedValue({
      publishedCount: 0,
      refreshedAt: null,
      nextRefreshAt: null,
      sources: [],
    });

    render(<PromptGallery />);

    expect(await screen.findByText('提示词广场暂不可用')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('secret response body')).not.toBeInTheDocument());
  });
});
