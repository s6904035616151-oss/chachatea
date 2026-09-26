export const metadata = {
  title: 'chacha',
  description: 'ระบบสั่งอาหารร้านชา chacha',
}

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
