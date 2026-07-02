import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { getName } from '../lib/identity'
import { computeBill, groupSharesByItem, formatVnd, dueInfo } from '../lib/bills'
import Chat from '../components/Chat'
import BillEditor from '../components/BillEditor'
import { DueBadge, ShareBadge } from '../components/BillCard'

export default function GroupOwner() {
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
  const [proofModal, setProofModal] = useState(null)
  const [tab, setTab] = useState('chat')

  // Bills view: { mode: 'list' | 'create' | 'edit' | 'detail', billId }
  const [view, setView] = useState({ mode: 'list' })

  // Account / QR editor
  const [editAccount, setEditAccount] = useState(false)
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [qrImage, setQrImage] = useState('')

  const ownerName = group?.owner_name || getName(groupId) || 'Chủ nhóm'

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
    const channel = supabase.channel(`owner-${groupId}`)
    for (const table of ['participants', 'bills', 'bill_items', 'item_shares', 'bill_shares', 'groups']) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'groups' ? `id=eq.${groupId}` : `group_id=eq.${groupId}` },
        () => fetchData())
    }
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [groupId, fetchData])

  // ----- Derived per-bill data -----
  const sharesByItem = groupSharesByItem(itemShares)
  const itemsOf = (billId) => items.filter(it => it.bill_id === billId)
  const sharesOf = (billId) => billShares.filter(s => s.bill_id === billId)
  const computeFor = (billId) => computeBill(itemsOf(billId), sharesByItem)
  const participantName = (id) => participants.find(p => p.id === id)?.name || '?'

  // ----- Participants -----
  const addParticipant = async (name) => {
    const n = name.trim()
    if (!n) return
    if (participants.some(p => p.name.trim().toLowerCase() === n.toLowerCase())) {
      showToast('Người này đã có trong danh sách', 'error'); return
    }
    const { error } = await supabase.from('participants').insert({ group_id: groupId, name: n })
    if (error) { showToast('Lỗi khi thêm người', 'error'); return }
    await fetchData()
  }
  const removeParticipant = async (id) => {
    if (!window.confirm('Xoá người này khỏi nhóm? Phần chia của họ trong các hoá đơn sẽ bị xoá.')) return
    await supabase.from('participants').delete().eq('id', id)
    showToast('Đã xoá người')
    fetchData()
  }

  // ----- Bill write helpers -----
  const writeItems = async (billId, payloadItems) => {
    for (const it of payloadItems) {
      const { data: itemRow, error } = await supabase.from('bill_items')
        .insert({ group_id: groupId, bill_id: billId, name: it.name, price: it.price, qty: it.qty, note: it.note })
        .select().single()
      if (error) throw error
      if (it.assignedIds.length) {
        const { error: sErr } = await supabase.from('item_shares')
          .insert(it.assignedIds.map(pid => ({ group_id: groupId, item_id: itemRow.id, participant_id: pid })))
        if (sErr) throw sErr
      }
    }
  }

  const owedFromPayload = (payloadItems) => {
    const owed = {}
    for (const it of payloadItems) {
      const lt = (Number(it.price) || 0) * (Number(it.qty) || 1)
      if (!it.assignedIds.length) continue
      const per = lt / it.assignedIds.length
      for (const pid of it.assignedIds) owed[pid] = (owed[pid] || 0) + per
    }
    return owed
  }

  const syncBillShares = async (billId, owed) => {
    const owingIds = Object.keys(owed)
    const { data: existing } = await supabase.from('bill_shares').select('*').eq('bill_id', billId)
    const existingIds = new Set((existing || []).map(s => s.participant_id))
    const toInsert = owingIds.filter(pid => !existingIds.has(pid))
      .map(pid => ({ group_id: groupId, bill_id: billId, participant_id: pid, status: 'pending', payment_method: 'none' }))
    if (toInsert.length) await supabase.from('bill_shares').insert(toInsert)
    const toDelete = (existing || []).filter(s => !owingIds.includes(s.participant_id)).map(s => s.id)
    if (toDelete.length) await supabase.from('bill_shares').delete().in('id', toDelete)
  }

  const createBill = async (payload) => {
    const { data: bill, error } = await supabase.from('bills')
      .insert({ group_id: groupId, title: payload.title, bill_date: payload.billDate, due_date: payload.dueDate, note: payload.note, status: 'open' })
      .select().single()
    if (error) throw error
    await writeItems(bill.id, payload.items)
    await syncBillShares(bill.id, owedFromPayload(payload.items))
    if (group.status === 'planning') await supabase.from('groups').update({ status: 'active' }).eq('id', groupId)
    showToast('Đã tạo hoá đơn 🎉')
    setView({ mode: 'detail', billId: bill.id })
    fetchData()
  }

  const updateBill = async (billId, payload) => {
    const { error } = await supabase.from('bills')
      .update({ title: payload.title, bill_date: payload.billDate, due_date: payload.dueDate, note: payload.note })
      .eq('id', billId)
    if (error) throw error
    await supabase.from('bill_items').delete().eq('bill_id', billId) // cascades item_shares
    await writeItems(billId, payload.items)
    await syncBillShares(billId, owedFromPayload(payload.items))
    showToast('Đã lưu thay đổi ✓')
    setView({ mode: 'detail', billId })
    fetchData()
  }

  // ----- Bill / share actions -----
  const confirmShare = async (shareId) => {
    await supabase.from('bill_shares').update({ status: 'confirmed' }).eq('id', shareId)
    showToast('Đã xác nhận ✓'); fetchData()
  }
  const markCashShare = async (shareId) => {
    await supabase.from('bill_shares').update({ status: 'confirmed', payment_method: 'cash' }).eq('id', shareId)
    showToast('Đã ghi nhận tiền mặt 💵'); fetchData()
  }
  const unconfirmShare = async (shareId) => {
    await supabase.from('bill_shares').update({ status: 'pending', payment_method: 'none' }).eq('id', shareId)
    showToast('Đã huỷ xác nhận'); fetchData()
  }
  const closeBill = async (billId) => {
    await supabase.from('bills').update({ status: 'closed' }).eq('id', billId)
    showToast('Đã đóng hoá đơn'); fetchData()
  }
  const reopenBill = async (billId) => {
    await supabase.from('bills').update({ status: 'open' }).eq('id', billId)
    showToast('Đã mở lại hoá đơn'); fetchData()
  }
  const deleteBill = async (billId) => {
    if (!window.confirm('Xoá hoá đơn này? Không thể hoàn tác.')) return
    await supabase.from('bills').delete().eq('id', billId) // cascades items/shares
    showToast('Đã xoá hoá đơn')
    setView({ mode: 'list' }); fetchData()
  }

  // ----- Account / QR -----
  const startEditAccount = () => {
    setBankName(group.bank_name || '')
    setAccountNumber(group.account_number || '')
    setAccountHolder(group.account_holder || '')
    setQrImage(group.qr_image || '')
    setEditAccount(true)
  }
  const handleQrUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { showToast('Ảnh QR tối đa 2MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setQrImage(ev.target.result)
    reader.readAsDataURL(file)
  }
  const saveAccount = async () => {
    await supabase.from('groups').update({
      bank_name: bankName.trim() || null,
      account_number: accountNumber.trim() || null,
      account_holder: accountHolder.trim() || null,
      qr_image: qrImage || null,
    }).eq('id', groupId)
    setEditAccount(false)
    showToast('Đã lưu thông tin chuyển khoản')
    fetchData()
  }

  // ----- Room actions -----
  const closeGroup = async () => {
    if (!window.confirm('Đóng nhóm? Thành viên sẽ không đóng tiền được nữa.')) return
    await supabase.from('groups').update({ status: 'closed' }).eq('id', groupId)
    showToast('Đã đóng nhóm'); fetchData()
  }
  const reopenGroup = async () => {
    await supabase.from('groups').update({ status: 'active' }).eq('id', groupId)
    showToast('Đã mở lại nhóm'); fetchData()
  }
  const deleteGroup = async () => {
    if (!window.confirm('Xóa nhóm vĩnh viễn? Hành động này không thể hoàn tác.')) return
    await supabase.from('messages').delete().eq('group_id', groupId)
    await supabase.from('groups').delete().eq('id', groupId) // cascades all bill tables
    navigate('/')
  }

  const copyLink = () => { navigator.clipboard.writeText(`${window.location.origin}/group/${groupId}`); showToast('Đã copy link! 📋') }
  const copyCode = () => { navigator.clipboard.writeText(group.group_code); showToast('Đã copy mã nhóm! 📋') }

  if (loading) {
    return (
      <div className="container loading-page">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-secondary)' }}>Đang tải...</p>
      </div>
    )
  }

  const shareLink = `${window.location.origin}/group/${groupId}`
  const totalSubmitted = billShares.filter(s => s.status === 'submitted').length
  const hasAccount = group.bank_name || group.account_number || group.qr_image

  // chat-derived names not yet participants (quick suggestions handled in editor via add)

  // ---------- Bill detail renderer ----------
  const renderDetail = (bill) => {
    const { owed, total, unassigned } = computeFor(bill.id)
    const shares = sharesOf(bill.id)
    const shareByPid = Object.fromEntries(shares.map(s => [s.participant_id, s]))
    const confirmedAmt = shares.filter(s => s.status === 'confirmed').reduce((sum, s) => sum + (owed[s.participant_id] || 0), 0)
    const confirmedCount = shares.filter(s => s.status === 'confirmed').length
    const billItems = itemsOf(bill.id)
    const di = dueInfo(bill.due_date)
    const allSettled = shares.length > 0 && confirmedCount === shares.length

    return (
      <div className="animate-slide-up">
        <button className="back-btn" onClick={() => setView({ mode: 'list' })}>← Danh sách hoá đơn</button>

        <div className="bill-detail-head">
          <h2 style={{ marginBottom: 4 }}>{bill.title}</h2>
          <div className="bill-meta">
            {bill.bill_date && <span>📅 {new Date(`${bill.bill_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>}
            <DueBadge dueDate={bill.due_date} settled={allSettled} />
            {bill.status === 'closed' && <span className="badge badge-cash">🔒 Đã đóng</span>}
          </div>
          {bill.note && <p className="page-subtitle" style={{ textAlign: 'left', marginTop: 6 }}>{bill.note}</p>}
          {di && di.overdue && !allSettled && (
            <div className="status-banner closed" style={{ marginTop: 10 }}>⚠️ Hoá đơn đã {di.label.toLowerCase()}</div>
          )}
        </div>

        <div className="progress-bar-wrapper">
          <div className="progress-bar-label">
            <span>Đã đóng {confirmedCount}/{shares.length}</span>
            <span>{formatVnd(confirmedAmt)} / {formatVnd(total)}đ</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${total > 0 ? Math.round((confirmedAmt / total) * 100) : 0}%` }}></div>
          </div>
        </div>

        {/* Items breakdown */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ fontSize: '0.95rem', marginBottom: 10 }}>🍽️ Chi tiết món</h3>
          {billItems.map(it => {
            const sharers = sharesByItem[it.id] || []
            return (
              <div key={it.id} className="detail-item-row">
                <div>
                  <div className="detail-item-name">{it.name} {Number(it.qty) > 1 && <span className="detail-item-qty">×{Number(it.qty)}</span>}</div>
                  <div className="detail-item-sub">
                    {sharers.length ? sharers.map(participantName).join(', ') : <span style={{ color: 'var(--warning)' }}>chưa gán ai</span>}
                  </div>
                </div>
                <div className="detail-item-price">{formatVnd(Number(it.price) * Number(it.qty))}đ</div>
              </div>
            )
          })}
          {unassigned > 0 && (
            <div className="detail-item-row">
              <div className="detail-item-name" style={{ color: 'var(--warning)' }}>Chưa gán cho ai</div>
              <div className="detail-item-price" style={{ color: 'var(--warning)' }}>{formatVnd(unassigned)}đ</div>
            </div>
          )}
        </div>

        {/* Per-person */}
        <h3 className="section-title" style={{ margin: '4px 0 8px' }}>👥 Ai trả bao nhiêu</h3>
        {shares.length === 0 && <div className="empty-state"><p>Chưa gán món cho ai. Bấm “Sửa” để gán.</p></div>}
        {shares.map(s => {
          const amt = owed[s.participant_id] || 0
          return (
            <div key={s.id} className="member-card">
              <div className="member-avatar">{participantName(s.participant_id).charAt(0).toUpperCase()}</div>
              <div className="member-info">
                <div className="member-name">{participantName(s.participant_id)}</div>
                <div className="member-amount">{formatVnd(amt)}đ</div>
                <div style={{ marginTop: 4 }}><ShareBadge share={s} /></div>
              </div>
              <div className="member-actions">
                {s.status === 'submitted' && s.payment_proof && (
                  <button className="btn btn-sm btn-secondary" onClick={() => setProofModal({ ...s, name: participantName(s.participant_id) })}>🖼️ Ảnh</button>
                )}
                {s.status !== 'confirmed' && (
                  <button className="btn btn-sm btn-success" onClick={() => confirmShare(s.id)}>✓ Xác nhận</button>
                )}
                {s.status === 'pending' && (
                  <button className="btn btn-sm btn-warning" onClick={() => markCashShare(s.id)}>💵 Tiền mặt</button>
                )}
                {s.status === 'confirmed' && (
                  <button className="btn btn-sm btn-secondary" onClick={() => unconfirmShare(s.id)}>↩︎ Huỷ</button>
                )}
              </div>
            </div>
          )
        })}

        <div className="divider"></div>
        <div className="action-row">
          <button className="btn btn-secondary" onClick={() => setView({ mode: 'edit', billId: bill.id })}>✏️ Sửa</button>
          {bill.status === 'open'
            ? <button className="btn btn-warning" onClick={() => closeBill(bill.id)}>🔒 Đóng</button>
            : <button className="btn btn-success" onClick={() => reopenBill(bill.id)}>🔓 Mở lại</button>}
          <button className="btn btn-danger" onClick={() => deleteBill(bill.id)}>🗑️ Xoá</button>
        </div>
      </div>
    )
  }

  // ---------- Bills list ----------
  const renderBillsList = () => (
    <div className="animate-slide-up">
      {/* Roster */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ fontSize: '0.95rem', marginBottom: 10 }}>👥 Người trong nhóm ({participants.length})</h3>
        {participants.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Chưa có ai. Khi tạo hoá đơn bạn có thể thêm người và gán món cho họ.
          </p>
        ) : (
          <div className="roster-chips">
            {participants.map(p => (
              <span key={p.id} className="roster-chip">
                {p.name}
                <button onClick={() => removeParticipant(p.id)} title="Xoá">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-block btn-lg" style={{ marginBottom: 16 }}
        onClick={() => setView({ mode: 'create' })} disabled={group.status === 'closed'}>
        ＋ Tạo hoá đơn mới
      </button>

      {bills.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🧾</span>
          <p>Chưa có hoá đơn nào. Bàn bạc trong <strong>Chat</strong> rồi tạo hoá đơn khi chốt!</p>
        </div>
      ) : (
        bills.map(bill => {
          const { total } = computeFor(bill.id)
          const shares = sharesOf(bill.id)
          const confirmedCount = shares.filter(s => s.status === 'confirmed').length
          const allSettled = shares.length > 0 && confirmedCount === shares.length
          return (
            <div key={bill.id} className="bill-list-card" onClick={() => setView({ mode: 'detail', billId: bill.id })}>
              <div className="bill-list-top">
                <div className="bill-list-title">{bill.title}</div>
                <div className="bill-list-total">{formatVnd(total)}đ</div>
              </div>
              <div className="bill-meta">
                {bill.bill_date && <span>📅 {new Date(`${bill.bill_date}T00:00:00`).toLocaleDateString('vi-VN')}</span>}
                <DueBadge dueDate={bill.due_date} settled={allSettled} />
                {bill.status === 'closed' && <span className="badge badge-cash">🔒 Đã đóng</span>}
              </div>
              <div className="bill-list-progress">
                {allSettled
                  ? <span style={{ color: 'var(--success)' }}>✓ Mọi người đã đóng</span>
                  : <span>Đã đóng {confirmedCount}/{shares.length} người</span>}
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  const currentBill = view.billId ? bills.find(b => b.id === view.billId) : null
  const editorInitial = view.mode === 'edit' && currentBill ? {
    ...currentBill,
    items: itemsOf(currentBill.id).map(it => ({
      id: it.id, name: it.name, price: it.price, qty: it.qty, note: it.note,
      assignedIds: sharesByItem[it.id] || [],
    })),
  } : null

  return (
    <div className="container">
      <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>

      <div className="animate-fade-in">
        <h1 className="page-title">{group.name}</h1>
        <p className="page-subtitle">Chủ nhóm: {group.owner_name} 👑</p>
      </div>

      <div className={`status-banner ${group.status}`}>
        {group.status === 'planning' && '📝 Đang lên kế hoạch · chưa có hoá đơn'}
        {group.status === 'active' && '🟢 Nhóm đang mở'}
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
        <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>💬 Chat</button>
        <button className={`tab ${tab === 'bill' ? 'active' : ''}`} onClick={() => setTab('bill')}>
          🧾 Hoá đơn{bills.length > 0 && <span className="tab-badge" style={{ background: 'var(--accent-gradient)' }}>{bills.length}</span>}
          {totalSubmitted > 0 && <span className="tab-badge">{totalSubmitted}</span>}
        </button>
        <button className={`tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>💳 TK</button>
      </div>

      {tab === 'chat' && <Chat groupId={groupId} senderName={ownerName} isOwner={true} />}

      {tab === 'bill' && (
        <>
          {view.mode === 'list' && renderBillsList()}
          {view.mode === 'create' && (
            <BillEditor participants={participants} onSave={createBill}
              onCancel={() => setView({ mode: 'list' })} onAddParticipant={addParticipant} />
          )}
          {view.mode === 'edit' && currentBill && (
            <BillEditor participants={participants} initial={editorInitial}
              onSave={(p) => updateBill(currentBill.id, p)}
              onCancel={() => setView({ mode: 'detail', billId: currentBill.id })} onAddParticipant={addParticipant} />
          )}
          {view.mode === 'detail' && currentBill && renderDetail(currentBill)}
          {view.mode === 'detail' && !currentBill && renderBillsList()}
        </>
      )}

      {/* Account tab */}
      {tab === 'account' && (
        <div className="animate-slide-up">
          {!editAccount ? (
            <>
              {group.qr_image && (
                <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
                  <h3 className="section-title" style={{ marginBottom: 12 }}>📱 QR chuyển khoản</h3>
                  <img src={group.qr_image} alt="QR" className="qr-bank-image" />
                </div>
              )}
              {(group.bank_name || group.account_number) ? (
                <div className="bank-info" style={{ marginBottom: 16 }}>
                  {group.bank_name && <div className="bank-info-row"><span className="bank-info-label">Ngân hàng</span><span className="bank-info-value">{group.bank_name}</span></div>}
                  {group.account_number && <div className="bank-info-row"><span className="bank-info-label">Số tài khoản</span><span className="bank-info-value">{group.account_number}</span></div>}
                  {group.account_holder && <div className="bank-info-row"><span className="bank-info-label">Chủ tài khoản</span><span className="bank-info-value">{group.account_holder}</span></div>}
                </div>
              ) : (
                <div className="empty-state"><span className="empty-state-icon">💳</span><p>Chưa có thông tin chuyển khoản. Thêm để mọi người chuyển tiền.</p></div>
              )}
              <button className="btn btn-primary btn-block" onClick={startEditAccount}>
                {hasAccount ? '✏️ Sửa thông tin chuyển khoản' : '＋ Thêm thông tin chuyển khoản'}
              </button>
            </>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 className="section-title" style={{ marginBottom: 16 }}>📱 QR chuyển khoản</h3>
                <div className={`upload-area ${qrImage ? 'has-image' : ''}`} onClick={() => document.getElementById('qr-upload').click()}>
                  {qrImage ? <img src={qrImage} alt="QR" className="upload-preview" /> : (
                    <><span className="upload-icon">📷</span><p className="upload-text"><span>Bấm để upload</span> ảnh QR</p></>
                  )}
                </div>
                <input id="qr-upload" type="file" className="upload-input" accept="image/*" onChange={handleQrUpload} />
                {qrImage && <button className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => setQrImage('')}>🗑️ Xóa ảnh QR</button>}

                <h3 className="section-title" style={{ margin: '20px 0 16px' }}>🏦 Tài khoản</h3>
                <div className="form-group"><label className="form-label">Tên ngân hàng</label>
                  <input type="text" className="form-input" placeholder="VD: Vietcombank" value={bankName} onChange={e => setBankName(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Số tài khoản</label>
                  <input type="text" className="form-input" placeholder="VD: 1234567890" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Tên chủ tài khoản</label>
                  <input type="text" className="form-input" placeholder="VD: NGUYEN VAN A" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} /></div>
              </div>
              <div className="action-row">
                <button className="btn btn-secondary" onClick={() => setEditAccount(false)}>Huỷ</button>
                <button className="btn btn-primary" onClick={saveAccount}>💾 Lưu</button>
              </div>
            </>
          )}

          <div className="divider"></div>
          <div className="action-row">
            {group.status !== 'closed'
              ? <button className="btn btn-danger" onClick={closeGroup}>🔒 Đóng nhóm</button>
              : <button className="btn btn-success" onClick={reopenGroup}>🔓 Mở lại nhóm</button>}
            <button className="btn btn-danger" onClick={deleteGroup}>🗑️ Xóa nhóm</button>
          </div>
        </div>
      )}

      {/* Proof modal */}
      {proofModal && (
        <div className="modal-overlay" onClick={() => setProofModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Ảnh chuyển khoản - {proofModal.name}</h3>
            <img src={proofModal.payment_proof} alt="Payment proof" />
            <div className="action-row" style={{ marginTop: 16 }}>
              <button className="btn btn-success" onClick={() => { confirmShare(proofModal.id); setProofModal(null) }}>✓ Xác nhận</button>
              <button className="btn btn-secondary" onClick={() => setProofModal(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast show ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
