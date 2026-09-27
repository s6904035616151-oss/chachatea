'use client'
 
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
 
const COLORS = {
  bg: '#F3EFE6',
  surface: '#FFFFFF',
  ink: '#2E2015',
  sub: '#7A6A57',
  border: '#DED2BC',
  received: '#FFFFFF',
  receivedBorder: '#DED2BC',
  cooking: '#FFE4B5',
  cookingBorder: '#E2963C',
  startButton: '#5C4028',
  servedButton: '#3F7A4E',
  danger: '#B3492E',
}
 
const ACTIVE_STATUSES = ['received', 'cooking']
 
export default function KitchenPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionErrorByOrder, setActionErrorByOrder] = useState({})
  const [now, setNow] = useState(() => Date.now())
 
  // โหลดออเดอร์ที่ยังไม่จบตอนเปิดหน้าครั้งแรก
  useEffect(() => {
    let cancelled = false
 
    async function loadInitialOrders() {
      setLoading(true)
      setError('')
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('id, table_number, items, status, created_at')
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: true })
 
      if (cancelled) return
 
      if (fetchError) {
        setError('โหลดออเดอร์ไม่สำเร็จ กรุณารีเฟรชหน้านี้')
        setLoading(false)
        return
      }
 
      setOrders(data || [])
      setLoading(false)
    }
 
    loadInitialOrders()
    return () => {
      cancelled = true
    }
  }, [])
 
  // ฟัง Realtime: ออเดอร์ใหม่ (INSERT) และการเปลี่ยนสถานะ (UPDATE)
  useEffect(() => {
    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new
          if (!ACTIVE_STATUSES.includes(newOrder.status)) return
          setOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev
            return [...prev, newOrder]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new
          setOrders((prev) => {
            if (!ACTIVE_STATUSES.includes(updated.status)) {
              // เสิร์ฟแล้ว/สถานะอื่นที่ไม่ active -> เอาออกจากจอ
              return prev.filter((o) => o.id !== updated.id)
            }
            const exists = prev.some((o) => o.id === updated.id)
            if (!exists) return [...prev, updated]
            return prev.map((o) => (o.id === updated.id ? updated : o))
          })
        }
      )
      .subscribe()
 
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
 
  // อัปเดตเวลาทุก 30 วิ เพื่อให้ "สั่งมาแล้ว N นาที" สดอยู่เสมอ (จอนี้เปิดทิ้งไว้ตลอด)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])
 
  async function handleStartCooking(order) {
    setActionErrorByOrder((prev) => ({ ...prev, [order.id]: '' }))
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'cooking' })
      .eq('id', order.id)
      .eq('status', 'received')
 
    if (updateError) {
      setActionErrorByOrder((prev) => ({ ...prev, [order.id]: 'อัปเดตไม่สำเร็จ ลองใหม่' }))
      return
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: 'cooking' } : o))
    )
  }
 
  async function handleServed(order) {
    setActionErrorByOrder((prev) => ({ ...prev, [order.id]: '' }))
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: 'served' })
      .eq('id', order.id)
 
    if (updateError) {
      setActionErrorByOrder((prev) => ({ ...prev, [order.id]: 'อัปเดตไม่สำเร็จ ลองใหม่' }))
      return
    }
    // เอาการ์ดออกจากจอทันที ไม่ต้องรอ realtime
    setOrders((prev) => prev.filter((o) => o.id !== order.id))
  }
 
  const orderCount = orders.length
 
  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>ครัว chacha</h1>
        <span style={styles.countBadge}>{orderCount} ออเดอร์</span>
      </header>
 
      {error && <p style={styles.errorBanner}>{error}</p>}
 
      {loading ? (
        <p style={styles.loadingText}>กำลังโหลดออเดอร์...</p>
      ) : orders.length === 0 ? (
        <p style={styles.emptyText}>ไม่มีออเดอร์ค้างอยู่</p>
      ) : (
        <div style={styles.grid}>
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              now={now}
              error={actionErrorByOrder[order.id]}
              onStartCooking={() => handleStartCooking(order)}
              onServed={() => handleServed(order)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
 
function OrderCard({ order, now, error, onStartCooking, onServed }) {
  const isCooking = order.status === 'cooking'
  const minutesAgo = Math.max(
    0,
    Math.floor((now - new Date(order.created_at).getTime()) / 60000)
  )
  const orderedTime = new Date(order.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const items = Array.isArray(order.items) ? order.items : []
 
  return (
    <div
      style={{
        ...styles.card,
        background: isCooking ? COLORS.cooking : COLORS.received,
        borderColor: isCooking ? COLORS.cookingBorder : COLORS.receivedBorder,
      }}
    >
      <div style={styles.cardHeader}>
        <span style={styles.tableNumber}>โต๊ะ {order.table_number}</span>
        <div style={styles.timeBlock}>
          <span style={styles.orderedTime}>{orderedTime} น.</span>
          <span style={styles.minutesAgo}>{minutesAgo} นาทีที่แล้ว</span>
        </div>
      </div>
 
      {isCooking && <span style={styles.cookingTag}>กำลังทำ</span>}
 
      <ul style={styles.itemList}>
        {items.map((line, idx) => (
          <li key={idx} style={styles.itemLine}>
            <span>{line.name}</span>
            <span style={styles.itemQty}>× {line.quantity}</span>
          </li>
        ))}
      </ul>
 
      {error && <p style={styles.cardError}>{error}</p>}
 
      <div style={styles.cardButtonRow}>
        {order.status === 'received' && (
          <button type="button" style={styles.startButton} onClick={onStartCooking}>
            เริ่มทำ
          </button>
        )}
        <button type="button" style={styles.servedButton} onClick={onServed}>
          จัดเสิร์ฟแล้ว
        </button>
      </div>
    </div>
  )
}
 
const styles = {
  page: {
    minHeight: '100vh',
    background: COLORS.bg,
    color: COLORS.ink,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '24px 28px 40px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: 700,
    margin: 0,
  },
  countBadge: {
    fontSize: 20,
    fontWeight: 700,
    background: COLORS.surface,
    border: `2px solid ${COLORS.border}`,
    borderRadius: 24,
    padding: '10px 20px',
  },
  errorBanner: {
    color: '#FFFFFF',
    background: COLORS.danger,
    fontSize: 16,
    fontWeight: 600,
    padding: '12px 16px',
    borderRadius: 8,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 22,
    color: COLORS.sub,
  },
  emptyText: {
    fontSize: 26,
    color: COLORS.sub,
    marginTop: 40,
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 20,
  },
  card: {
    border: '3px solid',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  tableNumber: {
    fontSize: 40,
    fontWeight: 800,
    lineHeight: 1,
  },
  timeBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  orderedTime: {
    fontSize: 18,
    fontWeight: 700,
  },
  minutesAgo: {
    fontSize: 14,
    color: COLORS.sub,
  },
  cookingTag: {
    alignSelf: 'flex-start',
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.cookingBorder,
    background: '#FFFFFF',
    borderRadius: 12,
    padding: '4px 12px',
  },
  itemList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  itemLine: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 22,
    fontWeight: 600,
  },
  itemQty: {
    color: COLORS.sub,
  },
  cardError: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  cardButtonRow: {
    display: 'flex',
    gap: 10,
    marginTop: 4,
  },
  startButton: {
    flex: 1,
    fontSize: 18,
    fontWeight: 700,
    padding: '16px 12px',
    borderRadius: 10,
    border: 'none',
    background: COLORS.startButton,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  servedButton: {
    flex: 1,
    fontSize: 18,
    fontWeight: 700,
    padding: '16px 12px',
    borderRadius: 10,
    border: 'none',
    background: COLORS.servedButton,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
}
