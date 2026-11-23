"""Independent answer-table and character-coverage checks using pypdf."""
import json
import re
from collections import Counter
from pathlib import Path
from pypdf import PdfReader

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO.parent
SOURCE = next(ROOT.parent.glob('*427*Studocu.pdf'))
AUDIT = ROOT / 'extraction/studocu'
data = json.loads((AUDIT / 'candidate-questions.json').read_text(encoding='utf-8'))
rows = json.loads((AUDIT / 'visual-lines.json').read_text(encoding='utf-8'))
reader = PdfReader(SOURCE)
chapter, in_answers = None, False
keys, source_pairs = {}, []
character_differences = []
for i, page in enumerate(reader.pages, 1):
    text = page.extract_text()
    cm = re.search(r'CHƯƠNG\s+(\d+)', text)
    if cm:
        chapter, in_answers = int(cm[1]), False
    if 'GỢI Ý ĐÁP ÁN' in text:
        text_before, answer_text = text.split('GỢI Ý ĐÁP ÁN', 1)
        in_answers = True
    else:
        answer_text = text if in_answers else ''
    if answer_text:
        for number, answer in re.findall(r'Câu\s+(\d+)\s+([ABCD])\b', answer_text):
            key = (chapter, int(number))
            assert key not in keys, ('duplicate independent answer', key)
            keys[key] = (answer, i)
    # Reordering fragmented drawing commands must preserve every visible glyph.
    original = Counter(re.sub(r'\s+', '', page.extract_text()))
    reconstructed = Counter(re.sub(r'\s+', '', ''.join(r['text'] for r in rows if r['page'] == i)))
    if original != reconstructed:
        character_differences.append({'page': i, 'onlyInPypdf': dict(original-reconstructed), 'onlyInCoordinates': dict(reconstructed-original)})

assert len(keys) == 427, len(keys)
assert len(data['questions']) == 427
for q in data['questions']:
    answer, page = keys[(q['chapterId'], q['number'])]
    assert q['correctAnswers'] == [answer], (q['chapterId'], q['number'])
    assert q['answerEvidence']['page'] == page
    assert [o['id'] for o in q['options']] == list('ABCD')
    assert all(o['text'] for o in q['options']) and q['question']
    assert '\ufffd' not in q['question']+' '.join(o['text'] for o in q['options'])
assert not character_differences, character_differences
expected = {1:71, 2:148, 3:88, 4:44, 5:76}
assert Counter(q['chapterId'] for q in data['questions']) == expected
report = {'questions': 427, 'options': 1708, 'chapters': expected, 'answerKeysMatched': 427,
          'fullPageCharacterCoverageMatched': len(reader.pages),
          'methods': ['Coordinate-based PyMuPDF extraction', 'Independent pypdf answer-table parser and full-page character multiset comparison'],
          'normalizations': ['Chapter 1 question 27: fourth option was mislabeled C in source; UI label normalized to D, original label retained, source answer A unchanged.'],
          'knowledgeValidation': 'Answers reproduce the supplied answer tables; no independent subject-matter changes.'}
(AUDIT / 'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
