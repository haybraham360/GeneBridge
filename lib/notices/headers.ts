/**
 * Privacy headers for the public family notice pages (task 08 section 5).
 * Used by the proxy, so no server-only imports.
 */

/** A strict CSP: our own origin only, scripts only with this request's nonce. */
export function noticeCsp(nonce: string, { dev = false } = {}): string {
  return [
    "default-src 'self'",
    // React needs eval in development only (stack traces, fast refresh).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // style attributes (e.g. widths) are inline; no external stylesheets.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; ');
}

export const noticeHeaders: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()',
};

/** A random nonce for one response. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
