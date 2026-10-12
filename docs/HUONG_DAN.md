# Travel Wallet — Hướng dẫn sử dụng & bảo trì

Travel Wallet giúp nhóm đi chơi quản lý **quỹ chung**, **chi tiêu chung** và **khoản tự trả cá nhân** ở một nơi. Cuối chuyến đi, web tính ra số dư quỹ còn lại và **kế hoạch thanh toán đơn giản nhất**.

---

# PHẦN A — SỬ DỤNG

## 1. Khái niệm chính

| Khái niệm | Ý nghĩa |
|---|---|
| **Wallet (quỹ chung)** | Tiền cả nhóm góp vào, dùng để trả chi phí chung |
| **Add money** | Một người nộp tiền vào quỹ (đóng góp) |
| **Expense** | Một khoản chi. Có thể **trả từ quỹ** hoặc **một người tự trả (tiền túi)** |
| **Shared** | Khoản chi chia đều cho nhiều người được chọn |
| **Personal** | Khoản chi chỉ của một người (VD: mua quà riêng) |
| **Receives / Owes** | Cuối chuyến: ai được nhận lại tiền, ai còn nợ nhóm |

**Cách tính cho mỗi người**

> Kết quả = *Đã góp quỹ* + *Đã tự trả bằng tiền túi* − *Phần chi tiêu của mình*

- Kết quả **dương** → được nhận lại (**Receives**).
- Kết quả **âm** → còn nợ nhóm (**Owes**).
- Tiền còn trong quỹ được hoàn lại cho những người được nhận; web tự tạo **ít giao dịch nhất**.

## 2. Bắt đầu

1. Mở web → **Create an account** → nhập tên, email, mật khẩu (≥ 8 ký tự).
2. Lần sau chọn **Sign in**. Phiên đăng nhập giữ 30 ngày.
3. Muốn xem thử: ở màn hình trống bấm **Try a sample trip**.

## 3. Quy trình một chuyến đi

1. **＋ New trip** → nhập tên, điểm đến, ngày đi/về, ngân sách dự kiến (tuỳ chọn), danh sách người đi (cách nhau dấu phẩy).
2. **＋ Add money** → mỗi người nộp tiền vào quỹ (chọn người, số tiền, ngày, ghi chú).
3. Trong chuyến đi, mỗi khoản chi bấm **＋ Expense** (hoặc phím **N**):
   - **Amount**: số tiền (có nút nhanh +100k, +500k, +1M, +5M).
   - **Paid from**: *Group wallet* hoặc tên một người (tiền túi).
   - **Shared** → chọn những ai cùng chia; **Personal** → chọn người được hưởng.
   - Tuỳ chọn: danh mục, ngày, ghi chú, đính kèm hoá đơn (ảnh/PDF ≤ 5 MB).
4. Theo dõi ở 3 tab:
   - **Overview**: số dư từng người + biểu đồ theo danh mục và theo ngày.
   - **Activity**: dòng thời gian tiền vào/ra; lọc *All / Money in / Shared / Personal*, tìm kiếm; bấm một dòng để sửa hoặc xoá.
   - **Settle up**: số dư quỹ còn lại, **kế hoạch thanh toán**, bảng kết quả từng người.
5. Cuối chuyến: vào **Settle up** → **Copy plan** (dán vào nhóm chat) hoặc xuất **PDF / Excel**.

## 4. Quản lý

- **Sửa / xoá chuyến đi, xuất báo cáo**: nút **⋯** góc phải tiêu đề chuyến đi.
- **Thêm / đổi tên / xoá người đi**: tab Overview (bấm tên một người).
  - Không xoá được người đã góp quỹ, đã trả tiền, hoặc là người duy nhất của một khoản chi — hãy sửa các khoản đó trước.
- **Giao diện sáng/tối**: nút 🌙/☀️ trên thanh trên. **Esc** đóng cửa sổ.

## 5. Hỏi đáp

| Câu hỏi | Trả lời |
|---|---|
| Quỹ bị âm (Overdrawn)? | Quỹ đã chi nhiều hơn số tiền thu. Hãy **Add money** hoặc ghi lại ai thực sự đã trả. Kế hoạch thanh toán sẽ có dòng "… pays Wallet" để bù. |
| Chia không đều? | Chưa hỗ trợ — chỉ chia đều giữa những người được chọn. Có thể tách thành nhiều khoản. |
| Quên mật khẩu? | Chưa có chức năng đặt lại mật khẩu. |
| Báo "Receipt uploads are not enabled"? | Chưa bật R2 trên Cloudflare — xem B.6. Vẫn lưu khoản chi bình thường. |
| Dữ liệu trên máy và trên web? | Hai cơ sở dữ liệu tách biệt. |

---

# PHẦN B — CẬP NHẬT & BẢO TRÌ

## B.1. Cấu trúc

```
worker/index.js     ← TOÀN BỘ API (chạy trên Cloudflare và cả khi chạy local)
worker/schema.sql   ← cấu trúc cơ sở dữ liệu
server.js           ← bộ chạy local (SQLite + file) dùng đúng worker/index.js
public/app.js       ← toàn bộ giao diện & logic tính toán
public/styles.css   ← giao diện (biến màu ở đầu file)
public/index.html   ← khung trang
scripts/cf-setup.mjs, wrangler.jsonc ← cấu hình Cloudflare
```

> Chỉ có **một** nơi chứa API là `worker/index.js` — sửa một lần, cả local lẫn Cloudflare cùng cập nhật.

## B.2. Quy trình cập nhật

```bash
node server.js              # chạy thử: http://localhost:3000
git add -A && git commit -m "Mô tả thay đổi" && git push
npm run cf:deploy           # đưa lên web
```
Sau đó nhấn **Ctrl+F5** để tải bản mới.

**Lần đầu nâng cấp lên Travel Wallet** (DB cũ cần thêm bảng/cột mới): chạy `npm run cf:setup` một lần.

## B.3. Sửa nội dung ở đâu

| Muốn sửa | File | Tìm |
|---|---|---|
| Tên app, slogan đăng nhập | `public/app.js` | `Group trip money, simply settled` |
| Tiêu đề tab trình duyệt | `public/index.html` | `<title>` |
| Danh mục chi tiêu (tên, icon, màu) | `public/app.js` + `worker/index.js` | `CATS` và `CATEGORIES` |
| Màu, font, giao diện | `public/styles.css` | `:root`, `[data-theme="dark"]` |
| Công thức tính / kế hoạch thanh toán | `public/app.js` | `function ledger` |
| Chuyến đi mẫu | `worker/index.js` | `seedDemo` |
| Nội dung báo cáo PDF / Excel | `public/app.js` | `exportPdf`, `exportExcel` |

## B.4. Thêm tính năng

- **Thêm cột dữ liệu**: thêm vào `worker/schema.sql` (cho cài mới) + chạy
  `npx wrangler d1 execute travelspend --remote --command "ALTER TABLE trips ADD COLUMN ten_cot TEXT"`
  + thêm một dòng `ALTER` tương tự (bọc try/catch) trong `server.js`; sau đó sửa `worker/index.js` và giao diện.
- **Thêm API**: thêm `route('GET', '/api/...', handler)` trong `worker/index.js`, luôn gọi `requireUser` và kiểm tra quyền sở hữu (`getTrip` / `getOwned`).

## B.5. Dữ liệu & vận hành

```bash
npx wrangler d1 export travelspend --remote --output=backup.sql       # sao lưu
npx wrangler d1 execute travelspend --remote --file=backup.sql        # khôi phục
npx wrangler d1 execute travelspend --remote --command "SELECT COUNT(*) FROM users"
npx wrangler tail                                                      # xem log trực tiếp
npx wrangler rollback                                                  # quay về bản deploy trước
```
Chạy local: dữ liệu trong thư mục `data/` (sao chép để sao lưu).

## B.6. Bật tải hoá đơn (R2)

Cloudflare Dashboard → **R2** → bật (có gói miễn phí, cần phương thức thanh toán) → chạy lại `npm run cf:setup`.

## B.7. Tên miền riêng

Dashboard → **Workers & Pages → travelspend → Settings → Domains & Routes → Add → Custom domain**.

## B.8. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Web hiện giao diện cũ | Ctrl+F5 |
| API lỗi 500 sau khi nâng cấp | `npm run cf:setup` (thêm bảng/cột còn thiếu), rồi xem `npx wrangler tail` |
| Deploy báo lỗi đăng nhập | `npx wrangler login` |
| "Too many attempts" | Sai mật khẩu > 10 lần — đợi 15 phút |
| Local báo thiếu `node:sqlite` | Cài Node.js ≥ 22.5 |
| Tài khoản cũ trên máy không đăng nhập được | Phiên bản mới dùng cách băm mật khẩu khác; xoá thư mục `data/` hoặc đăng ký lại |

## B.9. Bảo mật

Mật khẩu băm PBKDF2; cookie HttpOnly + SameSite=Strict; giới hạn đăng nhập sai; mỗi người chỉ truy cập dữ liệu của mình. Hãy bật xác thực 2 bước cho tài khoản Cloudflare và **không commit** API token.
