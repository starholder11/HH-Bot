import * as crypto from 'crypto';

/**
 * Validate GitHub webhook signature
 * @param payload - Raw request body
 * @param signature - GitHub signature header
 * @param secret - Webhook secret from environment
 * @returns boolean indicating if signature is valid
 */
export function validateGitHubWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    // GitHub sends signature as "sha256=hash"
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Webhook signature validation error:', error);
    return false;
  }
}

/**
 * Extract signature from GitHub webhook headers
 * @param headers - Request headers
 * @returns signature string or null
 */
export function extractGitHubSignature(headers: Headers): string | null {
  return headers.get('x-hub-signature-256') || headers.get('x-hub-signature') || null;
} 