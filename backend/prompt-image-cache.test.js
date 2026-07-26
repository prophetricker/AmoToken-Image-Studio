const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchPromptImageResponse,
  getPromptImageFetchUrl,
  getPromptImageCacheKey,
  isAllowedPromptImageUrl,
  normalizePromptImageUrl,
  openPromptImageResponse,
  readPromptImageBody,
  resolvePromptImageRedirectUrl,
} = require('./prompt-image-cache');

const ATTACHMENT_URL = 'https://github.com/user-attachments/assets/3a056a8d-904e-4b3e-b0d2-b5122758b7f5';
const TRUSTED_EXTERNAL_IMAGES = [
  'https://i.ibb.co/example/gallery.jpg',
  'https://files.catbox.moe/example.png',
  'https://cdn.imgedify.com/imgedify/images/example.jpeg',
  'https://cms-assets.youmind.com/media/example.webp',
];

test('allows only UUID-shaped GitHub user attachments on the exact GitHub host', () => {
  assert.equal(isAllowedPromptImageUrl(ATTACHMENT_URL), true);
  assert.equal(isAllowedPromptImageUrl('https://github.com/org/repo/issues/1'), false);
  assert.equal(isAllowedPromptImageUrl('https://evil.example/user-attachments/assets/abc'), false);
  assert.equal(isAllowedPromptImageUrl('https://github.com/user-attachments/assets/not-a-uuid'), false);
});

test('keeps existing raw GitHub and ccode proxy image compatibility', () => {
  const raw = 'https://raw.githubusercontent.com/example/gallery/main/image.png';
  const proxied = 'https://proxy.ccode.vip/https/raw.githubusercontent.com/example/gallery/main/image.png';
  const uppercaseProxy = 'HTTPS://proxy.ccode.vip/https/raw.githubusercontent.com/example/gallery/main/image.png';

  assert.equal(isAllowedPromptImageUrl(raw), true);
  assert.equal(isAllowedPromptImageUrl(proxied), true);
  assert.equal(isAllowedPromptImageUrl('HTTPS://i.ibb.co/example/image.jpg'), true);
  assert.equal(normalizePromptImageUrl(proxied), raw);
  assert.equal(normalizePromptImageUrl(uppercaseProxy), raw);
});

test('routes exact Catbox images through the trusted server-side proxy', () => {
  const catbox = 'https://files.catbox.moe/example.png';

  assert.equal(
    getPromptImageFetchUrl(catbox),
    'https://proxy.ccode.vip/https/files.catbox.moe/example.png',
  );
  assert.equal(
    getPromptImageFetchUrl('https://i.ibb.co/example/gallery.jpg'),
    'https://i.ibb.co/example/gallery.jpg',
  );
  assert.equal(getPromptImageFetchUrl(ATTACHMENT_URL), ATTACHMENT_URL);
});

test('drops URL fragments before fetch and cache identity are calculated', () => {
  const catbox = 'https://files.catbox.moe/example.png';
  const raw = 'https://raw.githubusercontent.com/example/gallery/main/image.png';

  assert.equal(normalizePromptImageUrl(`${catbox}#one`), catbox);
  assert.equal(getPromptImageFetchUrl(`${catbox}#two`), getPromptImageFetchUrl(catbox));
  assert.equal(getPromptImageCacheKey(`${raw}#one`).hash, getPromptImageCacheKey(`${raw}#two`).hash);
});

test('allows only a matching GitHub attachment redirect to the fixed asset host', () => {
  const allowedRedirect = 'https://github-production-user-asset-6210df.s3.amazonaws.com/123/456-3a056a8d-904e-4b3e-b0d2-b5122758b7f5.png?X-Amz-Signature=demo';

  assert.equal(resolvePromptImageRedirectUrl(ATTACHMENT_URL, allowedRedirect), allowedRedirect);
  assert.equal(
    resolvePromptImageRedirectUrl(
      ATTACHMENT_URL,
      'https://github-production-user-asset-6210df.s3.amazonaws.com/123/456-aaaaaaaa-904e-4b3e-b0d2-b5122758b7f5.png',
    ),
    '',
  );
  assert.equal(
    resolvePromptImageRedirectUrl(ATTACHMENT_URL, 'https://evil.example/123/456-3a056a8d-904e-4b3e-b0d2-b5122758b7f5.png'),
    '',
  );
  assert.equal(
    resolvePromptImageRedirectUrl(
      'https://raw.githubusercontent.com/example/gallery/main/image.png',
      allowedRedirect,
    ),
    '',
  );
  assert.equal(
    resolvePromptImageRedirectUrl(
      ATTACHMENT_URL,
      'https://github-production-user-asset-6210df.s3.amazonaws.com:443/123/456-3a056a8d-904e-4b3e-b0d2-b5122758b7f5.png',
    ),
    '',
  );
});

test('fetches Catbox through the trusted proxy without following redirects implicitly', async () => {
  const calls = [];
  const expected = { status: 200 };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return expected;
  };

  const response = await fetchPromptImageResponse(
    'https://files.catbox.moe/example.png',
    { fetchImpl, signal: 'signal', headers: { Accept: 'image/*' } },
  );

  assert.equal(response, expected);
  assert.deepEqual(calls, [{
    url: 'https://proxy.ccode.vip/https/files.catbox.moe/example.png',
    options: { signal: 'signal', redirect: 'manual', headers: { Accept: 'image/*' } },
  }]);
});

test('follows exactly one validated GitHub attachment redirect', async () => {
  const redirectUrl = 'https://github-production-user-asset-6210df.s3.amazonaws.com/123/456-3a056a8d-904e-4b3e-b0d2-b5122758b7f5.png';
  const calls = [];
  let firstBodyCancelled = false;
  const finalResponse = { status: 200 };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return {
        status: 302,
        headers: new Headers({ location: redirectUrl }),
        body: { async cancel() { firstBodyCancelled = true; } },
      };
    }
    return finalResponse;
  };

  const response = await fetchPromptImageResponse(ATTACHMENT_URL, { fetchImpl });

  assert.equal(response, finalResponse);
  assert.equal(firstBodyCancelled, true);
  assert.deepEqual(calls.map(({ url, options }) => ({ url, redirect: options.redirect })), [
    { url: ATTACHMENT_URL, redirect: 'manual' },
    { url: redirectUrl, redirect: 'manual' },
  ]);
});

test('rejects an untrusted first redirect and every second redirect', async () => {
  let rejectedBodyCancelled = false;
  const untrustedFetch = async () => ({
    status: 302,
    headers: new Headers({ location: 'https://evil.example/image.png' }),
    body: { async cancel() { rejectedBodyCancelled = true; } },
  });
  await assert.rejects(
    fetchPromptImageResponse(ATTACHMENT_URL, { fetchImpl: untrustedFetch }),
    /redirect rejected/,
  );
  assert.equal(rejectedBodyCancelled, true);

  let callCount = 0;
  let secondBodyCancelled = false;
  const redirectingFetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        status: 302,
        headers: new Headers({
          location: 'https://github-production-user-asset-6210df.s3.amazonaws.com/123/456-3a056a8d-904e-4b3e-b0d2-b5122758b7f5.png',
        }),
        body: { async cancel() {} },
      };
    }
    return {
      status: 307,
      headers: new Headers({ location: 'https://evil.example/again.png' }),
      body: { async cancel() { secondBodyCancelled = true; } },
    };
  };
  await assert.rejects(
    fetchPromptImageResponse(ATTACHMENT_URL, { fetchImpl: redirectingFetch }),
    /redirect rejected/,
  );
  assert.equal(callCount, 2);
  assert.equal(secondBodyCancelled, true);
});

test('stops streaming as soon as a prompt image exceeds the byte limit', async () => {
  let cancelled = false;
  let reads = 0;
  const response = {
    body: {
      getReader() {
        return {
          async read() {
            reads += 1;
            if (reads <= 2) return { done: false, value: Uint8Array.from([1, 2, 3, 4]) };
            return { done: true };
          },
          async cancel() { cancelled = true; },
          releaseLock() {},
        };
      },
    },
  };

  await assert.rejects(readPromptImageBody(response, 6), /too large/i);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});

test('keeps the fetch timeout active while the response body is streaming', async () => {
  const fetchImpl = async (_url, { signal }) => ({
    status: 200,
    body: new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => {
          controller.error(new DOMException('Timed out', 'AbortError'));
        }, { once: true });
      },
    }),
  });
  const session = await openPromptImageResponse(
    'https://i.ibb.co/example/gallery.jpg',
    { fetchImpl, timeoutMs: 10 },
  );

  try {
    await assert.rejects(
      readPromptImageBody(session.response, 1024),
      error => error?.name === 'AbortError',
    );
  } finally {
    await session.close();
  }
});

test('rejects non-canonical HTTPS spellings tolerated by WHATWG URL parsing', () => {
  const nonCanonicalUrls = [
    'https:i.ibb.co:443/a.jpg',
    'https:i.ibb.co/a.jpg',
    String.raw`https:\\i.ibb.co:443\a.jpg`,
    String.raw`https:\\i.ibb.co\a.jpg`,
    'https:proxy.ccode.vip:443/https/raw.githubusercontent.com/o/r/main/a.png',
    'https:proxy.ccode.vip/https/raw.githubusercontent.com/o/r/main/a.png',
  ];

  for (const url of nonCanonicalUrls) {
    assert.equal(normalizePromptImageUrl(url), '', url);
    assert.equal(isAllowedPromptImageUrl(url), false, url);
  }
});

test('rejects an HTTP ccode proxy URL before it can be rewritten as HTTPS', () => {
  const insecureProxy = 'http://proxy.ccode.vip/https/raw.githubusercontent.com/example/gallery/main/image.png';

  assert.equal(normalizePromptImageUrl(insecureProxy), '');
  assert.equal(isAllowedPromptImageUrl(insecureProxy), false);
});

test('allows supported images on the exact trusted external hosts over HTTPS', () => {
  for (const url of TRUSTED_EXTERNAL_IMAGES) {
    assert.equal(isAllowedPromptImageUrl(url), true, url);
  }
});

test('rejects unsafe variants and untrusted external image hosts', () => {
  for (const trustedUrl of TRUSTED_EXTERNAL_IMAGES) {
    const url = new URL(trustedUrl);
    const pathAndSearch = `${url.pathname}${url.search}`;
    assert.equal(isAllowedPromptImageUrl(`http://${url.hostname}${pathAndSearch}`), false);
    assert.equal(isAllowedPromptImageUrl(`https://user:pass@${url.hostname}${pathAndSearch}`), false);
    assert.equal(isAllowedPromptImageUrl(`https://${url.hostname}:444${pathAndSearch}`), false);
    assert.equal(isAllowedPromptImageUrl(`https://${url.hostname}/image.svg`), false);
    assert.equal(isAllowedPromptImageUrl(`https://${url.hostname}/image`), false);
  }

  const untrustedUrls = [
    'https://evil-i.ibb.co/example.jpg',
    'https://i.ibb.co.evil.example/example.jpg',
    'https://img.shields.io/badge/example-blue.png',
    'https://x.com/example/image.jpg',
    'https://youmind.com/example/image.jpg',
    'https://assets.youmind.com/example/image.jpg',
    'https://other.example/image.jpg',
  ];
  for (const url of untrustedUrls) {
    assert.equal(isAllowedPromptImageUrl(url), false, url);
  }
});

test('rejects credentials and every explicit port for each allowed image URL shape', () => {
  const unsafeUrls = [
    'https://user:pass@github.com/user-attachments/assets/3a056a8d-904e-4b3e-b0d2-b5122758b7f5',
    'https://github.com:444/user-attachments/assets/3a056a8d-904e-4b3e-b0d2-b5122758b7f5',
    'https://github.com:443/user-attachments/assets/3a056a8d-904e-4b3e-b0d2-b5122758b7f5',
    'https://user:pass@raw.githubusercontent.com/example/gallery/main/image.png',
    'https://raw.githubusercontent.com:444/example/gallery/main/image.png',
    'https://raw.githubusercontent.com:443/example/gallery/main/image.png',
    'https://user:pass@proxy.ccode.vip/https/raw.githubusercontent.com/example/gallery/main/image.png',
    'https://proxy.ccode.vip:444/https/raw.githubusercontent.com/example/gallery/main/image.png',
    'https://proxy.ccode.vip:443/https/raw.githubusercontent.com/example/gallery/main/image.png',
    ...TRUSTED_EXTERNAL_IMAGES.flatMap((trustedUrl) => {
      const url = new URL(trustedUrl);
      return [
        `https://user:pass@${url.hostname}${url.pathname}`,
        `https://${url.hostname}:444${url.pathname}`,
        `https://${url.hostname}:443${url.pathname}`,
      ];
    }),
  ];

  for (const url of unsafeUrls) {
    assert.equal(normalizePromptImageUrl(url), '', url);
    assert.equal(isAllowedPromptImageUrl(url), false, url);
  }
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
