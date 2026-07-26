import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageAnnotationEditor } from '@/components/canvas/components/image-annotation-editor';

class MockImage {
  static instances: MockImage[] = [];

  crossOrigin = '';
  naturalWidth = 640;
  naturalHeight = 480;
  complete = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';

  constructor() {
    MockImage.instances.push(this);
  }
}

describe('ImageAnnotationEditor image loading', () => {
  beforeEach(() => {
    MockImage.instances = [];
    vi.stubGlobal('Image', MockImage);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns to loading when the image source changes after an error', () => {
    const view = render(
      <ImageAnnotationEditor src="first.png" title="First" onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    act(() => MockImage.instances[0].onerror?.());
    expect(screen.getByText('图片加载失败')).toBeInTheDocument();

    view.rerender(
      <ImageAnnotationEditor src="second.png" title="Second" onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(screen.queryByText('图片加载失败')).not.toBeInTheDocument();
    expect(MockImage.instances).toHaveLength(2);
    view.unmount();
  });
});
