/**
 * Cytale system-browser SSO bridge.
 *
 * Instead of launching homeserver SSO/OIDC inside the Capacitor WKWebView
 * (whose `allowNavigation` host allowlist cannot cover arbitrary user-picked
 * homeservers, and which cannot reliably follow a 303 redirect to the
 * `cytale://` custom scheme), SSO runs in the SYSTEM browser. This works for
 * ANY homeserver/IdP the user selects: the browser is a standalone OS surface,
 * and on completion the homeserver redirects to `cytale://callback?...`, iOS
 * routes that custom scheme back to our app, and `@capacitor/app` fires
 * `appUrlOpen` with the token.
 *
 * Accessing the Capacitor plugins here mirrors how the SSO deep-link runtime
 * does it (global `Capacitor.Plugins.*`) so this file has no native/module
 * dependency and degrades to a normal `<a>` navigation when the bridge is
 * absent (e.g. plain web).
 */

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

/** Whether the Capacitor Browser (system browser) bridge is available. */
export function hasSystemBrowser(): boolean {
  return getBrowserPlugin()?.open != null;
}

/**
 * Open an SSO login URL in the system browser.
 *
 * Returns a promise that settles when the native open request is issued (not
 * when the user finishes), so a click handler can await it without changing
 * the SPA URL — the callback comes back through `appUrlOpen`, not a navigation.
 *
 * Falls back to a normal top-level navigation when the bridge is unavailable.
 */
export async function openSSOInSystemBrowser(url: string): Promise<void> {
  const browser = getBrowserPlugin();
  if (browser?.open) {
    try {
      await browser.open({ url });
      return;
    } catch {
      // Fall through to a regular navigation if the plugin call throws.
    }
  }
  // No Capacitor bridge (plain web): let the link navigate normally.
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}

/**
 * Request the system browser be closed. Called when the `appUrlOpen` callback
 * fires (the homeserver redirected to cytale://callback and the OS brought our
 * app forward), so the browser sheet dismisses and the SPA ends up foreground.
 */
export function closeSystemBrowser(): void {
  const browser = getBrowserPlugin();
  if (browser?.close) {
    browser.close().catch(() => {
      // Ignore: the browser may already be gone or the bridge unavailable.
    });
  }
}
