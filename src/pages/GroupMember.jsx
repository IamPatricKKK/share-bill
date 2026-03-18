import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function GroupMember() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState(null)
  const [paymentProof, setPaymentProof] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  const [step, setStep] = useState('select') // select | payment | done

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

    const channel = supabase
      .channel(`member-${groupId}`)
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ảnh không được vượt quá 2MB', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => setPaymentProof(ev.target.result)
    reader.readAsDataURL(file)
  }

  const submitPayment = async () => {
    if (!paymentProof) {
      showToast('Vui lòng upload ảnh chuyển khoản', 'error')
      return
    }

    setSubmitting(true)
    const { error } = await supabase
      .from('members')
      .update({
        payment_proof: paymentProof,
        payment_method: 'transfer',
        status: 'submitted',
      })
      .eq('id', selectedMember.id)

    if (error) {
      showToast('Có lỗi xảy ra, thử lại', 'error')
    } else {
      showToast('Đã gửi! Chờ chủ nhóm xác nhận ⏳')
      setStep('done')
      fetchData()
    }
    setSubmitting(false)
  }

  const selectMember = (member) => {
    if (member.status === 'confirmed') return
    setSelectedMember(member)

    if (member.status === 'submitted') {
      setStep('done')
    } else {
      setStep('payment')
    }
  }

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

  if (loading) {
    return (
      <div className="container loading-page">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-secondary)' }}>Đang tải...</p>
      </div>
    )
  }

  if (!group) return null

  const confirmed = members.filter(m => m.status === 'confirmed').length
  const progress = members.length > 0 ? Math.round((confirmed / members.length) * 100) : 0

  // Step 1: Select member
  if (step === 'select') {
    return (
      <div className="container">
        <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>

        <div className="animate-fade-in">
          <h1 className="page-title">{group.name}</h1>
          <p className="page-subtitle">Chủ nhóm: {group.owner_name}</p>
        </div>

        {group.status === 'closed' && (
          <div className="status-banner closed">🔴 Nhóm đã đóng</div>
        )}

        {/* Progress */}
        <div className="progress-bar-wrapper">
          <div className="progress-bar-label">
            <span>Tiến độ: {confirmed}/{members.length}</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        <div className="divider"></div>

        <h3 className="section-title" style={{ marginBottom: 16 }}>👤 Chọn tên của bạn</h3>

        {members.map((member) => (
          <div
            key={member.id}
            className={`member-select-card ${member.status === 'confirmed' ? 'disabled' : ''}`}
            onClick={() => selectMember(member)}
          >
            <div className="member-avatar">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div className="member-info">
              <div className="member-name">{member.name}</div>
              <div className="member-amount">{formatNumber(member.amount)} VNĐ</div>
            </div>
            {getStatusBadge(member)}
          </div>
        ))}

        {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
      </div>
    )
  }

  // Step 2: Payment
  if (step === 'payment' && selectedMember) {
    return (
      <div className="container">
        <button className="back-btn" onClick={() => { setStep('select'); setSelectedMember(null); setPaymentProof('') }}>
          ← Quay lại
        </button>

        <div className="animate-fade-in">
          <h1 className="page-title">Chuyển khoản</h1>
          <p className="page-subtitle">
            {selectedMember.name} — <strong>{formatNumber(selectedMember.amount)} VNĐ</strong>
          </p>
        </div>

        {/* Bank QR */}
        {group.qr_image && (
          <div className="card animate-slide-up" style={{ textAlign: 'center', marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 12 }}>📱 QR chuyển khoản</h3>
            <img src={group.qr_image} alt="QR Bank" className="qr-bank-image" />
          </div>
        )}

        {/* Bank Info */}
        {(group.bank_name || group.account_number) && (
          <div className="bank-info animate-slide-up" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 12, padding: '0 4px' }}>🏦 Thông tin tài khoản</h3>
            {group.bank_name && (
              <div className="bank-info-row">
                <span className="bank-info-label">Ngân hàng</span>
                <span className="bank-info-value">{group.bank_name}</span>
              </div>
            )}
            {group.account_number && (
              <div className="bank-info-row">
                <span className="bank-info-label">Số tài khoản</span>
                <span className="bank-info-value">{group.account_number}</span>
              </div>
            )}
            {group.account_holder && (
              <div className="bank-info-row">
                <span className="bank-info-label">Chủ tài khoản</span>
                <span className="bank-info-value">{group.account_holder}</span>
              </div>
            )}
            <div className="bank-info-row">
              <span className="bank-info-label">Số tiền</span>
              <span className="bank-info-value" style={{ color: 'var(--accent-start)', fontSize: '1.1rem' }}>
                {formatNumber(selectedMember.amount)} VNĐ
              </span>
            </div>
          </div>
        )}

        {/* Upload proof */}
        {group.status === 'active' && (
          <>
            <div className="card animate-slide-up" style={{ marginBottom: 16 }}>
              <h3 className="section-title" style={{ marginBottom: 12 }}>📸 Ảnh chuyển khoản</h3>
              <div
                className={`upload-area ${paymentProof ? 'has-image' : ''}`}
                onClick={() => document.getElementById('proof-upload').click()}
              >
                {paymentProof ? (
                  <img src={paymentProof} alt="Payment proof" className="upload-preview" />
                ) : (
                  <>
                    <span className="upload-icon">📷</span>
                    <p className="upload-text">
                      <span>Bấm để upload</span> ảnh chuyển khoản
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
                      Tối đa 2MB
                    </p>
                  </>
                )}
              </div>
              <input
                id="proof-upload"
                type="file"
                className="upload-input"
                accept="image/*"
                onChange={handleImageUpload}
              />
              {paymentProof && (
                <button
                  className="btn btn-secondary btn-sm btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => setPaymentProof('')}
                >
                  🗑️ Chọn ảnh khác
                </button>
              )}
            </div>

            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={submitPayment}
              disabled={submitting || !paymentProof}
              id="btn-submit-payment"
            >
              {submitting ? <span className="spinner"></span> : '✅ Done - Gửi xác nhận'}
            </button>
          </>
        )}

        {group.status === 'closed' && (
          <div className="status-banner closed">🔴 Nhóm đã đóng, không thể submit</div>
        )}

        {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
      </div>
    )
  }

  // Step 3: Done - waiting for confirmation
  if (step === 'done' && selectedMember) {
    const current = members.find(m => m.id === selectedMember.id) || selectedMember

    return (
      <div className="container">
        <button className="back-btn" onClick={() => { setStep('select'); setSelectedMember(null); setPaymentProof('') }}>
          ← Quay lại danh sách
        </button>

        <div className="animate-fade-in" style={{ textAlign: 'center', padding: '40px 0' }}>
          {current.status === 'confirmed' ? (
            <>
              <span style={{ fontSize: '4rem', display: 'block', marginBottom: 16 }}>🎉</span>
              <h2 style={{ marginBottom: 8 }}>Đã được xác nhận!</h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Chủ nhóm đã xác nhận thanh toán của bạn
              </p>
            </>
          ) : (
            <>
              <span style={{ fontSize: '4rem', display: 'block', marginBottom: 16, animation: 'pulse 2s infinite' }}>⏳</span>
              <h2 style={{ marginBottom: 8 }}>Đang chờ xác nhận</h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Ảnh chuyển khoản đã gửi, chờ chủ nhóm ({group.owner_name}) xác nhận
              </p>
            </>
          )}

          <div className="card" style={{ textAlign: 'left', marginTop: 24 }}>
            <div className="bank-info-row">
              <span className="bank-info-label">Người gửi</span>
              <span className="bank-info-value">{current.name}</span>
            </div>
            <div className="bank-info-row">
              <span className="bank-info-label">Số tiền</span>
              <span className="bank-info-value">{formatNumber(current.amount)} VNĐ</span>
            </div>
            <div className="bank-info-row">
              <span className="bank-info-label">Hình thức</span>
              <span className="bank-info-value">
                {current.payment_method === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}
              </span>
            </div>
            <div className="bank-info-row">
              <span className="bank-info-label">Trạng thái</span>
              {getStatusBadge(current)}
            </div>
          </div>
        </div>

        {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
      </div>
    )
  }

  return null
}
