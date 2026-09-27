# CLAUDE.md — บันทึกอ้างอิงสำหรับโปรเจกต์ chacha

ไฟล์นี้ไว้ให้ Claude (หรือ AI ตัวอื่น) อ่านก่อนเริ่มงานในโปรเจกต์นี้ทุกครั้ง
เพื่อให้จำ context และกติกาที่ตกลงกันไว้ได้ถูกต้อง ไม่ต้องถามซ้ำ

## เกี่ยวกับโปรเจกต์
- ชื่อร้าน: **chacha** (ร้านชา)
- ระบบ: เว็บแอปสั่งอาหาร/เครื่องดื่มผ่าน QR code ที่โต๊ะ + หน้าจอครัวรับออเดอร์
- Stack: Next.js (App Router, JavaScript ล้วน — **ไม่ใช้ TypeScript**)
- Backend/DB: Supabase (Postgres)
- Deploy: Vercel

## ⚠️ กติกาสำคัญ: Next.js เวอร์ชันล่าสุด — Dynamic Route params เป็น Promise

โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด (Next.js 15+) ซึ่ง **`params` ของ Dynamic Route
เป็น Promise แล้ว ไม่ใช่ object ธรรมดา**

เวลาสร้างหน้า dynamic route (เช่น หน้าสั่งอาหารต่อโต๊ะ `app/order/[tableId]/page.js`
หรือ API route ที่รับ params) **ต้อง unwrap ด้วย `use()` จาก React เสมอ** (ใน client
component) หรือ `await` (ใน server component / route handler) — ห้าม destructure
`params` ตรง ๆ แบบเก่าเด็ดขาด เพราะจะพังหรือ warning

ตัวอย่างแนวทางที่ถูกต้อง (client component):

```js
'use client'
import { use } from 'react'

export default function Page({ params }) {
  const { tableId } = use(params)
  // ...
}
```

ตัวอย่างแนวทางที่ถูกต้อง (server component):

```js
export default async function Page({ params }) {
  const { tableId } = await params
  // ...
}
```

กติกานี้ใช้กับทุกหน้าที่มี dynamic segment (`[id]`, `[tableId]`, ฯลฯ) ที่จะสร้างใน
ขั้นตอนถัดไป (เช่น หน้าสั่งอาหารของแต่ละโต๊ะ)

## โครงสร้างฐานข้อมูล Supabase (มีอยู่แล้ว — ห้ามสร้างใหม่)

ตารางต่อไปนี้ถูกสร้างไว้แล้วใน Supabase ของโปรเจกต์นี้ ให้ใช้อ้างอิงชื่อ
ตาราง/คอลัมน์ให้ตรงเป๊ะทุกครั้งที่เขียนโค้ดที่ query ฐานข้อมูล **ไม่ต้องรัน
migration หรือสร้างตารางใหม่**

### `sessions`
| column        | type      | หมายเหตุ |
|---------------|-----------|----------|
| id            | uuid/int  | primary key |
| table_number  |           | หมายเลขโต๊ะ |
| adult_count   | int       | จำนวนผู้ใหญ่ |
| child_count   | int       | จำนวนเด็ก |
| status        | text      | สถานะ session — ค่าที่ใช้จริงในโค้ดตอนนี้: `'open'`, `'closed'` |
| created_at    | timestamp | เวลาสร้าง |

โต๊ะเดียวกันอาจมีหลายแถวใน `sessions` ตามประวัติ (เปิด-ปิดหลายรอบ) แต่ที่ `status =
'open'` ต้องมีได้ไม่เกิน 1 แถวต่อ `table_number` ณ เวลาใดเวลาหนึ่ง — หน้า
`app/generate-qr/page.js` เช็คเงื่อนไขนี้ก่อน insert ทุกครั้ง

### `menu_categories`
| column     | type | หมายเหตุ |
|------------|------|----------|
| id         |      | primary key |
| name       | text | ชื่อหมวดหมู่เมนู |
| sort_order | int  | ลำดับการแสดงผล |

### `menu_items`
| column      | type | หมายเหตุ |
|-------------|------|----------|
| id          |      | primary key |
| category_id |      | foreign key → menu_categories.id |
| name        | text | ชื่อเมนู |

### `orders`
| column       | type      | หมายเหตุ |
|--------------|-----------|----------|
| id           |           | primary key |
| session_id   |           | foreign key → sessions.id |
| table_number |           | หมายเลขโต๊ะ |
| items        | jsonb     | รายการอาหารที่สั่ง (array ของ item) |
| status       | text      | สถานะออเดอร์ |
| created_at   | timestamp | เวลาสั่ง |

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

ตั้งค่าใน `.env.local` (ดู `.env.local.example`) และใน Vercel Project Settings →
Environment Variables ตอน deploy จริง

## Supabase client
ใช้ `lib/supabaseClient.js` เป็น client กลาง import ใช้ได้ทุกที่ในโปรเจกต์:

```js
import { supabase } from '@/lib/supabaseClient'
```

Import แบบ `@/...` ใช้ได้เพราะมี `jsconfig.json` ตั้ง path alias ไว้แล้ว

## หน้าที่มีอยู่แล้วในโปรเจกต์
- `app/page.js` — หน้าแรก แสดงชื่อร้าน + ลิงก์ทดสอบ
- `app/generate-qr/page.js` — หน้าสำหรับพนักงานหน้าร้าน ใช้เปิดโต๊ะให้ลูกค้า:
  กรอกเลขโต๊ะ/จำนวนผู้ใหญ่/เด็ก → เช็ค session ที่ยัง `open` ค้างอยู่ของโต๊ะนั้น
  (ถ้ามีจะเตือนให้ปิดก่อน พร้อม modal ยืนยัน) → ถ้าไม่มีค้าง insert session ใหม่
  แล้วโชว์ QR code ที่ชี้ไป `/order/[เลขโต๊ะ]` (ใช้ api.qrserver.com สร้าง QR
  แบบไม่มี library เพิ่ม) — เป็น client component (`'use client'`) เรียก
  Supabase ตรงจาก browser ด้วย anon key
- `app/kitchen/page.js` — ยังเป็น placeholder รอทำหน้าจอครัวจริง
- `app/order/[tableNumber]/page.js` — หน้าสั่งอาหารของลูกค้า (dynamic route,
  unwrap `params` ด้วย `use()` ตามกติกาด้านบน): เช็ค `sessions` ที่
  `table_number` ตรงกันและ `status='open'` ก่อนเสมอ ถ้าไม่เจอจะโชว์ข้อความเต็ม
  จอไม่ให้สั่งอาหาร ถ้าเจอจะโหลดเมนูจาก `menu_categories` + `menu_items` มาเป็น
  แท็บ ลูกค้าเพิ่มลงตะกร้า (สูงสุด 10 รายการ, จำนวนต่อรายการ 1–5) แล้ว insert
  ลง `orders` (status เริ่มต้น `'received'`) — มีปุ่ม "เรียกเก็บเงิน" คำนวณยอด
  จาก `adult_count × 85 + child_count × 65` (ค่าคงที่ `ADULT_PRICE`/`CHILD_PRICE`
  ในไฟล์นี้) แล้ว update `sessions.status = 'closed'` เมื่อยืนยัน — เป็น client
  component เรียก Supabase ตรงจาก browser เหมือนหน้า generate-qr
  ใช้ฟ้อนต์ `next/font/google` (DM Serif Display) กับข้อความอังกฤษ/ตัวเลข
