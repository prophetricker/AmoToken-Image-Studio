const { createHash } = require('crypto');
const path = require('path');

const RAW_GITHUB_HOST = 'raw.githubusercontent.com';
const GITHUB_HOST = 'github.com';
const CCODE_PROXY_HOST = 'proxy.ccode.vip';
const CATBOX_HOST = 'files.catbox.moe';
const GITHUB_ASSET_HOST = 'github-production-user-asset-6210df.s3.amazonaws.com';
const ALLOWED_PROMPT_IMAGE_HOSTS = new Set([
  RAW_GITHUB_HOST,
  'i.ibb.co',
  CATBOX_HOST,
  'cdn.imgedify.com',
  'cms-assets.youmind.com',
]);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const GITHUB_ATTACHMENT_PATH = /^\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function hasExplicitPortInAuthority(value) {
  const schemeSeparator = value.indexOf('://');
  if (schemeSeparator < 0) return false;
  const authorityStart = schemeSeparator + 3;
  const authorityEndOffset = value.slice(authorityStart).search(/[/?#]/);
  const authorityEnd = authorityEndOffset < 0
    ? value.length
    : authorityStart + authorityEndOffset;
  const authority = value.slice(authorityStart, authorityEnd);
  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (hostAndPort.startsWith('[')) {
    const closingBracket = hostAndPort.indexOf(']');
    return closingBracket >= 0 && hostAndPort[closingBracket + 1] === ':';
  }
  return hostAndPort.includes(':');
}

function normalizePromptImageUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (!/^https:\/\//i.test(value)) return '';
  if (hasExplicitPortInAuthority(value)) return '';

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }

  if (parsed.protocol !== 'https:') return '';
  if (parsed.username || parsed.password || parsed.port) return '';
  parsed.hash = '';

  if (parsed.hostname === CCODE_PROXY_HOST) {
    const match = parsed.pathname.match(/^\/https\/raw\.githubusercontent\.com\/(.+)$/);
    if (!match) return '';
    return `https://${RAW_GITHUB_HOST}/${match[1]}${parsed.search}`;
  }

  if (parsed.hostname === RAW_GITHUB_HOST) {
    return parsed.toString();
  }

  return parsed.toString();
}

function isAllowedPromptImageUrl(rawUrl) {
  const normalized = normalizePromptImageUrl(rawUrl);
  if (!normalized) return false;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname === GITHUB_HOST) {
    return GITHUB_ATTACHMENT_PATH.test(parsed.pathname);
  }
  if (!ALLOWED_PROMPT_IMAGE_HOSTS.has(parsed.hostname)) return false;

  const ext = path.extname(parsed.pathname).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function getPromptImageFetchUrl(rawUrl) {
  const normalized = normalizePromptImageUrl(rawUrl);
  if (!normalized || !isAllowedPromptImageUrl(normalized)) return '';

  const parsed = new URL(normalized);
  if (parsed.hostname !== CATBOX_HOST) return normalized;
  return `https://${CCODE_PROXY_HOST}/https/${CATBOX_HOST}${parsed.pathname}${parsed.search}`;
}

function resolvePromptImageRedirectUrl(rawInitialUrl, rawLocation) {
  const initialUrl = normalizePromptImageUrl(rawInitialUrl);
  if (!initialUrl || !isAllowedPromptImageUrl(initialUrl)) return '';

  const initial = new URL(initialUrl);
  const attachmentMatch = initial.hostname === GITHUB_HOST
    ? initial.pathname.match(GITHUB_ATTACHMENT_PATH)
    : null;
  if (!attachmentMatch) return '';

  const location = String(rawLocation || '').trim();
  if (!/^https:\/\//i.test(location) || hasExplicitPortInAuthority(location)) return '';

  let redirect;
  try {
    redirect = new URL(location);
  } catch {
    return '';
  }
  if (
    redirect.protocol !== 'https:'
    || redirect.hostname !== GITHUB_ASSET_HOST
    || redirect.username
    || redirect.password
    || redirect.port
  ) return '';

  const attachmentId = initial.pathname.slice(initial.pathname.lastIndexOf('/') + 1);
  const escapedId = attachmentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assetPath = new RegExp(`^/\\d+/\\d+-${escapedId}\\.(?:png|jpe?g|webp|gif)$`, 'i');
  return assetPath.test(redirect.pathname) ? redirect.toString() : '';
}

async function cancelResponseBody(response) {
  try {
    if (response?.body) await response.body.cancel();
  } catch {
    // The body may already be consumed, errored, or locked by a reader.
  }
}

async function fetchPromptImageResponse(rawUrl, { fetchImpl = fetch, signal, headers } = {}) {
  const fetchUrl = getPromptImageFetchUrl(rawUrl);
  if (!fetchUrl) throw new Error('Prompt image URL rejected');

  let response = await fetchImpl(fetchUrl, {
    signal,
    redirect: 'manual',
    headers,
  });
  if (!REDIRECT_STATUSES.has(response.status)) return response;

  const redirectUrl = resolvePromptImageRedirectUrl(rawUrl, response.headers?.get('location'));
  await cancelResponseBody(response);
  if (!redirectUrl) throw new Error('Prompt image redirect rejected');

  response = await fetchImpl(redirectUrl, {
    signal,
    redirect: 'manual',
    headers,
  });
  if (REDIRECT_STATUSES.has(response.status)) {
    await cancelResponseBody(response);
    throw new Error('Prompt image redirect rejected');
  }
  return response;
}

async function openPromptImageResponse(rawUrl, {
  fetchImpl = fetch,
  timeoutMs = 20000,
  headers,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 1));
  try {
    const response = await fetchPromptImageResponse(rawUrl, {
      fetchImpl,
      signal: controller.signal,
      headers,
    });
    let closed = false;
    return {
      response,
      async close() {
        if (closed) return;
        closed = true;
        clearTimeout(timeout);
        await cancelResponseBody(response);
      },
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function readPromptImageBody(response, maxBytes) {
  const reader = response?.body?.getReader?.();
  if (!reader) throw new Error('Prompt image response body is unavailable');

  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) throw new Error('Prompt image is too large');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

function extensionFromUrlOrContentType(url, contentType = '') {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch {
    // Fall through to content-type.
  }
  const mimeType = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
    case 'image/pjpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.png';
  }
}

function getPromptImageCacheKey(rawUrl, contentType = '') {
  const normalizedUrl = normalizePromptImageUrl(rawUrl);
  const hash = createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 40);
  const ext = extensionFromUrlOrContentType(normalizedUrl, contentType);
  return {
    normalizedUrl,
    hash,
    fileName: `${hash}${ext}`,
  };
}

module.exports = {
  fetchPromptImageResponse,
  getPromptImageFetchUrl,
  getPromptImageCacheKey,
  isAllowedPromptImageUrl,
  normalizePromptImageUrl,
  openPromptImageResponse,
  readPromptImageBody,
  resolvePromptImageRedirectUrl,
};
