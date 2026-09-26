import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>chacha</h1>
      <p>ระบบสั่งอาหารร้านชา chacha</p>

      <ul>
        <li>
          <Link href="/generate-qr">ไปหน้า /generate-qr</Link>
        </li>
        <li>
          <Link href="/kitchen">ไปหน้า /kitchen</Link>
        </li>
      </ul>
    </main>
  )
}
