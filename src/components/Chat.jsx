import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Group chat scoped to a single group. Used by both owner and member views.
// senderName identifies the author; isOwner marks the admin's bubbles.
export default function Chat({ groupId, senderName, isOwner = false }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const listRef = useRef(null)

  const fetchMessages = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
  }, [groupId])

  useEffect(() => {
    fetchMessages()

    if (!supabase) return

    const channel = supabase
      .channel(`chat-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [groupId, fetchMessages])

  // Auto-scroll to newest message
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    const content = text.trim()
    if (!content || !supabase) return

    setText('')
    // Optimistic insert with a temp id; realtime will reconcile by id.
    const optimistic = {
      id: `temp-${content}-${messages.length}`,
      group_id: groupId,
      sender_name: senderName,
      is_owner: isOwner,
      content,
      created_at: new Date().toISOString(),
      _optimistic: true,
    }
    setMessages((prev) => [...prev, optimistic])

    const { data, error } = await supabase
      .from('messages')
      .insert({ group_id: groupId, sender_name: senderName, is_owner: isOwner, content })
      .select()
      .single()

    if (!error && data) {
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== optimistic.id)
          .some((m) => m.id === data.id)
          ? prev.filter((m) => m.id !== optimistic.id)
          : [...prev.filter((m) => m.id !== optimistic.id), data]
      )
    }
  }

  const formatTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="chat">
      <div className="chat-messages" ref={listRef}>
        {loading ? (
          <div className="chat-empty"><span className="spinner"></span></div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <span className="empty-state-icon">💬</span>
            <p>Chưa có tin nhắn. Bắt đầu lên kế hoạch nào!</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_name === senderName
            return (
              <div key={m.id} className={`chat-bubble-row ${mine ? 'mine' : ''}`}>
                <div className={`chat-bubble ${mine ? 'mine' : ''} ${m.is_owner ? 'owner' : ''}`}>
                  {!mine && (
                    <div className="chat-sender">
                      {m.sender_name}{m.is_owner && ' 👑'}
                    </div>
                  )}
                  <div className="chat-text">{m.content}</div>
                  <div className="chat-time">{formatTime(m.created_at)}</div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <form className="chat-input-row" onSubmit={send}>
        <input
          type="text"
          className="form-input"
          placeholder="Nhập tin nhắn..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
        />
        <button type="submit" className="btn btn-primary chat-send-btn" disabled={!text.trim()}>
          ➤
        </button>
      </form>
    </div>
  )
}
