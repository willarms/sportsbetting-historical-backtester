// Client-side snapshot of who is signed in. Populated after successful
// POST /api/users/login or /api/users/register (see LoginPage / RegisterPage).
// No server-side session yet — only localStorage.

const USER_KEY = "betwise_user";

/**
 * Persist the signed-in user.
 * Typical shape after API auth: { userID, username, email }.
 */
export function saveUser(user) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user ?? {}));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

/** @returns {{ userID?: number, email?: string, username?: string, identifier?: string } | null} */
export function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearUser() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Best-effort display label for the user. Prefers username; falls back to
 * the raw login identifier; finally a neutral placeholder.
 */
export function userDisplayName(user) {
  if (!user) return "Account";
  return user.username || user.identifier || user.email || "Account";
}
