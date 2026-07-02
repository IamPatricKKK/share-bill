import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { setName } from '../lib/identity'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [groupName, setGroupName] = useState('')
  const [ownerName, setOwnerName] = useState('')

  const handleCreate = async () => {
    if (!groupName.trim() || !ownerName.trim()) return

    setLoading(true)
    setError('')

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
          total_amount: 0,
          status: 'planning',
        })
        .select()
        .single()

      if (groupErr) throw groupErr

      // Remember the owner's display name on this device for chat
      setName(group.id, ownerName.trim())

      navigate(`/group/${group.id}/owner`)
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra')
    }
    setLoading(false)
  }

  const canCreate = groupName.trim() && ownerName.trim()

  return (
    <div className="container">
      <button className="back-btn" onClick={() => navigate('/')}>← Trang chủ</button>

      <h1 className="page-title">Tạo nhóm mới</h1>
      <p className="page-subtitle">Tạo nhóm để bàn kế hoạch, giá tiền lên sau</p>

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
            maxLength={60}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Tên của bạn (chủ nhóm)</label>
          <input
            id="input-owner-name"
            type="text"
            className="form-input"
            placeholder="VD: Minh"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value)}
            maxLength={40}
          />
        </div>

        <div style={{
          background: 'var(--info-bg)',
          border: '1px solid rgba(96,165,250,0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          marginBottom: 20,
          color: 'var(--text-secondary)',
          fontSize: '0.82rem',
          lineHeight: 1.5,
        }}>
          💬 Sau khi tạo, nhóm sẽ có <strong>khung chat</strong> để cả nhóm bàn mua gì.
          Khi chốt, bạn tạo <strong>hoá đơn</strong>: nhập từng món, giá, ngày &amp; hạn trả,
          rồi gán món cho từng người để tự chia tiền.
        </div>

        <button
          className="btn btn-primary btn-block btn-lg"
          onClick={handleCreate}
          disabled={loading || !canCreate}
          id="btn-create-group"
        >
          {loading ? <span className="spinner"></span> : '🚀 Tạo nhóm'}
        </button>
      </div>
    </div>
  )
}
