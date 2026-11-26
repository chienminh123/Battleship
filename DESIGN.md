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
