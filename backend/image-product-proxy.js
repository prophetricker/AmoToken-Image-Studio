function createImageProductProxyError(cause) {
  const error = new Error('生图服务暂时不可用，请稍后重试');
  error.statusCode = 502;
  error.code = 'IMAGE_PRODUCT_UPSTREAM_FAILED';
  error.cause = cause;
  return error;
}

async function fetchImageProductPayload(fetchResponse, fallbackMessage) {
  let response;
  try {
    response = await fetchResponse();
  } catch (error) {
    throw createImageProductProxyError(error);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw createImageProductProxyError(error);
    }
  }

  return {
    status: response.status,
    data: data || { error: fallbackMessage },
  };
}

module.exports = { fetchImageProductPayload };
