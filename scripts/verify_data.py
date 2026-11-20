"""Independently verify PyMuPDF extraction against pypdf's text/color reader."""
import json
import re
from collections import Counter
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
data = json.loads((ROOT / 'luyen-tu-tuong-hcm/dist/questions.json').read_text(encoding='utf-8'))
reader = PdfReader(ROOT / 'Scribd.pdf')
tokens = []
text_mismatches = []
for i, page in enumerate(reader.pages, 1):
    color = [None]
    def operand(op, args, cm, tm):
        if op == b'rg': color[0] = tuple(float(v) for v in args)
    def visitor(text, cm, tm, font, size):
        # Ignore Form XObject aggregate callbacks, which have no font dictionary.
        if font and text.strip():
            tokens.append((i, text.strip(), color[0], tm[4]))
    text = page.extract_text(visitor_operand_before=operand, visitor_text=visitor)
    actual = ''.join(re.sub(r'\s+', '', row['text']) for row in json.loads((ROOT/'extraction/lines.json').read_text(encoding='utf-8')) if row['page']==i)
    expected = re.sub(r'\s+', '', text)
    if actual != expected:
        text_mismatches.append(i)

assert len(data['questions']) == 349
assert [q['id'] for q in data['questions']] == list(range(1,350))
# Some labels are black while their answer TEXT is red (for example question 8).
# Read the whole option, including tokens split into individual letters.
option_x = Counter(x for _,t,_,x in tokens if re.match(r'^[ABCD]\.',t)).most_common(1)[0][0]
labels = []
current = None
for i,(page,text,color,x) in enumerate(tokens):
    label = re.match(r'^([ABCD])\.($|\s)', text)
    split_label = text in list('ABCD') and i+1<len(tokens) and tokens[i+1][1].startswith('.')
    if x == option_x and (label or split_label):
        current = {'page':page,'id':text[0],'red':color == (1.,0.,0.)}
        labels.append(current)
    elif re.fullmatch(r'\d+\.',text) and x<option_x:
        current = None
    elif current and color == (1.,0.,0.):
        current['red'] = True
assert len(labels) == 349 * 4, f'Independent reader found {len(labels)} left-aligned option labels'
for i,q in enumerate(data['questions']):
    group=labels[i*4:i*4+4]
    assert [o['id'] for o in group] == list('ABCD'), (q['id'],group)
    red=[o['id'] for o in group if o['red']]
    assert red == q['correctAnswers'], (q['id'],red,q['correctAnswers'])
    assert len(q['options']) == 4 and all(o['text'] for o in q['options'])
    assert not any('\ufffd' in s for s in [q['question']]+[o['text'] for o in q['options']])
assert not text_mismatches, f'Full-page text differs between readers on pages: {text_mismatches}'
report={'questions':349,'options':1396,'redAnswerKeysMatched':349,'fullTextPagesMatched':57,
        'method':'Independent pypdf full-page text and RGB option-content comparison against PyMuPDF output',
        'knowledgeValidation':'Answer keys reproduce source red markings; no independent subject-matter validation.'}
(ROOT/'extraction/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
