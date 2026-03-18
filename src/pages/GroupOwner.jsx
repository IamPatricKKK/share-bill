import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

export default function GroupOwner() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [proofModal, setProofModal] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const { data: g } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single()

    if (!g) {
      navigate('/')
      return
    }
    setGroup(g)

    const { data: m } = await supabase
      .from('members')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })

    setMembers(m || [])
    setLoading(false)
  }, [groupId, navigate])

  useEffect(() => {
    fetchData()

    if (!supabase) return

    // Real-time subscription
    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'members',
        filter: `group_id=eq.${groupId}`
      }, () => {
        fetchData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [groupId, fetchData])

  const confirmPayment = async (memberId) => {
    await supabase
      .from('members')
      .update({ status: 'confirmed' })
      .eq('id', memberId)

    showToast('Đã xác nhận thanh toán ✓')
    fetchData()
  }

  const markCash = async (memberId) => {
    await supabase
      .from('members')
      .update({ status: 'confirmed', payment_method: 'cash' })
      .eq('id', memberId)

    showToast('Đã ghi nhận tiền mặt 💵')
    fetchData()
  }

  const closeGroup = async () => {
    if (!window.confirm('Bạn có chắc muốn đóng nhóm? Thành viên sẽ không thể submit thêm.')) return
    await supabase
      .from('groups')
      .update({ status: 'closed' })
      .eq('id', groupId)

    showToast('Đã đóng nhóm')
    fetchData()
  }

  const reopenGroup = async () => {
    await supabase
      .from('groups')
      .update({ status: 'active' })
      .eq('id', groupId)

    showToast('Đã mở lại nhóm')
    fetchData()
  }

  const deleteGroup = async () => {
    if (!window.confirm('Xóa nhóm vĩnh viễn? Hành động này không thể hoàn tác.')) return

    await supabase.from('members').delete().eq('group_id', groupId)
    await supabase.from('groups').delete().eq('id', groupId)

    navigate('/')
  }

  const copyLink = () => {
    const link = `${window.location.origin}/group/${groupId}`
    navigator.clipboard.writeText(link)
    showToast('Đã copy link! 📋')
  }

  const copyCode = () => {
    navigator.clipboard.writeText(group.group_code)
    showToast('Đã copy mã nhóm! 📋')
  }

  if (loading) {
    return (
      <div className="container loading-page">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-secondary)' }}>Đang tải...</p>
      </div>
    )
  }

  const confirmed = members.filter(m => m.status === 'confirmed').length
  const submitted = members.filter(m => m.status === 'submitted').length
  const pending = members.filter(m => m.status === 'pending').length
  const paidAmount = members
    .filter(m => m.status === 'confirmed')
    .reduce((s, m) => s + Number(m.amount), 0)
  const progress = members.length > 0 ? Math.round((confirmed / members.length) * 100) : 0
  const shareLink = `${window.location.origin}/group/${groupId}`

  const formatNumber = (num) => Number(num).toLocaleString('vi-VN')

  const getStatusBadge = (member) => {
    if (member.status === 'confirmed' && member.payment_method === 'cash') {
      return <span className="badge badge-cash">💵 Tiền mặt</span>
    }
    if (member.status === 'confirmed') {
      return <span className="badge badge-confirmed">✓ Đã xác nhận</span>
    }
    if (member.status === 'submitted') {
      return <span className="badge badge-submitted">📤 Chờ xác nhận</span>
    }
    return <span className="badge badge-pending">⏳ Chưa đóng</span>
  }

  return (
    <div className="container">
      <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>

      {/* Group Header */}
      <div className="animate-fade-in">
        <h1 className="page-title">{group.name}</h1>
        <p className="page-subtitle">Chủ nhóm: {group.owner_name}</p>
      </div>

      {/* Status */}
      <div className={`status-banner ${group.status}`}>
        {group.status === 'active' ? '🟢 Nhóm đang hoạt động' : '🔴 Nhóm đã đóng'}
      </div>

      {/* Stats */}
      <div className="stats-row animate-slide-up">
        <div className="stat-card">
          <div className="stat-value success">{confirmed}</div>
          <div className="stat-label">Đã đóng</div>
        </div>
        <div className="stat-card">
          <div className="stat-value warning">{submitted}</div>
          <div className="stat-label">Chờ duyệt</div>
        </div>
        <div className="stat-card">
          <div className="stat-value info">{pending}</div>
          <div className="stat-label">Chưa đóng</div>
        </div>
      </div>

      {/* Progress */}
      <div className="progress-bar-wrapper">
        <div className="progress-bar-label">
          <span>Tiến độ: {confirmed}/{members.length}</span>
          <span>{formatNumber(paidAmount)} / {formatNumber(group.total_amount)} VNĐ</span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      {/* Share Section */}
      <div className="share-box animate-slide-up">
        <h3 style={{ marginBottom: 4 }}>📤 Chia sẻ nhóm</h3>
        <div className="share-code">{group.group_code}</div>
        <button className="copy-btn" onClick={copyCode} style={{ marginBottom: 12 }}>
          Copy mã nhóm
        </button>
        <div className="qr-wrapper">
          <QRCodeSVG value={shareLink} size={160} level="M" />
        </div>
        <div className="share-link">{shareLink}</div>
        <button className="copy-btn" onClick={copyLink}>Copy link</button>
      </div>

      {/* Members List */}
      <div className="section-header">
        <h3 className="section-title">👥 Thành viên ({members.length})</h3>
      </div>

      {members.map((member) => (
        <div key={member.id} className="member-card">
          <div className="member-avatar">
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="member-info">
            <div className="member-name">{member.name}</div>
            <div className="member-amount">
              {formatNumber(member.amount)} VNĐ
            </div>
            <div style={{ marginTop: 4 }}>{getStatusBadge(member)}</div>
          </div>
          <div className="member-actions">
            {member.status === 'submitted' && member.payment_proof && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setProofModal(member)}
              >
                🖼️ Xem ảnh
              </button>
            )}
            {member.status === 'submitted' && (
              <button
                className="btn btn-sm btn-success"
                onClick={() => confirmPayment(member.id)}
              >
                ✓ Xác nhận
              </button>
            )}
            {member.status === 'pending' && group.status === 'active' && (
              <button
                className="btn btn-sm btn-warning"
                onClick={() => markCash(member.id)}
              >
                💵 Tiền mặt
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="divider"></div>

      {/* Actions */}
      <div className="action-row">
        {group.status === 'active' ? (
          <button className="btn btn-danger" onClick={closeGroup}>
            🔒 Đóng nhóm
          </button>
        ) : (
          <button className="btn btn-success" onClick={reopenGroup}>
            🔓 Mở lại
          </button>
        )}
        <button className="btn btn-danger" onClick={deleteGroup}>
          🗑️ Xóa nhóm
        </button>
      </div>

      {/* Proof Modal */}
      {proofModal && (
        <div className="modal-overlay" onClick={() => setProofModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Ảnh chuyển khoản - {proofModal.name}</h3>
            <img src={proofModal.payment_proof} alt="Payment proof" />
            <div className="action-row" style={{ marginTop: 16 }}>
              <button
                className="btn btn-success"
                onClick={() => { confirmPayment(proofModal.id); setProofModal(null) }}
              >
                ✓ Xác nhận
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setProofModal(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast show ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
