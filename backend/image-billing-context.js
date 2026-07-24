const LEGACY_1K_SIZES = new Set([
  '1024x1024',
  '1536x1024',
  '1024x1536',
]);

function createBillingError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getReferenceImageCount(task) {
  return Array.isArray(task?.images) ? task.images.length : 0;
}

function getOperationMode(task) {
  return task?.mode === 'text-to-image' ? 'generation' : 'edit';
}

function buildImageQuoteRequest(task) {
  return {
    model: String(task?.model || '').trim(),
    mode: getOperationMode(task),
    size: String(task?.customSize || '').trim(),
    quality: String(task?.gptImageQuality || '').trim(),
    count: Number(task?.parallelCount),
    reference_image_count: getReferenceImageCount(task),
  };
}

function isLegacyQuoteFreeImageRequest(task) {
  const referenceImageCount = getReferenceImageCount(task);
  const referencesMatchMode = task?.mode === 'text-to-image'
    ? referenceImageCount === 0
    : task?.mode === 'image-to-image' && referenceImageCount === 1;

  return task?.protocol === 'openai'
    && task?.model === 'gpt-image-2'
    && task?.outputSize === '1K'
    && LEGACY_1K_SIZES.has(task?.customSize)
    && task?.gptImageQuality === 'auto'
    && task?.parallelCount === 1
    && referencesMatchMode;
}

function normalizeAuthoritativeQuote(payload) {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.data
    : null;
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.available !== true) {
    throw createBillingError(400, 'IMAGE_QUOTE_INVALID', '生图报价无效，请重新选择规格');
  }

  const quote = {
    catalogVersion: String(data.catalog_version || '').trim(),
    model: String(data.model || '').trim(),
    displayName: String(data.display_name || '').trim(),
    mode: String(data.mode || '').trim(),
    resolutionTier: String(data.resolution || '').trim(),
    size: String(data.size || '').trim(),
    quality: String(data.quality || '').trim(),
    count: Number(data.count),
    referenceImageCount: Number(data.reference_image_count),
    unitPrice: Number(data.unit_price),
    totalPrice: Number(data.total_price),
    currency: String(data.currency || '').trim(),
    available: true,
  };
  const valid = quote.catalogVersion
    && quote.model
    && quote.displayName
    && (quote.mode === 'generation' || quote.mode === 'edit')
    && quote.resolutionTier
    && quote.size
    && quote.quality
    && Number.isInteger(quote.count)
    && quote.count > 0
    && Number.isInteger(quote.referenceImageCount)
    && quote.referenceImageCount >= 0
    && Number.isFinite(quote.unitPrice)
    && quote.unitPrice >= 0
    && Number.isFinite(quote.totalPrice)
    && quote.totalPrice >= 0
    && quote.currency === 'API_CREDIT';
  if (!valid) {
    throw createBillingError(400, 'IMAGE_QUOTE_INVALID', '生图报价格式无效，请重试');
  }
  return quote;
}

function quoteMatchesTask(quote, task) {
  const request = buildImageQuoteRequest(task);
  return quote.model === request.model
    && quote.mode === request.mode
    && quote.resolutionTier === task.outputSize
    && quote.size === request.size
    && quote.quality === request.quality
    && quote.count === request.count
    && quote.referenceImageCount === request.reference_image_count;
}

async function authorizeImageTaskBilling(task, fetchAuthoritativeQuote) {
  if (task?.protocol !== 'openai') return task?.imageQuote;

  if (!task?.imageQuote) {
    if (isLegacyQuoteFreeImageRequest(task)) return undefined;
    throw createBillingError(
      400,
      'IMAGE_BILLING_CONTEXT_REQUIRED',
      '当前生图规格需要重新获取报价',
    );
  }
  if (typeof fetchAuthoritativeQuote !== 'function') {
    throw createBillingError(502, 'IMAGE_QUOTE_UNAVAILABLE', '暂时无法核对生图报价，请稍后重试');
  }

  let quotePayload;
  try {
    quotePayload = await fetchAuthoritativeQuote(
      String(task.apiKey || '').trim(),
      buildImageQuoteRequest(task),
    );
  } catch (error) {
    if (error && typeof error.statusCode === 'number' && typeof error.code === 'string') {
      throw error;
    }
    throw createBillingError(
      502,
      'IMAGE_QUOTE_UNAVAILABLE',
      '暂时无法核对生图报价，请稍后重试',
    );
  }
  const quote = normalizeAuthoritativeQuote(quotePayload);
  if (!quoteMatchesTask(quote, task)) {
    throw createBillingError(400, 'IMAGE_QUOTE_MISMATCH', '生图规格已变更，请重新获取报价');
  }
  return quote;
}

module.exports = {
  authorizeImageTaskBilling,
  buildImageQuoteRequest,
  isLegacyQuoteFreeImageRequest,
};
