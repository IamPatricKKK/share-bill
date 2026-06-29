// Lightweight per-group identity stored in localStorage (no auth).
// Each group remembers the display name the visitor chose for chat / paying.

const keyFor = (groupId) => `lenkeo_name_${groupId}`

export function getName(groupId) {
  try {
    return localStorage.getItem(keyFor(groupId)) || ''
  } catch {
    return ''
  }
}

export function setName(groupId, name) {
  try {
    localStorage.setItem(keyFor(groupId), name)
  } catch {
    /* ignore (private mode) */
  }
}
