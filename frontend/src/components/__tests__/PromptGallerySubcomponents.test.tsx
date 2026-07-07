import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptCard } from '@/components/prompt-gallery/PromptGallerySubcomponents';

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
