const test = require('node:test');
const assert = require('node:assert/strict');

const {
  authorizeImageTaskBilling,
  buildImageQuoteRequest,
  isLegacyQuoteFreeImageRequest,
} = require('./image-billing-context');

function createTask(overrides = {}) {
  return {
    apiKey: 'sk-test',
    protocol: 'openai',
    mode: 'text-to-image',
    model: 'gpt-image-2',
    outputSize: '1K',
    customSize: '1024x1024',
    gptImageQuality: 'auto',
    parallelCount: 1,
    images: [],
    ...overrides,
  };
}

function createQuotePayload(overrides = {}) {
  return {
    data: {
      available: true,
      catalog_version: 'image-v12',
      model: 'gpt-image-2',
      display_name: 'AmoToken GPT Image 2',
      mode: 'generation',
      resolution: '1K',
      size: '1024x1024',
      quality: 'auto',
      count: 1,
      reference_image_count: 0,
      unit_price: 0.08,
      total_price: 0.08,
      currency: 'API_CREDIT',
      ...overrides,
    },
  };
}

test('allows only the strict legacy 1K contract without a quote', () => {
  assert.equal(isLegacyQuoteFreeImageRequest(createTask()), true);
  assert.equal(isLegacyQuoteFreeImageRequest(createTask({
    mode: 'image-to-image',
    images: [{ data: 'AAAA', mimeType: 'image/png' }],
  })), true);

  for (const task of [
    createTask({ model: 'another-model' }),
    createTask({ outputSize: '2K', customSize: '2048x2048' }),
    createTask({ customSize: '2048x2048' }),
    createTask({ gptImageQuality: 'high' }),
    createTask({ parallelCount: 2 }),
    createTask({ images: [{ data: 'AAAA', mimeType: 'image/png' }] }),
    createTask({
      mode: 'image-to-image',
      images: [
        { data: 'AAAA', mimeType: 'image/png' },
        { data: 'BBBB', mimeType: 'image/png' },
      ],
    }),
  ]) {
    assert.equal(isLegacyQuoteFreeImageRequest(task), false);
  }
});

test('builds the upstream quote request from task fields rather than the client quote', () => {
  assert.deepEqual(buildImageQuoteRequest(createTask({
    mode: 'image-to-image',
    images: [{ data: 'AAAA', mimeType: 'image/png' }],
    imageQuote: { totalPrice: 0 },
  })), {
    model: 'gpt-image-2',
    mode: 'edit',
    size: '1024x1024',
    quality: 'auto',
    count: 1,
    reference_image_count: 1,
  });
});

test('rejects an out-of-contract task that has no quote', async () => {
  await assert.rejects(
    authorizeImageTaskBilling(createTask({ outputSize: '2K', customSize: '2048x2048' })),
    error => error.code === 'IMAGE_BILLING_CONTEXT_REQUIRED' && error.statusCode === 400,
  );
});

test('leaves non-OpenAI image tasks outside the AmoToken billing contract', async () => {
  let quoteCalls = 0;
  const originalQuote = { provider: 'google', totalPrice: 0.03 };
  const quote = await authorizeImageTaskBilling(
    createTask({
      protocol: 'google',
      model: 'gemini-3-pro-image-preview',
      outputSize: '2K',
      customSize: undefined,
      gptImageQuality: undefined,
      imageQuote: originalQuote,
    }),
    async () => { quoteCalls += 1; },
  );

  assert.equal(quote, originalQuote);
  assert.equal(quoteCalls, 0);
});

test('re-queries and stores the server quote instead of trusting client pricing', async () => {
  const task = createTask({ imageQuote: { totalPrice: 0.000001, model: 'forged-model' } });
  let receivedApiKey = '';
  let receivedRequest = null;

  const quote = await authorizeImageTaskBilling(task, async (apiKey, request) => {
    receivedApiKey = apiKey;
    receivedRequest = request;
    return createQuotePayload();
  });

  assert.equal(receivedApiKey, 'sk-test');
  assert.deepEqual(receivedRequest, buildImageQuoteRequest(task));
  assert.equal(quote.totalPrice, 0.08);
  assert.equal(quote.model, 'gpt-image-2');
  assert.equal(quote.catalogVersion, 'image-v12');
  assert.equal(Object.hasOwn(quote, 'apiKey'), false);
});

test('rejects an upstream quote whose billed specification differs from the task', async () => {
  await assert.rejects(
    authorizeImageTaskBilling(
      createTask({ imageQuote: { totalPrice: 0.08 } }),
      async () => createQuotePayload({ size: '1536x1024' }),
    ),
    error => error.code === 'IMAGE_QUOTE_MISMATCH' && error.statusCode === 400,
  );
});

test('rejects unavailable or malformed upstream quotes', async () => {
  await assert.rejects(
    authorizeImageTaskBilling(
      createTask({ imageQuote: { totalPrice: 0.08 } }),
      async () => ({ data: { available: false } }),
    ),
    error => error.code === 'IMAGE_QUOTE_INVALID' && error.statusCode === 400,
  );
});

test('classifies a quote service network failure as temporarily unavailable', async () => {
  await assert.rejects(
    authorizeImageTaskBilling(
      createTask({ imageQuote: { totalPrice: 0.08 } }),
      async () => { throw new TypeError('fetch failed'); },
    ),
    error => error.code === 'IMAGE_QUOTE_UNAVAILABLE' && error.statusCode === 502,
  );
});
