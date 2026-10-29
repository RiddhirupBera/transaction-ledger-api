export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Unable to reach Transaction Ledger API. Check your connection and try again.');
  }
  let payload;
  try { payload = await response.json(); } catch {
    throw new Error('The server returned an unexpected response. Check that the API is running.');
  }
  if (!response.ok) {
    const details = payload.error?.details?.map(({ path, message }) => `${path || 'Request'}: ${message}`).join(' ');
    const error = new Error(details || payload.error?.message || `Request failed (${response.status}).`);
    error.code = payload.error?.code;
    throw error;
  }
  return payload;
}

export function money(value) {
  const [whole, fraction] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
