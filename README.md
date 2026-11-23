# Ôn Tư tưởng

Trang ôn tập và thi thử Tư tưởng Hồ Chí Minh: 427 câu hỏi mới từ tài liệu năm 2023, chia theo 5 chương. Bộ cũ đã được thay khỏi dữ liệu đang phục vụ.

## Chạy

Mở `dist/index.html`, hoặc chạy `python -m http.server 4173 --directory dist` rồi truy cập `http://localhost:4173`.

HTML/CSS/JavaScript thuần, không cần cài thư viện hay chạy build. Không dùng cookie, localStorage, tài khoản hoặc cơ sở dữ liệu. Đáp án và kết quả chỉ tồn tại trong bộ nhớ của trang; tải lại hoặc đóng trang kết thúc lượt làm bài. Đánh dấu câu chỉ áp dụng trong lượt hiện tại.

Ôn tập hiện đáp án đúng ngay sau lần chọn đầu tiên, đánh dấu riêng câu trả lời sai và khóa lựa chọn để điểm phản ánh lần trả lời đầu. Thi thử cho phép đổi đáp án, tùy chọn giới hạn thời gian, tự nộp khi hết giờ và hiện đáp án khi kết thúc. Cả hai chế độ đều chọn được một chương hoặc toàn bộ 5 chương.

## Vercel

Repo GitHub đã được kết nối với dự án Vercel. Push vào `main` sẽ tạo bản triển khai mới. Cấu hình `vercel.json` chọn preset Other, bỏ qua cài đặt/build và xuất bản `dist`. URL chính: https://luyentthcm.vercel.app/.

## Dữ liệu và kiểm tra

`dist/questions.json` chứa 427 câu, 1.708 lựa chọn và metadata 5 chương. Mỗi câu có `id` duy nhất, `chapterId`, `number` là số câu trong chương, `sourcePages`, `correctAnswers` và `answerEvidence` trỏ tới trang bảng đáp án. `questions.js` là bản dữ liệu dùng trực tiếp trong trình duyệt. Các chương lần lượt có 71, 148, 88, 44 và 76 câu.

`scripts/extract_studocu.py --write` tái tạo dữ liệu từ file PDF Studocu năm 2023 do người dùng cung cấp. Ký tự được sắp theo tọa độ vì thứ tự vẽ trong PDF làm tách một số từ và số câu. Đáp án ghép theo chương và số câu từ bảng Gợi ý đáp án; không suy đoán theo kiến thức bên ngoài. `scripts/verify_studocu.py` đối chiếu 427 đáp án bằng pypdf và kiểm tra toàn bộ ký tự ở 94 trang. Cần PyMuPDF cho trích xuất, pypdf cho đối chiếu.

Lỗi nhãn đã đối chiếu hình PDF: chương 1 câu 27 ghi hai nhãn C. Nhãn lựa chọn thứ tư được chuẩn hóa thành D, lưu `sourceLabel: "C"` và ghi chú trong JSON; nội dung cùng đáp án A không đổi. Khoảng trắng giữa nhãn D và dấu chấm ở câu 49 được chuẩn hóa. Giữ nguyên thứ tự A–D vì có lựa chọn tham chiếu các đáp án khác.

`scripts/qa_exam.py` kiểm tra luồng thi thật trong Chrome bằng Playwright, gồm chấm điểm, thay đổi đáp án, tự nộp khi hết giờ, tải lại không giữ tiến trình và kích thước màn hình điện thoại. Có thể truyền URL bản deploy làm đối số đầu tiên. Playwright chỉ cần cho bước kiểm tra, không tham gia triển khai.
