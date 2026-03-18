# 💸 Share Bill - Chia Bill Nhóm

Ứng dụng web đơn giản để chia bill cho nhóm bạn. Chủ nhóm tạo bill, thêm thành viên, chia sẻ link/QR. Thành viên chuyển khoản và upload ảnh xác nhận.

## 🛠 Công nghệ

- **Frontend:** React + Vite
- **Database:** Supabase (PostgreSQL)
- **Deploy:** Vercel

---

## 🚀 Hướng dẫn cài đặt

### Bước 1: Cài dependencies

```bash
cd share-bill
npm install
```

### Bước 2: Tạo database trên Supabase

1. Đăng nhập [Supabase Dashboard](https://supabase.com/dashboard)
2. Tạo project mới (hoặc dùng project có sẵn)
3. Vào **SQL Editor** → bấm **New Query**
4. Copy toàn bộ nội dung file `supabase-setup.sql` → paste vào → bấm **Run**
5. Kiểm tra tab **Table Editor** → phải thấy 2 bảng: `groups` và `members`

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
1. Bấm **Tạo nhóm mới**
2. Nhập tên nhóm, tên chủ nhóm, tổng số tiền
3. Thêm thành viên (tên + số tiền). Có nút **Chia đều** tự động
4. Upload ảnh QR chuyển khoản hoặc nhập thông tin tài khoản ngân hàng
5. Bấm **Tạo nhóm** → nhận được mã nhóm + QR code để chia sẻ
6. Theo dõi trạng thái thanh toán trên Dashboard
7. Xác nhận khi thành viên đã chuyển khoản, hoặc bấm **Tiền mặt** nếu nhận tiền mặt
8. Đóng / Xóa nhóm khi hoàn tất

### Thành viên
1. Bấm **Vào nhóm** → nhập mã nhóm (hoặc mở link được chia sẻ)
2. Chọn tên của mình trong danh sách
3. Xem QR / thông tin tài khoản chủ nhóm → chuyển khoản
4. Upload ảnh chuyển khoản → bấm **Done**
5. Chờ chủ nhóm xác nhận

---

## 📁 Cấu trúc project

```
share-bill/
├── index.html              # Entry HTML
├── package.json
├── vite.config.js
├── supabase-setup.sql      # SQL tạo database
├── .env.example             # File mẫu biến môi trường
├── public/
│   └── vite.svg             # Favicon
└── src/
    ├── main.jsx             # Entry React
    ├── App.jsx              # Router
    ├── index.css            # Toàn bộ CSS (dark theme)
    ├── lib/
    │   └── supabase.js      # Supabase client
    └── pages/
        ├── Home.jsx         # Trang chủ
        ├── CreateGroup.jsx  # Tạo nhóm (3 bước)
        ├── GroupOwner.jsx   # Dashboard chủ nhóm
        └── GroupMember.jsx  # Giao diện thành viên
```

---

## ⚠️ Lưu ý

- Ảnh chuyển khoản được lưu dạng **base64** trong database. Mỗi ảnh ~500KB, Supabase free tier giới hạn **500MB** database.
- Nên **xóa nhóm** sau khi hoàn tất để giải phóng dung lượng.
- Mỗi nhóm tối đa **30 thành viên**.
- Ảnh upload tối đa **2MB** mỗi file.
