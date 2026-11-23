"""Regenerate browser data, public metadata and the editable missing-data list.

Edit dist/questions.json first. Pending fields stay blank until supplied and
verified; status is derived from issues, never from a guessed answer.
"""
import json
from pathlib import Path

REPO=Path(__file__).resolve().parents[1]
DIST=REPO/'dist'

def sync():
    data=json.loads((DIST/'questions.json').read_text(encoding='utf8'))
    questions=data['questions']
    assert len(questions)==522 and len(data['chapters'])==6
    for q in questions:
        q['status']='needs_review' if q['issues'] else 'ready'
        if q['status']=='ready':
            assert q['question'].strip() and all(o['text'].strip() for o in q['options'])
            assert len(q['correctAnswers'])==1 and q['correctAnswers'][0] in 'ABCD'
    data['totalQuestions']=len(questions)
    data['readyQuestions']=sum(q['status']=='ready' for q in questions)
    data['pendingQuestions']=len(questions)-data['readyQuestions']
    for chapter in data['chapters']:
        pool=[q for q in questions if q['chapterId']==chapter['id']]
        chapter['sourceQuestionCount']=len(pool)
        chapter['questionCount']=sum(q['status']=='ready' for q in pool)
        chapter['pendingCount']=len(pool)-chapter['questionCount']
    (DIST/'questions.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (DIST/'questions.js').write_text('window.QUIZ_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
    lines=['CÁC CÂU CẦN BỔ SUNG — BỘ 6 PDF MỚI',
           f"Tổng: {len(questions)} vị trí câu hỏi; {data['readyQuestions']} câu sẵn sàng luyện; {data['pendingQuestions']} câu cần bổ sung.",
           'Số câu là số in trong từng PDF, không phải vị trí câu hỏi sau khi trộn.',
           'Chương 1 là file có đầu đề Tổng hợp LMS.',
           'Chương 1, 3, 4 và 6 đã cập nhật theo bản chụp Azota mới ngày 23/11/2026; số câu theo bản mới.',
           'Các chỗ chưa rõ giữ trống; chỉ bổ sung khi có nguồn xác nhận cùng câu và cùng lựa chọn.',
           'Bạn có thể gửi lại theo mẫu: Chương 3 câu 50: câu hỏi = ...; Chương 4 câu 18: đáp án = A/B/C/D.','']
    template=[]
    for c in data['chapters']:
        pending=[q for q in questions if q['chapterId']==c['id'] and q['issues']]
        lines += [f"CHƯƠNG {c['id']} — {len(pending)} câu cần bổ sung"]
        for q in pending:
            fields={i['field'] for i in q['issues']}
            missing=[]
            if 'question' in fields:missing.append('nội dung câu hỏi')
            letters=[letter for letter in 'ABCD' if letter in fields]
            if letters:missing.append('lựa chọn '+', '.join(letters))
            if 'answer' in fields:missing.append('đáp án đúng')
            lines.append(f"- Câu {q['number']}: {'; '.join(missing)}.")
            lines.append('  Câu hỏi đọc được: '+(q['question'] or '[Chưa đọc được nội dung câu hỏi]'))
            item={'chapterId':q['chapterId'],'number':q['number']}
            if 'question' in fields:item['question']=None
            if letters:item['options']={letter:None for letter in letters}
            if 'answer' in fields:item['correctAnswer']=None
            template.append(item)
        lines.append('')
    (DIST/'can-bo-sung.txt').write_text('\n'.join(lines).rstrip()+'\n',encoding='utf8')
    (DIST/'mau-bo-sung.json').write_text(json.dumps({'instructions':'Chỉ điền các trường null; đáp án dùng A/B/C/D. Số câu theo từng chương trong PDF.','corrections':template},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    html=DIST/'index.html'
    text=html.read_text(encoding='utf8').replace('427 câu hỏi','522 câu hỏi').replace('5 chương','6 chương')
    html.write_text(text,encoding='utf8')
    card=DIST/'social-card.svg'
    card.write_text(card.read_text(encoding='utf8').replace('427 câu hỏi · 5 chương','522 câu hỏi · 6 chương'),encoding='utf8')
    return data

if __name__=='__main__':
    data=sync()
    print(data['totalQuestions'],data['readyQuestions'],data['pendingQuestions'])
