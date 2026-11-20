# Ôn Tư tưởng

Trang thi trắc nghiệm Tư tưởng Hồ Chí Minh: 349 câu hỏi, chọn số câu và thời gian, tạo đề ngẫu nhiên, nộp bài và xem kết quả.

## Chạy

Mở `dist/index.html`, hoặc chạy `python -m http.server 4173 --directory dist` rồi truy cập `http://localhost:4173`.

HTML/CSS/JavaScript thuần, không cần cài thư viện hay chạy build. Không dùng cookie, localStorage, tài khoản hoặc cơ sở dữ liệu. Đáp án và kết quả chỉ tồn tại trong bộ nhớ của trang; tải lại hoặc đóng trang kết thúc lượt thi. Đánh dấu câu chỉ áp dụng trong lượt thi hiện tại.

## Vercel

Repo GitHub đã được kết nối với dự án Vercel. Push vào `main` sẽ tạo bản triển khai mới. Cấu hình `vercel.json` chọn preset Other, bỏ qua cài đặt/build và xuất bản `dist`. URL chính: https://luyentthcm.vercel.app/.

## Dữ liệu và kiểm tra

`dist/questions.json` chứa đủ câu 1–349 và 1.396 lựa chọn; `questions.js` là bản dữ liệu dùng trực tiếp trong trình duyệt. Nội dung và đáp án giữ theo tài liệu nguồn, có số trang để đối chiếu. Giữ nguyên thứ tự A–D vì có lựa chọn tham chiếu các đáp án khác.

`scripts/qa_exam.py` kiểm tra luồng thi thật trong Chrome bằng Playwright, gồm chấm điểm, thay đổi đáp án, tự nộp khi hết giờ, tải lại không giữ tiến trình và kích thước màn hình điện thoại. Có thể truyền URL bản deploy làm đối số đầu tiên. Playwright chỉ cần cho bước kiểm tra, không tham gia triển khai.
