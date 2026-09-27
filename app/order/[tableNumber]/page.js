'use client'

import { use, useEffect, useState } from 'react'
import { DM_Serif_Display } from 'next/font/google'
import { supabase } from '@/lib/supabaseClient'

// ฟ้อนต์ DM Serif Display ใช้กับตัวอักษรภาษาอังกฤษ/ตัวเลข (ชื่อร้าน, ราคา, หัวข้อ)
// ภาษาไทยใช้ฟ้อนต์เริ่มต้นของเครื่อง (system font) เพื่อความอ่านง่าย
const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
})

const COLORS = {
  bg: '#FAF6F0',
  surface: '#FFFFFF',
  ink: '#3B2A1E',
  sub: '#8A7863',
  brownLight: '#C9A27E',
  brownLightPress: '#B88F68',
  brownDark: '#5C4028',
  border: '#E7DBC8',
  black: '#1E1710',
  danger: '#B3492E',
}

const MAX_CART_LINES = 10
const ADULT_PRICE = 85
const CHILD_PRICE = 65

export default function OrderPage({ params }) {
  // ⚠️ Next.js เวอร์ชันนี้ params เป็น Promise ต้อง unwrap ด้วย use() เสมอ
  const { tableNumber: rawTableNumber } = use(params)
  const tableNumber = Number(rawTableNumber)

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null) // { id, adult_count, child_count }
  const [sessionClosed, setSessionClosed] = useState(false)

  const [categories, setCategories] = useState([])
  const [itemsByCategory, setItemsByCategory] = useState({})
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [menuError, setMenuError] = useState('')

  const [qtyByItem, setQtyByItem] = useState({})
  const [cart, setCart] = useState([]) // [{ itemId, name, quantity }]
  const [cartOpen, setCartOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [orderNotice, setOrderNotice] = useState('')

  const [showBillModal, setShowBillModal] = useState(false)
  const [closingBill, setClosingBill] = useState(false)
  const [billError, setBillError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadSessionAndMenu() {
      setLoading(true)

      const { data, error } = await supabase
        .from('sessions')
        .select('id, adult_count, child_count')
        .eq('table_number', tableNumber)
        .eq('status', 'open')
        .limit(1)

      if (cancelled) return

      if (error || !data || data.length === 0) {
        setSession(null)
        setLoading(false)
        return
      }

      setSession(data[0])
      await loadMenu(cancelled)
      if (!cancelled) setLoading(false)
    }

    async function loadMenu(cancelled) {
      setMenuError('')

      const { data: cats, error: catError } = await supabase
        .from('menu_categories')
        .select('id, name, sort_order')
        .order('sort_order', { ascending: true })

      if (cancelled) return
      if (catError || !cats) {
        setMenuError('โหลดเมนูไม่สำเร็จ กรุณาลองรีเฟรชหน้านี้')
        return
      }

      const categoryIds = cats.map((c) => c.id)
      const { data: items, error: itemError } = await supabase
        .from('menu_items')
        .select('id, category_id, name')
        .in('category_id', categoryIds.length > 0 ? categoryIds : [-1])

      if (cancelled) return
      if (itemError) {
        setMenuError('โหลดเมนูไม่สำเร็จ กรุณาลองรีเฟรชหน้านี้')
        return
      }

      const grouped = {}
      for (const cat of cats) grouped[cat.id] = []
      for (const item of items || []) {
        if (!grouped[item.category_id]) grouped[item.category_id] = []
        grouped[item.category_id].push(item)
      }

      setCategories(cats)
      setItemsByCategory(grouped)
      setActiveCategoryId(cats.length > 0 ? cats[0].id : null)
    }

    if (!Number.isNaN(tableNumber)) {
      loadSessionAndMenu()
    } else {
      setSession(null)
      setLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [tableNumber])

  function getQty(itemId) {
    return qtyByItem[itemId] ?? 1
  }

  function setQty(itemId, value) {
    const clamped = Math.min(5, Math.max(1, value))
    setQtyByItem((prev) => ({ ...prev, [itemId]: clamped }))
  }

  const cartFull = cart.length >= MAX_CART_LINES

  function handleAddToCart(item) {
    const quantity = getQty(item.id)
    setCart((prev) => {
      const existingIndex = prev.findIndex((line) => line.itemId === item.id)
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + quantity,
        }
        return next
      }
      if (prev.length >= MAX_CART_LINES) return prev
      return [...prev, { itemId: item.id, name: item.name, quantity }]
    })
  }

  function handleRemoveFromCart(itemId) {
    setCart((prev) => prev.filter((line) => line.itemId !== itemId))
  }

  async function handleSubmitOrder() {
    if (!session || cart.length === 0) return
    setSubmitting(true)
    setOrderNotice('')
    try {
      const { error } = await supabase.from('orders').insert({
        session_id: session.id,
        table_number: tableNumber,
        items: cart.map((line) => ({ name: line.name, quantity: line.quantity })),
        status: 'received',
      })
      if (error) throw error

      setCart([])
      setCartOpen(false)
      setOrderNotice('ส่งออเดอร์แล้ว')
      setTimeout(() => setOrderNotice(''), 3000)
    } catch (err) {
      console.error(err)
      setOrderNotice('ส่งออเดอร์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  const billAmount = session
    ? session.adult_count * ADULT_PRICE + session.child_count * CHILD_PRICE
    : 0

  async function handleConfirmBill() {
    if (!session) return
    setClosingBill(true)
    setBillError('')
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id)
        .eq('status', 'open')

      if (error) throw error

      setShowBillModal(false)
      setSessionClosed(true)
    } catch (err) {
      console.error(err)
      setBillError('ปิดโต๊ะไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setClosingBill(false)
    }
  }

  if (loading) {
    return (
      <main style={styles.centerScreen}>
        <p style={{ ...dmSerif.style, ...styles.loadingText }}>chacha</p>
      </main>
    )
  }

  if (sessionClosed) {
    return (
      <main style={styles.centerScreen}>
        <p style={{ ...dmSerif.style, ...styles.thankYouTitle }}>Thank You</p>
        <p style={styles.thankYouSubtitle}>ขอบคุณที่ใช้บริการ</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main style={styles.centerScreen}>
        <p style={styles.closedText}>โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน</p>
      </main>
    )
  }

  const activeItems = activeCategoryId ? itemsByCategory[activeCategoryId] || [] : []
  const cartTotalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={{ ...dmSerif.style, ...styles.shopName }}>chacha</p>
          <p style={styles.tableLabel}>โต๊ะ {tableNumber}</p>
        </div>
        <button
          type="button"
          style={styles.billHeaderButton}
          onClick={() => setShowBillModal(true)}
        >
          เรียกเก็บเงิน
        </button>
      </header>

      {menuError && <p style={styles.menuError}>{menuError}</p>}

      <nav style={styles.tabRow}>
        {categories.map((cat) => {
          const active = cat.id === activeCategoryId
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategoryId(cat.id)}
              style={{
                ...styles.tabButton,
                ...(active ? styles.tabButtonActive : {}),
              }}
            >
              {cat.name}
            </button>
          )
        })}
      </nav>

      <section style={styles.menuList}>
        {activeItems.length === 0 && !menuError && (
          <p style={styles.emptyMenuText}>ยังไม่มีเมนูในหมวดนี้</p>
        )}

        {activeItems.map((item) => (
          <MenuItemRow
            key={item.id}
            item={item}
            qty={getQty(item.id)}
            onQtyChange={(value) => setQty(item.id, value)}
            onAdd={() => handleAddToCart(item)}
          />
        ))}
      </section>

      {/* เว้นที่ด้านล่างไม่ให้เนื้อหาโดนตะกร้าลอยบัง */}
      <div style={{ height: 96 }} />

      {orderNotice && (
        <div style={styles.toast}>
          <p style={styles.toastText}>{orderNotice}</p>
        </div>
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          cartFull={cartFull}
          submitting={submitting}
          onRemove={handleRemoveFromCart}
          onClose={() => setCartOpen(false)}
          onSubmit={handleSubmitOrder}
        />
      )}

      <button
        type="button"
        style={styles.cartBar}
        onClick={() => setCartOpen((v) => !v)}
      >
        <span style={styles.cartBarText}>
          ตะกร้า · {cart.length} รายการ{cartFull ? ' (เต็ม)' : ''}
        </span>
        <span style={styles.cartBarCount}>{cartTotalQuantity}</span>
      </button>

      {showBillModal && (
        <BillModal
          adultCount={session.adult_count}
          childCount={session.child_count}
          amount={billAmount}
          closing={closingBill}
          error={billError}
          onCancel={() => setShowBillModal(false)}
          onConfirm={handleConfirmBill}
        />
      )}
    </main>
  )
}

function MenuItemRow({ item, qty, onQtyChange, onAdd }) {
  return (
    <div style={styles.itemRow}>
      <p style={styles.itemName}>{item.name}</p>
      <div style={styles.itemControls}>
        <div style={styles.qtyStepper}>
          <button
            type="button"
            style={styles.qtyButton}
            onClick={() => onQtyChange(qty - 1)}
            aria-label="ลดจำนวน"
          >
            −
          </button>
          <span style={styles.qtyValue}>{qty}</span>
          <button
            type="button"
            style={styles.qtyButton}
            onClick={() => onQtyChange(qty + 1)}
            aria-label="เพิ่มจำนวน"
          >
            +
          </button>
        </div>
        <button type="button" style={styles.addButton} onClick={onAdd}>
          + ใส่ตะกร้า
        </button>
      </div>
    </div>
  )
}

function CartDrawer({ cart, cartFull, submitting, onRemove, onClose, onSubmit }) {
  return (
    <div style={styles.drawerOverlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <p style={styles.drawerTitle}>ตะกร้าของคุณ</p>

        {cart.length === 0 ? (
          <p style={styles.emptyMenuText}>ยังไม่มีรายการในตะกร้า</p>
        ) : (
          <div style={styles.drawerList}>
            {cart.map((line) => (
              <div key={line.itemId} style={styles.drawerLine}>
                <span style={styles.drawerLineText}>
                  {line.name} × {line.quantity}
                </span>
                <button
                  type="button"
                  style={styles.drawerRemoveButton}
                  onClick={() => onRemove(line.itemId)}
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        )}

        {cartFull && (
          <p style={styles.menuError}>ตะกร้าเต็มแล้ว (สูงสุด {MAX_CART_LINES} รายการ)</p>
        )}

        <button
          type="button"
          style={{
            ...styles.submitOrderButton,
            ...(cart.length === 0 ? styles.disabledButton : {}),
          }}
          onClick={onSubmit}
          disabled={cart.length === 0 || submitting}
        >
          {submitting ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
        </button>
      </div>
    </div>
  )
}

function BillModal({ adultCount, childCount, amount, closing, error, onCancel, onConfirm }) {
  return (
    <div style={styles.drawerOverlay} onClick={onCancel}>
      <div style={styles.billBox} onClick={(e) => e.stopPropagation()}>
        <p style={styles.drawerTitle}>เรียกเก็บเงิน</p>
        <p style={styles.billDetail}>
          ผู้ใหญ่ {adultCount} คน × {ADULT_PRICE} บาท
        </p>
        <p style={styles.billDetail}>
          เด็ก {childCount} คน × {CHILD_PRICE} บาท
        </p>
        <p style={{ ...dmSerif.style, ...styles.billAmount }}>
          {amount.toLocaleString('th-TH')} บาท
        </p>

        {error && <p style={styles.menuError}>{error}</p>}

        <div style={styles.modalButtonRow}>
          <button type="button" style={styles.secondaryButton} onClick={onCancel} disabled={closing}>
            ยกเลิก
          </button>
          <button type="button" style={styles.confirmBillButton} onClick={onConfirm} disabled={closing}>
            {closing ? 'กำลังปิด...' : 'ยืนยัน'}
          </button>
        </div>
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
  },
  centerScreen: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 24,
    background: COLORS.bg,
  },
  loadingText: {
    fontSize: 32,
    color: COLORS.brownDark,
  },
  thankYouTitle: {
    fontSize: 40,
    color: COLORS.brownDark,
    margin: 0,
  },
  thankYouSubtitle: {
    fontSize: 20,
    color: COLORS.sub,
    marginTop: 12,
  },
  closedText: {
    fontSize: 22,
    fontWeight: 600,
    color: COLORS.brownDark,
    lineHeight: 1.6,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '20px 20px 12px',
  },
  shopName: {
    fontSize: 30,
    color: COLORS.brownDark,
    margin: 0,
  },
  tableLabel: {
    fontSize: 15,
    color: COLORS.sub,
    margin: '2px 0 0',
  },
  billHeaderButton: {
    fontSize: 15,
    fontWeight: 700,
    padding: '12px 16px',
    borderRadius: 24,
    border: 'none',
    background: COLORS.brownLight,
    color: '#FFFFFF',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  menuError: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: 600,
    padding: '0 20px',
  },
  tabRow: {
    display: 'flex',
    gap: 8,
    padding: '4px 20px 16px',
    overflowX: 'auto',
    position: 'sticky',
    top: 0,
    background: COLORS.bg,
    zIndex: 5,
  },
  tabButton: {
    fontSize: 15,
    fontWeight: 600,
    padding: '10px 18px',
    borderRadius: 20,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface,
    color: COLORS.brownDark,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabButtonActive: {
    background: COLORS.brownDark,
    color: '#FFFFFF',
    border: `1px solid ${COLORS.brownDark}`,
  },
  menuList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '0 20px',
  },
  emptyMenuText: {
    color: COLORS.sub,
    fontSize: 15,
    padding: '20px 0',
  },
  itemRow: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
    color: COLORS.ink,
  },
  itemControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  qtyStepper: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: COLORS.bg,
    borderRadius: 24,
    border: `1px solid ${COLORS.border}`,
    padding: 4,
  },
  qtyButton: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    background: COLORS.surface,
    color: COLORS.brownDark,
    fontSize: 20,
    fontWeight: 700,
    cursor: 'pointer',
  },
  qtyValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: 700,
  },
  addButton: {
    fontSize: 15,
    fontWeight: 700,
    padding: '12px 18px',
    borderRadius: 24,
    border: 'none',
    background: COLORS.brownLight,
    color: '#FFFFFF',
    cursor: 'pointer',
    flex: 1,
    maxWidth: 160,
  },
  toast: {
    position: 'fixed',
    bottom: 96,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    zIndex: 20,
    pointerEvents: 'none',
  },
  toastText: {
    background: COLORS.brownDark,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 600,
    padding: '12px 24px',
    borderRadius: 24,
    margin: 0,
  },
  cartBar: {
    position: 'fixed',
    left: 16,
    right: 16,
    bottom: 16,
    height: 64,
    borderRadius: 32,
    border: 'none',
    background: COLORS.black,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    cursor: 'pointer',
    zIndex: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  cartBarText: {
    fontSize: 16,
    fontWeight: 600,
  },
  cartBarCount: {
    fontSize: 16,
    fontWeight: 700,
    background: COLORS.brownLight,
    borderRadius: '50%',
    minWidth: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(30, 23, 16, 0.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 30,
  },
  drawer: {
    width: '100%',
    maxWidth: 480,
    background: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: '24px 20px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxHeight: '70vh',
    overflowY: 'auto',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    color: COLORS.brownDark,
  },
  drawerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  drawerLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${COLORS.border}`,
    paddingBottom: 10,
  },
  drawerLineText: {
    fontSize: 16,
  },
  drawerRemoveButton: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.danger,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px 4px',
  },
  submitOrderButton: {
    fontSize: 18,
    fontWeight: 700,
    padding: '18px 20px',
    borderRadius: 28,
    border: 'none',
    background: COLORS.brownDark,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  billBox: {
    width: '100%',
    maxWidth: 480,
    background: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: '28px 24px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    textAlign: 'center',
  },
  billDetail: {
    fontSize: 16,
    color: COLORS.sub,
    margin: 0,
  },
  billAmount: {
    fontSize: 40,
    color: COLORS.brownDark,
    margin: '12px 0 4px',
  },
  modalButtonRow: {
    display: 'flex',
    gap: 12,
    marginTop: 16,
  },
  secondaryButton: {
    flex: 1,
    fontSize: 16,
    fontWeight: 600,
    padding: '16px 20px',
    borderRadius: 28,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.surface,
    color: COLORS.ink,
    cursor: 'pointer',
  },
  confirmBillButton: {
    flex: 1,
    fontSize: 16,
    fontWeight: 700,
    padding: '16px 20px',
    borderRadius: 28,
    border: 'none',
    background: COLORS.brownLight,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
}
