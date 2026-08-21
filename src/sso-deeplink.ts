import { trimSlash, trimTrailingSlash } from './app/utils/common';
import { getLoginPath } from './app/pages/pathUtils';

/**
 * Cytale SSO deep-link handler.
 *
 * When the homeserver's SSO/OIDC flow completes it redirects to Cytale's
 * custom scheme (config.json `ssoRedirectScheme`, default "cytale://callback")
 * carrying the Matrix `loginToken`. iOS routes that scheme to our app; the
 * Capacitor `App` plugin emits `appUrlOpen` with the raw URL. This module
 * rewrites the deep link into Cinny's own login route with the token so
 * `TokenLogin` completes sign-in entirely in-app.
 *
 * It registers the listener as early as possible (imported from the bundle
 * entry) and also handles the case where the app is launched cold via the
 * deep link by checking a retained pending URL.
 */

type AppUrlOpenPayload = {
  url: string;
  iosSourceApplication?: string;
  iosOpenInPlace?: boolean;
};

type AppPluginLike = {
  addListener?: (event: 'appUrlOpen', cb: (payload: AppUrlOpenPayload) => void) => Promise<unknown>;
};

function getAppPlugin(): AppPluginLike | null {
  const capacitor = (globalThis as Record<string, unknown>).Capacitor as
    | { Plugins?: Record<string, unknown> }
    | undefined;
  const plugins = capacitor?.Plugins ?? {};
  const app = (plugins as Record<string, unknown>).App;
  return (app as AppPluginLike | undefined) ?? null;
}

/** Build the in-app Cinny login URL from a cytale://callback deep link. */
function buildLoginUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // Only act on our own SSO callback scheme/host.
  if (parsed.protocol !== 'cytale:' || parsed.hostname !== 'callback') {
    return null;
  }

  const token = parsed.searchParams.get('loginToken');
  if (!token) {
    // A callback without a token is not a usable sign-in; ignore it rather
    // than naviging the user somewhere unexpected.
    return null;
  }

  const origin = trimTrailingSlash(window.location.origin); // capacitor://localhost
  const baseUrl = trimSlash(import.meta.env.BASE_URL ?? '');
  const loginPath = getLoginPath(undefined);

  const params = new URLSearchParams();
  params.set('loginToken', token);
  // Preserve any other auth-ish params the server may echo back.
  for (const key of ['code', 'state', 'error', 'error_description']) {
    const v = parsed.searchParams.get(key);
    if (v) params.set(key, v);
  }

  return `${origin}/${baseUrl ? baseUrl + '/' : ''}${trimLeadingSlash(loginPath)}?${params.toString()}`;
}

function trimLeadingSlash(s: string): string {
  return s.replace(/^\/+/, '');
}

let resolvedOne = false;

/**
 * Register the deep-link callback handler. This runs at SPA startup, so it
 * must NEVER throw: an uncaught error on any code path would abort Cinny's
 * mount and leave a blank white screen. Every action is wrapped in try/catch
 * and degrades to a no-op when the Capacitor App bridge is absent.
 */
export function initSSODeeplink(): void {
  if (resolvedOne) return;
  resolvedOne = true;

  try {
    const appPlugin = getAppPlugin();
    if (appPlugin?.addListener) {
      appPlugin
        .addListener('appUrlOpen', (payload) => {
          try {
            const target = buildLoginUrl(payload.url);
            if (target) {
              // Redirect the SPA to its own login route carrying the token. Use
              // replace so the deep link does not pollute the history stack.
              window.location.replace(target);
            }
          } catch {
            // Never let a malformed deep link break the running app.
          }
        })
        .catch(() => {
          // Capacitor bridge unavailable at load; fall back to the cold-start
          // check below (launch via the scheme is handled there).
        });
    }

    // Cold-start fallback: if the app was launched by the scheme, the callback
    // URL may already be present (Capacitor rehydrates `window.location`).
    const target = buildLoginUrl(window.location.href);
    if (target && window.location.protocol !== 'cytale:') {
      window.location.replace(target);
    }
  } catch {
    // Outer safety net: an unexpected throw here must never white-screen the
    // app. SSO deep-link handling is best-effort only.
  }
}
