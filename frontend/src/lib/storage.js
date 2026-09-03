/**
 * localStorage that never throws.
 *
 * Private browsing and blocked site data make every access a potential
 * exception, and a preference failing to persist must never take a page down
 * with it. Lives apart from lib/api so consent handling can read storage
 * without importing the API client that depends on it.
 */
export function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing */
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private browsing */
  }
}
