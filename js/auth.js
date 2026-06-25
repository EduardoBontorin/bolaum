// =============================================================================
// js/auth.js — Session management via sessionStorage
// =============================================================================
//
// Session shape: { nome: string, isAdmin: boolean }
// Storage key:   'bolao_session'
// =============================================================================

const SESSION_KEY = 'bolao_session';

/** Returns the current session object or null if not logged in. */
export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Persists a user object to the session storage. */
export function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/** Removes the session from storage (logout). */
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Redirects to index.html if there is no active session.
 * Throws to stop execution of the calling module.
 */
export function requireAuth() {
  if (!getSession()) {
    window.location.href = 'index.html';
    throw new Error('not authenticated');
  }
}

/**
 * Redirects to index.html if the current session does not have isAdmin=true.
 * Throws to stop execution of the calling module.
 */
export function requireAdmin() {
  const s = getSession();
  if (!s || !s.isAdmin) {
    window.location.href = 'index.html';
    throw new Error('not admin');
  }
}
