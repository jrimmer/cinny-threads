import { useMemo } from 'react';
import { useClientConfig } from './useClientConfig';
import { usePathWithOrigin } from './usePathWithOrigin';

/**
 * Compute the redirectUrl passed to the homeserver's SSO/OIDC login flow.
 *
 * Normally this is the WebView-origin URL (usePathWithOrigin). But in a
 * Capacitor WebView the origin is `capacitor://localhost` (a custom scheme
 * iOS hands to any registered app — that's the "Open with <other app>?"
 * symptom). If the client config sets `ssoRedirectScheme` (Cytale does:
 * "cytale://callback"), we return exactly that scheme so the homeserver
 * redirects there and iOS routes it back to our app, where the deep link is
 * rewritten into the in-app login route (see the Cytale runtime).
 */
export function useSSORedirectUrl(path: string): string {
  const { ssoRedirectScheme } = useClientConfig();
  const webViewOriginUrl = usePathWithOrigin(path);

  return useMemo(() => {
    const scheme = ssoRedirectScheme?.trim();
    if (scheme && /^[a-z][a-z0-9+.-]*:\/\//i.test(scheme)) {
      return scheme;
    }
    // Fallback: current behaviour.
    return webViewOriginUrl;
  }, [ssoRedirectScheme, webViewOriginUrl]);
}
