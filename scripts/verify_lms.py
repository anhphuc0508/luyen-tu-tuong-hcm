"""Validate the current six-file bank, including deliberately incomplete records."""
import hashlib,json,re,sys
from pathlib import Path
REPO=Path(__file__).resolve().parents[1]
DATA=json.loads((REPO/'dist/questions.json').read_text(encoding='utf8'))
questions=DATA['questions']
assert DATA['schemaVersion']=='3.0'
assert [c['sourceQuestionCount'] for c in DATA['chapters']]==[95,71,148,88,44,76]
assert len(questions)==522 and [q['id'] for q in questions]==list(range(1,523))
assert len(DATA['source']['files'])==6
assert (REPO/'dist/questions.js').read_text(encoding='utf8')=='window.QUIZ_DATA = '+json.dumps(DATA,ensure_ascii=False,separators=(',',':'))+';\n'
for c in DATA['chapters']:
    pool=[q for q in questions if q['chapterId']==c['id']]
    assert [q['number'] for q in pool]==list(range(1,c['sourceQuestionCount']+1))
    assert c['questionCount']==sum(q['status']=='ready' for q in pool)
    assert c['pendingCount']==sum(q['status']=='needs_review' for q in pool)
for q in questions:
    assert q['sourceFile']==f"chương {q['chapterId']}.pdf"
    assert [o['id'] for o in q['options']]==list('ABCD')
    assert len(q['correctAnswers'])<=1 and all(a in 'ABCD' for a in q['correctAnswers'])
    assert bool(q['issues'])==(q['status']=='needs_review')
    if q['status']=='ready':
        assert len(q['correctAnswers'])==1 and q['question'].strip()
        assert q['sourcePages'] and q['answerEvidence']['y'] is not None
        assert all(o['text'].strip() for o in q['options'])
        content=q['question']+' '+' '.join(o['text'] for o in q['options'])
        assert not re.search(r'TimGi\w*|TìmGiáo|Giáo\s+Án|©|\[.*(?:che|mất|bổ sung)|[—_=]{3,}|10:\d{7}',content,re.I),q['id']
    else:
        fields={i['field'] for i in q['issues']}
        if 'answer' in fields:assert q['correctAnswers']==[]
        for o in q['options']:
            if o['id'] in fields:assert o['text']==''
assert DATA['readyQuestions']==sum(q['status']=='ready' for q in questions)
assert DATA['pendingQuestions']==sum(q['status']=='needs_review' for q in questions)
if '--sources' in sys.argv:
    source_dir=Path(sys.argv[sys.argv.index('--sources')+1])
    for source in DATA['source']['files']:
        assert hashlib.sha256((source_dir/source['file']).read_bytes()).hexdigest()==source['sha256']
template=json.loads((REPO/'dist/mau-bo-sung.json').read_text(encoding='utf8'))
assert {(q['chapterId'],q['number']) for q in template['corrections']}=={(q['chapterId'],q['number']) for q in questions if q['issues']}
print(json.dumps({'total':522,'chapters':6,'ready':DATA['readyQuestions'],'pending':DATA['pendingQuestions'],'options':len(questions)*4,'sourceHashesChecked':'--sources' in sys.argv},indent=2))
