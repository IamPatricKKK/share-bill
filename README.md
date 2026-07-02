# 🤝 Lên Kèo — Lên kế hoạch & chia tiền nhóm

> **Plan together, split the bill.**

Ứng dụng web để **lên kế hoạch mua đồ** và **chia bill** cho nhóm bạn.

Luồng mới (plan-first):
1. **Tạo nhóm** chỉ với tên nhóm + tên chủ nhóm — chưa cần giá tiền.
2. Mọi người vào nhóm bằng mã/link, **chat** để bàn mua gì.
3. Khi chốt, chủ nhóm bấm **“Lên giá & chia bill”** để nhập số tiền từng người + QR/tài khoản.
4. Thành viên xem bill và bấm **“Done”** — **không bắt buộc up ảnh** chứng minh.
5. Chủ nhóm xác nhận từng người (hoặc đánh dấu tiền mặt).

> 💬 Mỗi nhóm có **group chat riêng**, chỉ tồn tại trong nhóm đó.

## 🛠 Công nghệ

- **Frontend:** React + Vite
- **Database:** Supabase (PostgreSQL)
- **Deploy:** Vercel

---

## 🚀 Hướng dẫn cài đặt

### Bước 1: Cài dependencies

```bash
cd LenKeo
npm install
```

### Bước 2: Tạo database trên Supabase

1. Đăng nhập [Supabase Dashboard](https://supabase.com/dashboard)
2. Tạo project mới (hoặc dùng project có sẵn)
3. Vào **SQL Editor** → bấm **New Query**
4. Copy toàn bộ nội dung file `supabase-setup.sql` → paste vào → bấm **Run**
   - Nếu bạn **đã tạo schema cũ** từ trước, chạy `supabase-migration.sql` thay vì setup (an toàn khi chạy nhiều lần).
5. Chạy thêm `supabase-bills.sql` (New Query → paste → Run) để thêm tính năng **hoá đơn chi tiết** (nhiều hoá đơn / ngày / hạn trả / gán món theo người). An toàn khi chạy nhiều lần.
6. Kiểm tra tab **Table Editor** → phải thấy các bảng: `groups`, `members`, `messages`, `participants`, `bills`, `bill_items`, `item_shares`, `bill_shares`

### Bước 3: Lấy Supabase credentials

1. Vào **Settings** → **API** trong Supabase Dashboard
2. Copy 2 giá trị:
   - **Project URL** (dạng `https://xxxxx.supabase.co`)
   - **anon public key** (dạng `eyJhbGci...`)

### Bước 4: Tạo file `.env`

Copy file mẫu:

```bash
cp .env.example .env
```

Mở file `.env` và điền thông tin:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Bước 5: Chạy project

```bash
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`

---

## 📦 Deploy lên Vercel

1. Push code lên GitHub
2. Vào [vercel.com](https://vercel.com) → **Import Project** → chọn repo
3. Thêm **Environment Variables**:
   - `VITE_SUPABASE_URL` = URL Supabase của bạn
   - `VITE_SUPABASE_ANON_KEY` = Anon key Supabase của bạn
4. Bấm **Deploy**

---

## 📖 Cách sử dụng

### Chủ nhóm
1. Bấm **Tạo nhóm mới** → nhập tên nhóm + tên của bạn → **Tạo nhóm**
2. Chia sẻ **mã nhóm / link / QR** để mọi người vào
3. Tab **Chat**: cùng nhau bàn mua gì, lên kế hoạch
4. Khi chốt → tab **Lên giá**: nhập tên + số tiền từng người (nút **Chia đều** tiện lợi), thêm QR/tài khoản ngân hàng → **Chốt giá & mở bill**
5. Theo dõi trạng thái ở tab **Bill**; **Xác nhận** khi ai đó báo đóng, hoặc **Tiền mặt** nếu nhận tiền mặt
6. Có thể **➕ Thêm người** vào bill bất cứ lúc nào
7. **Đóng / Xóa** nhóm khi hoàn tất

### Thành viên
1. Bấm **Vào nhóm** → nhập mã nhóm (hoặc mở link được chia sẻ)
2. Nhập **tên của bạn** để tham gia & chat
3. Tab **Chat**: bàn kế hoạch cùng nhóm
4. Khi chủ nhóm đã lên giá → tab **Bill** → chọn tên của bạn → xem QR/tài khoản
5. Chuyển khoản rồi bấm **Done** (up ảnh là **tùy chọn**, không bắt buộc)
6. Chờ chủ nhóm xác nhận

---

## 📁 Cấu trúc project

```
LenKeo/
├── index.html              # Entry HTML
├── package.json
├── vite.config.js
├── supabase-setup.sql      # SQL tạo database (project mới)
├── supabase-migration.sql  # SQL migrate database cũ
├── supabase-bills.sql      # SQL thêm hoá đơn chi tiết (chạy sau setup)
├── .env.example             # File mẫu biến môi trường
├── public/
│   └── vite.svg             # Favicon
└── src/
    ├── main.jsx             # Entry React
    ├── App.jsx              # Router
    ├── index.css            # Toàn bộ CSS (dark theme)
    ├── lib/
    │   ├── supabase.js      # Supabase client
    │   └── identity.js      # Tên hiển thị lưu localStorage theo nhóm
    ├── components/
    │   └── Chat.jsx         # Group chat realtime (dùng chung)
    └── pages/
        ├── Home.jsx         # Trang chủ
        ├── CreateGroup.jsx  # Tạo nhóm (tên + chủ nhóm)
        ├── GroupOwner.jsx   # Chủ nhóm: Chat + Lên giá + theo dõi bill
        └── GroupMember.jsx  # Thành viên: Chat + đóng bill (Done)
```

---

## ⚠️ Lưu ý

- Ảnh chuyển khoản được lưu dạng **base64** trong database. Mỗi ảnh ~500KB, Supabase free tier giới hạn **500MB** database.
- Nên **xóa nhóm** sau khi hoàn tất để giải phóng dung lượng.
- Mỗi nhóm tối đa **30 thành viên**.
- Ảnh upload tối đa **2MB** mỗi file.
