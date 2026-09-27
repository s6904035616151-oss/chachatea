# chacha

ระบบสั่งอาหารร้านชา "chacha" — Next.js (App Router, JavaScript) + Supabase
พร้อม deploy บน Vercel

## เริ่มต้นใช้งาน

1. ติดตั้ง dependencies
   ```bash
   npm install
   ```

2. คัดลอกไฟล์ env ตัวอย่างแล้วใส่ค่าจริงจาก Supabase project ของคุณ
   ```bash
   cp .env.local.example .env.local
   ```
   แล้วเปิด `.env.local` ใส่ค่า:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

3. รันโปรเจกต์
   ```bash
   npm run dev
   ```
   เปิด http://localhost:3000

## Deploy บน Vercel

1. push โค้ดขึ้น GitHub repo
2. import repo เข้า Vercel
3. ตั้งค่า Environment Variables บน Vercel ให้ตรงกับ `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy — ทดสอบว่า deploy สำเร็จได้ที่หน้าแรก ซึ่งมีลิงก์ไป `/generate-qr`
   และ `/kitchen`

## หมายเหตุสำคัญสำหรับ dev/AI ที่ทำงานต่อในโปรเจกต์นี้

ดูรายละเอียดกติกาการเขียนโค้ด, โครงสร้างฐานข้อมูล Supabase ที่มีอยู่แล้ว และ
ข้อควรระวังเรื่อง Dynamic Route `params` ใน Next.js เวอร์ชันล่าสุดได้ที่ไฟล์
[`CLAUDE.md`](./CLAUDE.md)
