/**
 * Cytale SSO launch bridge.
 *
 * Tries, in order:
 *  1. Native `CytaleSSO` (ASWebAuthenticationSession) — preferred. Returns the
 *     final `cytale://callback?...loginToken` URL directly and hands it through
 *     the same `buildLoginUrl` rewrite used by the `appUrlOpen` deep-link path,
 *     so Cinny TokenLogin completes fully in-app. no OS-level deep-link
 *     re-delivery race, no "Open in Cytale?" prompt.
 *  2. `@capacitor/browser` (SFSafariViewController in-app sheet) — previous
 *     fallback; callback still arrives via `appUrlOpen` (less reliable).
 *  3. Plain top-level navigation (`window.location.href`) when no native bridge
 *     exists (plain web / tooling-hot path).
 *
 * Accessing the Capacitor plugins mirrors how the SSO deep-link runtime does it
 * (global `Capacitor.Plugins.*`) so this file has no native/module dependency.
 */

import { buildLoginUrl } from './sso-deeplink';
import { startCytaleNativeSSO, hasCytaleNativeSSO } from './cytale-sso';

type BrowserPluginLike = {
  open?: (opts: { url: string }) => Promise<unknown>;
  close?: () => Promise<unknown>;
};

function getBrowserPlugin(): BrowserPluginLike | null {
  try {
    const capacitor = (globalThis as Record<string, unknown>).Capacitor as
      | { Plugins?: Record<string, unknown> }
      | undefined;
    const plugins = capacitor?.Plugins ?? {};
    const browser = (plugins as Record<string, unknown>).Browser;
    return (browser as BrowserPluginLike | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Whether a preferable SSO bridge (native-first, then Browser) is available. */
export function hasSystemBrowser(): boolean {
  return hasCytaleNativeSSO() || getBrowserPlugin()?.open != null;
}

/** After a callback URL is produced, route it into Cinny's login route. */
function routeLoginToken(callbackUrl: string): void {
  const target = buildLoginUrl(callbackUrl);
  if (target && typeof window !== 'undefined') {
    window.location.replace(target);
  }
}

/**
 * Open an SSO login URL for the user.
 *
 * Prefers the native ASWebAuthenticationSession bridge: it awaits the user's
 * completion and routes the returned callback directly through TokenLogin. When
 * the native bridge is absent it falls back to @capacitor/browser, and finally
 * to a normal top-level navigation.
 */
export async function openSSOInSystemBrowser(url: string): Promise<void> {
  // 1) Native ASWebAuthenticationSession path (returns the callback URL).
  if (hasCytaleNativeSSO()) {
    const callbackUrl = await startCytaleNativeSSO(url);
    if (callbackUrl) {
      routeLoginToken(callbackUrl);
      return;
    }
    // Cancelled/error: stay on the login page rather than navigating away.
    return;
  }

  // 2) @capacitor/browser in-app SFSafariViewController (callback via appUrlOpen).
  const browser = getBrowserPlugin();
  if (browser?.open) {
    try {
      await browser.open({ url });
      return;
    } catch {
      // Fall through to a regular navigation if the plugin call throws.
    }
  }

  // 3) Plain web: let the link navigate normally.
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}

/**
 * Request the system browser be closed. Called when the `appUrlOpen` callback
 * fires (the homeserver redirected to cytale://callback and the OS brought our
 * app forward), so a browser sheet dismisses. No-op for the native
 * ASWebAuthenticationSession path (it auto-dismisses on callback).
 */
export function closeSystemBrowser(): void {
  const browser = getBrowserPlugin();
  if (browser?.close) {
    browser.close().catch(() => {
      // Ignore: the browser may already be gone or the bridge unavailable.
    });
  }
}
