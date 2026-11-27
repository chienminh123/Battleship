# Battleship — thiết kế giao diện

## Hướng đã thống nhất

Tiếp tục hệ màu biển tối/xanh ngọc và typography của bản 2D. Bàn 3D là bàn hải chiến nhìn từ trên xuống hơi nghiêng; lưới, tọa độ và thao tác quan trọng hơn hiệu ứng trang trí. Tàu sân bay có đường băng, thiết giáp hạm có hai cụm pháo, tàu ngầm có thân tròn và kính tiềm vọng.

## Chơi và tương tác

- Chọn ô bằng chạm, chuột, phím mũi tên hoặc cột/hàng; nhấn Bắn để xác nhận. Không bắn ngay khi chọn ô.
- Xoay camera là chế độ riêng, có Góc chuẩn để trở về. Khi không xoay, vuốt dọc trên canvas vẫn cho phép cuộn trang trên điện thoại.
- Desktop: một bàn chính và một bàn phụ; điện thoại: một bàn chính và tab đổi bàn. Tự đổi theo lượt có thể tắt.
- Trình bày hiệu ứng theo thứ tự sự kiện server, đợi hiệu ứng xong trước khi tự đổi bàn hoặc hiển thị kết quả. Khôi phục kết nối không phát lại lịch sử.
- Trượt: đạn, cột nước, giọt và vòng sóng. Trúng: đạn, nổ, tia lửa, khói. Chìm: thân tàu nghiêng, hạ xuống và tan, giữ các ô đỏ. Thời gian phát thường 1050 ms; chìm 2100 ms.
- Chỉ server xác nhận kết quả. Tàu đối thủ còn sống không được dựng vào scene. Chỉ dựng tàu đã chìm từ `sunkCells`, hoặc toàn bộ đội tàu sau trận.

## Bố cục

- Grid/Flex dùng các cột `minmax(0, ...)`, không che lỗi tràn ngang bằng `overflow-x: hidden` ở trang.
- Canvas lấy kích thước từ khung, camera orthographic tính lại frustum để đủ các góc bàn, nhãn và mô hình sau resize/xoay.
- Màn thấp cho phép cuộn phần phụ, không cắt bàn/nút. Có chọn cột/hàng để thao tác chính xác ở màn nhỏ.
- Giao diện tiếng Việt, trạng thái có màu lẫn ký hiệu. Focus bàn phím rõ, có 2D dự phòng và báo mất WebGL context.

## Chất lượng và âm thanh

- Tự động: giảm pixel ratio, FPS và số hạt trên thiết bị cảm ứng hoặc CPU ít lõi; có Thấp/Cao tùy chọn. Đây là heuristic, chưa phải đo FPS thích ứng.
- Giảm chuyển động theo hệ điều hành: bỏ đạn, particles và chuyển động chìm, giữ dấu kết quả.
- Web Audio được khởi tạo sau pointer/keyboard của người dùng. Nút tắt tiếng và âm lượng riêng cho hiệu ứng/biển được lưu ở localStorage.
- Âm thanh tổng hợp cục bộ; dừng tiếng khi tab bị ẩn. Không có file âm thanh tải ngoài.

## Màu và chữ

Kế thừa biến trong `client/src/index.css`: nền `#09191d`, chữ `#e9eee6`, nhấn xanh ngọc `#a4d6c5`; Barlow Condensed cho tiêu đề, DM Sans cho UI, DM Mono cho tọa độ/mã. Trúng vàng 20%, chìm đỏ 24% trong 2D và lớp ô đánh dấu 3D. Phân biệt bằng dấu X/vòng tròn và chú thích, không chỉ bằng màu.


## Tinh gọn sảnh và chi tiết hạm đội — 27/11/2026

- Thanh chơi máy là một nhóm viền chung: nút bắt đầu bên trái, select Dễ/Khó/Hủy diệt bên phải. Hai điều khiển độc lập, không đặt select lồng trong button; có nhãn trợ năng và vùng chạm tối thiểu 52px. Bỏ các đoạn giải thích lặp ở sảnh.
- 2D dùng sơ đồ boong riêng cho cả năm loại tàu: đường băng/máy bay, cụm pháo, ống khói, cửa hầm và kính tiềm vọng. Texture mặt biển sinh cục bộ, giữ lưới và tọa độ rõ. SVG dùng chung ở bàn và danh sách xếp tàu.
- 3D dùng thân tàu bo cong, boong/tháp nhiều tầng, lan can, pháo nhiều nòng, máy bay và tàu ngầm. Gộp geometry theo vật liệu để giữ số lượt vẽ thấp; không thêm shadow map. Mặt nước liên tục có sóng/phản sáng nhẹ; raycast trực tiếp mặt nước rồi quy về đúng 10×10 ô.
- Desktop xem trước giới hạn 820px để bàn không lọt thỏm trong một khung quá rộng. Màn nhỏ giữ toàn bộ 10 hàng/cột, nhãn 3D tăng kích thước, kéo dọc vẫn cuộn trang khi không bật Xoay. Các dấu bắn và quyền giữ bí mật đội tàu tiếp tục theo dữ liệu server.

## Mã người chơi và bạn bè

- Mã người chơi có nút Sao chép với trạng thái thành công/lỗi; dùng Clipboard API và fallback cho HTTP. Mã vẫn chọn thủ công được.
- Nút Bạn bè trên thanh đầu mở thẳng danh sách, kèm số bạn online sẵn sàng chơi. Danh sách ưu tiên Online → Busy → Offline, có lọc Chỉ online và phân biệt trạng thái bằng chữ lẫn chấm màu.
- Nút Mời chơi gửi qua API lời mời hiện có, khóa khi offline/đang đấu/tìm trận hoặc đã có lời mời. Xóa bạn/Chặn gom trong Thêm. Bảng cuộn độc lập, không tràn ngang ở 320px.

## Hiệu ứng biển

- 2D trộn hai lớp texture trôi chậm dưới lưới; 3D tăng chuyển động gợn sóng, phản sáng và bọt ở đỉnh sóng, thân tàu nhấp nhô nhẹ trong khi bóng tiếp xúc giữ nguyên. Không thêm geometry hay draw call cho hiệu ứng nước.
- Tạm dừng mặt nước khi bàn ra khỏi viewport hoặc tab bị ẩn. Chế độ giảm chuyển động của hệ điều hành giữ biển tĩnh và bỏ nhấp nhô.
- Tiếng sóng stereo tổng hợp cục bộ theo chu kỳ dâng/rút 18 giây, nối vòng bằng crossfade. Phát ở sảnh, khi xếp tàu và trong trận sau tương tác đầu tiên; khởi đầu ở âm lượng 0 rồi tăng nhẹ. Nút âm thanh tắt toàn bộ, thanh “Tiếng sóng biển” chỉnh riêng. AudioContext tạm ngừng khi tab bị ẩn, tiếp tục bằng cùng một vòng âm thanh khi quay lại.
