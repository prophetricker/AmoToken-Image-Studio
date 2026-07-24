const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchImageProductPayload } = require('./image-product-proxy');

test('maps an image product network failure to a retryable gateway error', async () => {
  await assert.rejects(
    fetchImageProductPayload(
      async () => { throw new TypeError('fetch failed'); },
      '暂时无法读取生图模型',
    ),
    error => error.statusCode === 502 && error.code === 'IMAGE_PRODUCT_UPSTREAM_FAILED',
  );
});

test('maps an interrupted image product response body to a retryable gateway error', async () => {
  const response = new Response('{}', { status: 200 });
  response.json = async () => { throw new TypeError('terminated'); };

  await assert.rejects(
    fetchImageProductPayload(async () => response, '暂时无法读取生图模型'),
    error => error.statusCode === 502 && error.code === 'IMAGE_PRODUCT_UPSTREAM_FAILED',
  );
});

test('keeps malformed successful JSON blocked instead of treating it as a network fallback', async () => {
  const response = new Response('{', { status: 200 });

  assert.deepEqual(
    await fetchImageProductPayload(async () => response, '暂时无法读取生图模型'),
    { status: 200, data: { error: '暂时无法读取生图模型' } },
  );
});

test('preserves a valid image product response status and payload', async () => {
  const data = { object: 'list', data: [{ model: 'gpt-image-2' }] };
  const response = new Response(JSON.stringify(data), { status: 200 });

  assert.deepEqual(
    await fetchImageProductPayload(async () => response, '暂时无法读取生图模型'),
    { status: 200, data },
  );
});
