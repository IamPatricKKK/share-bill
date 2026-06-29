import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getName, setName } from '../lib/identity'
import Chat from '../components/Chat'

export default function GroupMember() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [tab, setTab] = useState('chat')

  // Identity
  const [myName, setMyName] = useState(getName(groupId))
  const [nameInput, setNameInput] = useState('')

  // Bill sub-flow
  const [selectedMember, setSelectedMember] = useState(null)
  const [paymentProof, setPaymentProof] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [billStep, setBillStep] = useState('select') // select | pay | done

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).single()
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
        event: '*', schema: 'public', table: 'members', filter: `group_id=eq.${groupId}`
      }, () => fetchData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [groupId, fetchData])

  const saveName = (e) => {
    e.preventDefault()
    const n = nameInput.trim()
    if (!n) return
    setName(groupId, n)
    setMyName(n)
  }

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

  // Done — proof is OPTIONAL
  const submitPayment = async () => {
    setSubmitting(true)
    const { error } = await supabase
      .from('members')
      .update({
        payment_proof: paymentProof || null,
        payment_method: 'transfer',
        status: 'submitted',
      })
      .eq('id', selectedMember.id)

    if (error) {
      showToast('Có lỗi xảy ra, thử lại', 'error')
    } else {
      showToast('Đã báo xong! Chờ chủ nhóm xác nhận ⏳')
      setBillStep('done')
      fetchData()
    }
    setSubmitting(false)
  }

  const selectMember = (member) => {
    if (member.status === 'confirmed') return
    setSelectedMember(member)
    setBillStep(member.status === 'submitted' ? 'done' : 'pay')
  }

  const formatNumber = (num) => Number(num).toLocaleString('vi-VN')

  const getStatusBadge = (member) => {
    if (member.status === 'confirmed' && member.payment_method === 'cash') {
      return <span className="badge badge-cash">💵 Tiền mặt</span>
    }
    if (member.status === 'confirmed') return <span className="badge badge-confirmed">✓ Đã xác nhận</span>
    if (member.status === 'submitted') return <span className="badge badge-submitted">📤 Chờ xác nhận</span>
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

  // ----- Name gate -----
  if (!myName) {
    return (
      <div className="container">
        <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>
        <div className="name-gate animate-fade-in">
          <span className="logo-icon">👋</span>
          <h1 className="page-title">{group.name}</h1>
          <p className="page-subtitle">Nhập tên của bạn để tham gia nhóm &amp; chat</p>
          <form className="card" onSubmit={saveName}>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Tên của bạn (VD: Lan)"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                maxLength={40}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={!nameInput.trim()}>
              Vào nhóm →
            </button>
          </form>
        </div>
        {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
      </div>
    )
  }

  const isPlanning = group.status === 'planning'
  const confirmed = members.filter(m => m.status === 'confirmed').length
  const progress = members.length > 0 ? Math.round((confirmed / members.length) * 100) : 0

  // ----- Payment sub-views (overlay the bill tab) -----
  const renderPayView = () => {
    const current = members.find(m => m.id === selectedMember.id) || selectedMember

    if (billStep === 'done') {
      return (
        <div className="animate-fade-in" style={{ textAlign: 'center', padding: '24px 0' }}>
          {current.status === 'confirmed' ? (
            <>
              <span style={{ fontSize: '4rem', display: 'block', marginBottom: 16 }}>🎉</span>
              <h2 style={{ marginBottom: 8 }}>Đã được xác nhận!</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Chủ nhóm đã xác nhận thanh toán của bạn</p>
            </>
          ) : (
            <>
              <span style={{ fontSize: '4rem', display: 'block', marginBottom: 16, animation: 'pulse 2s infinite' }}>⏳</span>
              <h2 style={{ marginBottom: 8 }}>Đang chờ xác nhận</h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Đã báo xong, chờ chủ nhóm ({group.owner_name}) xác nhận
              </p>
            </>
          )}
          <div className="card" style={{ textAlign: 'left', marginTop: 24 }}>
            <div className="bank-info-row"><span className="bank-info-label">Người đóng</span><span className="bank-info-value">{current.name}</span></div>
            <div className="bank-info-row"><span className="bank-info-label">Số tiền</span><span className="bank-info-value">{formatNumber(current.amount)} VNĐ</span></div>
            <div className="bank-info-row"><span className="bank-info-label">Trạng thái</span>{getStatusBadge(current)}</div>
          </div>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }}
            onClick={() => { setBillStep('select'); setSelectedMember(null); setPaymentProof('') }}>
            ← Quay lại danh sách
          </button>
        </div>
      )
    }

    // billStep === 'pay'
    return (
      <div className="animate-fade-in">
        <button className="back-btn" onClick={() => { setBillStep('select'); setSelectedMember(null); setPaymentProof('') }}>
          ← Chọn người khác
        </button>
        <h2 style={{ marginBottom: 4 }}>{current.name}</h2>
        <p className="page-subtitle" style={{ marginBottom: 20, textAlign: 'left' }}>
          Cần đóng: <strong style={{ color: 'var(--accent-start)' }}>{formatNumber(current.amount)} VNĐ</strong>
        </p>

        {group.qr_image && (
          <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 12 }}>📱 QR chuyển khoản</h3>
            <img src={group.qr_image} alt="QR Bank" className="qr-bank-image" />
          </div>
        )}

        {(group.bank_name || group.account_number) && (
          <div className="bank-info" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 12, padding: '0 4px' }}>🏦 Thông tin tài khoản</h3>
            {group.bank_name && <div className="bank-info-row"><span className="bank-info-label">Ngân hàng</span><span className="bank-info-value">{group.bank_name}</span></div>}
            {group.account_number && <div className="bank-info-row"><span className="bank-info-label">Số tài khoản</span><span className="bank-info-value">{group.account_number}</span></div>}
            {group.account_holder && <div className="bank-info-row"><span className="bank-info-label">Chủ tài khoản</span><span className="bank-info-value">{group.account_holder}</span></div>}
            <div className="bank-info-row">
              <span className="bank-info-label">Số tiền</span>
              <span className="bank-info-value" style={{ color: 'var(--accent-start)', fontSize: '1.1rem' }}>{formatNumber(current.amount)} VNĐ</span>
            </div>
          </div>
        )}

        {group.status === 'active' ? (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 className="section-title" style={{ marginBottom: 6 }}>📸 Ảnh chuyển khoản (tùy chọn)</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12 }}>
                Bạn có thể bấm “Done” luôn mà không cần up ảnh.
              </p>
              <div className={`upload-area ${paymentProof ? 'has-image' : ''}`} onClick={() => document.getElementById('proof-upload').click()}>
                {paymentProof ? (
                  <img src={paymentProof} alt="Payment proof" className="upload-preview" />
                ) : (
                  <>
                    <span className="upload-icon">📷</span>
                    <p className="upload-text"><span>Bấm để upload</span> ảnh chuyển khoản</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>Tối đa 2MB</p>
                  </>
                )}
              </div>
              <input id="proof-upload" type="file" className="upload-input" accept="image/*" onChange={handleImageUpload} />
              {paymentProof && (
                <button className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setPaymentProof('')}>
                  🗑️ Chọn ảnh khác
                </button>
              )}
            </div>

            <button className="btn btn-primary btn-block btn-lg" onClick={submitPayment} disabled={submitting} id="btn-submit-payment">
              {submitting ? <span className="spinner"></span> : '✅ Done — Tôi đã đóng'}
            </button>
          </>
        ) : (
          <div className="status-banner closed">🔴 Nhóm đã đóng, không thể báo đóng</div>
        )}
      </div>
    )
  }

  return (
    <div className="container">
      <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>

      <div className="animate-fade-in">
        <h1 className="page-title">{group.name}</h1>
        <p className="page-subtitle">Chủ nhóm: {group.owner_name} • Bạn: {myName}</p>
      </div>

      <div className={`status-banner ${group.status}`}>
        {group.status === 'planning' && '📝 Đang lên kế hoạch — chờ chủ nhóm chốt giá'}
        {group.status === 'active' && '🟢 Bill đang mở'}
        {group.status === 'closed' && '🔴 Nhóm đã đóng'}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>💬 Chat</button>
        <button className={`tab ${tab === 'bill' ? 'active' : ''}`} onClick={() => setTab('bill')}>🧾 Bill</button>
      </div>

      {/* CHAT TAB */}
      {tab === 'chat' && <Chat groupId={groupId} senderName={myName} isOwner={false} />}

      {/* BILL TAB */}
      {tab === 'bill' && (
        <div className="animate-slide-up">
          {isPlanning ? (
            <div className="empty-state">
              <span className="empty-state-icon">⏳</span>
              <p>Chủ nhóm chưa lên giá. Hãy vào <strong>Chat</strong> để cùng lên kế hoạch nhé!</p>
            </div>
          ) : selectedMember ? (
            renderPayView()
          ) : (
            <>
              <div className="progress-bar-wrapper">
                <div className="progress-bar-label">
                  <span>Tiến độ: {confirmed}/{members.length}</span>
                  <span>{progress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>

              <h3 className="section-title" style={{ margin: '16px 0' }}>👤 Chọn tên của bạn để đóng tiền</h3>

              {members.map((member) => (
                <div
                  key={member.id}
                  className={`member-select-card ${member.status === 'confirmed' ? 'disabled' : ''}`}
                  onClick={() => selectMember(member)}
                >
                  <div className="member-avatar">{member.name.charAt(0).toUpperCase()}</div>
                  <div className="member-info">
                    <div className="member-name">{member.name}</div>
                    <div className="member-amount">{formatNumber(member.amount)} VNĐ</div>
                  </div>
                  {getStatusBadge(member)}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
