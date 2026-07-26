const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPromptImageCacheKey,
  isAllowedPromptImageUrl,
  normalizePromptImageUrl,
} = require('./prompt-image-cache');

const ATTACHMENT_URL = 'https://github.com/user-attachments/assets/3a056a8d-904e-4b3e-b0d2-b5122758b7f5';

test('allows only UUID-shaped GitHub user attachments on the exact GitHub host', () => {
  assert.equal(isAllowedPromptImageUrl(ATTACHMENT_URL), true);
  assert.equal(isAllowedPromptImageUrl('https://github.com/org/repo/issues/1'), false);
  assert.equal(isAllowedPromptImageUrl('https://evil.example/user-attachments/assets/abc'), false);
  assert.equal(isAllowedPromptImageUrl('https://github.com/user-attachments/assets/not-a-uuid'), false);
});

test('keeps existing raw GitHub and ccode proxy image compatibility', () => {
  const raw = 'https://raw.githubusercontent.com/example/gallery/main/image.png';
  const proxied = 'https://proxy.ccode.vip/https/raw.githubusercontent.com/example/gallery/main/image.png';

  assert.equal(isAllowedPromptImageUrl(raw), true);
  assert.equal(isAllowedPromptImageUrl(proxied), true);
  assert.equal(normalizePromptImageUrl(proxied), raw);
});

test('uses a safe response Content-Type extension for extensionless attachments offline', () => {
  const initial = getPromptImageCacheKey(ATTACHMENT_URL);
  const jpeg = getPromptImageCacheKey(ATTACHMENT_URL, 'image/jpeg; charset=binary');
  const webp = getPromptImageCacheKey(ATTACHMENT_URL, 'image/webp');
  const untrusted = getPromptImageCacheKey(ATTACHMENT_URL, 'application/x-webp-script');

  assert.equal(initial.hash, jpeg.hash);
  assert.equal(initial.hash, webp.hash);
  assert.match(initial.fileName, /\.png$/);
  assert.match(jpeg.fileName, /\.jpg$/);
  assert.match(webp.fileName, /\.webp$/);
  assert.match(untrusted.fileName, /\.png$/);
});
