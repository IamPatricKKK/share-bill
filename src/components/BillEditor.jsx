import { useMemo, useState } from 'react'
import { computeBill, groupSharesByItem, formatVnd, lineTotal, todayISO } from '../lib/bills'

// Owner-facing form to create or edit one invoice (hoá đơn).
// Each line item can be assigned to one or more participants who split it.
// onSave receives { title, billDate, dueDate, note, items: [{id?, name, price, qty, note, assignedIds}] }
export default function BillEditor({ participants, initial, onSave, onCancel, onAddParticipant }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [billDate, setBillDate] = useState(initial?.bill_date || todayISO())
  const [dueDate, setDueDate] = useState(initial?.due_date || '')
  const [note, setNote] = useState(initial?.note || '')
  const [items, setItems] = useState(
    initial?.items?.length
      ? initial.items.map(it => ({
          id: it.id,
          name: it.name || '',
          price: it.price != null ? String(it.price) : '',
          qty: it.qty != null ? String(it.qty) : '1',
          note: it.note || '',
          assignedIds: it.assignedIds || [],
        }))
      : [{ name: '', price: '', qty: '1', note: '', assignedIds: [] }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newPersonName, setNewPersonName] = useState('')

  const updateItem = (idx, field, value) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }
  const addItem = () => setItems([...items, { name: '', price: '', qty: '1', note: '', assignedIds: [] }])
  const removeItem = (idx) => {
    if (items.length <= 1) { setItems([{ name: '', price: '', qty: '1', note: '', assignedIds: [] }]); return }
    setItems(items.filter((_, i) => i !== idx))
  }
  const toggleAssign = (idx, pid) => {
    setItems(items.map((it, i) => {
      if (i !== idx) return it
      const has = it.assignedIds.includes(pid)
      return { ...it, assignedIds: has ? it.assignedIds.filter(x => x !== pid) : [...it.assignedIds, pid] }
    }))
  }
  const assignAll = (idx) => {
    const allIds = participants.map(p => p.id)
    setItems(items.map((it, i) => {
      if (i !== idx) return it
      const isAll = allIds.length > 0 && allIds.every(id => it.assignedIds.includes(id))
      return { ...it, assignedIds: isAll ? [] : allIds }
    }))
  }

  const addPerson = async () => {
    const n = newPersonName.trim()
    if (!n) return
    await onAddParticipant(n)
    setNewPersonName('')
  }

  // Live per-person preview from current (unsaved) item state.
  const preview = useMemo(() => {
    const fakeItems = items.map((it, i) => ({ id: i, price: it.price, qty: it.qty }))
    const sharesByItem = {}
    items.forEach((it, i) => { sharesByItem[i] = it.assignedIds })
    return computeBill(fakeItems, sharesByItem)
  }, [items])

  const handleSave = async () => {
    setError('')
    if (!title.trim()) { setError('Nhập tên hoá đơn (vd: Ăn lẩu 1/7)'); return }
    const validItems = items.filter(it => it.name.trim() && it.price !== '')
    if (validItems.length === 0) { setError('Cần ít nhất 1 món có tên và giá'); return }
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        billDate: billDate || null,
        dueDate: dueDate || null,
        note: note.trim() || null,
        items: validItems.map(it => ({
          id: it.id,
          name: it.name.trim(),
          price: Number(it.price) || 0,
          qty: Number(it.qty) || 1,
          note: it.note.trim() || null,
          assignedIds: it.assignedIds,
        })),
      })
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra khi lưu')
      setSaving(false)
    }
  }

  return (
    <div className="animate-slide-up">
      <button className="back-btn" onClick={onCancel}>← Huỷ</button>
      <h2 style={{ marginBottom: 16 }}>{initial ? '✏️ Sửa hoá đơn' : '🧾 Hoá đơn mới'}</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">Tên hoá đơn</label>
          <input type="text" className="form-input" placeholder="VD: Ăn lẩu tối 1/7"
            value={title} onChange={e => setTitle(e.target.value)} maxLength={80} autoFocus />
        </div>
        <div className="bill-date-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Ngày hoá đơn</label>
            <input type="date" className="form-input" value={billDate} onChange={e => setBillDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Hạn trả</label>
            <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0, marginTop: 16 }}>
          <label className="form-label">Ghi chú (tùy chọn)</label>
          <input type="text" className="form-input" placeholder="VD: Quán Lẩu Ph24"
            value={note} onChange={e => setNote(e.target.value)} maxLength={120} />
        </div>
      </div>

      {/* Participants quick-add */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ fontSize: '0.95rem', marginBottom: 10 }}>
          👥 Người tham gia ({participants.length})
        </h3>
        {participants.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 10 }}>
            Thêm người trước, rồi gán món cho từng người bên dưới.
          </p>
        )}
        <div className="member-form-row" style={{ marginBottom: 0 }}>
          <input type="text" className="form-input" placeholder="Thêm tên người..."
            value={newPersonName} onChange={e => setNewPersonName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } }} maxLength={40} />
          <button className="btn btn-sm btn-primary" style={{ height: 44 }}
            onClick={addPerson} disabled={!newPersonName.trim()}>＋</button>
        </div>
      </div>

      {/* Items */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <h3 className="section-title" style={{ fontSize: '0.95rem' }}>🍽️ Các món ({items.length})</h3>
          <button className="btn btn-sm btn-secondary" onClick={addItem}>+ Thêm món</button>
        </div>

        {items.map((it, idx) => (
          <div key={idx} className="bill-item-editor">
            <div className="bill-item-head">
              <input type="text" className="form-input" placeholder={`Tên món ${idx + 1}`}
                value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} />
              <button className="remove-member-btn" onClick={() => removeItem(idx)} title="Xóa món">✕</button>
            </div>
            <div className="bill-item-nums">
              <input type="number" className="form-input" placeholder="Giá"
                value={it.price} onChange={e => updateItem(idx, 'price', e.target.value)} />
              <span className="bill-item-x">×</span>
              <input type="number" className="form-input bill-item-qty" placeholder="SL" min="1"
                value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} />
              <span className="bill-item-line">= {formatVnd(lineTotal({ price: it.price, qty: it.qty }))}đ</span>
            </div>
            {participants.length > 0 && (
              <div className="assign-chips">
                <button
                  className={`assign-chip all ${participants.every(p => it.assignedIds.includes(p.id)) ? 'on' : ''}`}
                  onClick={() => assignAll(idx)}>Tất cả</button>
                {participants.map(p => (
                  <button key={p.id}
                    className={`assign-chip ${it.assignedIds.includes(p.id) ? 'on' : ''}`}
                    onClick={() => toggleAssign(idx, p.id)}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Preview */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="bank-info-row">
          <span className="bank-info-label">Tổng hoá đơn</span>
          <span className="bank-info-value" style={{ color: 'var(--accent-start)' }}>{formatVnd(preview.total)}đ</span>
        </div>
        {preview.unassigned > 0 && (
          <div className="bank-info-row">
            <span className="bank-info-label">Chưa gán cho ai</span>
            <span className="bank-info-value" style={{ color: 'var(--warning)' }}>{formatVnd(preview.unassigned)}đ</span>
          </div>
        )}
        {participants.filter(p => preview.owed[p.id]).map(p => (
          <div key={p.id} className="bank-info-row">
            <span className="bank-info-label">{p.name}</span>
            <span className="bank-info-value">{formatVnd(preview.owed[p.id])}đ</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16,
          color: 'var(--danger)', fontSize: '0.9rem', textAlign: 'center'
        }}>{error}</div>
      )}

      <button className="btn btn-primary btn-block btn-lg" onClick={handleSave} disabled={saving}>
        {saving ? <span className="spinner"></span> : (initial ? '💾 Lưu thay đổi' : '✅ Tạo hoá đơn')}
      </button>
    </div>
  )
}
