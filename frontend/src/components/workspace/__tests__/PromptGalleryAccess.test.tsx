import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePromptGalleryAccess } from '@/components/workspace/PromptGalleryAccess';
import type { PromptGalleryMode } from '@/hooks/usePromptGalleryConfig';

describe('usePromptGalleryAccess mode changes', () => {
  it('resets an unlocked restricted gallery after it is disabled', () => {
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ mode }: { mode: PromptGalleryMode }) => usePromptGalleryAccess(mode, false, onError),
      { initialProps: { mode: '2' as PromptGalleryMode } },
    );

    expect(result.current.showPromptGallery).toBe(false);

    act(() => result.current.handlePromptGalleryEntry());
    expect(result.current.showPromptGallery).toBe(true);

    rerender({ mode: '3' });
    expect(result.current.showPromptGallery).toBe(false);

    rerender({ mode: '2' });
    expect(result.current.showPromptGallery).toBe(false);

    rerender({ mode: '1' });
    expect(result.current.showPromptGallery).toBe(true);
  });
});
