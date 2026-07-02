import { dueInfo, formatDate } from '../lib/bills'

// Due-date pill. Turns red/urgent when overdue and the bill isn't fully paid.
export function DueBadge({ dueDate, settled = false }) {
  const info = dueInfo(dueDate)
  if (!info) return null
  let cls = 'due-badge'
  if (settled) cls += ' done'
  else if (info.overdue) cls += ' overdue'
  else if (info.dueToday) cls += ' today'
  return (
    <span className={cls} title={`Hạn trả: ${formatDate(dueDate)}`}>
      ⏰ {settled ? `Hạn ${formatDate(dueDate)}` : info.label}
    </span>
  )
}

// Payment status badge for one participant's share of a bill.
export function ShareBadge({ share }) {
  const status = share?.status || 'pending'
  const method = share?.payment_method || 'none'
  if (status === 'confirmed' && method === 'cash') return <span className="badge badge-cash">💵 Tiền mặt</span>
  if (status === 'confirmed') return <span className="badge badge-confirmed">✓ Đã xác nhận</span>
  if (status === 'submitted') return <span className="badge badge-submitted">📤 Chờ xác nhận</span>
  return <span className="badge badge-pending">⏳ Chưa đóng</span>
}
