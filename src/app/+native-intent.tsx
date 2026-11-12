/**
 * Beam registers the stremio:// scheme (see app.json), so tapping "Install"
 * on an addon's configure page can open Beam. Those links aren't app routes,
 * so they're rewritten to the Addons screen with the URL prefilled.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    if (/^stremio:\/\//i.test(path)) {
      return `/addons?install=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    return '/';
  }
}
