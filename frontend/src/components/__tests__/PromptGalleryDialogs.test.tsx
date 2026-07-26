import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptSelectDialog } from '@/components/PromptSelectDialog';
import { CanvasPromptGalleryImportDialog } from '@/components/canvas/components/canvas-prompt-gallery-import-dialog';
import { fetchPromptGallery } from '@/lib/prompt-gallery-client';
import { promptGalleryCache } from '@/lib/prompt-gallery-cache';

vi.mock('@/lib/prompt-gallery-client', () => ({
  fetchPromptGallery: vi.fn(),
  fetchPromptGalleryMeta: vi.fn(),
}));

vi.mock('@/lib/prompt-gallery-cache', () => ({
  promptGalleryCache: {
    load: vi.fn(),
    peek: vi.fn(() => null),
  },
}));

const oldPrompt = {
  id: 'old',
  uniqueKey: 'source-old',
  title: '旧请求提示词',
  content: '旧请求内容。',
  images: ['https://example.com/old.png'],
  tags: [],
  contributor: '',
  notes: '',
  source: 'source',
  sourceUrl: 'https://github.com/example/prompts',
  category: '其他',
};

const newPrompt = {
  ...oldPrompt,
  id: 'new',
  uniqueKey: 'source-new',
  title: '新请求提示词',
  content: '新请求内容。',
};

const meta = {
  publishedCount: 1,
  refreshedAt: '2026-07-26T00:00:00.000Z',
  nextRefreshAt: '2026-07-29T00:00:00.000Z',
  sources: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.mocked(fetchPromptGallery).mockReset();
  vi.mocked(promptGalleryCache.load).mockReset();
  vi.mocked(promptGalleryCache.peek).mockReturnValue(null);
});

describe('PromptSelectDialog request lifecycle', () => {
  it('keeps the reopened request loading when the closed request resolves first', async () => {
    const first = deferred<typeof oldPrompt[]>();
    const second = deferred<typeof newPrompt[]>();
    vi.mocked(fetchPromptGallery)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = render(<PromptSelectDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />);

    view.rerender(<PromptSelectDialog open={false} onOpenChange={vi.fn()} onSelect={vi.fn()} />);
    view.rerender(<PromptSelectDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />);

    await act(async () => first.resolve([oldPrompt]));

    expect(screen.queryByText(oldPrompt.title)).not.toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    await act(async () => second.resolve([newPrompt]));
    expect(await screen.findByText(newPrompt.title)).toBeInTheDocument();
  });

  it('does not let an older request overwrite a newer completed request', async () => {
    const first = deferred<typeof oldPrompt[]>();
    const second = deferred<typeof newPrompt[]>();
    vi.mocked(fetchPromptGallery)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = render(<PromptSelectDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />);

    view.rerender(<PromptSelectDialog open={false} onOpenChange={vi.fn()} onSelect={vi.fn()} />);
    view.rerender(<PromptSelectDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />);
    await act(async () => second.resolve([newPrompt]));
    expect(await screen.findByText(newPrompt.title)).toBeInTheDocument();

    await act(async () => first.resolve([oldPrompt]));
    expect(screen.getByText(newPrompt.title)).toBeInTheDocument();
    expect(screen.queryByText(oldPrompt.title)).not.toBeInTheDocument();
  });

  it('aborts the active request when unmounted', async () => {
    const pending = deferred<typeof oldPrompt[]>();
    vi.mocked(fetchPromptGallery).mockReturnValue(pending.promise);
    const view = render(<PromptSelectDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />);
    const options = vi.mocked(fetchPromptGallery).mock.calls[0]?.[0];

    expect(options?.signal?.aborted).toBe(false);
    view.unmount();
    expect(options?.signal?.aborted).toBe(true);
  });
});

describe('CanvasPromptGalleryImportDialog request lifecycle', () => {
  it('ignores a stale load that finishes after the reopened dialog', async () => {
    const first = deferred<{ prompts: typeof oldPrompt[]; meta: typeof meta }>();
    const second = deferred<{ prompts: typeof newPrompt[]; meta: typeof meta }>();
    vi.mocked(promptGalleryCache.load)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = render(
      <CanvasPromptGalleryImportDialog open importing={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );

    view.rerender(
      <CanvasPromptGalleryImportDialog open={false} importing={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );
    view.rerender(
      <CanvasPromptGalleryImportDialog open importing={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );
    await act(async () => second.resolve({ prompts: [newPrompt], meta }));
    expect(await screen.findByText(newPrompt.title)).toBeInTheDocument();

    await act(async () => first.resolve({ prompts: [oldPrompt], meta }));
    await waitFor(() => expect(screen.queryByText(oldPrompt.title)).not.toBeInTheDocument());
    expect(screen.getByText(newPrompt.title)).toBeInTheDocument();
  });
});
