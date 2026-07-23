import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AmoTokenHarborScene } from '@/components/brand/AmoTokenHarborScene';

describe('AmoTokenHarborScene', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('renders three decorative boats behind the workbench', () => {
    render(<AmoTokenHarborScene />);
    const scene = screen.getByTestId('amotoken-harbor-scene');
    expect(scene).toHaveAttribute('aria-hidden', 'true');
    expect(scene).toHaveAttribute('data-motion', 'full');
    expect(scene.querySelectorAll('[data-harbor-boat]')).toHaveLength(3);
    expect(scene.querySelector('canvas')).toBeNull();
  });

  it('marks the scene as reduced when the OS requests reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(<AmoTokenHarborScene />);

    expect(screen.getByTestId('amotoken-harbor-scene')).toHaveAttribute(
      'data-motion',
      'reduced',
    );
  });

  it('updates bounded pointer variables in full-motion mode', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    render(<AmoTokenHarborScene />);
    window.dispatchEvent(
      new MouseEvent('pointermove', {
        clientX: window.innerWidth,
        clientY: 0,
      }),
    );

    const scene = screen.getByTestId('amotoken-harbor-scene');
    expect(scene.style.getPropertyValue('--harbor-pointer-x')).toBe('7px');
    expect(scene.style.getPropertyValue('--harbor-pointer-y')).toBe('-3px');
  });
});
