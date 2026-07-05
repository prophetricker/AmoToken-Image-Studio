import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '@/components/SettingsModal';
import { AMOTOKEN_IMAGE_MODEL_ID, loadRegistry } from '@/lib/nova-models';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  });
  vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
});

describe('SettingsModal AmoToken setup', () => {
  it('shows token-only setup and hides raw model fields', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} onApiKeyChange={vi.fn()} />);

    expect(screen.getByText('AmoToken 令牌')).toBeInTheDocument();
    expect(screen.getByLabelText('AmoToken 令牌')).toBeInTheDocument();
    expect(screen.queryByText('Base URL')).not.toBeInTheDocument();
    expect(screen.queryByText('模型 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('协议')).not.toBeInTheDocument();
  });

  it('saves one token into the AmoToken preset registry', () => {
    const onApiKeyChange = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} onApiKeyChange={onApiKeyChange} />);

    fireEvent.change(screen.getByLabelText('AmoToken 令牌'), { target: { value: 'sk-test-token' } });
    fireEvent.click(screen.getByRole('button', { name: '保存令牌' }));

    const registry = loadRegistry();
    expect(registry.imageModels[0].id).toBe(AMOTOKEN_IMAGE_MODEL_ID);
    expect(registry.imageModels[0].apiKey).toBe('sk-test-token');
    expect(onApiKeyChange).toHaveBeenCalledWith('sk-test-token');
  });
});
