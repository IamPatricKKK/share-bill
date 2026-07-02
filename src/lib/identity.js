// Lightweight per-group identity stored in localStorage (no auth).
// Each group remembers the display name the visitor chose for chat / paying.

const keyFor = (groupId) => `lenkeo_name_${groupId}`
const pidKeyFor = (groupId) => `lenkeo_pid_${groupId}`

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

// Which participant (roster row) this visitor identifies as, for paying bills.
export function getParticipantId(groupId) {
  try {
    return localStorage.getItem(pidKeyFor(groupId)) || ''
  } catch {
    return ''
  }
}

export function setParticipantId(groupId, id) {
  try {
    if (id) localStorage.setItem(pidKeyFor(groupId), id)
    else localStorage.removeItem(pidKeyFor(groupId))
  } catch {
    /* ignore (private mode) */
  }
}
