# Kế hoạch phát triển và sửa lỗi Battleship

Cập nhật ngày 27/11/2026 (Asia/Saigon), sau khi đọc code và chạy kiểm tra cục bộ.

## Phạm vi tiếp theo đã thống nhất — 27/11/2026

- Người dùng đồng ý hướng phát triển chat chữ, tài khoản/lịch sử trận, bạn bè/mời chơi và xếp hạng; bỏ mic khỏi phiên bản này vì môi trường triển khai hiện dùng HTTP. Không triển khai thoại/WebRTC/TURN trong đợt này.
- Phạm vi dưới đây đã được triển khai trong working tree ở phiên trước và đang được nghiệm thu. Các ghi chú chưa có tài khoản/database ở mốc khảo sát ban đầu là lịch sử; xem ROADMAP.md và biên bản tiếp tục bên dưới để biết trạng thái hiện tại.
- **Lộ trình chi tiết đang áp dụng:** [ROADMAP.md](ROADMAP.md) — các mốc M1–M5. Người dùng xác nhận tài khoản cũng chạy trên HTTP, không áp điều kiện bắt buộc HTTPS; giữ băm mật khẩu/cookie/chống CSRF và ghi nhận giới hạn đường truyền. Không thêm lại mic.

1. **Chat trong phòng:** hai người nhắn riêng trong phòng, khôi phục lịch sử khi reconnect; điện thoại có nút mở chat và số tin chưa đọc.
2. **Tài khoản và lịch sử:** định danh người chơi cố định, lưu kết quả do server xác nhận; vẫn giữ chế độ chơi khách để thử game và đấu bot.
3. **Bạn bè và mời chơi:** mã người chơi, kết bạn, trạng thái online/đang đấu/offline; lời mời có chấp nhận/từ chối/hết hạn. Khi chấp nhận, server tạo phòng và đưa hai người vào.
4. **Tìm trận và xếp hạng:** ghép người gần điểm, dùng Elo quyết định hạng; hồ sơ vẫn hiện tỷ lệ thắng và tổng số trận. Dự kiến 10 trận xác định ban đầu, các bậc Đồng/Bạc/Vàng/Bạch kim/Kim cương; ngưỡng điểm cụ thể chốt khi triển khai. Đấu bot và phòng mời bạn bè tính thành tích riêng, không cộng Elo. Có đầu hàng, thời gian chờ reconnect trước khi xử thua và hủy kết quả khi lỗi server.

## Tinh gọn giao diện và nâng chi tiết 2D/3D — 27/11/2026

- Theo yêu cầu mới, gộp mức bot vào bên phải cùng thanh “Chơi với máy”, bỏ nhãn/mô tả bot và các chú thích lặp ở sảnh. Select và nút bắt đầu vẫn độc lập cho bàn phím/cảm ứng; giữ cả ba mức.
- 2D có sơ đồ boong riêng cho năm tàu, đường băng/máy bay, tháp pháo, ống khói, cửa hầm, kính tiềm vọng. Bàn có texture nước tĩnh 56 kB, sinh lại bằng `python client/scripts/generate-ocean-texture.py` không cần thư viện ngoài.
- 3D có thân bo cong, chi tiết boong, lan can, cụm pháo, máy bay và tàu ngầm. Gộp geometry theo vật liệu; phiên xem trước 5 tàu/1 phát trượt đo được 63 draw calls, khoảng 14.700 tam giác. Không suy ra FPS hay hiệu năng điện thoại thật từ số này.
- Thay các ô nước khối nổi bằng mặt nước liên tục có sóng/phản sáng nhẹ; raycast mặt biển rồi quy tọa độ 10×10. Phóng nhãn tọa độ 3D cho màn nhỏ. Bàn xem trước giới hạn 820px trên desktop.
- Kiểm chứng: 38/38 frontend test qua; lint/build qua, chunk 3D vẫn có cảnh báo >500 kB (607 kB, gzip 155 kB). Detector nguồn của Impeccable không có finding cho Lobby/ShipDrawing/App.css.
- Trình duyệt: xem desktop 1280px và viewport điện thoại 320×740/390×844, 2D/3D không tràn ngang. Đổi mức Hủy diệt không bắt đầu sớm; tạo ván Khó bằng phiên khách, click đặt tàu C6 đúng ô, khóa đội tàu, chọn B1 bằng bàn phím chưa tự bắn, bấm Bắn nhận lượt máy, tải lại rồi chuyển 2D vẫn giữ lịch sử. Tàu sống đối thủ vẫn ẩn. Chưa dùng điện thoại thật, chưa đo FPS/GPU, chưa deploy.

## Tiếp tục phiên bị ngắt — 27/11/2026

### Bổ sung mặt biển động và tiếng sóng theo yêu cầu

- 2D có hai lớp sóng trôi nhẹ; 3D thêm gợn nước/bọt/phản sáng và thân tàu nhấp nhô. IntersectionObserver tạm dừng phần nước ngoài viewport; tab ẩn dừng hiệu ứng và suspend âm thanh. Có đường giảm chuyển động theo hệ điều hành.
- Thay nền tiếng biển đều bằng surf stereo có nhịp dâng/rút, loop 18 giây được crossfade, khởi động sau tương tác và fade in. Có tiếng biển cả ở sảnh/xếp tàu; dùng điều khiển âm thanh sẵn có, giữ tùy chọn đã lưu.
- Kiểm chứng: 40/40 frontend test qua (gồm nhịp sóng, ranh giới loop, mute/volume, đổi tab và không nhân đôi loop); lint/build qua. Chunk 3D 608 kB, gzip 155 kB, vẫn có cảnh báo >500 kB.
- Trình duyệt: 3D/2D ở 390×844, điều khiển âm thanh ở 320×740 không tràn ngang; thanh sóng đổi 49→50→49%, tắt/bật tiếng trả về trạng thái ban đầu. 320×640 xác minh 2D ngoài viewport có `seaPaused=true`, animation paused. Bản 3D vẫn 63 draw calls/14.689 tam giác; thời gian shader tăng khi nhìn thấy. Đã trả viewport về mặc định. Chưa nghe/đo qua loa điện thoại thật và chưa deploy.

Phiên “Kiểm tra tiến độ lộ trình” dừng vì giới hạn hội thoại trong lúc triển khai theo yêu cầu “code lộ trình đi”. Đã khôi phục ngữ cảnh và tiếp tục trên working tree hiện có; không coi bảng “Chưa làm” cũ là trạng thái hiện tại.

- Đã xác minh chat, Identity/cookie/CSRF, SQLite/migration, lịch sử, bạn bè/mời, ghép hạng và Elo đã có code. HTTP Production vẫn hoạt động theo phạm vi người dùng xác nhận.
- Đã sửa xử lý danh tính frontend: nhận ra đổi tài khoản/đăng xuất ở tab khác khi thăm dò; hủy thao tác viết nếu tài khoản đổi; xóa dữ liệu cũ và bỏ qua profile/leaderboard trả về trễ. Đổi danh tính remount bảng tài khoản để xóa bản nháp mật khẩu.
- Đã sửa thông báo kết thúc do đầu hàng/hết giờ; sự kiện timeout có lý do. API hồ sơ trả Elo trước/sau của chính tài khoản theo MatchId; UI kết quả dùng dữ liệu này, chờ/thử tải lại khi server chưa ghi xong.
- Đã bổ sung test hồi quy danh tính, phản hồi trễ, rate limit, lý do timeout và kết quả/Elo. CI có Node/dependencies ở job Server, dùng csproj tương thích SDK .NET 8 và chạy smoke game/bot/chat/platform cùng restart. Chưa chạy CI trên GitHub.

### Kiểm chứng đã chạy

- `dotnet test Battleship.slnx --no-restore --configuration Release --verbosity minimal`: baseline 35/35 Core và 50/50 Server qua. Lượt build sau thay đổi gặp DLL bị server cũ khóa; chuyển output sang `artifacts/resume-build/Release/`, không dừng tiến trình ngoài phiên.
- Bản sửa cuối Server: **50/50 test qua** (gồm kiểm tra hai phía đều nhận lý do Timeout). Lệnh: `dotnet test server/Battleship.Server.Tests/Battleship.Server.Tests.csproj --no-restore --configuration Release -p:OutputPath=C:/VsCode/.vscode/game/artifacts/resume-build/Release/ --verbosity minimal`.
- `npm.cmd test --prefix client -- --maxWorkers=2`: 38/38 qua, 10 file.
- `npm.cmd run lint --prefix client`: qua, không còn 5 cảnh báo React của phiên trước. `npm.cmd run build --prefix client`: qua; vẫn có cảnh báo kích thước chunk 3D khoảng 598 kB.
- Backend thử riêng ở `127.0.0.1:18283`, environment Production; dữ liệu trong `artifacts/resume-platform-data`, độc lập với database ứng dụng đang chạy. Smoke hai người, cả ba mức bot, chat và platform qua. Không chạy các lượt tạo phòng vượt quota chung của nhau.
- `BATTLESHIP_API_URL=http://127.0.0.1:18283` + `npm run test:platform`: đăng ký/cookie, CSRF, kết bạn, mời idempotent/đặt ghế, Ranked, đầu hàng, Elo một lần và rematch Friendly qua. Sau restart, `--verify-restart` qua.
- Dùng SQLite backup API tạo bản sao, chạy integrity_check và đối chiếu số bản ghi; sao chép cả khóa Data Protection sang `artifacts/resume-platform-restored`. Khởi động backend khác ở 18284 và chạy `--verify-restart`: cookie cũ, lịch sử, Elo trước/sau đều qua. Đây là backup/restore native, chưa phải Docker volume.
- UI biểu mẫu đăng nhập và đăng ký đã xem ở 320×740: không tràn ngang, nhập liệu/nút nằm trong panel cuộn. Phiên trước đã nghiệm thu chat hai trình duyệt; phiên tiếp tục này chưa kiểm tra UI tài khoản sau đăng nhập do bộ duyệt phê duyệt chặn tạo/đăng nhập QA và yêu cầu ủy quyền cụ thể.

### Chưa nghiệm thu

UI hai tài khoản/nhiều tab sau đăng nhập; các ca tranh chấp và ngưỡng hạng còn ghi ở ROADMAP; Docker/volume/Nginx HTTP; điện thoại thật; GitHub CI và production. Không tự đánh dấu M4/M5 hoàn thành; chưa commit/push/deploy.

## Bổ sung: bot có mức khó — 27/11/2026

- Theo yêu cầu người dùng, tạm gác nghiệm thu các đợt ổn định để triển khai bot Dễ / Khó / Hủy diệt. Các mục khảo sát phía dưới giữ lại để tiếp tục sau.
- Đã có bộ chọn mức ở sảnh và nhãn mức trong trận/kết quả. Server lưu mức trong phòng, trả lại khi reconnect và giữ nguyên khi chơi lại. Endpoint tạo bot không tham số vẫn mặc định Dễ cho client cũ.
- Khó: tìm ngẫu nhiên, dò bốn hướng khi trúng, ưu tiên kéo dài đoạn trúng cùng hàng/cột, đổi đầu khi trượt; giữ hướng thay thế khi các tàu chạm nhau. Hủy diệt dùng thêm bản đồ điểm từ các cách đặt hợp lệ của những tàu chưa chìm. Đây là heuristic mật độ, không phải xác suất chính xác của toàn bộ đội tàu.
- Bot chỉ nhận lịch sử bắn, loại tàu chìm và đúng các ô đã tiết lộ của tàu chìm; không nhận bàn tàu người chơi. Không loại ô cạnh tàu chìm và không bỏ các dấu trúng khác còn dang dở.
- Kiểm chứng: 35/35 Core test và 24/24 frontend test qua; lint/build frontend qua. 7/7 test phòng bot qua trong lượt chạy Server (25 test, 24 qua, còn 1 test kết nối cũ kỳ vọng `ALREADY_IN_ROOM` nhưng nhận `ROOM_FULL`). Đã sửa sai kiểu tham số của helper test để bộ Server build được; chưa sửa logic kết nối ngoài phạm vi bot.
- So sánh xác định trên cùng 80 bố trí ngẫu nhiên hợp lệ: trung bình Dễ 95,15; Khó 61,60; Hủy diệt 45,38 phát để hạ toàn bộ tàu. Đây là mẫu mô phỏng, không bảo đảm thứ tự thắng/thua từng ván.
- Smoke SignalR hai người qua; smoke cả ba mức bot qua toàn trận, reconnect, không lặp mục tiêu và chơi tiếp sau rematch. Đã cập nhật kỳ vọng smoke về giai đoạn xếp tàu sau rematch cho đúng code hiện tại.
- Đã xem bộ chọn trong trình duyệt ở desktop và màn 320px, không tràn ngang; tạo trận Hủy diệt và tải lại vẫn giữ mức. Chưa kiểm tra điện thoại thật hoặc production. Chưa commit/deploy trong phiên này.

## Mốc khảo sát ban đầu — lưu để đối chiếu lịch sử

- Nhánh đang mở: `main`; HEAD `39e04e5` — `Fix missing optional dependencies in client lockfile`.
- Lịch sử đã có commit merge giao diện 3D `f16308d`. Các ghi chú “chưa merge/chưa commit” trong `CONTEXT_3D.md` thuộc mốc bàn giao cũ.
- Working tree sạch khi bắt đầu khảo sát. Phiên này lập kế hoạch, chưa sửa logic game.
- Chưa kiểm tra production, trình duyệt hoặc điện thoại thật trong phiên khảo sát này.

## Thống nhất sau khảo sát ban đầu — đã có điều chỉnh phạm vi phía trên

- Hoàn tất các đợt ổn định trong lộ trình trước; tính năng mới như bot có mức khó sẽ bàn lại với người dùng sau đó.
- Đã thêm nút Sao chép rõ ràng cạnh mã phòng ở màn chờ và nút gọn trên thanh phòng của máy tính; có cách dự phòng khi Clipboard API không khả dụng hoặc bị từ chối, cùng thông báo kết quả sao chép.
- Kiểm chứng phần bổ sung: lint/build qua; đã xem giao diện và thử chuột/Enter trong trình duyệt, màn 320px không tràn ngang. Bốn kiểm tra logic độc lập qua cho Clipboard API, API không tồn tại, quyền bị từ chối và fallback thất bại/dọn dẹp. Công cụ trình duyệt dùng clipboard ảo nên chưa đối chiếu được nội dung clipboard hệ điều hành; chưa kiểm tra trên điện thoại thật hoặc deploy.

## Bản đồ code

| Phần | Điểm vào chính | Trách nhiệm |
| --- | --- | --- |
| Luật game | `server/Battleship.Core/Board.cs`, `Game.cs`, `Domain.cs` | Kiểm tra đội tàu, lượt bắn, thắng/thua, dữ liệu được phép tiết lộ. |
| Bot | `server/Battleship.Core/RandomOpponent.cs` | Xếp tàu hợp lệ và chọn ô chưa bắn ngẫu nhiên. |
| Phòng và realtime | `server/Battleship.Server/GameHub.cs`, `Room.cs`, `RoomStore.cs` | Token, kết nối, khôi phục trận, sự kiện và chơi lại. |
| Trạng thái client | `client/src/useGameHub.ts`, `types.ts` | Kết nối SignalR, khôi phục phiên và cập nhật trận theo sự kiện. |
| Các màn hình | `client/src/App.tsx` | Sảnh, xếp tàu, chiến đấu, kết quả; chọn mục tiêu rồi xác nhận bắn. |
| Hiển thị | `BoardGrid.tsx`, `Board3D.tsx`, `OceanBoard3D.tsx`, `oceanScene.ts` trong `client/src` | Bàn 2D, tải 3D khi cần, camera, mô hình tàu, thao tác và hiệu ứng. |
| Âm thanh và hàng đợi | `battleSound.ts`, `useBattleTimeline.ts`, `battlePresentation.ts` trong `client/src` | Phát hiệu ứng theo thứ tự, xử lý tàu chìm và âm thanh. |
| Triển khai | `Dockerfile`, `deploy/docker-compose.yml`, `deploy/nginx.conf` | Một instance; Nginx 5228 → localhost 5227 → container 8080. |

Giữ các nguyên tắc hiện có: server quyết định kết quả, bàn 10×10, năm tàu, tàu được chạm nhau, bắn trúng vẫn đổi lượt, không lộ tàu sống của đối thủ. Phòng lưu trong RAM; khởi động lại server làm mất trận. Chưa mở rộng sang tài khoản hoặc database khi chưa chốt nhu cầu.

## Kiểm tra nền

Các kiểm tra dưới đây chạy từ working tree hiện tại, không chỉ dựa vào biên bản bàn giao:

- `npm.cmd run lint --prefix client`: qua.
- `npm.cmd run build --prefix client`: qua; chunk 3D khoảng 597,79 kB, gzip 151,87 kB; chunk chính khoảng 323,10 kB, gzip 96,55 kB.
- `dotnet test Battleship.slnx --no-restore --verbosity minimal`: qua 13/13 test.
- `npm.cmd run test:smoke --prefix client`: qua, dùng backend kiểm thử riêng tại `http://127.0.0.1:18181`.
- `npm.cmd run test:bot --prefix client`: qua toàn trận, reconnect và rematch; dùng backend mới với logger Windows Event Log tắt riêng cho kiểm thử.
- Bộ smoke hiện tại kiểm tra giao thức/backend, chưa thay thế kiểm thử giao diện và canvas trong trình duyệt.
- Lưu ý môi trường: lần chạy bot đầu bị kẹt khi logger Windows Event Log không có quyền ghi. Chạy backend kiểm thử với `--Logging:EventLog:LogLevel:Default None` để bỏ riêng logger này, không sửa cấu hình ứng dụng. Các probe giới hạn tạo phòng cần tách khỏi lượt smoke hoặc dùng server mới để không chia sẻ quota 5 phòng/phút.

## Danh sách ưu tiên

### P1 — Vòng đời phòng và kết nối

**BS-01: Gỡ liên kết phòng cũ khi một kết nối đổi phòng.**

- Trạng thái: đã tái hiện bằng SignalR trên backend cục bộ.
- Cách tái hiện: A tạo phòng 1; B vào phòng 1; A dùng cùng kết nối tạo phòng 2; A ngắt kết nối; B tải lại snapshot phòng 1. `opponentConnected` vẫn là `true`.
- Điểm sửa dự kiến: `GameHub.CreateRoom`, `GameHub.JoinRoom`, `GameHub.OnDisconnectedAsync` và quản lý binding trong `Room`.
- Bổ sung test cho tầng Server; project xUnit hiện tại chỉ tham chiếu Core nên chưa bảo vệ các tình huống binding/hub này.
- Hướng sửa: quy định rõ mỗi connection chỉ thuộc một phòng/ghế; từ chối đổi phòng trực tiếp hoặc rời binding cũ một cách nhất quán. Không để sự kiện phòng cũ lọt sang phiên mới.
- Nghiệm thu: test tạo/vào phòng nhiều lần trên cùng connection, ngắt kết nối, chuyển ghế, tiếp quản bằng token và reconnect đồng thời. Phòng cũ báo offline và có thể được dọn đúng hạn.
- Phạm vi đã kiểm tra: lời gọi hub trực tiếp; chưa chứng minh chuỗi thao tác tương đương qua giao diện thông thường.

**BS-02: Giữ token khi khôi phục gặp lỗi tạm thời.**

- Trạng thái: xác nhận đường xử lý trong code; chưa mô phỏng lỗi mạng trong trình duyệt.
- `restore()` trong `client/src/useGameHub.ts` xóa mã phòng/token với mọi exception từ `JoinRoom`, đồng thời thông báo phòng đã hết hạn.
- Hướng sửa: phân biệt lỗi phòng/token không hợp lệ với timeout, mất mạng hoặc lỗi server tạm thời; chỉ xóa phiên khi có lý do chắc chắn. Cho thử khôi phục lại và ngăn thao tác trận trước khi khôi phục xong.
- Nghiệm thu: timeout khi JoinRoom không làm mất token; bật mạng lại khôi phục đúng ghế, đội tàu, lượt và lịch sử; phòng thực sự hết hạn có thông báo riêng.

**BS-03: Kiểm tra giới hạn tạo phòng qua reverse proxy.**

- Trạng thái: rủi ro xác định từ cấu hình; chưa kiểm tra máy production.
- `RoomCreationRateLimitFilter` dùng `RemoteIpAddress`; Nginx truyền `X-Forwarded-For` nhưng `Program.cs` chưa cấu hình middleware đọc forwarded headers. Với đường triển khai này, nhiều người chơi có thể chung bucket của proxy.
- Probe cục bộ: sáu kết nối cùng địa chỉ nguồn nhưng sáu giá trị `X-Forwarded-For` khác nhau vẫn dùng chung quota; năm lần tạo thành công, lần sáu bị `ROOM_CREATE_RATE_LIMITED`. Kết quả chứng minh header chưa tách quota ở môi trường này; không thay thế kiểm tra với proxy và IP thật.
- Hướng sửa: khai báo đúng các proxy tin cậy và xử lý forwarded headers trước hub; không tin tùy ý header do client tự gửi. Dọn các bucket IP đã hết hạn nếu cần vận hành lâu dài.
- Nghiệm thu: hai IP thật qua proxy có quota độc lập; một IP vẫn bị giới hạn; giả mạo header từ nguồn không được tin cậy không né được giới hạn.

### P2 — Chơi lại và độ tin cậy frontend

**BS-04: Cho bố trí lại đội tàu khi chơi lại.**

- Trạng thái: hành vi hiện tại xác định trong `Room.RequestRematch`; smoke test cũng đang kỳ vọng ván mới vào thẳng `Playing`.
- Hai bên đã thấy đội tàu đối phương ở cuối trận nhưng rematch dùng lại đội tàu người chơi. Khi đấu bot, chỉ tàu bot được xếp ngẫu nhiên lại.
- Đề xuất sản phẩm: khi đủ phiếu chơi lại, quay về `Placing`; người chơi được sửa đội tàu và khóa lại. Có thể giữ bố trí cũ làm bản nháp, nhưng không tự khóa.
- Nghiệm thu: xóa lịch sử/kết quả/hiệu ứng ván cũ; chưa ai bắn được trước khi hai bên sẵn sàng; reconnect trong giai đoạn xếp lại vẫn đúng; cập nhật smoke test cho hai người và bot.

**BS-05: Bổ sung kiểm thử frontend cho các luồng dễ hồi quy.**

- Hiện có xUnit cho Core và hai script smoke; chưa có bộ unit/component/E2E frontend được cấu hình trong package scripts.
- Ưu tiên test reconnect, rematch, giữ bí mật tàu sống, toàn bộ ô của đúng tàu chìm, hàng đợi hiệu ứng, chuyển 2D/3D và chọn ô chưa tự bắn.
- Bổ sung xử lý lỗi tải chunk 3D: `Board3D.tsx` hiện chỉ có Suspense; cần bảo đảm tải module thất bại vẫn cho người chơi dùng 2D.
- Tách `App.tsx` thành các màn hình và tách logic cập nhật sự kiện khi cần cho test, giữ nguyên hành vi trong đợt tách code.

### P3 — Hiệu năng, tài liệu và phát triển tính năng

- Kiểm tra GPU, FPS, cảm ứng và âm thanh trên Android/iPhone thật; ghi kết quả theo thiết bị. Chất lượng tự động hiện dựa trên loại con trỏ/số lõi CPU, chưa thích ứng theo FPS đo thực tế.
- Đo thời gian tải 3D trên mạng chậm, số lần vẽ và bộ nhớ trước khi quyết định tối ưu chunk/mô hình. Giữ bàn 2D hoạt động độc lập.
- Dọn đoạn mô tả lặp trong `README.md`/`PRODUCT.md`; ghi rõ đâu là lịch sử, đâu là trạng thái hiện tại trong `CONTEXT_3D.md`.
- Thêm CI chạy lint, build, unit test; sau đó tự khởi động backend để chạy smoke. Chưa thấy cấu hình CI trong repo hiện tại.
- Các tính năng cần cùng chốt sau đợt ổn định: bot có mức khó, link mời vào phòng, chơi lại với tùy chọn bố trí tàu. Chưa tự mở rộng luật game.

## Trình tự thực hiện đề xuất

1. **Đợt 1 — Kết nối:** thêm test tái hiện BS-01, BS-02 rồi sửa; kiểm tra BS-03 theo môi trường proxy thực tế. Xong khi không còn binding cũ, lỗi mạng không làm mất phiên và quota đúng người dùng.
2. **Đợt 2 — Chơi lại:** thống nhất và thực hiện BS-04; cập nhật test giao thức trước khi sửa client. Xong khi hoàn tất được ván kế tiếp với bố trí mới ở cả hai chế độ chơi.
3. **Đợt 3 — Giao diện ổn định:** làm BS-05, kiểm thử trình duyệt và thiết bị thật; tối ưu theo số đo. Xong khi các tương tác chính qua được ở 2D/3D và khi 3D lỗi.
4. **Đợt 4 — Tính năng:** chọn một mục phát triển có tiêu chí cụ thể; triển khai riêng để dễ đánh giá.

Mỗi lỗi đi theo vòng: bước tái hiện → test bảo vệ phù hợp → sửa đúng phạm vi → chạy lại các kiểm tra liên quan → ghi kết quả và giới hạn. Không gộp sửa luật, thiết kế lại UI và thay hạ tầng trong cùng một thay đổi.
