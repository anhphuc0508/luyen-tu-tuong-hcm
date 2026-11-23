"""Extract the chapter-based 2023 source, with answer-table provenance.

PDF drawing order splits some words and question numbers. Rebuild visual lines
from character coordinates before parsing; do not guess any answer keys.
"""
import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO.parent
sys.path.insert(0, str(ROOT / '.pdf-tools'))
import pymupdf


def clean(text):
    return re.sub(r'\s+', ' ', text).strip()


def visual_lines(page):
    chars = []
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                for char in span['chars']:
                    chars.append({**char, 'size': span['size']})
    groups = []
    for char in sorted(chars, key=lambda c: (c['origin'][1], c['origin'][0])):
        y = char['origin'][1]
        if not groups or abs(y - groups[-1]['y']) > 1.2:
            groups.append({'y': y, 'chars': []})
        groups[-1]['chars'].append(char)
    rows = []
    for group in groups:
        text, previous = '', None
        for char in sorted(group['chars'], key=lambda c: c['origin'][0]):
            if previous and char['bbox'][0] - previous['bbox'][2] > char['size'] * .15:
                text += ' '
            text += char['c']
            previous = char
        text = clean(text)
        if text:
            rows.append({'page': page.number + 1, 'y': round(group['y'], 2), 'text': text})
    return rows


def extract(source, write=False):
    doc = pymupdf.open(source)
    lines = [line for page in doc for line in visual_lines(page)]
    chapters, questions, answers, issues, normalizations = [], [], {}, [], []
    chapter = current = option = None
    state = 'cover'
    chapter_title = False
    for row in lines:
        text, page = row['text'], row['page']
        cm = re.match(r'^CHƯƠNG\s+(\d+)\s*:\s*(.*)$', text)
        if cm:
            chapter = {'id': int(cm[1]), 'title': cm[2], 'sourcePage': page, 'questionCount': 0}
            chapters.append(chapter)
            answers[chapter['id']] = {}
            current = option = None
            state, chapter_title = 'questions', True
            continue
        if text.startswith('GỢI Ý ĐÁP ÁN'):
            state = 'answers'
            current = option = None
            chapter_title = False
            continue
        if state == 'cover':
            continue
        if state == 'answers':
            pairs = re.findall(r'Câu\s+(\d+)\s+([ABCD])\b', text)
            if not pairs:
                issues.append({'type': 'unparsed_answer_line', **row})
            for number, letter in pairs:
                number = int(number)
                if number in answers[chapter['id']]:
                    issues.append({'type': 'duplicate_answer', 'chapter': chapter['id'], 'number': number})
                answers[chapter['id']][number] = {'answer': letter, 'page': page}
            continue
        qm = re.match(r'^Câu\s+(\d+)\s*[:.]?\s*(.*)$', text)
        om = re.match(r'^([ABCD])\s*[.)]\s*(.*)$', text)
        if qm:
            chapter_title = False
            current = {'id': len(questions) + 1, 'chapterId': chapter['id'],
                       'number': int(qm[1]), 'question': qm[2], 'options': [], 'sourcePages': [page]}
            questions.append(current)
            chapter['questionCount'] += 1
            option = None
        elif chapter_title:
            chapter['title'] = clean(chapter['title'] + ' ' + text)
        elif om and current:
            option = {'id': om[1], 'text': om[2]}
            current['options'].append(option)
        elif current:
            target = option if option else current
            field = 'text' if option else 'question'
            target[field] = clean(target[field] + ' ' + text)
        else:
            issues.append({'type': 'unassigned_line', **row})
        if current and page not in current['sourcePages']:
            current['sourcePages'].append(page)

    for chapter in chapters:
        chapter['title'] = chapter['title'].capitalize().replace('hồ chí minh', 'Hồ Chí Minh').replace('cnxh', 'CNXH').replace('đảng cộng sản', 'Đảng Cộng sản')
        cq = [q for q in questions if q['chapterId'] == chapter['id']]
        numbers = [q['number'] for q in cq]
        if numbers != list(range(1, len(cq) + 1)):
            issues.append({'type': 'question_sequence', 'chapter': chapter['id'], 'numbers': numbers})
        if set(numbers) != set(answers[chapter['id']]):
            issues.append({'type': 'question_answer_mismatch', 'chapter': chapter['id'],
                           'questionsWithoutAnswers': sorted(set(numbers) - set(answers[chapter['id']])),
                           'answersWithoutQuestions': sorted(set(answers[chapter['id']]) - set(numbers))})
    for q in questions:
        # Source page 8 labels the FOURTH choice of chapter 1 question 27 "C".
        # Visually checked against the rendered original; keep its text and source
        # label, normalize the fourth UI key to D. The answer table says A.
        if (q['chapterId'], q['number']) == (1, 27):
            assert [o['id'] for o in q['options']] == list('ABCC')
            q['options'][3]['sourceLabel'] = 'C'
            q['options'][3]['id'] = 'D'
            q['sourceNotes'] = ['Tài liệu ghi nhầm nhãn lựa chọn thứ tư là C; chuẩn hóa nhãn thành D theo thứ tự. Nội dung và đáp án A giữ nguyên.']
            normalizations.append({'chapterId': 1, 'number': 27, 'page': 8, 'change': 'Fourth option label C -> D; answer remains A.'})
        key = answers[q['chapterId']].get(q['number'])
        q['correctAnswers'] = [key['answer']] if key else []
        q['answerEvidence'] = {'method': 'chapter_answer_table', 'page': key['page'] if key else None,
                               'chapterId': q['chapterId'], 'questionNumber': q['number']}
        if not q['question'] or [o['id'] for o in q['options']] != list('ABCD') or not all(o['text'] for o in q['options']):
            issues.append({'type': 'question_structure', 'question': q})

    data = {'schemaVersion': '2.0', 'title': 'Tư tưởng Hồ Chí Minh',
            'source': {'file': source.name, 'year': 2023, 'pages': len(doc),
                       'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                       'answerMethod': 'Bảng Gợi ý đáp án cuối từng chương trong tài liệu nguồn.'},
            'totalQuestions': len(questions), 'chapters': chapters, 'questions': questions}
    report = {'questions': len(questions), 'chapters': chapters, 'issues': issues, 'normalizations': normalizations,
              'answerCounts': {str(c): len(v) for c, v in answers.items()},
              'answerDistribution': dict(Counter(a for q in questions for a in q['correctAnswers']))}
    audit = ROOT / 'extraction/studocu'
    audit.mkdir(parents=True, exist_ok=True)
    (audit / 'visual-lines.json').write_text(json.dumps(lines, ensure_ascii=False, indent=2), encoding='utf-8')
    (audit / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (audit / 'candidate-questions.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if write:
        assert not issues, 'Resolve extraction issues before updating the active bank.'
        assert len(questions) == 427 and len(chapters) == 5
        (REPO / 'dist/questions.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (REPO / 'dist/questions.js').write_text('window.QUIZ_DATA = ' + json.dumps(data, ensure_ascii=False).replace('<', '\\u003c') + ';\n', encoding='utf-8')
        (ROOT / 'Studocu_427.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    source = args.source or next(ROOT.parent.glob('*427*Studocu.pdf'), None)
    if source is None:
        parser.error('Provide --source with the path to the supplied 427-question PDF.')
    extract(source, args.write)
