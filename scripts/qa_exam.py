"""Check the actual chapter-practice and exam flows locally or on Vercel."""
import functools
import http.server
import json
import sys
import threading
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / '.qa-tools'))
from playwright.sync_api import sync_playwright, expect

DATA = json.loads((REPO / 'dist/questions.json').read_text(encoding='utf-8'))
QUESTIONS = {q['id']: q for q in DATA['questions']}
READY = {i:q for i,q in QUESTIONS.items() if q['status']=='ready'}
TOTAL = len(QUESTIONS)
READY_COUNT = len(READY)
OUT = REPO / '.qa-results'
OUT.mkdir(parents=True, exist_ok=True)
server = None
if len(sys.argv) > 1:
    URL = sys.argv[1].rstrip('/') + '/'
else:
    HEADERS = json.loads((REPO / 'vercel.json').read_text(encoding='utf-8'))['headers'][0]['headers']
    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            for header in HEADERS:
                self.send_header(header['key'], header['value'])
            super().end_headers()
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(REPO / 'dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    URL = f'http://127.0.0.1:{server.server_port}/'

passed, errors, failures = [], [], []
def record(name):
    passed.append(name)
    print('PASS', name, flush=True)

def home(page):
    page.reload()
    expect(page.locator('body')).to_have_attribute('data-page', 'home')

def begin(page, mode='practice', chapter='all', count='10', minutes='0', shuffle=False):
    page.locator(f'[name=mode][value="{mode}"]').check()
    page.locator('#chapter-select').select_option(str(chapter))
    page.locator(f'[name=count][value="{count}"]').check()
    if mode == 'exam':
        page.locator('[name=minutes]').select_option(minutes)
    page.locator('[name=shuffle]').set_checked(shuffle)
    page.locator('#exam-setup [type=submit]').click()
    expect(page.locator('body')).to_have_attribute('data-page', 'exam')
    size = len([q for q in READY.values() if chapter == 'all' or q['chapterId'] == int(chapter)]) if count == 'all' else int(count)
    expect(page.locator('.question-grid button')).to_have_count(size)
    return size

def current(page):
    return QUESTIONS[int(page.locator('.question-card').get_attribute('data-question-id'))]

def finish(page):
    page.locator('.exam-heading [data-action=submit]').click()
    expect(page.locator('#dialog')).to_be_visible()
    page.locator('#dialog-confirm').click()
    expect(page.locator('body')).to_have_attribute('data-page', 'result')

def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True, args=['--disable-gpu'])
        context = browser.new_context(viewport={'width':1440, 'height':1000}, device_scale_factor=1)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: d.accept())
        page.on('console', lambda m: failures.append(m.text) if m.type == 'error' else None)
        response = page.goto(URL)
        assert response.status == 200
        expect(page.locator('body')).to_have_attribute('data-page', 'home')
        assert page.locator('[name=mode]:checked').input_value() == 'practice'
        assert page.locator('#chapter-select option').count() == len(DATA['chapters'])+1
        assert page.locator('[name=count]:checked').input_value() == '20'
        assert page.locator('[name=minutes]').is_disabled()
        assert str(TOTAL) in page.locator('.header-badge').inner_text()
        assert '349' not in page.locator('body').inner_text()
        assert page.evaluate('window.QUIZ_DATA.source.files.length') == 6
        assert page.evaluate('window.QUIZ_DATA.questions.length') == TOTAL
        page.screenshot(path=str(OUT / 'desktop-home.png'), full_page=True)
        record(f'New {TOTAL}-question bank, six chapters, {READY_COUNT} ready and practice as the default')

        begin(page, chapter='1')
        q = current(page)
        assert q['chapterId'] == 1 and q['number'] == 1
        wrong = next(o['id'] for o in q['options'] if o['id'] not in q['correctAnswers'])
        page.locator('[data-answer='+wrong+']').click()
        expect(page.locator('.answer-feedback.incorrect')).to_be_visible()
        key = q['correctAnswers'][0]
        key_text = next(o['text'] for o in q['options'] if o['id'] == key)
        assert key_text in page.locator('.answer-feedback').inner_text()
        assert page.locator('[data-answer='+key+']').get_attribute('class').find('is-correct') >= 0
        assert page.locator('[data-answer='+wrong+']').get_attribute('class').find('is-incorrect') >= 0
        assert page.locator('.answer:disabled').count() == 4
        page.keyboard.press(str('ABCD'.index(key)+1))
        assert page.locator('[data-answer='+wrong+']').get_attribute('aria-pressed') == 'true'
        page.locator('[data-action=flag]').click()
        page.screenshot(path=str(OUT / 'desktop-wrong-feedback.png'), full_page=True)
        page.locator('[data-action=next]').click()
        second = current(page)
        page.locator('[data-answer='+second['correctAnswers'][0]+']').click()
        expect(page.locator('.answer-feedback.correct')).to_be_visible()
        page.keyboard.press('ArrowLeft')
        assert current(page)['id'] == q['id']
        expect(page.locator('.answer-feedback.incorrect')).to_be_visible()
        assert page.locator('.question-grid button.incorrect').count() == 1
        assert page.locator('.question-grid button.correct').count() == 1
        record('Wrong practice answer immediately shows the full correct answer; first attempt locks and survives navigation')
        finish(page)
        assert page.locator('.score-ring strong').inner_text() == '1/10'
        assert page.locator('.result-stats strong').all_inner_texts()[:3] == ['1/10','1','8']
        page.locator('#review-filter').select_option('incorrect')
        assert page.locator('#review-list .bank-card').count() == 9
        page.locator('#review-filter').select_option('correct')
        assert page.locator('#review-list .bank-card').count() == 1
        assert 'Chương 1' in page.locator('.source-note').inner_text()
        page.locator('[data-action=retry]').click()
        assert current(page)['id'] == q['id']
        assert page.locator('.answer.selected').count() == 0
        page.locator('[data-answer='+wrong+']').click()
        expect(page.locator('.answer-feedback.incorrect')).to_be_visible()
        home(page)
        assert page.locator('.resume-notice').count() == 0
        record('Practice scoring, result filters, chapter provenance, retry and reload reset')

        # Walk every question in each selected chapter; IDs must never cross chapters.
        visited = []
        for chapter in DATA['chapters']:
            begin(page, chapter=str(chapter['id']), count='all')
            chapter_ids = []
            for index in range(chapter['questionCount']):
                page.locator(f'[data-action=jump][data-index="{index}"]').click()
                question = current(page)
                assert question['chapterId'] == chapter['id']
                assert question['number'] == [q['number'] for q in READY.values() if q['chapterId']==chapter['id']][index]
                assert question['status'] == 'ready'
                chapter_ids.append(question['id'])
            assert len(set(chapter_ids)) == chapter['questionCount']
            visited += chapter_ids
            home(page)
            record(f'Chapter {chapter["id"]}: all {chapter["questionCount"]} source questions in exact chapter order')
        assert len(visited) == READY_COUNT and len(set(visited)) == READY_COUNT
        page.locator('[name=count][value="50"]').check()
        page.locator('#chapter-select').select_option('5')
        assert page.locator('[name=count][value="50"]').is_disabled()
        assert page.locator('[name=count]:checked').input_value() == 'all'
        begin(page, chapter='all', count='all')
        page.locator(f'[data-action=jump][data-index="{READY_COUNT-1}"]').click()
        assert current(page)['id'] == TOTAL
        home(page)
        record(f'All {READY_COUNT} ready questions reachable; pending questions are excluded from scored sessions')

        begin(page, mode='exam', chapter='2', count='30', shuffle=True)
        ids = []
        for index in range(30):
            page.locator(f'[data-action=jump][data-index="{index}"]').click()
            question = current(page)
            assert question['chapterId'] == 2
            ids.append(question['id'])
        assert len(set(ids)) == 30
        home(page)
        begin(page, mode='exam')
        first = current(page)
        key = first['correctAnswers'][0]
        wrong = next(o['id'] for o in first['options'] if o['id'] != key)
        page.locator('[data-answer='+wrong+']').click()
        assert page.locator('.answer-feedback,.is-correct,.is-incorrect').count() == 0
        page.locator('[data-answer='+key+']').click()
        assert page.locator('[data-answer='+key+']').get_attribute('aria-pressed') == 'true'
        page.locator('[data-action=next]').click()
        second = current(page)
        wrong_second = next(o['id'] for o in second['options'] if o['id'] not in second['correctAnswers'])
        page.locator('[data-answer='+wrong_second+']').click()
        page.get_by_role('button', name='Nộp bài', exact=True).click()
        assert '8 câu' in page.locator('#dialog-content').inner_text()
        page.locator('#dialog-cancel').click()
        expect(page.locator('body')).to_have_attribute('data-page', 'exam')
        finish(page)
        assert page.locator('.result-stats strong').all_inner_texts()[:3] == ['1/10','1','8']
        page.screenshot(path=str(OUT / 'desktop-results.png'), full_page=True)
        assert page.evaluate('localStorage.length') == 0
        assert page.evaluate('sessionStorage.length') == 0
        assert context.cookies() == []
        record('Shuffled chapter exam has unique questions; exam allows changes, hides keys until submission and scores correctly')

        page.locator('[data-nav=questions]').click()
        expect(page.locator('body')).to_have_attribute('data-page','questions')
        expect(page.locator('#bank-list .bank-card')).to_have_count(12)
        page.locator('#bank-chapter').select_option('4')
        assert page.locator('#search-count').inner_text() == str(DATA['chapters'][3]['sourceQuestionCount'])+' câu hỏi'
        assert all(QUESTIONS[int(card.get_attribute('data-question-id'))]['chapterId'] == 4 for card in page.locator('.bank-card').all())
        page.locator('[data-action=bank-next]').click()
        assert 'Câu 13' in page.locator('.bank-meta').first.inner_text()
        page.locator('#bank-chapter').select_option('1')
        page.locator('#bank-search').fill('truyen thong')
        assert page.locator('.bank-card').count() > 0
        page.locator('#bank-search').fill('')
        page.locator('#bank-chapter').select_option('6')
        page.locator('#bank-search').fill(QUESTIONS[TOTAL]['question'])
        assert page.locator('.bank-card').count() == 1
        assert page.locator('.review-option.correct').count() == 0
        page.locator('#show-answers').check()
        assert page.locator('.review-option.correct').count() == 1
        assert 'Chương 6' in page.locator('.source-note').inner_text()
        page.screenshot(path=str(OUT / 'desktop-chapter-bank.png'), full_page=True)
        record('Question bank chapter filter, within-chapter numbering, pagination, accent-free search and source answers')

        page.locator('#bank-search').fill('')
        page.locator('#bank-chapter').select_option('all')
        page.locator('#bank-status').select_option('needs_review')
        pending_ids=[]
        while True:
            cards=page.locator('#bank-list .bank-card')
            for card in cards.all():
                qid=int(card.get_attribute('data-question-id'))
                assert QUESTIONS[qid]['status']=='needs_review'
                assert card.locator('.pending-details').is_visible()
                pending_ids.append(qid)
            nxt=page.locator('[data-action=bank-next]')
            if not nxt.count() or nxt.is_disabled():break
            nxt.click()
        assert set(pending_ids)==set(QUESTIONS)-set(READY)
        record('Every pending source question is present with missing-field details and no invented answer')

        timed = browser.new_context(viewport={'width':1200, 'height':900})
        clock_page = timed.new_page()
        clock_page.on('pageerror', lambda e: errors.append(str(e)))
        clock_page.clock.install()
        clock_page.goto(URL)
        begin(clock_page, mode='exam', minutes='10')
        clock_page.locator('[data-answer='+current(clock_page)['correctAnswers'][0]+']').click()
        clock_page.get_by_role('button', name='Nộp bài', exact=True).click()
        clock_page.clock.fast_forward(600001)
        expect(clock_page.locator('body')).to_have_attribute('data-page', 'result')
        assert clock_page.locator('.score-ring strong').inner_text() == '1/10'
        assert clock_page.locator('.time-stat').inner_text() == '10:00'
        assert not clock_page.locator('#dialog').is_visible()
        record('Timed exam auto-submits at its deadline even with a confirmation pending')

        mobile_context = browser.new_context(viewport={'width':390, 'height':844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        mobile = mobile_context.new_page()
        mobile.on('pageerror', lambda e: errors.append(str(e)))
        mobile.on('dialog', lambda d: d.accept())
        mobile.goto(URL)
        no_overflow(mobile)
        mobile.screenshot(path=str(OUT / 'mobile-home.png'), full_page=True)
        begin(mobile, chapter='5')
        question = current(mobile)
        wrong = next(o['id'] for o in question['options'] if o['id'] not in question['correctAnswers'])
        mobile.locator('[data-answer='+wrong+']').click()
        expect(mobile.locator('.answer-feedback.incorrect')).to_be_visible()
        no_overflow(mobile)
        mobile.screenshot(path=str(OUT / 'mobile-wrong-feedback.png'), full_page=True)
        home(mobile)
        begin(mobile, mode='exam', chapter='5')
        for index in range(10):
            mobile.locator('[data-answer='+current(mobile)['correctAnswers'][0]+']').click()
            if index < 9:
                mobile.locator('[data-action=next]').click()
        no_overflow(mobile)
        finish(mobile)
        assert mobile.locator('.score-ring strong').inner_text() == '10/10'
        no_overflow(mobile)
        mobile.screenshot(path=str(OUT / 'mobile-results.png'), full_page=True)
        home(mobile)
        assert mobile.evaluate('localStorage.length') == 0
        assert mobile.evaluate('sessionStorage.length') == 0
        record('Mobile wrong-answer feedback, 10/10 chapter exam and no progress saved')

        for width in [320,768,1024]:
            page.goto(URL)
            page.set_viewport_size({'width':width, 'height':1000})
            page.locator('#chapter-select').select_option('3')
            no_overflow(page)
            begin(page, chapter='3')
            question = current(page)
            wrong = next(o['id'] for o in question['options'] if o['id'] not in question['correctAnswers'])
            page.locator('[data-answer='+wrong+']').click()
            no_overflow(page)
            home(page)
        assert not errors, errors
        assert not failures, failures
        record('320px, 768px and 1024px chapter layouts; no JavaScript or CSP errors')
        browser.close()
    report = {'url':URL, 'sourceQuestions':TOTAL, 'readyQuestions':READY_COUNT, 'pendingQuestions':TOTAL-READY_COUNT, 'chapters':6, 'passed':passed, 'javascriptErrors':errors, 'consoleErrors':failures}
    (OUT / ('live-report.json' if len(sys.argv)>1 else 'local-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
finally:
    if server:
        server.shutdown()
