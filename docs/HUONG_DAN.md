# TravelSpend — Hướng dẫn sử dụng & bảo trì

Website: **https://travelspend.trantienphat-ftu2.workers.dev**
Mã nguồn: https://github.com/phattran23/travelspend

---

# PHẦN A — HƯỚNG DẪN SỬ DỤNG

## 1. Bắt đầu

1. Mở website, bấm **Create an account** (Tạo tài khoản).
2. Nhập **họ tên**, **email**, **mật khẩu** (tối thiểu 8 ký tự) → **Create account**.
3. Lần sau chọn **Sign in** để đăng nhập. Phiên đăng nhập được giữ 30 ngày.
4. Bấm **Sign out** (góc trên bên phải) để đăng xuất.

> Dữ liệu của mỗi tài khoản là riêng tư — người khác không xem được chuyến đi của bạn.

**Muốn xem thử ngay?** Ở màn hình trống, bấm **Load sample trip** để tạo chuyến đi mẫu "Đà Nẵng & Hội An" với đầy đủ chi tiêu và biểu đồ.

## 2. Tạo chuyến đi

Bấm **＋ New trip** và điền:

| Ô | Ý nghĩa |
|---|---|
| Trip name | Tên chuyến đi (bắt buộc) |
| Destination | Điểm đến — web tự chọn emoji phù hợp (🏖️ Đà Nẵng, ⛰️ Đà Lạt, 🏝️ Phú Quốc…) |
| Budget | Ngân sách tổng, đơn vị **₫ (VND)**, tự thêm dấu phẩy: `15,000,000` |
| Start / End date | Ngày đi / về — dùng để dự báo và tính "chi tiêu an toàn mỗi ngày" |
| Category budgets | (Tuỳ chọn) Hạn mức riêng cho từng danh mục: Lodging, Food, Flights… |
| Travelers | Tên những người đi, cách nhau bằng dấu phẩy (đã gồm bạn). Có thể thêm sau |

Sửa hoặc xoá chuyến đi: vào chuyến đi → nút ✏️ / 🗑️ trên banner. **Xoá chuyến đi sẽ xoá toàn bộ chi tiêu và hoá đơn — không khôi phục được.**

## 3. Thêm chi tiêu

Trong chuyến đi, bấm **＋ Add expense** (hoặc nhấn phím **N**, hoặc nút ＋ giữa thanh dưới trên điện thoại).

1. **Amount** — số tiền (₫). Dùng các nút nhanh `+50k`, `+100k`, `+500k`, `+1M`; **Clear** để xoá.
2. **Category** — chọn danh mục (Lodging, Food, Transport, Flights, Activities, Shopping, Health, Other).
3. **What was it for?** — mô tả ngắn (VD: "Bún chả Hương Liên").
4. **Date** — ngày chi; có nút nhanh **Today** / **Yesterday**.
5. **Paid by** — ai đã trả tiền.
6. **Split between** — những ai cùng chia khoản này (bấm tên để bật/tắt, **Everyone** = tất cả). Web hiển thị "≈ ₫X mỗi người".
7. **Notes** — ghi chú (tuỳ chọn).
8. **Receipt** — đính kèm hoá đơn: ảnh JPG/PNG/WebP/GIF hoặc PDF, tối đa 5 MB.

Bấm **Add expense** → có hiệu ứng pháo hoa 🎉 khi lưu thành công.

> Chia tiền luôn **chia đều** giữa những người được chọn; phần lẻ đồng được cộng cho người đầu danh sách.

## 4. Dashboard (tổng quan)

**Banner đầu trang**
- **Total budget / Total spent / Remaining** và **vòng tròn % ngân sách đã dùng** (xanh → vàng ≥ 85% → đỏ khi vượt).
- Dòng trạng thái: "On track", "Spending faster than your plan", "Almost at your limit", "Over budget…".
- Huy hiệu trạng thái chuyến đi: *Planning / In N days / Happening now / Completed*.

**Thẻ thông tin nhanh**: chi tiêu trung bình/ngày, bình quân đầu người, danh mục chi nhiều nhất, **Safe daily spend** (còn được tiêu bao nhiêu mỗi ngày), **Projected total** (dự báo tổng chi), ngày chi nhiều nhất, số hoá đơn đã có.

**Biểu đồ**
- *Spending by category* — tròn theo danh mục.
- *Spending trend & forecast* — cột theo ngày + đường luỹ kế + đường ngân sách + đường dự báo (nét đứt).
- *Category budgets* — thanh tiến độ từng danh mục so với hạn mức.
- *Daily spend by category* — cột chồng theo ngày.
- *Spending calendar* — lịch nhiệt: ngày càng đậm = chi càng nhiều (rê chuột để xem số tiền).
- *Spending by traveler* — mỗi người đã trả bao nhiêu so với phần phải chịu.
- *Biggest expenses* — top 5 khoản lớn nhất.

## 5. Tab "Expenses" (danh sách chi tiêu)

- **Tìm kiếm** theo tên/ghi chú; **lọc** theo danh mục, theo người trả.
- **Sort**: mới nhất / cũ nhất / số tiền cao nhất / thấp nhất.
- **Group**: theo ngày, theo danh mục, hoặc không nhóm. Phía trên có tổng số khoản và tổng tiền đang hiển thị.
- Mỗi dòng có: 📎 xem hoá đơn · ⧉ **nhân bản** (tạo khoản mới từ khoản cũ) · ✏️ sửa · 🗑️ xoá.

## 6. Tab "Travelers & splits" (người đi & chia tiền)

- Mỗi người hiển thị **Paid** (đã trả), **Fair share** (phần phải chịu) và số dư: *Gets back* (được nhận lại) / *Owes* (còn nợ).
- **Settle up**: danh sách "A trả B số tiền X" với **số lần chuyển khoản ít nhất**.
- **＋ Add traveler**: thêm người; ✏️ đổi tên; ✕ xoá.
  - Không xoá được người đã trả tiền cho khoản nào đó, hoặc người là người duy nhất chia một khoản — hãy sửa/xoá khoản đó trước.

## 7. Xuất báo cáo

Bấm **⬇ Export** (trên điện thoại: nút Export ở thanh dưới):
- **PDF report** — báo cáo A4: tổng quan, theo danh mục, theo người đi, thanh toán bù trừ, toàn bộ chi tiêu.
- **Excel workbook** — 5 sheet: Summary, Expenses, By category (kèm ngân sách), By traveler, Settlement.

## 8. Giao diện

- Nút 🌙 / ☀️ trên thanh trên: chuyển **chế độ sáng / tối** (nhớ lựa chọn của bạn).
- Giao diện tự co giãn cho máy tính, máy tính bảng, điện thoại.
- Phím tắt: **N** = thêm chi tiêu, **Esc** = đóng cửa sổ.

## 9. Hỏi đáp nhanh

| Câu hỏi | Trả lời |
|---|---|
| Quên mật khẩu? | Hiện **chưa có** chức năng đặt lại mật khẩu — xem mục B.9 để bổ sung; tạm thời chủ site có thể xoá tài khoản trong DB để đăng ký lại. |
| Báo "Receipt uploads are not enabled"? | Bộ nhớ hoá đơn (R2) chưa bật — xem B.7. Vẫn lưu chi tiêu bình thường không cần hoá đơn. |
| Có chia không đều được không? | Chưa — hiện chỉ chia đều. |
| Số tiền có lẻ/thập phân? | Chỉ nhận số nguyên VND. |
| Dữ liệu trên máy (chạy local) và trên web có chung không? | **Không**, hai cơ sở dữ liệu tách biệt. |

---

# PHẦN B — CẬP NHẬT & BẢO TRÌ

## B.1. Cấu trúc dự án

```
TravelSpend/
├─ public/                 ← Giao diện (chạy trên trình duyệt)
│  ├─ index.html           ← Khung trang
│  ├─ app.js               ← Toàn bộ logic giao diện, biểu đồ, xuất file
│  ├─ styles.css           ← Giao diện, dark mode, responsive
│  ├─ theme.js             ← Áp dụng sáng/tối trước khi vẽ trang
│  ├─ _headers             ← Header bảo mật khi chạy trên Cloudflare
│  └─ vendor/              ← Chart.js, SheetJS, jsPDF, html2canvas (đã đóng gói sẵn)
├─ worker/
│  ├─ index.js             ← API chạy trên Cloudflare (Workers + D1 + R2)
│  └─ schema.sql           ← Cấu trúc bảng dữ liệu
├─ server.js               ← Bản Node.js để chạy trên máy (cùng API với worker/)
├─ wrangler.jsonc          ← Cấu hình Cloudflare
├─ scripts/cf-setup.mjs    ← Script cài đặt Cloudflare một lệnh
└─ docs/HUONG_DAN.md       ← File này
```

> ⚠️ **Quy tắc vàng:** API tồn tại ở **hai nơi** — `server.js` (chạy local) và `worker/index.js` (chạy trên Cloudflare). Khi sửa API hoặc luật kiểm tra dữ liệu, **sửa cả hai file** để hai môi trường luôn giống nhau. Phần giao diện (`public/`) dùng chung.

## B.2. Quy trình cập nhật chuẩn

```bash
# 1. Sửa code (trong public/, worker/index.js, server.js …)

# 2. Chạy thử trên máy
node server.js                       # http://localhost:3000   (bản Node)
#   hoặc thử đúng như Cloudflare:
npx wrangler d1 execute travelspend --local --file=worker/schema.sql
npm run cf:dev                       # http://localhost:8787

# 3. Lưu vào Git & đẩy lên GitHub
git add -A
git commit -m "Mô tả thay đổi"
git push

# 4. Đưa lên website thật
npm run cf:deploy
```

Sau khi deploy, nhấn **Ctrl+F5** trên trình duyệt để tải lại bản mới (tránh cache cũ).

## B.3. Công thức thêm / sửa tính năng thường gặp

### Thêm một danh mục chi tiêu mới (ví dụ "Quà tặng")
1. `public/app.js` → object `CATS`: thêm `gifts: { label: 'Gifts', icon: '🎁', color: '#f97316' }`.
2. `server.js` → mảng `CATEGORIES`: thêm `'gifts'`.
3. `worker/index.js` → mảng `CATEGORIES`: thêm `'gifts'`.
4. Commit → `npm run cf:deploy`. (Không cần đổi cơ sở dữ liệu.)

### Thêm một cột dữ liệu mới (ví dụ `currency` cho chuyến đi)
1. `worker/schema.sql`: thêm cột vào `CREATE TABLE` (cho cài mới).
2. Chạy lệnh migration trên DB đang chạy:
   ```bash
   npx wrangler d1 execute travelspend --remote --command "ALTER TABLE trips ADD COLUMN currency TEXT"
   ```
3. `server.js`: thêm một dòng `try { db.exec('ALTER TABLE trips ADD COLUMN currency TEXT'); } catch {}` cạnh dòng tương tự đã có (cho bản local).
4. Sửa `tripFields()` và các câu `INSERT/UPDATE` trong **cả** `server.js` và `worker/index.js`.
5. Sửa form + hiển thị trong `public/app.js`.
6. Deploy.

> Luôn **thêm cột** (ALTER TABLE ADD COLUMN) thay vì xoá/đổi tên cột để không mất dữ liệu cũ.

### Thêm một API mới
Trong `worker/index.js` và `server.js`, thêm một dòng `route('GET', '/api/ten-api', handler)` — luôn gọi `requireUser` và kiểm tra quyền sở hữu (`getTrip`/`getExpense`) trước khi trả dữ liệu.

### Đổi giao diện, màu sắc, font
- Màu: biến `--accent`, `--accent-2`, … ở đầu `public/styles.css` (có khối riêng cho `[data-theme="dark"]`).
- Font: biến `--font` trong `styles.css` và hằng `FONT` ở đầu `app.js` (dùng cho biểu đồ).
- Văn bản giao diện: chuỗi tiếng Anh nằm trực tiếp trong `app.js` — tìm và sửa (hoặc dịch sang tiếng Việt).

### Đổi nội dung báo cáo PDF / Excel
Hàm `exportPdf()` và `exportExcel()` trong `public/app.js`.

## B.4. Cơ sở dữ liệu — xem, sao lưu, khôi phục

```bash
# Sao lưu toàn bộ DB trên Cloudflare ra file (nên làm định kỳ, và trước khi migration)
npx wrangler d1 export travelspend --remote --output=backup-2026-10-11.sql

# Khôi phục / nạp lại từ file sao lưu (cẩn thận: ghi vào DB thật)
npx wrangler d1 execute travelspend --remote --file=backup-2026-10-11.sql

# Xem nhanh dữ liệu
npx wrangler d1 execute travelspend --remote --command "SELECT COUNT(*) AS users FROM users"
npx wrangler d1 execute travelspend --remote --command "SELECT id,name,email,created_at FROM users"

# Xoá một tài khoản (kèm toàn bộ chuyến đi, chi tiêu của tài khoản đó)
npx wrangler d1 execute travelspend --remote --command "DELETE FROM users WHERE email='a@b.com'"
```

Bản chạy trên máy: toàn bộ dữ liệu nằm trong thư mục **`data/`** (`travelspend.db` + `receipts/`) — chỉ cần sao chép thư mục này để sao lưu.

## B.5. Theo dõi lỗi & quay lui bản cũ

```bash
npx wrangler tail                    # xem log trực tiếp của website đang chạy
npx wrangler deployments list        # danh sách các lần deploy
npx wrangler rollback                # quay về phiên bản deploy trước đó
```

Cũng có thể xem ở Cloudflare Dashboard → **Workers & Pages → travelspend → Logs / Metrics / Deployments**.

## B.6. Tên miền riêng

Cloudflare Dashboard → **Workers & Pages → travelspend → Settings → Domains & Routes → Add → Custom domain**. Tên miền cần nằm trong tài khoản Cloudflare của bạn. HTTPS được bật tự động.

## B.7. Bật tải hoá đơn (R2)

1. Cloudflare Dashboard → **R2 Object Storage** → bật/đăng ký gói R2 (có hạn mức miễn phí, yêu cầu thêm phương thức thanh toán).
2. Chạy lại: `npm run cf:setup` — script tạo bucket `travelspend-receipts`, gắn vào Worker và deploy.
3. Thử đính kèm hoá đơn vào một chi tiêu.

## B.8. Chi phí & giới hạn

Gói miễn phí của Workers/D1/R2 đủ cho nhóm nhỏ, dùng cá nhân. Hạn mức có thể thay đổi — kiểm tra trang giá của Cloudflare và mục **Usage** trong Dashboard. Nếu vượt hạn mức, nâng lên gói Workers Paid.

## B.9. Bảo mật & vấn đề cần lưu ý

- Mật khẩu được băm (PBKDF2 trên Cloudflare / scrypt trên Node); phiên đăng nhập dùng cookie HttpOnly + SameSite=Strict; đăng nhập sai nhiều lần bị tạm khoá 15 phút.
- Cloudflare **không** lưu mật khẩu dạng chữ thường — nhưng chủ site vẫn là người có thể truy cập DB: hãy bảo vệ tài khoản Cloudflare bằng xác thực 2 bước.
- `database_id` trong `wrangler.jsonc` không phải bí mật. **Không bao giờ** commit API token Cloudflare.
- Thư viện trong `public/vendor/` là bản cố định; định kỳ kiểm tra bản vá bảo mật của Chart.js, SheetJS, jsPDF, html2canvas và thay file.
- Chưa có: quên/đổi mật khẩu, xác minh email, chia tiền không đều, nhiều loại tiền tệ — có thể bổ sung theo công thức ở B.3.

## B.10. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Web hiện giao diện cũ sau khi deploy | Cache trình duyệt | Ctrl+F5 |
| `npm run cf:deploy` báo lỗi D1 `database_id` | Chưa chạy setup / sai ID | `npm run cf:setup` |
| `Please enable R2 … code 10042` | Tài khoản chưa bật R2 | Xem B.7 (app vẫn chạy, chỉ thiếu hoá đơn) |
| `Not logged in` / lỗi xác thực khi deploy | Hết phiên wrangler | `npx wrangler login` |
| Đăng nhập báo "Too many attempts" | Sai mật khẩu quá 10 lần | Đợi 15 phút |
| API trả 500 | Lỗi code/migration chưa chạy | `npx wrangler tail` để xem chi tiết; chạy migration còn thiếu |
| Chạy local báo thiếu `node:sqlite` | Node quá cũ | Cài Node.js ≥ 22.5 |
| Biểu đồ/xuất file không hoạt động | Thiếu file trong `public/vendor/` | Khôi phục các file vendor từ Git |

## B.11. Danh sách lệnh hay dùng

| Việc | Lệnh |
|---|---|
| Chạy bản Node trên máy | `node server.js` |
| Chạy thử bản Cloudflare trên máy | `npm run cf:dev` |
| Cài đặt Cloudflare lần đầu / sửa cấu hình | `npm run cf:setup` |
| Đưa bản mới lên web | `npm run cf:deploy` |
| Xem log | `npx wrangler tail` |
| Sao lưu DB | `npx wrangler d1 export travelspend --remote --output=backup.sql` |
| Quay lui bản deploy | `npx wrangler rollback` |
