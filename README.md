# Ôn Tư tưởng

Web tại https://luyentthcm.vercel.app/ dùng bộ mới từ **chương 1.pdf đến chương 6.pdf** do người dùng cung cấp. Bộ cũ đã được thay khỏi dữ liệu đang phục vụ.

## Dữ liệu hiện tại

522 vị trí câu hỏi, lần lượt 95, 71, 148, 88, 44 và 76 câu theo tên file. File có đầu đề “Tổng hợp LMS” được xếp vào **chương 1** theo yêu cầu. Giữ số câu trong từng PDF, kể cả các vị trí bị mất chữ.

PDF là ảnh chụp dài, có quảng cáo đè chữ, đoạn ghép ảnh mất nội dung và khung chưa tải chữ. OCR thực hiện cục bộ bằng PyMuPDF/Tesseract tiếng Việt; các vùng khó đọc được đối chiếu với ảnh. Đáp án theo nhãn đỏ “Đáp án đúng” trong file mới. Không lấy đáp án cũ điền vào chỗ thiếu. Các thay đổi chuẩn hoá chữ đọc được lưu tại `data/lms/ocr-normalizations.json`; bản chép tay đã xem ảnh nằm tại `data/lms/manual_fixes.py`.

430 câu đủ dữ liệu để luyện; 92 câu chờ bổ sung. Chỉ `status: ready` được chọn vào lượt ôn/thi. `needs_review` vẫn xuất hiện trong bộ câu hỏi với phần thiếu ghi rõ; `correctAnswers: []` khi chưa đọc được đáp án. Lựa chọn bị mất giữ chuỗi rỗng. Tên file, trang nguồn, tọa độ dọc ảnh và SHA-256 của 6 PDF được lưu để đối chiếu. Hồ sơ nhập ban đầu: `data/lms/source-audit.json`.

`dist/can-bo-sung.txt` là danh sách dễ đọc; `dist/mau-bo-sung.json` là mẫu điền các trường còn thiếu. Cả hai có liên kết trong web. Khi bổ sung, sửa `dist/questions.json`, lưu nguồn xác nhận trong `answerEvidence`, xoá đúng các mục đã xử lý trong `issues`, rồi chạy `python scripts/sync_lms.py` để cập nhật dữ liệu trình duyệt, số lượng và danh sách thiếu. Giữ các mục `issues` chưa xử lý.

## Chạy và triển khai

HTML/CSS/JavaScript thuần, không cần build. Mở `dist/index.html` hoặc chạy `python -m http.server 4173 --directory dist`. Vercel kết nối GitHub và xuất bản `dist` khi push `main`.

Không dùng tài khoản, cookie, localStorage hoặc sessionStorage. Lượt làm bài kết thúc khi tải lại trang. Ôn tập hiện đầy đủ đáp án đúng sau lần chọn đầu tiên, đánh dấu sai và khóa lựa chọn. Thi thử cho đổi đáp án trước khi nộp, hỗ trợ hẹn giờ và tự nộp. Cả hai chọn được từng chương hoặc toàn bộ câu đủ dữ liệu.

## Kiểm tra

`python scripts/verify_lms.py --sources D:/Downloads` kiểm tra đủ 522 vị trí gốc, trạng thái, nguồn/SHA-256, JSON/JS đồng nhất và mẫu bổ sung. Bỏ `--sources` khi không có PDF trên máy.

`python scripts/qa_exam.py [URL]` dùng Playwright/Chrome kiểm tra 430 câu luyện theo chương, 92 câu chờ bổ sung, hiện đáp án sai, chấm điểm, đổi lựa chọn, trộn câu, tự nộp, tìm kiếm, phân trang, tải lại không lưu và giao diện điện thoại. Thư viện kiểm tra nằm trong `.qa-tools`; kết quả gần nhất nằm trong `.qa-results`. Hai thư mục này được ẩn và không đưa lên GitHub.

Các script cho bộ đề cũ đã chuyển vào `../LUU_TRU_CU/scripts-cu`. Thư mục `scripts` chỉ còn `sync_lms.py`, `verify_lms.py` và `qa_exam.py` cho bộ mới.
