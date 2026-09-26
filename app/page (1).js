'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const COLORS = {
  bg: '#F6F3EC',
  ink: '#2B2B26',
  sub: '#6B6A5F',
  tea: '#5C7A54',
  teaDark: '#436138',
  border: '#DCD8C8',
  card: '#FFFFFF',
  warnBg: '#FFF1EC',
  warnBorder: '#E2673F',
  warnText: '#9A3412',
}

const EMPTY_FORM = { tableNumber: '', adultCount: '', childCount: '' }

export default function GenerateQrPage() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [existingSession, setExistingSession] = useState(null) // { id, adult_count, child_count, created_at }
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')

  const [qrResult, setQrResult] = useState(null) // { tableNumber, adultCount, childCount, url }
  const [copied, setCopied] = useState(false)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function resetAll() {
    setForm(EMPTY_FORM)
    setError('')
    setExistingSession(null)
    setShowConfirmClose(false)
    setCloseError('')
    setQrResult(null)
    setCopied(false)
  }

  async function handleOpenTable(e) {
    e.preventDefault()
    setError('')

    const tableNumber = Number(form.tableNumber)
    const adultCount = Number(form.adultCount)
    const childCount = Number(form.childCount)

    if (!form.tableNumber || Number.isNaN(tableNumber) || tableNumber <= 0) {
      setError('กรุณากรอกเลขโต๊ะให้ถูกต้อง')
      return
    }
    if (form.adultCount === '' || Number.isNaN(adultCount) || adultCount < 0) {
      setError('กรุณากรอกจำนวนผู้ใหญ่ให้ถูกต้อง')
      return
    }
    if (form.childCount === '' || Number.isNaN(childCount) || childCount < 0) {
      setError('กรุณากรอกจำนวนเด็กให้ถูกต้อง')
      return
    }

    setLoading(true)
    try {
      // 1) เช็คว่าโต๊ะนี้มี session ที่ยัง open อยู่หรือไม่
      const { data: openSessions, error: selectError } = await supabase
        .from('sessions')
        .select('id, adult_count, child_count, created_at')
        .eq('table_number', tableNumber)
        .eq('status', 'open')
        .limit(1)

      if (selectError) throw selectError

      if (openSessions && openSessions.length > 0) {
        // มี session เปิดค้างอยู่ -> แสดงกล่องเตือน ไม่สร้างแถวใหม่
        setExistingSession(openSessions[0])
        setLoading(false)
        return
      }

      // 2) ไม่มี session เปิดค้าง -> สร้างใหม่
      const { error: insertError } = await supabase.from('sessions').insert({
        table_number: tableNumber,
        adult_count: adultCount,
        child_count: childCount,
        status: 'open',
      })

      if (insertError) throw insertError

      const url = `${window.location.origin}/order/${tableNumber}`
      setQrResult({ tableNumber, adultCount, childCount, url })
    } catch (err) {
      console.error(err)
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  function handleRequestCloseOld() {
    setCloseError('')
    setShowConfirmClose(true)
  }

  function handleCancelClose() {
    setShowConfirmClose(false)
    setCloseError('')
  }

  async function handleConfirmCloseOld() {
    if (!existingSession) return
    setClosing(true)
    setCloseError('')
    try {
      const { data, error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', existingSession.id)
        .eq('status', 'open') // กันกดซ้ำซ้อน / ปิดไปแล้วจากที่อื่น
        .select('id')

      if (updateError) throw updateError

      if (!data || data.length === 0) {
        // มีคนอื่นปิดไปแล้วก่อนหน้า
        setCloseError('โต๊ะนี้ถูกปิดออเดอร์ไปแล้ว')
        setShowConfirmClose(false)
        setExistingSession(null)
        return
      }

      // ปิดสำเร็จ -> กลับไปที่ฟอร์มเดิม ค่าที่กรอกไว้ยังอยู่ครบ
      setShowConfirmClose(false)
      setExistingSession(null)
    } catch (err) {
      console.error(err)
      setCloseError('ปิดออเดอร์เดิมไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setClosing(false)
    }
  }

  async function handleCopyLink() {
    if (!qrResult) return
    try {
      await navigator.clipboard.writeText(qrResult.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  function minutesElapsed(createdAt) {
    const ms = Date.now() - new Date(createdAt).getTime()
    return Math.max(0, Math.floor(ms / 60000))
  }

  const qrImageUrl = qrResult
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        qrResult.url
      )}`
    : null

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>เปิดโต๊ะลูกค้า</h1>
        <p style={styles.subtitle}>chacha</p>

        {qrResult ? (
          <QrResultCard
            qrResult={qrResult}
            qrImageUrl={qrImageUrl}
            copied={copied}
            onCopy={handleCopyLink}
            onNewTable={resetAll}
          />
        ) : (
          <>
            {existingSession && !showConfirmClose && (
              <ExistingSessionWarning
                tableNumber={form.tableNumber}
                session={existingSession}
                minutesElapsed={minutesElapsed(existingSession.created_at)}
                closeError={closeError}
                onRequestClose={handleRequestCloseOld}
              />
            )}

            <form onSubmit={handleOpenTable} style={styles.form}>
              <FormField label="เลขโต๊ะ">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={form.tableNumber}
                  onChange={(e) => updateField('tableNumber', e.target.value)}
                  style={styles.input}
                  placeholder="เช่น 7"
                  disabled={loading}
                />
              </FormField>

              <FormField label="จำนวนผู้ใหญ่">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.adultCount}
                  onChange={(e) => updateField('adultCount', e.target.value)}
                  style={styles.input}
                  placeholder="เช่น 2"
                  disabled={loading}
                />
              </FormField>

              <FormField label="จำนวนเด็ก">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.childCount}
                  onChange={(e) => updateField('childCount', e.target.value)}
                  style={styles.input}
                  placeholder="เช่น 0"
                  disabled={loading}
                />
              </FormField>

              {error && <p style={styles.errorText}>{error}</p>}

              <button type="submit" style={styles.primaryButton} disabled={loading}>
                {loading ? 'กำลังเปิดโต๊ะ...' : 'เปิดโต๊ะ'}
              </button>
            </form>
          </>
        )}
      </div>

      {showConfirmClose && existingSession && (
        <ConfirmCloseModal
          tableNumber={form.tableNumber}
          session={existingSession}
          minutesElapsed={minutesElapsed(existingSession.created_at)}
          closing={closing}
          onCancel={handleCancelClose}
          onConfirm={handleConfirmCloseOld}
        />
      )}
    </main>
  )
}

function FormField({ label, children }) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      {children}
    </label>
  )
}

function ExistingSessionWarning({ tableNumber, session, minutesElapsed, closeError, onRequestClose }) {
  return (
    <div style={styles.warnBox}>
      <p style={styles.warnTitle}>
        โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร กรุณาปิดออเดอร์เดิมก่อน
      </p>
      <p style={styles.warnDetail}>
        โต๊ะ {tableNumber} · ผู้ใหญ่ {session.adult_count} · เด็ก {session.child_count} ·
        เปิดมาแล้ว {minutesElapsed} นาที
      </p>
      {closeError && <p style={styles.errorText}>{closeError}</p>}
      <button type="button" style={styles.warnButton} onClick={onRequestClose}>
        ปิดออเดอร์เดิม
      </button>
    </div>
  )
}

function ConfirmCloseModal({ tableNumber, session, minutesElapsed, closing, onCancel, onConfirm }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalBox}>
        <p style={styles.warnTitle}>ยืนยันปิดโต๊ะเดิม?</p>
        <div style={styles.modalDetailBox}>
          <p style={styles.modalDetailLine}>โต๊ะ {tableNumber}</p>
          <p style={styles.modalDetailLine}>ผู้ใหญ่ {session.adult_count} คน · เด็ก {session.child_count} คน</p>
          <p style={styles.modalDetailLine}>เปิดมาแล้ว {minutesElapsed} นาที</p>
        </div>
        <div style={styles.modalButtonRow}>
          <button type="button" style={styles.secondaryButton} onClick={onCancel} disabled={closing}>
            ยกเลิก
          </button>
          <button type="button" style={styles.warnButton} onClick={onConfirm} disabled={closing}>
            {closing ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QrResultCard({ qrResult, qrImageUrl, copied, onCopy, onNewTable }) {
  return (
    <div style={styles.qrCard}>
      <img src={qrImageUrl} alt={`QR โต๊ะ ${qrResult.tableNumber}`} style={styles.qrImage} />
      <p style={styles.qrSummary}>
        โต๊ะ {qrResult.tableNumber} · ผู้ใหญ่ {qrResult.adultCount} · เด็ก {qrResult.childCount}
      </p>
      <div style={styles.linkRow}>
        <span style={styles.linkText}>{qrResult.url}</span>
        <button type="button" style={styles.copyButton} onClick={onCopy}>
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
        </button>
      </div>
      <button type="button" style={styles.primaryButton} onClick={onNewTable}>
        เปิดโต๊ะใหม่
      </button>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: COLORS.bg,
    color: COLORS.ink,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: '32px 16px',
  },
  container: {
    maxWidth: 480,
    margin: '0 auto',
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.sub,
    margin: '4px 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 24,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontSize: 18,
    fontWeight: 600,
  },
  input: {
    fontSize: 24,
    padding: '14px 16px',
    borderRadius: 8,
    border: `2px solid ${COLORS.border}`,
    background: COLORS.bg,
    color: COLORS.ink,
    outline: 'none',
  },
  primaryButton: {
    fontSize: 20,
    fontWeight: 700,
    padding: '16px 20px',
    borderRadius: 8,
    border: 'none',
    background: COLORS.tea,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  secondaryButton: {
    fontSize: 18,
    fontWeight: 600,
    padding: '14px 20px',
    borderRadius: 8,
    border: `2px solid ${COLORS.border}`,
    background: COLORS.card,
    color: COLORS.ink,
    cursor: 'pointer',
    flex: 1,
  },
  errorText: {
    color: COLORS.warnBorder,
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
  },
  warnBox: {
    background: COLORS.warnBg,
    border: `2px solid ${COLORS.warnBorder}`,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  warnTitle: {
    color: COLORS.warnText,
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  },
  warnDetail: {
    color: COLORS.warnText,
    fontSize: 17,
    margin: 0,
  },
  warnButton: {
    fontSize: 18,
    fontWeight: 700,
    padding: '14px 20px',
    borderRadius: 8,
    border: 'none',
    background: COLORS.warnBorder,
    color: '#FFFFFF',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(43, 43, 38, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalBox: {
    background: COLORS.card,
    borderRadius: 12,
    border: `2px solid ${COLORS.warnBorder}`,
    padding: 24,
    maxWidth: 400,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  modalDetailBox: {
    background: COLORS.warnBg,
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  modalDetailLine: {
    fontSize: 18,
    margin: 0,
    color: COLORS.warnText,
  },
  modalButtonRow: {
    display: 'flex',
    gap: 12,
  },
  qrCard: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  qrSummary: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  },
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  linkText: {
    fontSize: 14,
    color: COLORS.sub,
    wordBreak: 'break-all',
  },
  copyButton: {
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.bg,
    color: COLORS.teaDark,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
}
