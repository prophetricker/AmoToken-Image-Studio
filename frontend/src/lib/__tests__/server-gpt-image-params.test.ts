import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverSource = fs.readFileSync(
  path.resolve(testDir, '../../../../backend/server.js'),
  'utf8',
);

describe('backend GPT Image advanced params forwarding', () => {
  it('does not contain legacy GPT Image SKU gating or token suffix logic', () => {
    expect(serverSource).not.toContain('gpt-image-2-fast');
    expect(serverSource).not.toContain('gpt-image-2-plus');
    expect(serverSource).not.toContain('gpt-image-2-pro');
    expect(serverSource).not.toContain('TOKEN_SUFFIX');
    expect(serverSource).not.toContain('supportsGptImageAdvancedParams(');
  });

  it('forwards quality/background/output_format and conditional style in multipart edits', () => {
    expect(serverSource).toContain("formData.append('quality', advancedParams.quality)");
    expect(serverSource).toContain("formData.append('background', advancedParams.background)");
    expect(serverSource).toContain("formData.append('output_format', 'png')");
    expect(serverSource).toContain("formData.append('style', advancedParams.style)");
  });

  it('forwards quality/background/output_format and conditional style in JSON generations', () => {
    expect(serverSource).toContain('quality: advancedParams.quality');
    expect(serverSource).toContain('background: advancedParams.background');
    expect(serverSource).toContain("output_format: 'png'");
    expect(serverSource).toContain("advancedParams.style === 'vivid' || advancedParams.style === 'natural' ? { style: advancedParams.style } : {}");
  });

  it('routes OpenAI image endpoint by mode rather than legacy model names', () => {
    expect(serverSource).toContain("request.mode === 'image-to-image'");
    expect(serverSource).toContain("/v1/images/edits");
    expect(serverSource).toContain("/v1/images/generations");
  });

  it('resolves and forwards size for OpenAI image requests', () => {
    expect(serverSource).toContain('function resolveGptImageRequestSize(request)');
    expect(serverSource).toContain('const customSize = normalizeCustomImageSize(request.customSize, 4096)');
    expect(serverSource).toContain('return getSupportedGptImageSize(request.model, request.outputSize, request.aspectRatio)');
    expect(serverSource).toContain('return requestGptImage(apiKey, request, resolveGptImageRequestSize(request), { baseUrl });');
  });
});

describe('AmoToken forced base URL guard', () => {
  it('defines NOVA_FORCE_BASE_URL support and a resolver for OpenAI-compatible requests', () => {
    expect(serverSource).toContain('NOVA_FORCE_BASE_URL');
    expect(serverSource).toContain('function resolveForcedOpenAiBaseUrl()');
    expect(serverSource).toContain('function resolveOpenAiCompatibleBaseUrl');
  });

  it('stores the effective task base URL instead of trusting client baseUrl', () => {
    expect(serverSource).toContain('const effectiveBaseUrl = resolveOpenAiCompatibleBaseUrl(body.protocol, body.baseUrl);');
    expect(serverSource).toContain('baseUrl: effectiveBaseUrl,');
  });

  it('uses the forced OpenAI-compatible base URL for text proxy and model proxy', () => {
    expect(serverSource).toContain('const normalizedBaseUrl = resolveOpenAiCompatibleBaseUrl(protocol, baseUrl);');
    expect(serverSource).toContain('const modelsBaseUrl = resolveOpenAiCompatibleBaseUrl(protocol, baseUrl);');
  });
});
