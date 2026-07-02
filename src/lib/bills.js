// Pure helpers for the multi-invoice (hoá đơn) feature.
// Money is computed on the client from items + item_shares so the owner can
// freely re-assign who-eats-what; bill_shares only persists payment status.

// item_shares[] -> { [itemId]: [participantId, ...] }
export function groupSharesByItem(itemShares) {
  const map = {}
  for (const s of itemShares) {
    ;(map[s.item_id] ||= []).push(s.participant_id)
  }
  return map
}

// Total of a single line item.
export function lineTotal(item) {
  return Number(item.price || 0) * Number(item.qty || 1)
}

// Compute what each participant owes for one bill.
// Returns { owed: { [participantId]: amount }, total, unassigned }
//  - an item split between N people charges each lineTotal / N
//  - items with nobody assigned are added to `unassigned` (nobody owes them)
export function computeBill(items, sharesByItem) {
  const owed = {}
  let total = 0
  let unassigned = 0
  for (const it of items) {
    const lt = lineTotal(it)
    total += lt
    const sharers = sharesByItem[it.id] || []
    if (sharers.length === 0) {
      unassigned += lt
      continue
    }
    const per = lt / sharers.length
    for (const pid of sharers) owed[pid] = (owed[pid] || 0) + per
  }
  return { owed, total, unassigned }
}

// Round to whole đồng for display / storage.
export const roundVnd = (n) => Math.round(Number(n) || 0)

export const formatVnd = (n) => roundVnd(n).toLocaleString('vi-VN')

// --- Due date helpers -------------------------------------------------------

// Returns null when no due date, else { diffDays, overdue, dueToday, label }.
// diffDays > 0 means days remaining; < 0 means days overdue.
export function dueInfo(dueDate) {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const diffDays = Math.round((due - today) / 86400000)
  const overdue = diffDays < 0
  const dueToday = diffDays === 0
  let label
  if (overdue) label = `Quá hạn ${Math.abs(diffDays)} ngày`
  else if (dueToday) label = 'Đến hạn hôm nay'
  else if (diffDays === 1) label = 'Còn 1 ngày'
  else label = `Còn ${diffDays} ngày`
  return { diffDays, overdue, dueToday, label }
}

// dd/mm/yyyy for display; '' when empty.
export function formatDate(d) {
  if (!d) return ''
  const date = new Date(`${d}T00:00:00`)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// yyyy-mm-dd of today, for date input defaults.
export function todayISO() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}
