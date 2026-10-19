/**
 * Shared API-key-required error detection for generate/tool clients.
 *
 * The backend signals a missing user API key (BYOK mode) in three shapes:
 * - plain code: 'user_api_key_required'
 * - raw JSON string: '{"error":"user_api_key_required",...}'
 * - SSE event: 'data: {"type":"error","error":"user_api_key_required",...}'
 *
 * Returns true when the given error message matches any of them.
 */
export function isApiKeyError(message: unknown): boolean {
  if (message === 'user_api_key_required') return true;
  if (typeof message !== 'string') return false;
  try {
    let text = message.trim();
    if (text.startsWith('data:')) text = text.slice(5).trim();
    const parsed = JSON.parse(text);
    return parsed?.error === 'user_api_key_required';
  } catch {
    return false;
  }
}
