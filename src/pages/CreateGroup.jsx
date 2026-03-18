import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function CreateGroup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Group info
  const [groupName, setGroupName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [totalAmount, setTotalAmount] = useState('')

  // Step 2: Members
  const [members, setMembers] = useState([{ name: '', amount: '' }])

  // Step 3: Bank info
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [qrImage, setQrImage] = useState('')

  const addMember = () => {
    if (members.length >= 30) return
    setMembers([...members, { name: '', amount: '' }])
  }

  const removeMember = (idx) => {
    if (members.length <= 1) return
    setMembers(members.filter((_, i) => i !== idx))
  }

  const updateMember = (idx, field, value) => {
    const updated = [...members]
    updated[idx][field] = value
    setMembers(updated)
  }

  const splitEvenly = () => {
    if (!totalAmount) return
    const validMembers = members.filter(m => m.name.trim())
    if (validMembers.length === 0) return
    const perPerson = Math.ceil(Number(totalAmount) / validMembers.length)
    const updated = members.map(m => ({
      ...m,
      amount: m.name.trim() ? String(perPerson) : m.amount
    }))
    setMembers(updated)
  }

  const handleQrUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError('Ảnh QR không được vượt quá 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => setQrImage(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    setLoading(true)
    setError('')

    const validMembers = members.filter(m => m.name.trim() && m.amount)
    if (validMembers.length === 0) {
      setError('Cần ít nhất 1 thành viên')
      setLoading(false)
      return
    }

    if (!bankName && !accountNumber && !qrImage) {
      setError('Vui lòng nhập thông tin ngân hàng hoặc upload QR')
      setLoading(false)
      return
    }

    if (!supabase) {
      setError('⚠️ Chưa cấu hình Supabase! Vui lòng điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào file .env rồi restart server.')
      setLoading(false)
      return
    }

    try {
      const groupCode = generateCode()

      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .insert({
          group_code: groupCode,
          name: groupName.trim(),
          owner_name: ownerName.trim(),
          total_amount: Number(totalAmount),
          bank_name: bankName.trim() || null,
          account_number: accountNumber.trim() || null,
          account_holder: accountHolder.trim() || null,
          qr_image: qrImage || null,
          status: 'active',
        })
        .select()
        .single()

      if (groupErr) throw groupErr

      const memberInserts = validMembers.map(m => ({
        group_id: group.id,
        name: m.name.trim(),
        amount: Number(m.amount),
        payment_method: 'none',
        status: 'pending',
      }))

      const { error: memberErr } = await supabase
        .from('members')
        .insert(memberInserts)

      if (memberErr) throw memberErr

      navigate(`/group/${group.id}/owner`)
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra')
    }
    setLoading(false)
  }

  const canNextStep1 = groupName.trim() && ownerName.trim() && totalAmount
  const canNextStep2 = members.some(m => m.name.trim() && m.amount)

  const formatNumber = (num) => {
    return Number(num).toLocaleString('vi-VN')
  }

  return (
    <div className="container">
      <button className="back-btn" onClick={() => step > 1 ? setStep(step - 1) : navigate('/')}>
        ← {step > 1 ? 'Quay lại' : 'Trang chủ'}
      </button>

      <h1 className="page-title">Tạo nhóm mới</h1>
      <p className="page-subtitle">
        {step === 1 && 'Thông tin nhóm'}
        {step === 2 && 'Thêm thành viên'}
        {step === 3 && 'Thông tin chuyển khoản'}
      </p>

      {/* Steps indicator */}
      <div className="steps-indicator">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={`step-dot ${s === step ? 'active' : ''} ${s < step ? 'completed' : ''}`}
          />
        ))}
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-bg)',
          border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: 20,
          color: 'var(--danger)',
          fontSize: '0.9rem',
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      {/* Step 1: Group Info */}
      {step === 1 && (
        <div className="card animate-slide-up">
          <div className="form-group">
            <label className="form-label">Tên nhóm</label>
            <input
              id="input-group-name"
              type="text"
              className="form-input"
              placeholder="VD: Ăn lẩu team dev"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tên chủ nhóm</label>
            <input
              id="input-owner-name"
              type="text"
              className="form-input"
              placeholder="VD: Minh"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tổng số tiền (VNĐ)</label>
            <input
              id="input-total-amount"
              type="number"
              className="form-input"
              placeholder="VD: 1500000"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
            />
            {totalAmount && (
              <p style={{ color: 'var(--accent-start)', fontSize: '0.85rem', marginTop: 6 }}>
                💰 {formatNumber(totalAmount)} VNĐ
              </p>
            )}
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={() => setStep(2)}
            disabled={!canNextStep1}
            id="btn-next-step1"
          >
            Tiếp tục →
          </button>
        </div>
      )}

      {/* Step 2: Members */}
      {step === 2 && (
        <div className="animate-slide-up">
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-header">
              <h3 className="section-title">Thành viên ({members.length}/30)</h3>
              <button className="btn btn-sm btn-secondary" onClick={splitEvenly}>
                ⚡ Chia đều
              </button>
            </div>

            {members.map((member, idx) => (
              <div key={idx} className="member-form-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder={`Tên thành viên ${idx + 1}`}
                  value={member.name}
                  onChange={e => updateMember(idx, 'name', e.target.value)}
                />
                <input
                  type="number"
                  className="form-input"
                  placeholder="Số tiền"
                  value={member.amount}
                  onChange={e => updateMember(idx, 'amount', e.target.value)}
                />
                {members.length > 1 && (
                  <button
                    className="remove-member-btn"
                    onClick={() => removeMember(idx)}
                    title="Xóa"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {members.length < 30 && (
              <button
                className="btn btn-secondary btn-block btn-sm"
                onClick={addMember}
                style={{ marginTop: 8 }}
              >
                + Thêm thành viên
              </button>
            )}
          </div>

          {totalAmount && (
            <div style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              marginBottom: 16
            }}>
              Tổng đã phân:&nbsp;
              <strong style={{ color: members.reduce((s, m) => s + (Number(m.amount) || 0), 0) > Number(totalAmount) ? 'var(--danger)' : 'var(--success)' }}>
                {formatNumber(members.reduce((s, m) => s + (Number(m.amount) || 0), 0))}
              </strong>
              &nbsp;/ {formatNumber(totalAmount)} VNĐ
            </div>
          )}

          <button
            className="btn btn-primary btn-block"
            onClick={() => { setError(''); setStep(3) }}
            disabled={!canNextStep2}
            id="btn-next-step2"
          >
            Tiếp tục →
          </button>
        </div>
      )}

      {/* Step 3: Bank Info */}
      {step === 3 && (
        <div className="animate-slide-up">
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 16 }}>📱 QR chuyển khoản</h3>
            <div
              className={`upload-area ${qrImage ? 'has-image' : ''}`}
              onClick={() => document.getElementById('qr-upload').click()}
            >
              {qrImage ? (
                <img src={qrImage} alt="QR Bank" className="upload-preview" />
              ) : (
                <>
                  <span className="upload-icon">📷</span>
                  <p className="upload-text">
                    <span>Bấm để upload</span> ảnh QR chuyển khoản
                  </p>
                </>
              )}
            </div>
            <input
              id="qr-upload"
              type="file"
              className="upload-input"
              accept="image/*"
              onChange={handleQrUpload}
            />
            {qrImage && (
              <button
                className="btn btn-secondary btn-sm btn-block"
                style={{ marginTop: 8 }}
                onClick={() => setQrImage('')}
              >
                🗑️ Xóa ảnh QR
              </button>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 16 }}>🏦 Thông tin tài khoản</h3>
            <div className="form-group">
              <label className="form-label">Tên ngân hàng</label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: Vietcombank, MBBank, ..."
                value={bankName}
                onChange={e => setBankName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Số tài khoản</label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: 1234567890"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tên chủ tài khoản</label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: NGUYEN VAN A"
                value={accountHolder}
                onChange={e => setAccountHolder(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={handleCreate}
            disabled={loading || (!bankName && !accountNumber && !qrImage)}
            id="btn-create-group"
          >
            {loading ? <span className="spinner"></span> : '🚀 Tạo nhóm'}
          </button>
        </div>
      )}
    </div>
  )
}
