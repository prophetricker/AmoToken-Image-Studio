import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAmoTokenImageToken } from '../amotoken-key-picker';

const TEST_KEY = 'sk-local-test-placeholder';

function createPopup() {
  return {
    closed: false,
    close: vi.fn(),
  } as unknown as Window;
}

function dispatchMessage(popup: Window, payload: unknown, origin = 'https://amotoken.cc') {
  window.dispatchEvent(new MessageEvent('message', {
    origin,
    source: popup,
    data: payload,
  }));
}

describe('requestAmoTokenImageToken', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'open');
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens a state-bound URL with only callback origin and state', () => {
    const popup = createPopup();
    vi.mocked(window.open).mockReturnValue(popup);

    void requestAmoTokenImageToken();

    const [rawUrl] = vi.mocked(window.open).mock.calls[0] ?? [];
    const url = new URL(String(rawUrl));
    const queryKeys = [...url.searchParams.keys()].sort();

    expect(url.origin).toBe('https://amotoken.cc');
    expect(url.pathname).toBe('/image-studio/connect');
    expect(queryKeys).toEqual(['callback_origin', 'state']);
    expect(url.searchParams.get('callback_origin')).toBe(window.location.origin);
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses an explicitly configured console origin for local integration', () => {
    vi.stubEnv('NEXT_PUBLIC_AMOTOKEN_CONSOLE_ORIGIN', 'http://127.0.0.1:43120');
    const popup = createPopup();
    vi.mocked(window.open).mockReturnValue(popup);

    void requestAmoTokenImageToken();

    const [rawUrl] = vi.mocked(window.open).mock.calls[0] ?? [];
    expect(new URL(String(rawUrl)).origin).toBe('http://127.0.0.1:43120');
  });

  it('resolves only an exact message from the selected popup and console origin', async () => {
    const popup = createPopup();
    vi.mocked(window.open).mockReturnValue(popup);
    const promise = requestAmoTokenImageToken();
    const rawUrl = vi.mocked(window.open).mock.calls[0]?.[0];
    const state = new URL(String(rawUrl)).searchParams.get('state');

    dispatchMessage(popup, { source: 'amotoken-image-studio-key', state, key: TEST_KEY }, 'https://evil.example');
    dispatchMessage(createPopup(), { source: 'amotoken-image-studio-key', state, key: TEST_KEY });
    dispatchMessage(popup, { source: 'amotoken-image-studio-key', state: 'f'.repeat(64), key: TEST_KEY });

    let settled = false;
    void promise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    dispatchMessage(popup, { source: 'amotoken-image-studio-key', state, key: TEST_KEY });

    await expect(promise).resolves.toBe(TEST_KEY);
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('rejects a blocked popup without adding listeners', async () => {
    vi.mocked(window.open).mockReturnValue(null);

    await expect(requestAmoTokenImageToken()).rejects.toThrow('popup');
  });

  it('rejects when the popup closes and cleans up timers and listeners', async () => {
    const popup = createPopup();
    vi.mocked(window.open).mockReturnValue(popup);
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const promise = requestAmoTokenImageToken({ timeoutMs: 1_000 });

    Object.defineProperty(popup, 'closed', { value: true, configurable: true });
    vi.advanceTimersByTime(250);

    await expect(promise).rejects.toThrow('closed');
    expect(removeListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('rejects after the timeout and removes the message listener', async () => {
    const popup = createPopup();
    vi.mocked(window.open).mockReturnValue(popup);
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const promise = requestAmoTokenImageToken({ timeoutMs: 1_000 });

    vi.advanceTimersByTime(1_000);

    await expect(promise).rejects.toThrow('timed out');
    expect(removeListener).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
