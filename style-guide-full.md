# STYLE GUIDE: Bộ Card Microlearning (Light & Dark)

Tài liệu này là quy chuẩn bắt buộc khi dựng bộ card HTML. Mọi bộ card phải giống nhau về bố cục, nhịp điệu và cảm giác thị giác. Chỉ khác nhau ở nội dung và ở chế độ màu (Light hoặc Dark).

Đầu vào mỗi lần chạy sẽ có dòng `MODE: light` hoặc `MODE: dark`. Dùng đúng bộ token của mode đó (mục 3).

---

## 1. Đầu ra bắt buộc

- Một file HTML duy nhất, tự chứa, `lang` đặt theo ngôn ngữ của nguồn (ví dụ `en`, `vi`), mở trực tiếp được trong trình duyệt.
- Thư viện chỉ được dùng: Tailwind CDN (`https://cdn.tailwindcss.com`), Font Awesome 6.4 (cdnjs), Google Font **Plus Jakarta Sans** (400, 500, 600, 700, 800).
- Toàn bộ nội dung card nằm trong mảng `cardsData` (JavaScript). Mỗi phần tử có đúng các trường: `badge`, `counter`, `title`, `content` (chuỗi HTML).
- Một hàm `renderAll()` dựng TẤT CẢ card từ `cardsData` vào một dải (`#track`) đặt cạnh nhau, mỗi card dùng cùng một khung cố định. Có `goTo(index)`, nút Trước/Tiếp, chấm điều hướng nhanh, và nút chuyển bố cục Ngang/Dọc (mục 2B).
- Trang phải dùng tốt ở chế độ toàn màn hình (full viewport), không phụ thuộc kích thước khung nhúng.
- Không dùng ảnh ngoài, không dùng emoji thay cho đồ hoạ. Mọi hình minh hoạ là **SVG inline**.
- Toàn bộ màu viết qua **CSS variables** (mục 3), không hard-code mã màu trong `content`. Nhờ vậy cùng một cấu trúc chạy được cả hai mode.
- Gắn `data-theme="light"` hoặc `data-theme="dark"` trên thẻ `<html>`.

---

## 2. Cấu trúc một card (không được thay đổi)

Khung card tỉ lệ **1:1** (kiểu bài đăng Instagram), chiều rộng `var(--card-w)` (mục 2B, tối đa 520px), bo góc `rounded-2xl`, padding `p-5 md:p-6`, `overflow-hidden`. Từ trên xuống:

1. **Header** (có đường kẻ dưới)
   - Hàng trên: `badge` bên trái (viên thuốc, chữ in hoa, 11px, đậm, giãn chữ) và `counter` bên phải (dạng `01 / 10`, 12px, semibold).
   - `title` bên dưới: `text-base md:text-lg`, đậm, `leading-tight`, tối đa 2 dòng.
2. **Nội dung** (chiếm phần còn lại, cuộn được với scrollbar mảnh 3px nếu tràn, nhưng cố gắng không để tràn)
   - Một **khối minh hoạ SVG** ở trên cùng (cao `h-24` đến `h-32`).
   - Một **tiêu đề phần** (thanh dọc màu nhấn bên trái).
   - Một **danh sách** 3 đến 4 ý.
3. **Footer** (có đường kẻ trên): chấm tròn nhỏ + tên chủ đề bên trái, nhãn nhấn mạnh in hoa bên phải.
4. **Thanh điều khiển** (toolbar) nằm ngoài các card, dính ở đầu trang: nút `Trước` (nút phụ), dãy chấm, nút `Tiếp` (nút chính), và nút chuyển bố cục Ngang/Dọc (nút phụ, icon Font Awesome `fa-arrows-left-right` / `fa-arrows-up-down`).

---

## 2B. Bố cục trang: các card đặt cạnh nhau, vuốt được

Trang là một dải card (`#track`) cho phép vuốt/cuộn mượt bằng touchpad, chuột và cảm ứng. Thực hiện đúng như sau:

```css
html, body { height: 100%; margin: 0; }
body { min-height: 100vh; display: flex; flex-direction: column; }
:root { --card-w: min(520px, 88vw, calc(100vh - 150px)); }

.toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center;
           justify-content: center; gap: 12px; padding: 12px 16px; background: var(--page-bg); }

/* Ngang (mặc định): các card cạnh nhau, vuốt ngang, snap vào giữa */
.track { flex: 1; display: flex; align-items: center; gap: 20px;
         overflow-x: auto; overflow-y: hidden;
         scroll-snap-type: x mandatory; scroll-behavior: smooth;
         overscroll-behavior-x: contain;          /* vuốt ngang không kích hoạt "Back" của trình duyệt */
         padding: 16px calc(50vw - var(--card-w) / 2);
         scrollbar-width: none; }
.track::-webkit-scrollbar { display: none; }
.track .insta-card { flex: none; width: var(--card-w); max-width: none; scroll-snap-align: center; }

/* Dọc: xếp thành cột, cuộn dọc của trang */
.track.v { flex-direction: column; overflow: visible; scroll-snap-type: none;
           padding: 16px; align-items: center; }
html:has(.track.v) { scroll-snap-type: y proximity; }
.track.v .insta-card { scroll-snap-align: center; }
```

Quy tắc hành vi:
- Ở bố cục ngang, `.track` KHÔNG được cuộn dọc (`overflow-y: hidden`), để cử chỉ vuốt dọc bằng touchpad luôn cuộn trang bình thường, còn vuốt ngang chuyển card. Vùng nội dung bên trong card cuộn dọc riêng nếu tràn (`overflow-y: auto`), không chặn cuộn của trang khi đã chạm đáy.
- Bố cục dọc: các card xếp cột, cuộn dọc bằng touchpad/chuột, vuốt ngang không làm gì.
- `goTo(i)` gọi `scrollIntoView({behavior:'smooth', inline:'center', block:'center'})` cho card thứ i. Phím ← → (ngang) hoặc ↑ ↓ (dọc) chuyển card.
- Chấm điều hướng: bấm để `goTo`, trạng thái đang chọn cập nhật bằng `IntersectionObserver` (card hiển thị trên 60%) trên `#track`.
- **Phím F bật/tắt toàn màn hình**: `document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()`, bỏ qua khi đang gõ trong ô nhập. Thêm nút `fa-expand` ở thanh điều khiển với `title` và một chú thích nhỏ hiển thị phím `F` (thẻ `<kbd>` nhỏ, 10px, viền `--border`, chữ `--text-muted`), chữ chú thích bằng ngôn ngữ của nguồn (ví dụ "Fullscreen" cho nguồn tiếng Anh). Ẩn nút nếu `document.documentElement.requestFullscreen` không tồn tại (ví dụ iPhone).
- Mặc định mở ở bố cục ngang. Nhớ lựa chọn bằng biến JS (không dùng localStorage).

### Quy tắc nội dung

- **Một card = một ý chính.** Không nhồi hai chủ đề.
- Mỗi card có **đúng một khối minh hoạ SVG** có ý nghĩa (sơ đồ, biểu tượng, so sánh, quy trình, bảng mini). Không dùng SVG trang trí vô nghĩa.
- Văn bản dày nhưng gọn: cỡ chữ nội dung 12,8px (mobile) và 13,6px (từ 640px), `line-height` 1,35 đến 1,4. Danh sách 11,5px. Chú thích trong SVG 8 đến 10px.
- Câu ngắn, dùng động từ, ưu tiên con số, mốc, điều kiện cụ thể. Mỗi gạch đầu dòng tối đa khoảng 25 từ.
- Số lượng card: 6 đến 12, tuỳ độ dài tài liệu. Đánh số liên tục: `badge` là `01. Tên Ngắn`, `counter` là `01 / N`.
- Thứ tự card đi từ nền tảng đến nâng cao, phần cập nhật, ngoại lệ hoặc điểm dễ nhầm để cuối.
- **Ngôn ngữ: TUYỆT ĐỐI KHÔNG DỊCH.** Mọi chữ trong card (badge, title, nội dung, chú thích SVG, footer, nhãn nút Trước/Tiếp, nhãn bố cục) phải viết bằng đúng ngôn ngữ của văn bản nguồn. Nguồn tiếng Anh thì card hoàn toàn tiếng Anh, nguồn tiếng Việt thì tiếng Việt, nguồn tiếng Nhật thì tiếng Nhật, v.v. Không tự ý chuyển sang ngôn ngữ khác, kể cả khi hướng dẫn này viết bằng tiếng Việt. Nếu nguồn trộn nhiều ngôn ngữ, giữ nguyên từng đoạn theo ngôn ngữ gốc của nó và dùng ngôn ngữ chiếm đa số cho phần giao diện (nhãn nút, tiêu đề phần). Giữ nguyên tên riêng, thuật ngữ, trích dẫn.
- **Trung thực với nguồn:** chỉ dùng thông tin có trong tài liệu và link người dùng gửi. Không bịa số liệu, điều luật, trích dẫn. Phần nào nguồn không nói rõ thì bỏ qua hoặc ghi rõ "nguồn chưa nêu".

### Hình minh hoạ, sơ đồ, biểu đồ, bảng có sẵn trong nguồn (QUY TẮC BẮT BUỘC)

Khi nguồn (văn bản, PDF, ảnh, trang web) đã có hình minh hoạ, sơ đồ khối, lưu đồ, biểu đồ, bảng, cây thư mục, công thức hoặc sơ đồ dạng chữ (mermaid, ASCII), thì:

- **Sơ đồ khối / lưu đồ (các ô nối với nhau bằng mũi tên): KHÔNG vẽ tay bằng SVG.** Dùng cơ chế vẽ tự động của ứng dụng để không thể thiếu ô hay mũi tên:
  - Nếu yêu cầu có kèm "SƠ ĐỒ ĐÃ ĐƯỢC TRÍCH CHÍNH XÁC" (D1, D2...), chỉ cần đặt `<div data-graph-ref="D1" class="w-full h-full"></div>` vào đúng card hình. Không viết lại, không sửa dữ liệu.
  - Nếu sơ đồ chỉ có trong ảnh hoặc PDF: đọc kỹ rồi liệt kê **đầy đủ từng node và từng mũi tên** trong một thẻ `<script type="application/json" id="graph-specs">{"G1":{"dir":"TD","nodes":[{"id":"a","label":"nhãn nguyên văn","sub":"dòng phụ (tuỳ chọn)"}],"edges":[{"from":"a","to":"b","label":"nhãn mũi tên (tuỳ chọn)","dashed":false}]}}</script>` đặt trước thẻ `<script>` chính, rồi dùng `<div data-graph-ref="G1" class="w-full h-full"></div>`. `dir` là `TD` (trên xuống), `LR` (trái sang phải), `BT` hoặc `RL`. Mỗi nhãn chép nguyên văn từ nguồn. Đếm lại số node và số mũi tên của hình gốc rồi đối chiếu với `graph-specs` trước khi trả kết quả.
  - Mỗi sơ đồ khối nằm trong card hình riêng, bọc trong `<div class="flex-1 min-h-0">` để chiếm hết vùng nội dung. Nếu sơ đồ nhỏ (không quá 5 node) có thể đặt trong khối minh hoạ thường.
  - Biểu đồ số liệu, bảng, sơ đồ không phải dạng node-mũi tên thì vẫn vẽ lại bằng SVG hoặc bảng HTML giống hệt như các quy tắc dưới.
- **Tuyệt đối không bỏ, không cắt bớt, không rút gọn, không gộp** bất kỳ hình nào, kể cả khi ACTION là `tom-tat`. Phần tóm tắt chỉ áp dụng cho văn bản, KHÔNG áp dụng cho hình.
- **Vẽ lại giống hệt** bằng SVG inline: đủ mọi ô/nút, đủ mọi mũi tên và hướng mũi tên, đủ mọi đường nối, đúng thứ tự và vị trí tương đối, đúng nhãn chữ từng ký tự (giữ nguyên ngôn ngữ, tên file, tên hàm, số liệu, đơn vị). Không tự đổi tên nhãn, không thêm bớt ô, không sắp xếp lại, không đơn giản hoá, không "làm đẹp" bằng cách thay đổi nội dung. Chỉ được đổi màu sắc và nét vẽ theo bảng token của style guide, giữ nguyên cấu trúc.
- Với biểu đồ và bảng: giữ đủ số hàng, số cột, số liệu, chú giải, trục và đơn vị.
- Nếu hình **quá lớn hoặc quá nhiều chi tiết** để đọc rõ trong một card thường, KHÔNG thu nhỏ đến mức chữ dưới 8px và KHÔNG cắt bớt. Hãy dành **một card riêng chỉ chứa hình đó** (gọi là card hình): SVG chiếm gần hết vùng nội dung, chỉ kèm một dòng chú thích ngắn. Hình thật dài thì chia thành nhiều card hình liên tiếp (Phần 1/2, 2/2) nhưng phải giữ liên kết (mũi tên đứt đoạn ghi rõ "tiếp tục ở card sau"), không làm mất phần nào.
- Card hình là ngoại lệ của quy tắc "khối minh hoạ cao `h-24` đến `h-32`" và "danh sách 3 đến 4 ý": khối SVG được phép cao hết vùng nội dung và không cần danh sách.
- Đặt card hình ngay sau card có phần văn bản nói về hình đó. Ghi rõ ở `badge`/`title` card đó là hình gốc của nguồn.
- Nếu không thể dựng lại trung thực một hình (ảnh mờ, thiếu thông tin), hãy nói rõ trong card "hình gốc không đọc rõ phần ...", tuyệt đối không bịa nội dung.
- Với nguồn không có hình, vẫn áp dụng quy tắc cũ: mỗi card có một khối minh hoạ SVG có ý nghĩa.

### Chế độ xử lý nội dung

- `ACTION: tom-tat`: rút gọn nội dung, giữ ý cốt lõi, số liệu và điều kiện quan trọng, rồi highlight các cụm then chốt.
- `ACTION: giu-nguyen`: giữ nguyên ý và gần như nguyên từ ngữ của nguồn, chỉ chia thành các card theo chủ đề, không lược bỏ ý. Vẫn highlight các cụm then chốt.

### Highlight

- Dùng thẻ `<b>` cho từ khoá quan trọng trong câu.
- Dùng `<mark class="hl">` cho cụm cần nhớ nhất (tối đa 1 đến 2 cụm mỗi card, không quá 8 từ mỗi cụm). Style của `.hl` định nghĩa ở mục 3.
- Không highlight cả câu, không highlight quá nhiều đến mức mất tác dụng.

---

## 3. Design tokens

Khai báo trong thẻ `<style>`:

```css
:root,
:root[data-theme="light"] {
  --page-bg:        #F8F4EE;
  --card-bg:        #FAF7F2;
  --surface:        #F4EFEA;   /* khối minh hoạ, ô con */
  --surface-solid:  #FFFFFF;   /* ô nổi trong khối minh hoạ, nút phụ */
  --border:         #EBDED6;

  --text:           #383331;   /* nội dung */
  --text-strong:    #2C2A29;   /* tiêu đề, tiêu đề phần */
  --text-muted:     #8C7A75;   /* counter, footer */
  --text-sub:       #4A4442;   /* chú thích trong minh hoạ */

  --accent:         #E89CAE;   /* hồng chính */
  --accent-hover:   #D88B9D;
  --accent-deep:    #A64B5E;   /* hồng đậm: nhãn, nhấn mạnh */
  --accent-soft:    #F4D3DA;   /* nền badge, nền highlight */

  --on-accent:      #FFFFFF;   /* chữ trên nút chính */

  --ok:             #5E8360;   --ok-soft:   #A4C2A5;
  --warn:           #E89C38;
  --danger:         #D85A5A;   --danger-soft: #E06A6A;
  --info:           #2B6CB0;
  --yellow:         #ECC94B;

  --shadow-card:    0 12px 30px -8px rgba(216, 139, 157, 0.15);
  --glow:           none;
  --glow-text:      none;
  --glow-svg:       none;
}

:root[data-theme="dark"] {
  --page-bg:        #232323;
  --card-bg:        #2D2D2D;   /* nền chuẩn của dark mode */
  --surface:        #363033;   /* khối minh hoạ, hơi ngả hồng-xám */
  --surface-solid:  #3D3539;
  --border:         #4A3C42;

  --text:           #F3D9E0;   /* chữ hồng nhạt, đọc thoải mái trên nền tối */
  --text-strong:    #FFB8CB;   /* tiêu đề, hồng sáng */
  --text-muted:     #A58C95;
  --text-sub:       #E8C4CF;

  --accent:         #FF9DB8;   /* hồng phát sáng */
  --accent-hover:   #FFB3C8;
  --accent-deep:    #FF8FAE;   /* nhãn, nhấn mạnh (sáng hơn light mode) */
  --accent-soft:    rgba(255, 157, 184, 0.16);

  --on-accent:      #2D2D2D;   /* chữ trên nút chính: tối để đủ tương phản */

  --ok:             #8FD69A;   --ok-soft:   #6FB67A;
  --warn:           #FFC15E;
  --danger:         #FF7A85;   --danger-soft: #FF909A;
  --info:           #7FB2FF;
  --yellow:         #FFD966;

  --shadow-card:    0 0 0 1px rgba(255, 157, 184, 0.14),
                    0 16px 44px -10px rgba(255, 143, 177, 0.28);
  --glow:           0 0 10px rgba(255, 143, 177, 0.45),
                    0 0 22px rgba(255, 143, 177, 0.18);
  --glow-text:      0 0 8px rgba(255, 157, 184, 0.45);
  --glow-svg:       drop-shadow(0 0 3px rgba(255, 157, 184, 0.75))
                    drop-shadow(0 0 8px rgba(255, 143, 177, 0.35));
}

body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--page-bg); color: var(--text); }

.insta-card {
  width: 100%; max-width: 500px; aspect-ratio: 1 / 1;
  background: var(--card-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.dense-text { font-size: 0.8rem; line-height: 1.35; }
@media (min-width: 640px) { .dense-text { font-size: 0.85rem; line-height: 1.4; } }

.custom-scrollbar::-webkit-scrollbar { width: 3px; }
.custom-scrollbar::-webkit-scrollbar-track { background: var(--card-bg); }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 3px; }

.hl {
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-weight: 700;
  padding: 0 3px;
  border-radius: 3px;
}
:root[data-theme="dark"] .hl { text-shadow: var(--glow-text); }
```

Mọi class Tailwind trong HTML phải dùng giá trị biến, ví dụ `bg-[var(--card-bg)]`, `text-[var(--text-strong)]`, `border-[var(--border)]`. Không viết mã hex trực tiếp.

---

## 4. Thông số từng thành phần

| Thành phần | Light | Dark |
|---|---|---|
| **Badge** | nền `--accent-soft`, chữ `--accent-deep`, 11px, bold, uppercase, tracking-wider, `rounded-full`, `px-2.5 py-0.5` | giống, thêm viền `1px solid` màu `--accent` ở 35% độ mờ và `box-shadow: var(--glow)` rất nhẹ |
| **Counter** | `--text-muted`, 12px, semibold | giống |
| **Title** | `--text-strong`, đậm | `--text-strong` + `text-shadow: var(--glow-text)` |
| **Đường kẻ header/footer** | `1px solid var(--border)` | giống |
| **Tiêu đề phần** | đậm, `--text-strong`, thanh trái `border-l-2` màu `--accent`, `pl-1.5` | giống, thanh trái thêm `box-shadow: var(--glow)` |
| **Khối minh hoạ** | nền `--surface`, viền `--border`, `rounded-lg`, `p-2` | giống |
| **Ô con trong minh hoạ** | nền `--surface-solid`, viền `--border`, `rounded` | giống |
| **Danh sách** | 11,5px, `space-y-1`, từ khoá `<b>` | giống |
| **Footer chấm tròn** | `w-2 h-2`, `rounded-full`, `--accent` | thêm `box-shadow: var(--glow)` |
| **Footer nhãn phải** | `--accent-deep`, bold, tracking-wider, 11px | thêm `text-shadow: var(--glow-text)` |
| **Nút Tiếp (chính)** | nền `--accent`, chữ `--on-accent`, hover `--accent-hover`, `rounded-xl`, `text-xs` semibold | thêm `box-shadow: var(--glow)` |
| **Nút Trước (phụ)** | nền `--surface-solid`, viền `--border`, chữ `--accent-deep`, `rounded-xl`, `text-xs` semibold | chữ `--accent-deep`, hover viền `--accent` |
| **Chấm điều hướng** | cao `h-2`, `rounded-full`; đang chọn rộng `w-5` màu `--accent-deep`; còn lại `w-2` màu `--accent` ở 50% | đang chọn thêm `box-shadow: var(--glow)` |

---

## 5. Quy tắc đồ hoạ SVG

- Luôn có `viewBox`, co giãn theo `h-full` hoặc `w-full` của khối minh hoạ. Không đặt kích thước pixel cứng.
- Tô màu bằng biến CSS (`fill="var(--accent)"`, `stroke="var(--accent-deep)"`), không hard-code hex.
- Bảng màu đồ hoạ:
  - Hồng là màu chủ đạo cho đối tượng chính, phần cần nhấn.
  - Màu trạng thái chỉ dùng đúng nghĩa: `--danger` cho nguy hiểm, cấm, sai; `--warn` cho cảnh báo; `--ok` cho đúng, an toàn; `--info` cho thông tin, bắt buộc; `--yellow` cho điểm nhấn phụ.
  - Nền trung tính dùng `--surface`, `--border`, `--text-muted`.
- Nét viền 1,5 đến 2px, bo góc nhẹ (`rx` 3 đến 4), đường nét đứt cho quỹ đạo, vùng nhìn, ranh giới ước lượng.
- Chữ trong SVG: 8 đến 10px, đậm với nhãn quan trọng, không chồng lên đối tượng khác.
- Đồ hoạ phải đúng nội dung card (sơ đồ, ký hiệu, quy trình), đọc hiểu được trong 3 giây.

### Glow (chỉ áp dụng ở Dark mode)

- Áp `filter: var(--glow-svg)` cho **các phần tử hồng chủ đạo** trong SVG (nét viền hồng, đối tượng chính màu hồng), qua một class như `.glow`.
- Glow phải **tinh tế và sang trọng**, không loè loẹt:
  - Tối đa 2 lớp bóng, độ mờ ≤ 0,5.
  - Chỉ dùng cho phần tử hồng, không dùng cho chữ nội dung thường, không dùng cho màu trạng thái (đỏ, vàng, xanh).
  - Mỗi card chỉ có khoảng 1 đến 3 điểm phát sáng, những chỗ thật sự cần nhìn đầu tiên.
  - Chữ thân bài tuyệt đối không có glow để giữ độ rõ khi đọc.
- Ở Light mode không dùng glow, biến glow đặt `none`.

---

## 6. Điều cấm

- Không thay đổi cấu trúc card (mục 2), không đổi font, không đổi tỉ lệ 1:1.
- Không dùng màu ngoài bảng token, không viết hex trực tiếp trong `content`.
- Không dùng ảnh raster, emoji làm đồ hoạ, hay icon từ nguồn ngoài (ngoại trừ Font Awesome cho nút điều hướng).
- Không tạo card chỉ có chữ mà không có khối minh hoạ.
- Không để chữ tràn ra ngoài card hoặc bị cắt cụt giữa câu. Nếu quá nhiều nội dung, tách thành card mới.
- Không bịa thông tin ngoài nguồn.
- Không bỏ, cắt bớt hay đơn giản hoá hình minh hoạ có sẵn trong nguồn (xem mục 2, "Hình minh hoạ ... có sẵn trong nguồn").

---

## 7. Checklist trước khi trả kết quả

- [ ] `data-theme` đúng với `MODE` được yêu cầu.
- [ ] Mọi card đều có đủ: badge, counter, title, khối SVG, tiêu đề phần, danh sách.
- [ ] `counter` liên tục, `badge` đánh số đúng.
- [ ] Mỗi card có 1 đến 2 `<mark class="hl">`, không quá tay.
- [ ] Không có mã hex hard-code trong nội dung card.
- [ ] Dark mode: glow chỉ ở yếu tố hồng, chữ thân bài không phát sáng, độ tương phản chữ vẫn rõ.
- [ ] Số liệu và khẳng định đều bám nguồn.
- [ ] Mọi sơ đồ khối dùng `data-graph-ref` và đủ số node, mũi tên so với nguồn.
- [ ] Mọi hình, sơ đồ, biểu đồ, bảng có trong nguồn đều có mặt, vẽ lại giống hệt (đủ ô, mũi tên, nhãn), không bị cắt bớt; hình lớn nằm ở card riêng.
- [ ] File chạy độc lập, điều hướng Trước/Tiếp/chấm hoạt động.
- [ ] Tất cả card hiển thị cạnh nhau trong `#track`, vuốt ngang bằng touchpad snap vào từng card, vuốt dọc vẫn cuộn trang; nút Ngang/Dọc chuyển được bố cục.
- [ ] Hiển thị đẹp khi mở toàn màn hình (không phụ thuộc khung nhúng).
