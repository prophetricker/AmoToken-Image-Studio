const { createHash } = require('crypto');
const path = require('path');

const RAW_GITHUB_HOST = 'raw.githubusercontent.com';
const GITHUB_HOST = 'github.com';
const CCODE_PROXY_HOST = 'proxy.ccode.vip';
const ALLOWED_PROMPT_IMAGE_HOSTS = new Set([RAW_GITHUB_HOST]);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const GITHUB_ATTACHMENT_PATH = /^\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePromptImageUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
  if (parsed.username || parsed.password || parsed.port) return '';

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
  getPromptImageCacheKey,
  isAllowedPromptImageUrl,
  normalizePromptImageUrl,
};
