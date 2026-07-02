import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Home() {
  const navigate = useNavigate()
  const [showJoin, setShowJoin] = useState(false)
  const [groupCode, setGroupCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!groupCode.trim()) return

    setLoading(true)
    setError('')

    try {
      if (!supabase) {
        setError('⚠️ Chưa cấu hình Supabase! Vui lòng điền thông tin vào file .env')
        setLoading(false)
        return
      }

      const { data, error: err } = await supabase
        .from('groups')
        .select('id')
        .eq('group_code', groupCode.trim().toUpperCase())
        .single()

      if (err || !data) {
        setError('Không tìm thấy nhóm. Vui lòng kiểm tra lại mã.')
        setLoading(false)
        return
      }

      navigate(`/group/${data.id}`)
    } catch {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
    }
    setLoading(false)
  }

  return (
    <div className="container">
      <div className="logo">
        <span className="logo-icon">🤝</span>
        <h1 className="page-title">Lên Kèo</h1>
        <p className="page-subtitle">Rủ cả nhóm lên kế hoạch & chia tiền<br />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Plan together, split the bill</span>
        </p>
      </div>

      <div className="home-actions animate-slide-up">
        <div
          className="home-action-card"
          onClick={() => navigate('/create')}
          id="btn-create-group"
        >
          <span className="home-action-icon">🆕</span>
          <div className="home-action-text">
            <h3 className="home-action-title">Tạo nhóm mới</h3>
            <p className="home-action-desc">Tạo bill và mời bạn bè chia tiền</p>
          </div>
          <span className="home-action-arrow">→</span>
        </div>

        <div
          className="home-action-card"
          onClick={() => setShowJoin(!showJoin)}
          id="btn-join-group"
        >
          <span className="home-action-icon">🔗</span>
          <div className="home-action-text">
            <h3 className="home-action-title">Vào nhóm</h3>
            <p className="home-action-desc">Nhập mã nhóm để tham gia chia bill</p>
          </div>
          <span className="home-action-arrow">→</span>
        </div>
      </div>

      {showJoin && (
        <form className="join-form" onSubmit={handleJoin}>
          <div className="card">
            <h3 style={{ marginBottom: 16, textAlign: 'center' }}>Nhập mã nhóm</h3>
            <div className="join-input-group">
              <input
                id="input-group-code"
                type="text"
                className="form-input"
                placeholder="VD: ABC12345"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
                maxLength={8}
                autoFocus
              />
            </div>
            {error && (
              <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 12, textAlign: 'center' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={loading || !groupCode.trim()}
              id="btn-submit-join"
            >
              {loading ? <span className="spinner"></span> : 'Vào nhóm'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
