# Bàn giao nhánh giao diện 3D Battleship

Cập nhật: 26/11/2026 (Asia/Saigon). Phiên mới hãy đọc file này trước khi sửa giao diện 3D, rồi kiểm tra lại trạng thái Git vì các thông tin dưới đây là mốc bàn giao.

Phần checklist phía dưới mô tả snapshot lúc bắt đầu phiên hoàn thiện. Phần **Bàn giao sau phiên hoàn thiện 3D** là trạng thái và kết quả kiểm chứng mới nhất.

## Mục tiêu người dùng

- Thử giao diện 3D trên nhánh riêng `feature/3d-interface`, giữ bản chính trên `main`.
- Giao diện tiếng Việt; tàu có hình dáng trực quan, không chỉ là các ô có chữ.
- Khi đến lượt bắn, ưu tiên bản đồ đối thủ lớn; khi đối thủ bắn, ưu tiên bản đồ đội tàu của mình và luôn nhìn được cách xếp tàu.
- Có chơi với máy: xếp tàu hợp lệ ngẫu nhiên, bắn ngẫu nhiên vào ô chưa bắn. Chức năng này đã có ở bản nền, không phải phần mới của 3D.
- Yêu cầu mới nhất đã xử lý ở `main`: dấu X trên nền vàng trong mờ khi trúng; khi chìm một tàu, tất cả ô trúng của đúng tàu đó chuyển đỏ trong mờ ngay trong trận, kể cả sau khi tải lại. Nền vàng 20%, đỏ 24%, vẫn nhìn được thân tàu bên dưới.

## Git tại thời điểm bàn giao

- Workspace: `C:\VsCode\.vscode\game`.
- Đang checkout `feature/3d-interface`, HEAD `2604064` (`sửa giao diện , thêm chơi với máy`).
- Đã khôi phục phần 3D từ stash vào working tree ngày 26/11. Code 3D và file bàn giao này **chưa commit**.
- Các file 3D đã thay đổi: `client/package.json`, `client/package-lock.json`, `client/src/App.tsx`, `client/src/App.css`, `client/src/index.css`; file mới `client/src/OceanBoard3D.tsx`.
- Stash dự phòng vẫn còn: `71622aa`, tên `On feature/3d-interface: WIP 3D interface before main hit-marker update`. Đã dùng `stash apply`, không dùng `pop`. Không apply lần nữa lên working tree đang có các thay đổi này.
- `main` và `origin/main` đang tại `6de0dde` (`ch`), có thêm `7707514` (`nhẹ màu đánh dấu`) và `6de0dde` so với nhánh 3D. Những cập nhật dấu bắn của main **chưa được đưa sang 3D**.
- Chưa merge main, chưa push hay triển khai giao diện 3D lên server trong lần bàn giao này.
- Trước khi chuyển nhánh/merge/pull, lưu toàn bộ thay đổi đang dở bằng commit WIP hoặc stash có cả file mới. Không reset/clean làm mất code. Nếu stash, nhớ bao gồm `OceanBoard3D.tsx` và file này.
- Sandbox có thể chặn ghi metadata `.git`; các lệnh đọc có thể cần `git -c safe.directory=C:/VsCode/.vscode/game ...`. Không sửa cấu hình Git toàn cục chỉ để vượt cảnh báo ownership.

## Phần 3D đã viết

### Renderer: `client/src/OceanBoard3D.tsx`

- Dùng Three.js `^0.187.0`, kèm `@types/three`.
- Bàn biển 10 × 10 có chiều sâu, trục A–J/1–10, camera phối cảnh, đèn, màu nước và chuyển động nhẹ.
- Tàu được dựng bằng geometry: thân, boong, cabin, tháp pháo; xoay theo hướng xếp tàu, có màu theo loại và trạng thái chìm.
- Có hình cho phát trượt, dấu X trúng và dấu chìm.
- Raycasting chọn ô; kéo chuột đổi góc nhìn; phím mũi tên + Enter chọn ô.
- Có lớp xem trước vị trí đặt tàu và báo vị trí không hợp lệ.
- Có resize, giới hạn pixel ratio/FPS, nhận reduced-motion, cleanup, xử lý WebGL mất/ngắt context và chuyển về 2D.
- Có biến thể `primary`/`mini` cho hai bản đồ.

### Tích hợp: `client/src/App.tsx`

- Có nút 3D/2D tại sảnh và trong trận; lựa chọn lưu ở localStorage `battleship-view-mode`. Mặc định là 3D nếu chưa chọn 2D.
- Sảnh có khu vực xem trước, truyền 5 tàu mẫu và 1 phát trượt.
- Màn xếp tàu, màn chơi và màn kết quả đều có nhánh render 3D, vẫn giữ bàn cờ 2D để chuyển lại.
- Luồng phòng, SignalR, xếp tàu, chơi máy và luật game dùng lại backend hiện có.

### Giao diện

- `client/src/App.css`: canvas biển, nhãn hướng dẫn/tọa độ, nút đổi chế độ, preview, fallback và responsive.
- `client/src/index.css`: các điều chỉnh nền/overflow/caret trong bộ thay đổi 3D.

## Đã xác minh và giới hạn

### Kiểm tra lại ngày 26/11/2026

- `cd client; npm.cmd run build`: **qua**.
- Build còn cảnh báo chunk lớn: JavaScript khoảng 903 kB, gzip 243 kB. Chưa lazy-load Three.js/OceanBoard3D.
- `npm.cmd run lint`: exit code 0 nhưng **còn 7 cảnh báo**, không được mô tả là lint sạch:
  - 4 cảnh báo ghi/access ref trong render ở OceanBoard3D.
  - 1 cảnh báo setState đồng bộ trong effect.
  - 2 cảnh báo dependency effect (`onCell`, `ships`/`shots`).

### Đã kiểm tra ở phiên trước, chưa chạy lại browser ngày 26/11

- Đã sửa lỗi trắng trang `Cannot access 'sceneDescription' before initialization`: đưa khai báo `sceneDescription` lên trước effect sử dụng nó. Bản stash đã chứa bản sửa.
- Đã bỏ hai biến material không dùng gây lỗi TypeScript.
- Đã dùng Chrome headless + SwiftShader thấy canvas có kích thước, có lưới/mặt biển, không còn uncaught page error từ lỗi khởi tạo.
- Ảnh cũ: `artifacts/ui-3d-preview.png` (25/11). Thư mục `artifacts` bị Git ignore, ảnh này chỉ có trên máy làm việc và không đi theo clone mới.
- **Ảnh cũ chỉ thấy lưới/mặt biển, không thấy 5 tàu mẫu và phát trượt dù props đã truyền.** Vì vậy chưa thể khẳng định mô hình tàu hoặc toàn bộ trận 3D hoạt động đúng.
- Chưa xác minh đầy đủ chọn ô/xếp tàu/bắn, chuyển lượt, kết quả, reconnect và mobile trong chế độ 3D. Các bài thử 2D cũ không chứng minh các tương tác 3D đã chạy đúng.

## Việc cần tiếp tục, theo ưu tiên

1. **Sửa tàu/shot không hiện hoặc bị mất khi render lại.** Giả thuyết cần kiểm chứng: effect dựng scene phụ thuộc `onUnavailable`; sảnh truyền callback inline nên callback đổi identity theo mỗi render. Effect khởi tạo có thể dọn/tạo scene mới trong khi effect thêm tàu chỉ phụ thuộc các JSON key không đổi, khiến group mới trống. Đây là suy luận từ code + ảnh, chưa phải nguyên nhân đã xác nhận. Kiểm tra React StrictMode và việc renderer/scene được dựng lại; giữ callback ổn định, đồng bộ lại objects/preview khi scene thực sự thay đổi.
2. Xử lý các cảnh báo refs/effect để tránh việc thêm dependency tùy tiện làm liên tục hủy/tạo renderer hoặc lặp render. Kiểm tra cleanup texture/material/geometry, cả Sprite và LineSegments.
3. Chạy một trận máy và một trận hai người trong 3D: tàu đủ 5 chiếc hiện đúng; đặt ngang/dọc, hover báo sai; click bắn đúng tọa độ ở các góc camera; không bắn lặp; đúng lượt; chuyển 2D/3D không mất trạng thái; reload giữ đội tàu.
4. Đưa hai commit mới của main sang nhánh 3D sau khi lưu WIP. Đọc lại diff trước khi merge vì `App.tsx` có thể xung đột. Main đã có `sunkCells` trong kết quả/lịch sử bắn để biết chính xác mọi ô của tàu vừa chìm; không suy đoán tàu bằng các ô kề nhau vì luật cho phép tàu chạm nhau.
5. Áp dụng dấu X và màu nền trong mờ theo yêu cầu mới nhất cho cả hai chế độ. `OceanBoard3D.addShot` hiện vẫn dùng màu/emissive riêng và vòng khi chìm; bản 3D chưa xử lý chuyển toàn bộ hit của một tàu sang đỏ như main. Chỉ lộ thông tin các ô đã trúng/tàu đã chìm trong trận, không lộ tàu đối thủ chưa chìm.
6. Màn kết quả 3D đang truyền `defeated` cho cả hai đội và không truyền lịch sử bắn vào bản đồ đối thủ; kiểm tra lại trước khi coi là hoàn chỉnh.
7. Tối ưu camera/bố cục: ảnh cũ cho thấy bàn cờ nhỏ giữa canvas lớn. Xác minh ở desktop/mobile, bản đồ được ưu tiên theo lượt cần thực sự lớn hơn (own board hiện truyền `variant="mini"` cố định).
8. Lazy-load renderer 3D nếu phù hợp, kiểm tra WebGL fallback bằng thiết bị/trình duyệt thật. Chạy build/lint và kiểm tra hình ảnh lại sau sửa.

## Bàn giao sau phiên hoàn thiện 3D (26/11/2026)

### Đã triển khai

- Giữ nhánh `feature/3d-interface`, HEAD `2604064`; chưa commit, push, merge hay deploy. Stash dự phòng `71622aa` vẫn giữ nguyên. Kiểm tra `git status` trước khi chuyển nhánh; các thay đổi nằm trong working tree.
- Đưa lại các file backend/Core/test/contract/client type có `sunkCells` từ `main` vào working tree mà không thay đổi metadata Git. Chỉ lộ chính xác ô của tàu vừa chìm; không lộ tàu đang sống. Lịch sử khôi phục giữ các ô chìm.
- Renderer tách trong `client/src/oceanScene.ts`, lazy load qua `client/src/Board3D.tsx`. Scene khởi tạo một lần; dữ liệu cập nhật không dựng lại renderer. Camera orthographic tự fit kích thước/góc nhìn; nút Xoay bật kéo góc riêng, nút Góc chuẩn phục hồi. Chuột/chạm/bàn phím chọn ô; scene ẩn tạm dừng render.
- Năm lớp tàu có cấu trúc riêng. Có đạn, splash, ripple, tia lửa, khói và animation tàu nghiêng/chìm. Dấu trúng vàng 20%, ô chìm đỏ 24%. Các ô chìm dựa trên `sunkCells` hoặc dữ liệu tàu sở hữu.
- Hàng đợi sự kiện server phát lần lượt; hiệu ứng thường giữ 1050 ms, chìm 2100 ms rồi mới tự đổi bàn/hiện kết quả. Refresh/reconnect không phát lại hiệu ứng cũ. Chọn mục tiêu rồi bấm **Bắn**, hoặc chọn cột/hàng.
- Web Audio tổng hợp sau thao tác đầu tiên. Tắt tiếng, âm lượng hiệu ứng/biển, chất lượng tự động/thấp/cao lưu tại localStorage. Chất lượng thấp giảm pixel ratio/FPS/số hạt; `prefers-reduced-motion` bỏ chuyển động hạt/chìm. Mất WebGL có thể thử lại hoặc tiếp tục 2D.
- Desktop: bàn chính và bàn phụ. Mobile portrait/landscape: một bàn chính, đổi bằng tab. Xếp tàu mobile đặt danh sách trên bàn; canvas tự resize/frustum fit theo khung.
- Đã lưu hướng thiết kế vào `DESIGN.md`, mô tả tính năng tại `PRODUCT.md` và `README.md`.

### Kiểm chứng

- `npm.cmd run build --prefix client`: qua. Three.js là chunk riêng khoảng 598 kB (152 kB gzip); vẫn có cảnh báo chunk trên 500 kB.
- `npm.cmd run lint --prefix client`: qua, không warning.
- `dotnet test Battleship.slnx --no-restore -p:BuildProjectReferences=false`: 13/13 test qua. Restore bị sandbox chặn khi .NET đọc `C:/Users/ASUS/AppData/Roaming/NuGet/NuGet.Config`.
- `npm.cmd run test:smoke --prefix client`: qua (hai người, validation, lượt, reconnect, victory, rematch).
- `npm.cmd run test:bot --prefix client`: qua (trận hoàn tất, không bắn lặp, reconnect, rematch).
- Chrome/SwiftShader: full match hai người qua với miss/hit/sink, chính xác toàn bộ ô chìm, giữ bí mật tàu sống, 2D/3D, refresh sau khi chìm, victory, rematch, không có lỗi trang.
- Canvas còn nguyên sau khi đổi settings; đủ năm tàu; chuột/bàn phím chọn mà chưa bắn. Sáu kích thước 320x740, 390x844, 768x1024, 844x390, 1440x900, 1920x1080 không tràn/cắt nút kể cả menu cài đặt mở. Thay viewport không dựng lại renderer.
- Thử cảm ứng, `prefers-reduced-motion`, WebGL không khởi tạo được và mất context giữa trận/fallback 2D đều qua.
- Ảnh kiểm chứng cục bộ (thư mục `artifacts/` bị ignore): `3d-placement-desktop.png`, `3d-placement-mobile.png`, `3d-battle-desktop.png`, `3d-battle-mobile.png`, `3d-battle-landscape.png`, `3d-effect-miss.png`, `3d-effect-hit.png`, `3d-effect-sink.png`, `3d-own-sinking-mobile.png`, `3d-victory-desktop.png`.

### Giới hạn còn lại

- SwiftShader không đo GPU/pin thật. Thử trên điện thoại tầm trung và iPhone/Android trước khi deploy. Chất lượng tự động hiện là heuristic coarse-pointer/số lõi CPU, chưa đo FPS; chất âm tổng hợp cần nghe/cân chỉnh trên thiết bị thật.
- Chunk 3D khoảng 598 kB minified (152 kB gzip), nhưng tải chỉ khi bật 3D. Có thể tối ưu nếu mạng yếu gây tải chậm.
- Không cập nhật server production trong phiên này. Backend kiểm thử chạy trên 8181, Vite trên 5174.

## Chạy thử cục bộ

Tại root, một terminal backend:

```powershell
dotnet run --project server/Battleship.Server/Battleship.Server.csproj --urls http://localhost:8181
```

Terminal frontend:

```powershell
cd client
npm.cmd install
npm.cmd run dev
```

Vite thường dùng 5173 (có thể tự tăng nếu bận). `client/vite.config.ts` proxy `/hub` sang `http://localhost:8181`; dùng backend đúng port. Backend không chạy có thể gây lỗi SignalR dù canvas vẫn dựng được. Mở URL mà Vite in ra, đợi kết nối rồi chơi với máy/tạo phòng. Lệnh `npm install` chỉ cần khi dependency chưa khớp package/lock sau đổi nhánh.

Kiểm tra:

```powershell
cd client
npm.cmd run build
npm.cmd run lint
# Từ root:
dotnet test Battleship.slnx
```

Các script `client/scripts/smoke-game.mjs`, `smoke-bot.mjs` kiểm tra luồng backend, không thay thế kiểm tra tương tác canvas 3D.

## Server thực tế — tránh nhầm cổng cũ

- Người dùng muốn mở game ở `http://113.171.153.134:5228`.
- Theo cấu hình repo: Nginx công khai 5228 → `127.0.0.1:5227` → Docker port 8080. Cả frontend đã build và SignalR được phục vụ cùng địa chỉ, không cần container FE riêng.
- Compose dùng `--urls http://0.0.0.0:8080` để tránh app nghe 5228 bên trong trong khi Docker lại forward vào 8080 (lỗi cũ gây 502/unhealthy).
- 8181 là cổng backend khi phát triển cục bộ, không phải cổng công khai mà người dùng yêu cầu.
- Chưa kết nối hay xác minh trạng thái server thực tế ở phiên bàn giao; không tuyên bố đã deploy/test từ mạng ngoài.

## Câu mở đầu cho phiên mới

> Đọc CONTEXT_3D.md và phần bàn giao mới nhất, kiểm tra git status và nhánh hiện tại. Giữ nguyên stash dự phòng và main. Trước khi deploy, thử nghiệm GPU, âm thanh và cảm ứng trên điện thoại thật; ghi kết quả vào file này.

Sau mỗi phiên làm 3D, cập nhật file này: commit/nhánh, những gì thực sự kiểm chứng, lỗi còn lại và bước kế tiếp. Không đánh đồng code đã viết với tính năng đã kiểm tra chạy được.
