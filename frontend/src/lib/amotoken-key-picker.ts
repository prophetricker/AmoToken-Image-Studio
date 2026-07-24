export interface AmoTokenKeyPickerMessage {
  source: 'amotoken-image-studio-key';
  state: string;
  key: string;
}

export interface AmoTokenKeyPickerOptions {
  consoleOrigin?: string;
  currentOrigin?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

const DEFAULT_CONSOLE_ORIGIN = 'https://amotoken.cc';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

function getConfiguredConsoleOrigin(): string {
  return process.env.NEXT_PUBLIC_AMOTOKEN_CONSOLE_ORIGIN?.trim()
    || DEFAULT_CONSOLE_ORIGIN;
}

function createState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function isPickerMessage(value: unknown): value is AmoTokenKeyPickerMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AmoTokenKeyPickerMessage>;
  return (
    message.source === 'amotoken-image-studio-key' &&
    typeof message.state === 'string' &&
    typeof message.key === 'string' &&
    message.key.length > 0
  );
}

export function requestAmoTokenImageToken(
  options: AmoTokenKeyPickerOptions = {},
): Promise<string> {
  const consoleOrigin = normalizeOrigin(options.consoleOrigin ?? getConfiguredConsoleOrigin());
  const callbackOrigin = normalizeOrigin(options.currentOrigin ?? window.location.origin);
  const state = createState();
  const pickerUrl = new URL('/image-studio/connect', consoleOrigin);
  pickerUrl.searchParams.set('callback_origin', callbackOrigin);
  pickerUrl.searchParams.set('state', state);
  const popup = window.open(
    pickerUrl.toString(),
    'amotoken-image-studio-key-picker',
    'popup,width=520,height=720',
  );

  if (!popup) {
    return Promise.reject(new Error('AmoToken key picker popup was blocked'));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== consoleOrigin || event.source !== popup) return;
      if (!isPickerMessage(event.data) || event.data.state !== state) return;

      settled = true;
      cleanup();
      popup.close();
      resolve(event.data.key);
    };

    window.addEventListener('message', handleMessage);
    const timeoutId = window.setTimeout(
      () => fail(new Error('AmoToken key picker timed out')),
      timeoutMs,
    );
    const pollId = window.setInterval(() => {
      if (popup.closed) fail(new Error('AmoToken key picker was closed'));
    }, pollIntervalMs);
  });
}
