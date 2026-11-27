# Lộ trình Battleship: chat, tài khoản, bạn bè và đấu hạng

Cập nhật: 27/11/2026, múi giờ Asia/Saigon.

**Trạng thái: M1–M4 đã có triển khai trong working tree; đang nghiệm thu M5, chưa phát hành.** Bot Dễ / Khó / Hủy diệt đã có từ đợt trước. Bảng dưới phản ánh code và kiểm tra thực tế, không đồng nghĩa mọi tiêu chí đã hoàn tất. Xem `DEVELOPMENT_PLAN.md` để biết kết quả và giới hạn kiểm chứng.

## 1. Phạm vi và nguyên tắc

- Giữ luật 10×10, năm tàu, tàu được chạm nhau, bắn trúng vẫn đổi lượt và server quyết định kết quả. Giữ cả bàn 2D và 3D.
- Thêm chat chữ giữa hai người trong phòng; tài khoản và lịch sử; bạn bè và lời mời; tìm trận và Elo. Tiếp tục cho chơi khách và đấu bot.
- **Không có mic, cuộc gọi, WebRTC hoặc TURN trong phiên bản này.**
- Thứ tự phát hành: chat trước; tài khoản/lưu dữ liệu trước bạn bè và đấu hạng. Không cần chờ toàn bộ tính năng mới phát hành chat.
- Không tự chốt ngày giao khi chưa làm từng đợt. Theo dõi bằng trạng thái và tiêu chí nghiệm thu; không dùng phần trăm hoàn thành ước lượng.
- Tạm gác các đợt tối ưu/hoàn thiện cũ theo yêu cầu người dùng. Chỉ xử lý lỗi cũ nếu nó trực tiếp ngăn tính năng đang làm hoạt động đúng; ghi rõ phần phát sinh.

### HTTP — cấu hình đã được người dùng xác nhận

Người dùng đã xác nhận tài khoản cũng phải hoạt động trên server HTTP, không yêu cầu bổ sung HTTPS. Triển khai đăng ký/đăng nhập, bạn bè và đấu hạng trên HTTP theo quyết định này; không chặn chức năng bằng điều kiện HTTPS. Mic vẫn nằm ngoài phạm vi.

- Vẫn dùng băm mật khẩu chuẩn, cookie HttpOnly/SameSite, chống CSRF, giới hạn thử sai và kiểm tra quyền ở server. Cookie dùng SameAsRequest để chạy được HTTP và tự có cờ Secure khi dùng HTTPS.
- Phiên HTTP mặc định tối đa một ngày. Không lưu mật khẩu trong localStorage/log; không tự đổi domain, cổng hay hạ tầng production.
- Giới hạn đã giải thích: HTTP không mã hóa mật khẩu/session trên đường truyền; băm mật khẩu trong database không thay thế TLS. Nên dùng mật khẩu riêng cho game; xem [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). Ghi nhận giới hạn này, không dùng nó làm điểm chặn triển khai theo yêu cầu người dùng.

## 2. Các mốc thực hiện

| Mốc | Kết quả người chơi nhận được | Phụ thuộc | Trạng thái |
| --- | --- | --- | --- |
| M1 — Chat trong phòng | Nhắn tin khi chờ, xếp tàu, chiến đấu và sau trận | Luồng phòng hiện tại | Đã triển khai; unit và smoke qua, phiên trước đã kiểm tra UI hai người |
| M2 — Tài khoản và lưu dữ liệu | Đăng nhập HTTP, hồ sơ, lịch sử và thống kê riêng theo chế độ | Thiết kế dữ liệu và phiên đăng nhập | Đã triển khai; HTTP Production, restart và khôi phục SQLite/khóa phiên qua |
| M3 — Bạn bè và mời chơi | Kết bạn, xem trạng thái, nhận lời mời và tự vào phòng | M2; định danh tài khoản trên kết nối realtime | Đã triển khai; test tranh chấp và smoke API/SignalR qua, còn nghiệm thu UI sau đăng nhập |
| M4 — Tìm trận và xếp hạng | Tìm đối thủ gần điểm, đấu hạng và lên/xuống hạng | M2; kết quả trận được ghi một lần; hoàn tất quy tắc mất kết nối | Đã triển khai; Elo/timeout/rematch có test, còn nghiệm thu đầy đủ nhiều tab và thiết bị |
| M5 — Kiểm thử và phát hành | Bản hoàn chỉnh trên hai thiết bị, dữ liệu giữ qua cập nhật | Những mốc được chọn để phát hành | Đang nghiệm thu cục bộ; CI đã bổ sung, chưa chạy trên GitHub/Docker/production |

M3 và M4 cùng cần M2. Thứ tự mặc định vẫn là M1 → M2 → M3 → M4; M5 là cửa nghiệm thu cho từng lần phát hành, không phải lý do gom tất cả thành một lần cập nhật lớn.

## 3. M1 — Chat chữ trong phòng

**Mục tiêu:** hai người đang ở cùng phòng nhắn được ngay, không cần tài khoản mới.

### Công việc

- **CHAT-01 — Giao thức và quyền gửi:** thêm gửi tin và lấy lịch sử. Server lấy người gửi từ ghế/kết nối đang hợp lệ, không tin `player`, tên hoặc mã phòng do client khai để giả danh. Kết nối đã bị tiếp quản không còn quyền gửi.
- **CHAT-02 — Dữ liệu trong phòng:** mỗi tin có ID/thứ tự do server cấp, thời gian UTC, người gửi và nội dung. Dùng mã yêu cầu của client để tránh gửi trùng khi thử lại. Mặc định đề xuất tối đa 300 ký tự/tin, 5 tin/5 giây/người và giữ 100 tin gần nhất/phòng; kiểm tra giới hạn ở server.
- **CHAT-03 — Khôi phục:** reconnect lấy lại lịch sử có giới hạn và ghép theo ID, không nhân đôi tin. Chat giữ xuyên rematch trong cùng phòng, có dấu phân cách ván mới; xóa khi phòng được dọn hoặc server khởi động lại trong bản M1. Chưa hứa lưu chat lâu dài.
- **CHAT-04 — Giao diện:** desktop có vùng chat gọn, không thu nhỏ bàn đến mức khó bấm; điện thoại mở/đóng chat bằng nút có số tin chưa đọc. Hỗ trợ bàn phím, xuống dòng và trạng thái đang gửi/gửi lỗi/thử lại. Đổi 2D/3D không làm mất bản nháp.
- **CHAT-05 — Nội dung và chế độ:** hiển thị văn bản thuần, không thực thi HTML. Chỉ người có quyền trong phòng xem được lịch sử. Không bật chat đối thoại trong trận bot và không tạo tin giả của bot.

### Nghiệm thu

- Hai trình duyệt gửi nhận được khi chờ phòng, xếp tàu, chơi và xem kết quả; tin đúng người gửi và đúng thứ tự server.
- Người ngoài phòng và kết nối mất quyền không gửi/đọc được chat; spam và nội dung quá dài bị từ chối rõ ràng.
- Mất mạng, gửi lại và tải trang không tạo tin trùng; rematch giữ đúng lịch sử theo quy tắc trên.
- Hai phòng không nhận tin của nhau. Màn 320px không tràn ngang; mở chat không tự bắn hay chặn nút Bắn khi đã đóng.
- Test server, reducer/component, smoke hai người và kiểm tra UI 2D/3D liên quan đều qua. Nếu có lỗi nền không thuộc chat, ghi tách riêng thay vì báo toàn bộ repo đã xanh.

**Điểm vào dự kiến:** `Room.cs`, `GameHub.cs`, `Contracts.cs`, `useGameHub.ts`, `gameState.ts`; thêm component chat riêng, không gộp cả logic vào `App.tsx`.

## 4. M2 — Tài khoản, database và lịch sử trận

**Mục tiêu:** một người có danh tính ổn định, dữ liệu vẫn còn sau khi cập nhật server.

### Lựa chọn kỹ thuật đề xuất

- Giữ ASP.NET Core và React hiện có. Dùng cơ chế xác thực chuẩn của ASP.NET Core Identity; ưu tiên cookie đồng nguồn cho web, không tự viết thuật toán lưu mật khẩu. Tài khoản gắn với kết nối SignalR theo [tài liệu xác thực của Microsoft](https://learn.microsoft.com/en-us/aspnet/core/signalr/authn-and-authz?view=aspnetcore-8.0).
- Mặc định đề xuất EF Core với SQLite trên một instance, lưu database ở volume bền vững. Đây là lựa chọn ban đầu theo quy mô hiện có, không phải cam kết mở rộng nhiều instance. Đo tranh chấp ghi trước khi cân nhắc PostgreSQL; xem [các trường hợp sử dụng SQLite](https://www.sqlite.org/whentouse.html).
- Phòng/trận đang chơi vẫn ở RAM ở bản đầu. Lưu tài khoản, quan hệ bạn bè, lời mời có thời hạn, bản ghi trận và Elo vào database. Khi server restart, các trận chưa kết thúc được đánh dấu gián đoạn, không tự xử người chơi thua.

### Công việc

- **ACC-01 — Danh tính:** ID tài khoản bất biến, tên đăng nhập chuẩn hóa duy nhất, tên hiển thị có thể đổi và mã người chơi duy nhất để kết bạn. Không dùng tên hiển thị hoặc token khôi phục ghế hiện tại làm ID tài khoản.
- **ACC-02 — Đăng nhập/đăng xuất:** đăng ký, đăng nhập, đăng xuất, đổi mật khẩu; giới hạn thử sai và lỗi có thể hiểu được. Tài khoản phiên bản đầu dùng tên đăng nhập/mật khẩu, chưa thêm mạng xã hội hoặc dịch vụ email. Không tạo chức năng đặt lại mật khẩu qua email nếu chưa có email đã xác minh và kênh gửi; ghi rõ giới hạn này khi phát hành.
- **ACC-03 — Phiên và khách:** giữ lối chơi khách hiện tại. Tách phiên đăng nhập khỏi token khôi phục ghế; bảo vệ cookie và các API thay đổi dữ liệu bằng cơ chế chuẩn, gồm chống CSRF, kiểm tra nguồn kết nối phù hợp và quyền ở server. Đăng nhập/đăng xuất phải cập nhật hoặc nối lại SignalR, không để kết nối cũ giữ quyền đã bị thu hồi. Không tự nhập lịch sử khách thành thành tích tài khoản.
- **DATA-01 — Dữ liệu và cập nhật:** migration có phiên bản, cấu hình đường dẫn database/volume và khóa bảo vệ phiên bền vững; không đưa bí mật vào Git. Thử tạo dữ liệu, restart container và khôi phục từ backup trước khi mở công khai.
- **MATCH-01 — Bản ghi trận:** mỗi ván có `MatchId` riêng, chế độ, người tham gia, trạng thái, thời điểm bắt đầu/kết thúc và nguyên nhân kết thúc. Rematch tạo `MatchId` mới dù giữ nguyên mã phòng. Server là nguồn kết quả duy nhất; API client không được tự khai thắng hoặc số điểm cộng.
- **MATCH-02 — Ghi nhận một lần:** lưu kết quả và cập nhật thống kê trong cùng giao dịch, có ràng buộc chống lặp theo `MatchId`. Event lặp, retry hoặc hai bên reconnect không cộng hai lần. Trận chưa bắt đầu, bị hủy hoặc lỗi server không tính thắng/thua.
- **PROFILE-01 — Hồ sơ:** hiện tên/mã người chơi và lịch sử phân trang. Thống kê tách `Bot`, `Friendly`, `Ranked`; bot tách theo mức. Tỷ lệ thắng = số thắng / số trận thắng-thua đã hoàn tất của đúng chế độ, không gộp trận hủy; chưa chơi thì hiện “Chưa có trận”. Chưa cần phát lại toàn bộ trận hoặc lưu vị trí tàu cho người khác xem.

### Nghiệm thu

- Đăng nhập cùng tài khoản trên hai thiết bị thấy cùng hồ sơ; người khác không sửa được hồ sơ hoặc xem dữ liệu riêng không được phép.
- Restart/cập nhật ứng dụng giữ tài khoản và kết quả đã chốt. Trận đang chơi bị gián đoạn có trạng thái rõ ràng và không phát sinh Elo/thua oan.
- Một kết quả được gửi/ghi thử lại nhiều lần vẫn chỉ tính một trận; hai trận kết thúc gần nhau không làm mất cập nhật thống kê.
- Chơi khách, khôi phục ghế, cả ba mức bot và rematch hiện tại vẫn hoạt động.
- Kiểm tra đăng ký/đăng nhập, cookie, CSRF và reconnect trên HTTP trong môi trường Production; không chỉ thử qua Development/localhost. Không dùng yêu cầu HTTPS để khóa chức năng người dùng đã yêu cầu.

## 5. M3 — Bạn bè và mời vào trận

**Mục tiêu:** tìm đúng bạn, bấm mời và vào chung phòng mà không cần chép mã.

### Công việc

- **SOC-01 — Kết bạn:** tìm theo mã người chơi chính xác; gửi, chấp nhận, từ chối, hủy yêu cầu và xóa bạn. Chống tự kết bạn, quan hệ trùng và yêu cầu gửi đồng thời từ hai phía. Có chặn người chơi để ngừng nhận lời mời/tin không mong muốn; chưa thêm nhắn tin riêng ngoài phòng.
- **SOC-02 — Hiện diện:** danh sách Online / Đang đấu / Offline tính trên tất cả kết nối của tài khoản. Đóng một tab không làm người còn tab khác thành offline; kết nối mất bất thường hết hạn theo heartbeat.
- **INV-01 — Lời mời:** chỉ mời bạn bè đang sẵn sàng; có người mời, trạng thái và hạn dùng do server quyết định. Mặc định đề xuất hết hạn sau 30 giây; người nhận có Chấp nhận / Từ chối. Không gửi mời lặp liên tục.
- **INV-02 — Tạo phòng:** khi chấp nhận, server kiểm tra lại cả hai tài khoản chưa ở trận/hàng đợi và còn quyền mời. Đặt chỗ hai ghế, tạo đúng một phòng Friendly và thông báo vào phòng cho các thiết bị liên quan. Có xử lý khôi phục nếu tạo phòng thất bại; mã phòng bị đoán không cho người thứ ba chiếm ghế đã đặt.
- **INV-03 — Tranh chấp và reconnect:** bấm chấp nhận hai lần, hai thiết bị cùng chấp nhận hoặc hai lời mời cùng lúc không tạo hai phòng. Hết hạn/hủy lời mời không thể chấp nhận lại. Nếu rớt mạng sau khi chấp nhận, người chơi khôi phục đúng ghế đã cấp.

### Nghiệm thu

- Từ hai tài khoản, kết bạn → mời → chấp nhận → cùng vào bước xếp tàu mà không nhập mã.
- Kiểm tra người offline, đang đấu, đang tìm trận, bị chặn và lời mời hết hạn; UI giải thích được lý do không mời được.
- Bấm nhiều lần hoặc chấp nhận đồng thời trên hai thiết bị vẫn chỉ tạo một phòng; người thứ ba không vào được ghế đặt trước.
- Xóa/chặn bạn có hiệu lực ở server; sửa `userId` phía client không giúp giả danh người mời.

## 6. M4 — Tìm đối thủ và đấu hạng

**Mục tiêu:** chơi các trận được ghép công bằng, điểm chỉ thay đổi bởi kết quả hợp lệ.

### Quy tắc phiên bản đầu — mặc định đề xuất, có cấu hình

| Mục | Quy tắc |
| --- | --- |
| Chế độ | Bot luyện tập; Friendly qua mã/mời; Ranked qua hàng đợi. Chỉ Ranked cộng/trừ Elo. |
| Điều kiện | Hai tài khoản khác nhau đã đăng nhập; mỗi tài khoản tối đa một hàng đợi hoặc một trận. Không tự chọn đối thủ để mở Ranked. |
| Điểm ban đầu | 1.000 Elo; 10 trận Ranked đầu hiện “Đang xác định hạng”, vẫn dùng điểm nội bộ để ghép. |
| Hệ số | K = 32 cho cả hai bên; tính một độ thay đổi làm tròn rồi cộng/trừ đối xứng. |
| Bậc hạng | Đồng < 1.000; Bạc 1.000–1.199; Vàng 1.200–1.399; Bạch kim 1.400–1.599; Kim cương ≥ 1.600. Chỉ công bố bậc sau 10 trận xác định. |
| Ghép trận | Ban đầu lệch tối đa 100 điểm; sau 30 giây mở 200; sau 60 giây mở 400. Không tìm được thì tiếp tục chờ hoặc hủy, không âm thầm vượt ngưỡng. |
| Xác nhận | Hai người xác nhận trong 15 giây trước khi tạo phòng; từ chối/không phản hồi không mất Elo. |
| Xếp tàu | Tối đa 120 giây sau khi hai bên vào phòng; chưa đủ hai đội tàu thì hủy khi hết hạn, chưa tính thắng/thua/Elo. |
| Trong trận | Mỗi lượt tối đa 90 giây. Đầu hàng hoặc hết hạn lượt: thua sau khi server xác nhận. |
| Mất kết nối | Có tối đa 90 giây để trở lại nhưng đồng hồ lượt vẫn chạy; hạn đang áp dụng đến trước thì có hiệu lực. Reconnect liên tục không đặt lại đồng hồ. |
| Sự cố server | Server restart hoặc lỗi khiến trận không thể chốt hợp lệ: Interrupted/Cancelled, không đổi Elo. Phân biệt với một người chủ động đóng tab. |
| Chống cày cặp | Mặc định tối đa 3 trận tính điểm cho cùng một cặp tài khoản trong 24 giờ trượt; hàng đợi tránh ghép cặp đã chạm giới hạn. Chơi lại với cùng đối thủ chuyển Friendly và ghi rõ không tính hạng. |

Các ngưỡng trên là thiết kế đề xuất cho bản đầu, chưa phải số đã được kiểm chứng bằng dữ liệu người chơi. Khi triển khai, lưu theo cấu hình/phiên bản để có thể điều chỉnh mà không tính lại tùy tiện kết quả cũ.

### Công việc

- **RANK-01 — Hàng đợi:** vào/hủy tìm trận, ghép và đặt chỗ hai tài khoản một cách nhất quán; không ghép chính mình qua hai tab. Gán ngẫu nhiên hai tài khoản vào ghế One/Two để người tìm trước không luôn được bắn trước. Dọn người rời hàng đợi/mất kết nối; lời mời bạn bè không chen vào trận đã ghép.
- **RANK-02 — Kết thúc trận:** bổ sung đầu hàng, deadline xếp tàu/lượt và nguyên nhân kết thúc. Kiểm tra deadline ở server; thời gian UI chỉ là phần hiển thị. Hai tác vụ timeout/bắn/kết thúc chạy gần nhau chỉ được tạo một kết quả cuối.
- **RANK-03 — Elo nguyên tử:** dùng giao dịch lưu kết quả, điểm trước/sau của cả hai, thống kê và dấu đã tính điểm theo `MatchId`. Hai người hoặc hai luồng không được cập nhật riêng rẽ dẫn đến cộng điểm một bên. Nếu ghi lỗi, hiện “Đang ghi nhận kết quả” và thử lại cùng `MatchId`; không cho client tự cộng điểm.
- **RANK-04 — Giao diện:** nút Tìm trận xếp hạng, màn chờ/hủy, xác nhận trận, badge hạng, điểm trước/sau và lý do cộng/trừ. Bảng xếp hạng phân trang chỉ gồm tài khoản đủ 10 trận; hồ sơ vẫn hiện tỷ lệ thắng và số trận xác định đã chơi.
- **RANK-05 — Giới hạn bản đầu:** chưa có mùa giải, reset mùa, giải thưởng, rank đội, giải đấu hoặc chống gian lận cấp thiết bị. Ghi nhận lịch sử đủ để điều tra kết quả lặp và cặp tài khoản bất thường.

### Công thức đề xuất

Với A gặp B: `E_A = 1 / (1 + 10^((R_B - R_A) / 400))`; `delta = round(32 × (S_A - E_A))`, trong đó `S_A` là 1 nếu A thắng, 0 nếu A thua. Điểm mới: `R_A + delta` và `R_B - delta`. Trận hủy/gián đoạn không gọi cập nhật này. Dùng cách làm tròn cố định trong code và test; tính từ cùng một cặp điểm trước trận đã được khóa hợp lệ.

### Nghiệm thu

- Hai tài khoản gần điểm tìm được nhau, xếp tàu và hoàn thành trận; hồ sơ, lịch sử và bảng hạng cùng khớp một kết quả.
- Test bằng điểm, chênh điểm, người yếu thắng, trận thứ 10, ranh giới hạng và làm tròn; tổng độ thay đổi hai bên bằng 0.
- Không cộng điểm ở Bot, Friendly, trận bị hủy, kết quả bị gửi lại hoặc rematch Friendly. Không chuyển một phòng Friendly thành Ranked bằng tham số client.
- Test hủy tìm sát lúc ghép, hai tab, hai lời mời, đồng thời đầu hàng/bắn/timeout, reconnect trước/sau deadline và restart server. Không tạo hai trận hoặc tính Elo hai lần.
- Thắng bằng hết thời gian/mất kết nối được server xác nhận rõ; sự cố server không bị ghi thành một người bỏ trận.

## 7. M5 — Kiểm thử, vận hành và phát hành từng đợt

- Giữ các kiểm tra hiện có: lint, build, unit Core/Server/frontend và smoke hai người/bot. Bổ sung smoke riêng cho chat, đăng nhập, mời bạn và Ranked theo mốc đã triển khai.
- Chạy các tình huống đồng thời với ít nhất hai tài khoản và nhiều tab; xem cả hai phía giao diện, không chỉ gọi API. Kiểm tra 2D/3D, 320px, desktop và ít nhất một điện thoại thật trước khi đánh dấu đã kiểm chứng thiết bị.
- Trước lần phát hành có database: sao lưu và thử khôi phục; xác minh volume, migration và khóa bảo vệ phiên qua restart/cập nhật. Ghi rõ phạm vi rollback; không hứa downgrade schema nếu chưa thử.
- Sau deploy: kiểm tra health, tạo/vào phòng, toàn trận, chat, reconnect, mời và ghi nhận kết quả theo tính năng đã mở. Không tự deploy trong bước lập lộ trình này.
- Mỗi mốc chốt bằng danh sách test thực sự đã chạy, kết quả, lỗi nền còn lại và giới hạn chưa kiểm chứng. Chỉ đánh dấu hoàn thành sau khi đọc lại code/dữ liệu và kiểm tra luồng người chơi.

## 8. Dữ liệu và ranh giới triển khai

| Dữ liệu/dịch vụ | Trách nhiệm dự kiến |
| --- | --- |
| Room + Chat | Ghế, game đang chơi, lịch sử chat giới hạn; bảo vệ bằng phiên phòng. Chat M1 chưa lưu database. |
| Account / Profile | Định danh và xác thực chuẩn, mã người chơi, tên hiển thị; không trộn token ghế với tài khoản. |
| Match / Participant | `MatchId`, chế độ, người tham gia, kết quả và nguyên nhân; nguồn cho lịch sử/thống kê. |
| FriendRequest / Friendship / Block | Quan hệ một lần cho mỗi cặp, quyền nhận lời mời. |
| Invite | Người gửi/nhận, trạng thái, hạn dùng và phòng đã tạo nếu được chấp nhận. |
| Presence / Queue | Trạng thái kết nối và chờ ghép ở RAM trên một instance; dựng lại sau reconnect, không coi tab là một tài khoản mới. |
| Rating / RatingChange | Điểm hiện tại và bản ghi thay đổi gắn với `MatchId`; cập nhật cùng giao dịch kết quả. |

Không cần ghi database sau mỗi frame 3D, âm thanh hoặc chuyển tab bàn cờ. Chưa mở rộng nhiều instance; nếu thay đổi điều này phải thiết kế lại nơi lưu phòng, hàng đợi và hiện diện trước.

## 9. Điểm tiếp tục sau phiên 27/11/2026

- **Đã có:** chat phòng; tài khoản Identity/cookie/CSRF và SQLite migration; hồ sơ, lịch sử/thống kê theo chế độ; bạn bè/chặn/mời; ghép hạng/xác nhận/deadline/đầu hàng; ghi kết quả và Elo một giao dịch, rematch chuyển Friendly. Kết quả hiển thị lý do kết thúc và Elo trước/sau lấy từ bản ghi server, có trạng thái chờ ghi nhận.
- **Kiểm chứng cục bộ:** 35 Core + 50 Server + 38 frontend test; lint không còn cảnh báo React; build qua. Smoke hai người, ba mức bot, chat và HTTP Production platform qua. Cookie, tài khoản, lịch sử và Elo giữ qua restart và qua bản sao lưu SQLite cùng khóa Data Protection; trận dở chuyển Interrupted, không tính Elo. Lệnh và giới hạn nằm trong DEVELOPMENT_PLAN.md.
- **Tiếp theo:** nghiệm thu UI sau đăng nhập với hai tài khoản/nhiều tab ở desktop và 320px: kết bạn → mời → tự vào xếp tàu; hủy/đồng ý ghép sát hạn; kết quả và lịch sử/Elo khớp hai phía. Biểu mẫu khách đã xem ở 320px; phiên này chưa hoàn tất đăng nhập QA qua trình duyệt vì bộ duyệt quyền yêu cầu ủy quyền cụ thể.
- **Còn trước phát hành:** chạy CI thực tế; build/restart/backup/restore trên Docker volume; kiểm tra qua Nginx HTTP ở địa chỉ server và ít nhất một điện thoại thật. Hiện đã thử native .NET Production trên loopback, chưa thay thế nghiệm thu triển khai.
- **Các tiêu chí cần thêm bằng chứng:** đủ 10 trận xác định và bảng hạng có dữ liệu/phân trang; giới hạn 3 trận/cặp/24 giờ; đua bắn/timeout/đầu hàng và lỗi ghi database; phạm vi ghép sau 30/60 giây. Thời gian/ngưỡng hiện được đặt cố định theo quy tắc bản đầu, chưa đưa ra cấu hình/version riêng. Không đánh dấu hoàn tất M4/M5 chỉ vì code đã tồn tại.

Chưa commit, push hoặc deploy. Giữ chế độ khách, HTTP theo quyết định đã chốt và không thêm mic.
