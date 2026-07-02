import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getName, setName, getParticipantId, setParticipantId } from '../lib/identity'
import { computeBill, groupSharesByItem, formatVnd, dueInfo } from '../lib/bills'
import Chat from '../components/Chat'
import { DueBadge, ShareBadge } from '../components/BillCard'

export default function GroupMember() {
  const { groupId } = useParams()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [participants, setParticipants] = useState([])
  const [bills, setBills] = useState([])
  const [items, setItems] = useState([])
  const [itemShares, setItemShares] = useState([])
  const [billShares, setBillShares] = useState([])

  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [tab, setTab] = useState('chat')

  const [myName, setMyName] = useState(getName(groupId))
  const [nameInput, setNameInput] = useState('')
  const [myPid, setMyPid] = useState(getParticipantId(groupId))

  const [openBillId, setOpenBillId] = useState(null)
  const [paymentProof, setPaymentProof] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).single()
    if (!g) { navigate('/'); return }
    setGroup(g)

    const [pRes, bRes, iRes, isRes, bsRes] = await Promise.all([
      supabase.from('participants').select('*').eq('group_id', groupId).order('created_at'),
      supabase.from('bills').select('*').eq('group_id', groupId).order('bill_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('bill_items').select('*').eq('group_id', groupId),
      supabase.from('item_shares').select('*').eq('group_id', groupId),
      supabase.from('bill_shares').select('*').eq('group_id', groupId),
    ])
    setParticipants(pRes.data || [])
    setBills(bRes.data || [])
    setItems(iRes.data || [])
    setItemShares(isRes.data || [])
    setBillShares(bsRes.data || [])
    setLoading(false)
  }, [groupId, navigate])

  useEffect(() => {
    fetchData()
    if (!supabase) return
    const channel = supabase.channel(`member-${groupId}`)
    for (const table of ['participants', 'bills', 'bill_items', 'item_shares', 'bill_shares', 'groups']) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'groups' ? `id=eq.${groupId}` : `group_id=eq.${groupId}` },
        () => fetchData())
    }
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [groupId, fetchData])

  // Auto-link to a participant whose name matches mine (once roster loads).
  useEffect(() => {
    if (myPid || !myName || participants.length === 0) return
    const match = participants.find(p => p.name.trim().toLowerCase() === myName.trim().toLowerCase())
    if (match) { setParticipantId(groupId, match.id); setMyPid(match.id) }
  }, [participants, myName, myPid, groupId])

  const saveName = (e) => {
    e.preventDefault()
    const n = nameInput.trim()
    if (!n) return
    setName(groupId, n); setMyName(n)
  }
  const pickParticipant = (id) => { setParticipantId(groupId, id); setMyPid(id) }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { showToast('Ảnh tối đa 2MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setPaymentProof(ev.target.result)
    reader.readAsDataURL(file)
  }

  // ----- Derived -----
  const sharesByItem = groupSharesByItem(itemShares)
  const itemsOf = (billId) => items.filter(it => it.bill_id === billId)
  const sharesOf = (billId) => billShares.filter(s => s.bill_id === billId)
  const computeFor = (billId) => computeBill(itemsOf(billId), sharesByItem)
  const participantName = (id) => participants.find(p => p.id === id)?.name || '?'
  const myShareFor = (billId) => billShares.find(s => s.bill_id === billId && s.participant_id === myPid)

  const submitPayment = async (share) => {
    setSubmitting(true)
    const { error } = await supabase.from('bill_shares').update({
      payment_proof: paymentProof || null,
      payment_method: 'transfer',
      status: 'submitted',
    }).eq('id', share.id)
    if (error) showToast('Có lỗi, thử lại', 'error')
    else { showToast('Đã báo xong! Chờ chủ nhóm xác nhận ⏳'); setPaymentProof('') }
    setSubmitting(false)
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
              <input type="text" className="form-input" placeholder="Tên của bạn (VD: Lan)"
                value={nameInput} onChange={e => setNameInput(e.target.value)} maxLength={40} autoFocus />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={!nameInput.trim()}>Vào nhóm →</button>
          </form>
        </div>
        {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
      </div>
    )
  }

  const canPay = (bill) => group.status === 'active' && bill.status === 'open'

  // ----- Bill detail (member) -----
  const renderBillDetail = (bill) => {
    const { owed, total } = computeFor(bill.id)
    const shares = sharesOf(bill.id)
    const myShare = myShareFor(bill.id)
    const myAmount = myPid ? owed[myPid] || 0 : 0
    const billItems = itemsOf(bill.id)
    const di = dueInfo(bill.due_date)

    return (
      <div className="animate-slide-up">
        <button className="back-btn" onClick={() => { setOpenBillId(null); setPaymentProof('') }}>← Danh sách hoá đơn</button>
        <h2 style={{ marginBottom: 4 }}>{bill.title}</h2>
        <div className="bill-meta" style={{ marginBottom: 8 }}>
          {bill.bill_date && <span>📅 {new Date(`${bill.bill_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>}
          <DueBadge dueDate={bill.due_date} settled={myShare?.status === 'confirmed'} />
          {bill.status === 'closed' && <span className="badge badge-cash">🔒 Đã đóng</span>}
        </div>
        {bill.note && <p className="page-subtitle" style={{ textAlign: 'left', marginBottom: 12 }}>{bill.note}</p>}

        {/* My share highlight */}
        {myPid && myShare ? (
          <div className="my-share-box">
            <div className="my-share-label">Bạn ({participantName(myPid)}) cần đóng</div>
            <div className="my-share-amount">{formatVnd(myAmount)}đ</div>
            <div style={{ marginTop: 6 }}><ShareBadge share={myShare} /></div>
            {di && di.overdue && myShare.status !== 'confirmed' && (
              <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: 6 }}>⚠️ {di.label}</div>
            )}
          </div>
        ) : myPid ? (
          <div className="empty-state" style={{ padding: '16px 0' }}><p>Bạn không có phần trong hoá đơn này.</p></div>
        ) : null}

        {/* Pay box */}
        {myPid && myShare && myShare.status !== 'confirmed' && canPay(bill) && (
          <>
            {group.qr_image && (
              <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
                <h3 className="section-title" style={{ marginBottom: 12 }}>📱 QR chuyển khoản</h3>
                <img src={group.qr_image} alt="QR" className="qr-bank-image" />
              </div>
            )}
            {(group.bank_name || group.account_number) && (
              <div className="bank-info" style={{ marginBottom: 16 }}>
                {group.bank_name && <div className="bank-info-row"><span className="bank-info-label">Ngân hàng</span><span className="bank-info-value">{group.bank_name}</span></div>}
                {group.account_number && <div className="bank-info-row"><span className="bank-info-label">Số tài khoản</span><span className="bank-info-value">{group.account_number}</span></div>}
                {group.account_holder && <div className="bank-info-row"><span className="bank-info-label">Chủ tài khoản</span><span className="bank-info-value">{group.account_holder}</span></div>}
                <div className="bank-info-row"><span className="bank-info-label">Số tiền</span>
                  <span className="bank-info-value" style={{ color: 'var(--accent-start)', fontSize: '1.1rem' }}>{formatVnd(myAmount)}đ</span></div>
              </div>
            )}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 className="section-title" style={{ marginBottom: 6 }}>📸 Ảnh chuyển khoản (tùy chọn)</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12 }}>Có thể bấm “Done” luôn mà không cần up ảnh.</p>
              <div className={`upload-area ${paymentProof ? 'has-image' : ''}`} onClick={() => document.getElementById('proof-upload').click()}>
                {paymentProof ? <img src={paymentProof} alt="proof" className="upload-preview" /> : (
                  <><span className="upload-icon">📷</span><p className="upload-text"><span>Bấm để upload</span> ảnh</p></>
                )}
              </div>
              <input id="proof-upload" type="file" className="upload-input" accept="image/*" onChange={handleImageUpload} />
              {paymentProof && <button className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setPaymentProof('')}>🗑️ Chọn ảnh khác</button>}
            </div>
            <button className="btn btn-primary btn-block btn-lg" onClick={() => submitPayment(myShare)} disabled={submitting}>
              {submitting ? <span className="spinner"></span> : '✅ Done · Tôi đã đóng'}
            </button>
          </>
        )}
        {myShare && myShare.status === 'submitted' && (
          <div className="status-banner active" style={{ marginTop: 4 }}>⏳ Đã báo, chờ chủ nhóm xác nhận</div>
        )}
        {myShare && myShare.status === 'confirmed' && (
          <div className="status-banner active" style={{ marginTop: 4 }}>🎉 Đã được xác nhận!</div>
        )}
        {myShare && myShare.status !== 'confirmed' && !canPay(bill) && (
          <div className="status-banner closed" style={{ marginTop: 4 }}>🔴 Hoá đơn đã đóng, không thể báo</div>
        )}

        {/* Full breakdown */}
        <div className="divider"></div>
        <h3 className="section-title" style={{ marginBottom: 10 }}>🍽️ Chi tiết món</h3>
        <div className="card" style={{ marginBottom: 16 }}>
          {billItems.map(it => {
            const sharers = sharesByItem[it.id] || []
            return (
              <div key={it.id} className="detail-item-row">
                <div>
                  <div className="detail-item-name">{it.name} {Number(it.qty) > 1 && <span className="detail-item-qty">×{Number(it.qty)}</span>}</div>
                  <div className="detail-item-sub">{sharers.length ? sharers.map(participantName).join(', ') : 'chưa gán'}</div>
                </div>
                <div className="detail-item-price">{formatVnd(Number(it.price) * Number(it.qty))}đ</div>
              </div>
            )
          })}
          <div className="detail-item-row" style={{ borderTop: '1px solid var(--border-glass)' }}>
            <div className="detail-item-name">Tổng</div>
            <div className="detail-item-price" style={{ color: 'var(--accent-start)' }}>{formatVnd(total)}đ</div>
          </div>
        </div>
        <h3 className="section-title" style={{ marginBottom: 10 }}>👥 Mọi người</h3>
        {shares.map(s => (
          <div key={s.id} className="member-card">
            <div className="member-avatar">{participantName(s.participant_id).charAt(0).toUpperCase()}</div>
            <div className="member-info">
              <div className="member-name">{participantName(s.participant_id)}{s.participant_id === myPid && ' (bạn)'}</div>
              <div className="member-amount">{formatVnd(owed[s.participant_id] || 0)}đ</div>
            </div>
            <ShareBadge share={s} />
          </div>
        ))}
      </div>
    )
  }

  const openBill = openBillId ? bills.find(b => b.id === openBillId) : null

  return (
    <div className="container">
      <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>

      <div className="animate-fade-in">
        <h1 className="page-title">{group.name}</h1>
        <p className="page-subtitle">Chủ nhóm: {group.owner_name} • Bạn: {myName}</p>
      </div>

      <div className={`status-banner ${group.status}`}>
        {group.status === 'planning' && '📝 Đang lên kế hoạch · chờ chủ nhóm tạo hoá đơn'}
        {group.status === 'active' && '🟢 Nhóm đang mở'}
        {group.status === 'closed' && '🔴 Nhóm đã đóng'}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>💬 Chat</button>
        <button className={`tab ${tab === 'bill' ? 'active' : ''}`} onClick={() => setTab('bill')}>
          🧾 Hoá đơn{bills.length > 0 && <span className="tab-badge" style={{ background: 'var(--accent-gradient)' }}>{bills.length}</span>}
        </button>
      </div>

      {tab === 'chat' && <Chat groupId={groupId} senderName={myName} isOwner={false} />}

      {tab === 'bill' && (
        <div className="animate-slide-up">
          {/* Who am I picker */}
          {!myPid && participants.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 className="section-title" style={{ fontSize: '0.95rem', marginBottom: 4 }}>Bạn là ai trong nhóm?</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 12 }}>Chọn tên của bạn để xem phần mình cần đóng.</p>
              <div className="roster-chips">
                {participants.map(p => (
                  <button key={p.id} className="assign-chip" onClick={() => pickParticipant(p.id)}>{p.name}</button>
                ))}
              </div>
            </div>
          )}
          {myPid && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12 }}>
              Bạn là <strong style={{ color: 'var(--text-secondary)' }}>{participantName(myPid)}</strong> ·{' '}
              <button className="link-btn" onClick={() => { setParticipantId(groupId, ''); setMyPid('') }}>đổi</button>
            </p>
          )}

          {openBill ? renderBillDetail(openBill) : (
            bills.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">⏳</span>
                <p>Chưa có hoá đơn nào. Vào <strong>Chat</strong> để cùng lên kế hoạch nhé!</p>
              </div>
            ) : (
              bills.map(bill => {
                const { total } = computeFor(bill.id)
                const myShare = myShareFor(bill.id)
                const myAmount = myPid ? computeFor(bill.id).owed[myPid] || 0 : 0
                return (
                  <div key={bill.id} className="bill-list-card" onClick={() => { setOpenBillId(bill.id); setPaymentProof('') }}>
                    <div className="bill-list-top">
                      <div className="bill-list-title">{bill.title}</div>
                      <div className="bill-list-total">{formatVnd(total)}đ</div>
                    </div>
                    <div className="bill-meta">
                      {bill.bill_date && <span>📅 {new Date(`${bill.bill_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>}
                      <DueBadge dueDate={bill.due_date} settled={myShare?.status === 'confirmed'} />
                      {bill.status === 'closed' && <span className="badge badge-cash">🔒</span>}
                    </div>
                    {myPid && myShare && (
                      <div className="bill-list-myrow">
                        <span>Bạn: <strong style={{ color: 'var(--accent-start)' }}>{formatVnd(myAmount)}đ</strong></span>
                        <ShareBadge share={myShare} />
                      </div>
                    )}
                  </div>
                )
              })
            )
          )}
        </div>
      )}

      {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
