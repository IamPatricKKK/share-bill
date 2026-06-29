import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { getName } from '../lib/identity'
import Chat from '../components/Chat'

export default function GroupOwner() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [proofModal, setProofModal] = useState(null)
  const [tab, setTab] = useState('chat')

  // Bill creation form (planning phase)
  const [billMembers, setBillMembers] = useState([{ name: '', amount: '' }])
  const [billTotal, setBillTotal] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [chatNames, setChatNames] = useState([])
  const [creating, setCreating] = useState(false)
  const [billError, setBillError] = useState('')

  // Add-member-to-active-bill inline form
  const [newMember, setNewMember] = useState({ name: '', amount: '' })

  const ownerName = group?.owner_name || getName(groupId) || 'Chủ nhóm'

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

  // Distinct chat participants — handy to prefill the bill
  const fetchChatNames = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('messages')
      .select('sender_name, is_owner')
      .eq('group_id', groupId)
    const names = [...new Set((data || []).filter(d => !d.is_owner).map(d => d.sender_name.trim()))]
    setChatNames(names)
  }, [groupId])

  useEffect(() => {
    fetchData()
    fetchChatNames()

    if (!supabase) return

    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'members', filter: `group_id=eq.${groupId}`
      }, () => fetchData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [groupId, fetchData, fetchChatNames])

  // ----- Bill form helpers -----
  const addBillRow = () => {
    if (billMembers.length >= 30) return
    setBillMembers([...billMembers, { name: '', amount: '' }])
  }
  const removeBillRow = (idx) => {
    if (billMembers.length <= 1) return
    setBillMembers(billMembers.filter((_, i) => i !== idx))
  }
  const updateBillRow = (idx, field, value) => {
    const updated = [...billMembers]
    updated[idx][field] = value
    setBillMembers(updated)
  }
  const addNameFromChat = (name) => {
    if (billMembers.some(m => m.name.trim().toLowerCase() === name.toLowerCase())) return
    const empties = billMembers.filter(m => !m.name.trim())
    if (empties.length > 0) {
      const idx = billMembers.findIndex(m => !m.name.trim())
      updateBillRow(idx, 'name', name)
    } else {
      setBillMembers([...billMembers, { name, amount: '' }])
    }
  }
  const splitEvenly = () => {
    if (!billTotal) return
    const valid = billMembers.filter(m => m.name.trim())
    if (valid.length === 0) return
    const per = Math.ceil(Number(billTotal) / valid.length)
    setBillMembers(billMembers.map(m => ({ ...m, amount: m.name.trim() ? String(per) : m.amount })))
  }
  const handleQrUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setBillError('Ảnh QR không được vượt quá 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => setQrImage(ev.target.result)
    reader.readAsDataURL(file)
  }

  const createBill = async () => {
    setBillError('')
    const valid = billMembers.filter(m => m.name.trim() && m.amount)
    if (valid.length === 0) {
      setBillError('Cần ít nhất 1 người và số tiền')
      return
    }
    if (!bankName && !accountNumber && !qrImage) {
      setBillError('Nhập thông tin ngân hàng hoặc upload QR để mọi người chuyển khoản')
      return
    }

    setCreating(true)
    try {
      const total = valid.reduce((s, m) => s + Number(m.amount), 0)

      const { error: gErr } = await supabase
        .from('groups')
        .update({
          total_amount: total,
          bank_name: bankName.trim() || null,
          account_number: accountNumber.trim() || null,
          account_holder: accountHolder.trim() || null,
          qr_image: qrImage || null,
          status: 'active',
        })
        .eq('id', groupId)
      if (gErr) throw gErr

      const inserts = valid.map(m => ({
        group_id: groupId,
        name: m.name.trim(),
        amount: Number(m.amount),
        payment_method: 'none',
        status: 'pending',
      }))
      const { error: mErr } = await supabase.from('members').insert(inserts)
      if (mErr) throw mErr

      showToast('Đã lên giá & chia bill 🎉')
      setTab('bill')
      fetchData()
    } catch (err) {
      setBillError(err.message || 'Có lỗi xảy ra')
    }
    setCreating(false)
  }

  const addMemberToActiveBill = async () => {
    if (!newMember.name.trim() || !newMember.amount) return
    const { error } = await supabase.from('members').insert({
      group_id: groupId,
      name: newMember.name.trim(),
      amount: Number(newMember.amount),
      payment_method: 'none',
      status: 'pending',
    })
    if (error) { showToast('Lỗi khi thêm người', 'error'); return }
    await supabase.from('groups')
      .update({ total_amount: Number(group.total_amount) + Number(newMember.amount) })
      .eq('id', groupId)
    setNewMember({ name: '', amount: '' })
    showToast('Đã thêm người vào bill')
    fetchData()
  }

  // ----- Payment actions -----
  const confirmPayment = async (memberId) => {
    await supabase.from('members').update({ status: 'confirmed' }).eq('id', memberId)
    showToast('Đã xác nhận thanh toán ✓')
    fetchData()
  }
  const markCash = async (memberId) => {
    await supabase.from('members')
      .update({ status: 'confirmed', payment_method: 'cash' }).eq('id', memberId)
    showToast('Đã ghi nhận tiền mặt 💵')
    fetchData()
  }
  const closeGroup = async () => {
    if (!window.confirm('Bạn có chắc muốn đóng nhóm? Thành viên sẽ không thể submit thêm.')) return
    await supabase.from('groups').update({ status: 'closed' }).eq('id', groupId)
    showToast('Đã đóng nhóm')
    fetchData()
  }
  const reopenGroup = async () => {
    await supabase.from('groups').update({ status: 'active' }).eq('id', groupId)
    showToast('Đã mở lại nhóm')
    fetchData()
  }
  const deleteGroup = async () => {
    if (!window.confirm('Xóa nhóm vĩnh viễn? Hành động này không thể hoàn tác.')) return
    await supabase.from('messages').delete().eq('group_id', groupId)
    await supabase.from('members').delete().eq('group_id', groupId)
    await supabase.from('groups').delete().eq('id', groupId)
    navigate('/')
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/group/${groupId}`)
    showToast('Đã copy link! 📋')
  }
  const copyCode = () => {
    navigator.clipboard.writeText(group.group_code)
    showToast('Đã copy mã nhóm! 📋')
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

  const isPlanning = group.status === 'planning'
  const confirmed = members.filter(m => m.status === 'confirmed').length
  const submitted = members.filter(m => m.status === 'submitted').length
  const pending = members.filter(m => m.status === 'pending').length
  const paidAmount = members.filter(m => m.status === 'confirmed').reduce((s, m) => s + Number(m.amount), 0)
  const progress = members.length > 0 ? Math.round((confirmed / members.length) * 100) : 0
  const shareLink = `${window.location.origin}/group/${groupId}`
  const billTotalSum = billMembers.reduce((s, m) => s + (Number(m.amount) || 0), 0)

  return (
    <div className="container">
      <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>

      <div className="animate-fade-in">
        <h1 className="page-title">{group.name}</h1>
        <p className="page-subtitle">Chủ nhóm: {group.owner_name} 👑</p>
      </div>

      <div className={`status-banner ${group.status}`}>
        {group.status === 'planning' && '📝 Đang lên kế hoạch — chưa chia bill'}
        {group.status === 'active' && '🟢 Bill đang mở — chờ mọi người đóng'}
        {group.status === 'closed' && '🔴 Nhóm đã đóng'}
      </div>

      {/* Share */}
      <div className="share-box animate-slide-up">
        <h3 style={{ marginBottom: 4 }}>📤 Mời mọi người vào nhóm</h3>
        <div className="share-code">{group.group_code}</div>
        <button className="copy-btn" onClick={copyCode} style={{ marginBottom: 12 }}>Copy mã nhóm</button>
        <div className="qr-wrapper"><QRCodeSVG value={shareLink} size={150} level="M" /></div>
        <div className="share-link">{shareLink}</div>
        <button className="copy-btn" onClick={copyLink}>Copy link</button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
          💬 Chat
        </button>
        <button className={`tab ${tab === 'bill' ? 'active' : ''}`} onClick={() => setTab('bill')}>
          🧾 {isPlanning ? 'Lên giá' : 'Bill'}
          {submitted > 0 && <span className="tab-badge">{submitted}</span>}
        </button>
      </div>

      {/* ---------- CHAT TAB ---------- */}
      {tab === 'chat' && (
        <Chat groupId={groupId} senderName={ownerName} isOwner={true} />
      )}

      {/* ---------- BILL TAB ---------- */}
      {tab === 'bill' && isPlanning && (
        <div className="animate-slide-up">
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 6 }}>🧾 Lên giá &amp; chia bill</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
              Nhập tên + số tiền mỗi người cần đóng. Khi xong, mọi người sẽ thấy bill và bấm “Done”.
            </p>

            {chatNames.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 8 }}>
                  👥 Thêm nhanh từ chat:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {chatNames.map(n => (
                    <button key={n} className="copy-btn" onClick={() => addNameFromChat(n)}>
                      + {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="section-header">
              <h3 className="section-title" style={{ fontSize: '0.95rem' }}>
                Thành viên ({billMembers.length}/30)
              </h3>
              <button className="btn btn-sm btn-secondary" onClick={splitEvenly} disabled={!billTotal}>
                ⚡ Chia đều
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Tổng tiền (để chia đều — tùy chọn)</label>
              <input
                type="number"
                className="form-input"
                placeholder="VD: 1500000"
                value={billTotal}
                onChange={e => setBillTotal(e.target.value)}
              />
            </div>

            {billMembers.map((m, idx) => (
              <div key={idx} className="member-form-row">
                <input
                  type="text" className="form-input"
                  placeholder={`Tên người ${idx + 1}`}
                  value={m.name}
                  onChange={e => updateBillRow(idx, 'name', e.target.value)}
                />
                <input
                  type="number" className="form-input"
                  placeholder="Số tiền"
                  value={m.amount}
                  onChange={e => updateBillRow(idx, 'amount', e.target.value)}
                />
                {billMembers.length > 1 && (
                  <button className="remove-member-btn" onClick={() => removeBillRow(idx)} title="Xóa">✕</button>
                )}
              </div>
            ))}

            {billMembers.length < 30 && (
              <button className="btn btn-secondary btn-block btn-sm" onClick={addBillRow} style={{ marginTop: 8 }}>
                + Thêm người
              </button>
            )}

            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 16 }}>
              Tổng bill: <strong style={{ color: 'var(--accent-start)' }}>{formatNumber(billTotalSum)} VNĐ</strong>
            </div>
          </div>

          {/* Bank info */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 16 }}>📱 QR chuyển khoản</h3>
            <div className={`upload-area ${qrImage ? 'has-image' : ''}`} onClick={() => document.getElementById('qr-upload').click()}>
              {qrImage ? (
                <img src={qrImage} alt="QR Bank" className="upload-preview" />
              ) : (
                <>
                  <span className="upload-icon">📷</span>
                  <p className="upload-text"><span>Bấm để upload</span> ảnh QR chuyển khoản</p>
                </>
              )}
            </div>
            <input id="qr-upload" type="file" className="upload-input" accept="image/*" onChange={handleQrUpload} />
            {qrImage && (
              <button className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setQrImage('')}>
                🗑️ Xóa ảnh QR
              </button>
            )}

            <h3 className="section-title" style={{ margin: '20px 0 16px' }}>🏦 Thông tin tài khoản</h3>
            <div className="form-group">
              <label className="form-label">Tên ngân hàng</label>
              <input type="text" className="form-input" placeholder="VD: Vietcombank, MBBank..." value={bankName} onChange={e => setBankName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Số tài khoản</label>
              <input type="text" className="form-input" placeholder="VD: 1234567890" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tên chủ tài khoản</label>
              <input type="text" className="form-input" placeholder="VD: NGUYEN VAN A" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} />
            </div>
          </div>

          {billError && (
            <div style={{
              background: 'var(--danger-bg)', border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16,
              color: 'var(--danger)', fontSize: '0.9rem', textAlign: 'center'
            }}>{billError}</div>
          )}

          <button className="btn btn-primary btn-block btn-lg" onClick={createBill} disabled={creating} id="btn-create-bill">
            {creating ? <span className="spinner"></span> : '💸 Chốt giá & mở bill'}
          </button>
        </div>
      )}

      {/* ---------- BILL TAB (active/closed) ---------- */}
      {tab === 'bill' && !isPlanning && (
        <div className="animate-slide-up">
          <div className="stats-row">
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

          <div className="progress-bar-wrapper">
            <div className="progress-bar-label">
              <span>Tiến độ: {confirmed}/{members.length}</span>
              <span>{formatNumber(paidAmount)} / {formatNumber(group.total_amount)} VNĐ</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="section-header" style={{ marginTop: 8 }}>
            <h3 className="section-title">👥 Thành viên ({members.length})</h3>
          </div>

          {members.map((member) => (
            <div key={member.id} className="member-card">
              <div className="member-avatar">{member.name.charAt(0).toUpperCase()}</div>
              <div className="member-info">
                <div className="member-name">{member.name}</div>
                <div className="member-amount">{formatNumber(member.amount)} VNĐ</div>
                <div style={{ marginTop: 4 }}>{getStatusBadge(member)}</div>
              </div>
              <div className="member-actions">
                {member.status === 'submitted' && member.payment_proof && (
                  <button className="btn btn-sm btn-secondary" onClick={() => setProofModal(member)}>🖼️ Xem ảnh</button>
                )}
                {member.status === 'submitted' && (
                  <button className="btn btn-sm btn-success" onClick={() => confirmPayment(member.id)}>✓ Xác nhận</button>
                )}
                {member.status === 'pending' && group.status === 'active' && (
                  <button className="btn btn-sm btn-warning" onClick={() => markCash(member.id)}>💵 Tiền mặt</button>
                )}
              </div>
            </div>
          ))}

          {/* Add person to active bill */}
          {group.status === 'active' && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3 className="section-title" style={{ fontSize: '0.9rem', marginBottom: 12 }}>➕ Thêm người vào bill</h3>
              <div className="member-form-row" style={{ marginBottom: 0 }}>
                <input type="text" className="form-input" placeholder="Tên" value={newMember.name}
                  onChange={e => setNewMember({ ...newMember, name: e.target.value })} />
                <input type="number" className="form-input" placeholder="Số tiền" value={newMember.amount}
                  onChange={e => setNewMember({ ...newMember, amount: e.target.value })} />
                <button className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-end', height: 44 }}
                  onClick={addMemberToActiveBill} disabled={!newMember.name.trim() || !newMember.amount}>＋</button>
              </div>
            </div>
          )}

          <div className="divider"></div>

          <div className="action-row">
            {group.status === 'active' ? (
              <button className="btn btn-danger" onClick={closeGroup}>🔒 Đóng nhóm</button>
            ) : (
              <button className="btn btn-success" onClick={reopenGroup}>🔓 Mở lại</button>
            )}
            <button className="btn btn-danger" onClick={deleteGroup}>🗑️ Xóa nhóm</button>
          </div>
        </div>
      )}

      {/* Proof Modal */}
      {proofModal && (
        <div className="modal-overlay" onClick={() => setProofModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Ảnh chuyển khoản - {proofModal.name}</h3>
            <img src={proofModal.payment_proof} alt="Payment proof" />
            <div className="action-row" style={{ marginTop: 16 }}>
              <button className="btn btn-success" onClick={() => { confirmPayment(proofModal.id); setProofModal(null) }}>✓ Xác nhận</button>
              <button className="btn btn-secondary" onClick={() => setProofModal(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
