/**
 * Where the page goes when a game or a search starts or ends: an active one
 * shows on /play, and the lobby takes over once nothing is left. Null when
 * the page stays where it is.
 *
 * Invite first (2026-10-16): in the app, an invite link that arrives over an
 * on-device AI game, at launch or while it runs, keeps the invite page on
 * screen. Joining ends that game; going back returns to it (InviteScreen).
 */
export function activityRoute(
  active: boolean,
  path: string,
  { invite, onDevice }: { invite: boolean; onDevice: boolean },
): "/play" | "/" | null {
  if (!active) return path === "/" ? null : "/";
  if (path === "/play") return null;
  return invite && onDevice ? null : "/play";
}
