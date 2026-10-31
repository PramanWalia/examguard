export const getApiError = (error) => {
  if (error?.response?.data?.error) return error.response.data.error;
  if (error?.code === 'ERR_NETWORK') {
    return {
      code: 'NETWORK_ERROR',
      message: 'You appear to be offline. Check your connection and try again.',
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'Something went wrong. Please try again.',
  };
};

export const getFieldErrors = (error) => {
  const details = getApiError(error).details;
  if (!Array.isArray(details)) return {};
  return details.reduce((accumulator, detail) => {
    if (detail?.path) accumulator[detail.path] = detail.message;
    return accumulator;
  }, {});
};

export const isExpiredError = (error) => getApiError(error).code === 'ATTEMPT_EXPIRED';

export const isResultUnavailable = (error) => getApiError(error).code === 'RESULT_NOT_AVAILABLE';
