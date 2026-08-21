/**
 * Cytale native SSO bridge (ASWebAuthenticationSession).
 *
 * Exposes the native `Capacitor.Plugins.CytaleSSO` plugin, which runs the SSO
 * flow in an `ASWebAuthenticationSession` (Apple's OAuth/SSO callback mechanism)
 * and returns the FULL callback URL (a `cytale://callback?...loginToken=...`
 * deep link) directly to this bridge — no OS-level "re-deliver the deep link to
 * the running app" step, which is what made the @capacitor/browser /
 * SFSafariViewController path unreliable on the phone.
 *
 * The calling code feeds the returned callback URL through the SAME
 * buildLoginUrl rewrite that the normal `appUrlOpen` deep-link runtime uses, so
 * the MAS `loginToken` → Cinny TokenLogin path is unchanged.
 *
 * Mirrors the global-accessor pattern used by system-browser-sso / sso-deeplink
 * (no @capacitor/core import), so it degrades to a no-op when the native
 * bridge is absent (e.g. plain web).
 */

type CytaleSSOPluginLike = {
  start?: (opts: { url: string; callbackScheme?: string }) => Promise<{
    url?: string;
    success?: boolean;
    message?: string;
  }>;
  cancel?: () => Promise<unknown>;
};

function getCytaleSSOPlugin(): CytaleSSOPluginLike | null {
  try {
    const capacitor = (globalThis as Record<string, unknown>).Capacitor as
      | { Plugins?: Record<string, unknown> }
      | undefined;
    const plugins = capacitor?.Plugins ?? {};
    const plugin = (plugins as Record<string, unknown>).CytaleSSO;
    return (plugin as CytaleSSOPluginLike | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Whether the native ASWebAuthenticationSession plugin bridge is present. */
export function hasCytaleNativeSSO(): boolean {
  return getCytaleSSOPlugin()?.start != null;
}

/**
 * Start the native SSO session and resolve with the FINAL callback URL
 * (`cytale://callback?...loginToken=...`) once the user completes OIDC/SSO.
 *
 * Returns `null` if the native bridge is unavailable or the session was
 * cancelled/errored (the caller can fall back to another path).
 */
export async function startCytaleNativeSSO(
  url: string,
  callbackScheme = 'cytale'
): Promise<string | null> {
  const plugin = getCytaleSSOPlugin();
  if (!plugin?.start) return null;
  try {
    const result = await plugin.start({ url, callbackScheme });
    return result?.url && result.success !== false ? result.url : null;
  } catch {
    return null;
  }
}
