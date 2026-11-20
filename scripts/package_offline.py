"""Create a portable single HTML file and a small ZIP, using stdlib only."""
import base64
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / 'luyen-tu-tuong-hcm/dist'
html = (DIST/'index.html').read_text(encoding='utf-8')
css = (DIST/'styles.css').read_text(encoding='utf-8')
app = (DIST/'app.js').read_text(encoding='utf-8')
data = json.loads((DIST/'questions.json').read_text(encoding='utf-8'))
icon = base64.b64encode((DIST/'icon.svg').read_bytes()).decode('ascii')
html = html.replace('href="icon.svg"', 'href="data:image/svg+xml;base64,'+icon+'"')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n'+css+'\n</style>')
html = html.replace('<script defer src="questions.js"></script>', '')
html = html.replace('<script defer src="app.js"></script>', '')
scripts = 'window.QUIZ_DATA = '+json.dumps(data,ensure_ascii=False).replace('<','\\u003c')+';\n'+app
scripts = re.sub(r'</script',lambda _:r'<\/script',scripts,flags=re.I)
html = html.replace('</body>','<script>\n'+scripts+'\n</script>\n</body>')
standalone = ROOT/'Luyen_trac_nghiem.html'
standalone.write_text(html,encoding='utf-8')
(ROOT/'Scribd.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
guide = '''TRANG LUYỆN TRẮC NGHIỆM TƯ TƯỞNG HỒ CHÍ MINH

CÁCH MỞ
1. Nhấp đúp Luyen_trac_nghiem.html để mở bằng Chrome hoặc Edge.
2. Chọn Luyện tập hoặc Tự kiểm tra, số câu và nhóm câu hỏi.
3. Bấm Bắt đầu luyện tập. Không cần cài đặt, máy chủ hoặc mạng.
Nếu nhận được file ZIP, giải nén trước khi mở HTML.

TÍNH NĂNG
- 349 câu hỏi, 1.396 lựa chọn, đáp án theo phần chữ màu đỏ trong Scribd.pdf.
- Luyện tập: hiện đáp án sau mỗi câu; câu đã chọn được khóa để giữ thống kê đúng.
- Tự kiểm tra: có thể đổi lựa chọn; đáp án chỉ hiện khi nộp bài.
- Chọn 10, 20, 30, 50 hoặc tất cả câu; có thể trộn thứ tự câu hỏi.
- Đáp án A–D giữ nguyên thứ tự vì một số lựa chọn tham chiếu A, B, C.
- Lọc câu chưa luyện, câu sai, câu đánh dấu; tìm kiếm có hoặc không dấu.
- Chấm điểm, xem lại bài, luyện lại những câu chưa đúng.
- Câu bỏ trống khi nộp bài tính là chưa đúng và đưa vào mục cần ôn lại.
- Phím 1–4 chọn A–D; phím mũi tên trái/phải chuyển câu.
- Tiến độ, bài đang làm và đánh dấu tự lưu trong trình duyệt hiện tại.
- Không đồng bộ giữa máy, trình duyệt hay các bản HTML ở vị trí khác nhau.
- Giữ file ở một vị trí cố định và dùng cùng trình duyệt để học tiếp.
- Nếu trình duyệt chặn lưu dữ liệu, trang sẽ hiện thông báo; khi đó vẫn luyện được trong phiên đang mở.

DỮ LIỆU JSON
Scribd.json là dữ liệu độc lập mã hóa UTF-8, gồm metadata nguồn và mảng questions.
Mỗi câu có id, question, options (id và text), correctAnswers (ví dụ ["C"]),
sourcePages (trang PDF, tính từ 1) và answerEvidence (bằng chứng màu).
Nguyên văn được giữ lại; chỉ nối các dòng và chuẩn hóa khoảng trắng.
Lỗi chính tả và cách diễn đạt trong PDF không được tự ý sửa.
Đáp án phản ánh cách đánh dấu trong PDF; chưa thẩm định lại kiến thức chuyên môn.

KIỂM CHỨNG
- 57 trang; đầy đủ câu 1–349; mỗi câu có A, B, C, D và một đáp án đỏ.
- Đối chiếu bằng hai bộ đọc PDF độc lập: khớp chữ 57/57 trang và đáp án 349/349.
- Đã kiểm tra các luồng luyện tập, tự kiểm tra, chấm điểm, lưu/khôi phục,
  ôn lại câu sai, tìm kiếm và giao diện máy tính/điện thoại trên Chrome.
- Chi tiết trong extraction/verification.json và extraction/browser-qa.json
  ở thư mục dự án gốc, nếu bạn đang dùng toàn bộ thư mục nguồn.

BẢN NGUỒN
luyen-tu-tuong-hcm/dist/index.html là bản nhiều file, cũng mở được trực tiếp.
Các script trích xuất và kiểm tra nằm trong luyen-tu-tuong-hcm/scripts/.
PDF gốc được giữ nguyên. Bản này chạy trên máy, chưa được xuất bản online.
'''
(ROOT/'HUONG_DAN.txt').write_text(guide,encoding='utf-8-sig')
with zipfile.ZipFile(ROOT/'Web_luyen_trac_nghiem.zip','w',zipfile.ZIP_DEFLATED) as z:
    for file in [standalone,ROOT/'Scribd.json',ROOT/'HUONG_DAN.txt']:
        z.write(file,file.name)
print(json.dumps({'html':standalone.name,'questions':len(data['questions']),
                  'htmlBytes':standalone.stat().st_size,'zipBytes':(ROOT/'Web_luyen_trac_nghiem.zip').stat().st_size},ensure_ascii=False))
