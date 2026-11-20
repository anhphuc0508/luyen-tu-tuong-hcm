"""Run public-exam browser checks locally or against an explicit deployment URL."""
import functools
import hashlib
import http.server
import json
import sys
import threading
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO.parent
sys.path.insert(0, str(ROOT / '.qa-tools'))
from playwright.sync_api import sync_playwright, expect

DATA = json.loads((REPO / 'dist/questions.json').read_text(encoding='utf-8'))
OUT = ROOT / 'extraction/public-web-qa'
OUT.mkdir(parents=True, exist_ok=True)
server = None
if len(sys.argv) > 1:
    URL = sys.argv[1].rstrip('/') + '/'
else:
    HEADERS = json.loads((REPO / 'vercel.json').read_text(encoding='utf-8'))['headers'][0]['headers']
    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            for h in HEADERS:
                self.send_header(h['key'], h['value'])
            super().end_headers()
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(REPO / 'dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    URL = f'http://127.0.0.1:{server.server_port}/'

passed, errors, failures = [], [], []
def record(name):
    passed.append(name)
    print('PASS',name,flush=True)

def begin(page,count='10',minutes='0',shuffle=False):
    page.locator(f'[name=count][value="{count}"]').check()
    page.locator('[name=minutes]').select_option(minutes)
    page.locator('[name=shuffle]').set_checked(shuffle)
    page.get_by_role('button',name='Bắt đầu làm bài',exact=True).click()
    expect(page.locator('.question-grid button')).to_have_count(int(count))

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--disable-gpu'])
        context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.accept())
        page.on('console',lambda m:failures.append(m.text) if m.type=='error' else None)
        response=page.goto(URL)
        assert response.status==200
        expect(page.locator('body')).to_have_attribute('data-page','home')
        assert page.locator('[name=count]:checked').input_value()=='20'
        assert page.locator('[name=minutes]').input_value()=='20'
        assert page.locator('input[name=count]').count()==5
        assert not page.locator('body').inner_text().count('Hành trình của bạn')
        page.screenshot(path=str(OUT/'desktop-home.png'),full_page=True)
        record('Landing page, default settings and full set of question counts')
        page.locator('[data-action=guide]').click()
        expect(page.locator('#dialog')).to_be_visible()
        page.locator('#dialog-confirm').click()
        begin(page)
        assert page.locator('.question-text').inner_text()==DATA['questions'][0]['question']
        page.locator('[data-answer=A]').click()
        page.locator('[data-answer=C]').click()
        assert page.locator('[data-answer=C]').get_attribute('aria-pressed')=='true'
        assert page.locator('.review-option,.source-note,.is-correct').count()==0
        page.locator('[data-action=flag]').click()
        assert page.locator('.question-grid button').first.get_attribute('class').find('flagged')>=0
        page.keyboard.press('ArrowRight')
        page.keyboard.press('4')
        page.keyboard.press('ArrowLeft')
        assert page.locator('[data-answer=C]').get_attribute('aria-pressed')=='true'
        page.screenshot(path=str(OUT/'desktop-exam.png'),full_page=True)
        record('Change answers, keyboard navigation, question flags and hidden answer keys')
        page.get_by_role('button',name='Nộp bài',exact=True).click()
        expect(page.locator('#dialog')).to_be_visible()
        assert '8 câu' in page.locator('#dialog-content').inner_text()
        page.locator('#dialog-cancel').click()
        expect(page.locator('body')).to_have_attribute('data-page','exam')
        page.get_by_role('button',name='Nộp bài',exact=True).click()
        page.locator('#dialog-confirm').click()
        expect(page.locator('body')).to_have_attribute('data-page','result')
        assert page.locator('.score-ring strong').inner_text()=='2/10'
        assert page.locator('.result-stats strong').all_inner_texts()[:3]==['2/10','0','8']
        assert page.locator('.review-option.correct').count()==10
        page.locator('#review-filter').select_option('incorrect')
        assert page.locator('#review-list .bank-card').count()==8
        page.locator('#review-filter').select_option('correct')
        assert page.locator('#review-list .bank-card').count()==2
        page.screenshot(path=str(OUT/'desktop-results.png'),full_page=True)
        assert page.evaluate('localStorage.length')==0
        assert page.evaluate('sessionStorage.length')==0
        assert context.cookies()==[]
        record('Correct scoring, empty answers, submit confirmation, result filters and no stored data')
        page.locator('[data-action=retry]').click()
        expect(page.locator('body')).to_have_attribute('data-page','exam')
        assert page.locator('.answer.selected').count()==0
        assert page.locator('.question-grid .flagged').count()==0
        assert page.locator('.question-text').inner_text()==DATA['questions'][0]['question']
        page.reload()
        expect(page.locator('body')).to_have_attribute('data-page','home')
        assert page.locator('.resume-notice').count()==0
        record('Retry resets answers and flags; reload discards the exam')
        # All 349 source questions remain reachable.
        begin(page,count='349')
        page.locator('[data-action=jump][data-index="348"]').click()
        assert page.locator('.question-text').inner_text()==DATA['questions'][-1]['question']
        page.reload()
        record('All 349 questions available and last question renders accurately')
        # A shuffled paper must contain no duplicates (identify by unique prompt).
        begin(page,count='30',shuffle=True)
        signatures=[]
        for i in range(30):
            page.locator(f'[data-action=jump][data-index="{i}"]').click()
            signatures.append(page.locator('.question-text').inner_text()+'|'+page.locator('.answers').inner_text())
        assert len(signatures)==30
        assert len(set(signatures))==30
        page.reload()
        page.locator('[data-nav=questions]').click()
        expect(page.locator('#bank-list .bank-card')).to_have_count(12)
        page.locator('[data-action=bank-next]').click()
        assert page.locator('.bank-meta').first.inner_text().startswith('Câu 13')
        page.locator('#bank-search').fill('thuat ngu')
        assert page.locator('.bank-card').count()>0
        page.locator('#bank-search').fill('349')
        expect(page.locator('.bank-card')).to_have_count(1)
        assert page.locator('.review-option.correct').count()==0
        page.locator('#show-answers').check()
        assert page.locator('.review-option.correct').count()==1
        page.screenshot(path=str(OUT/'desktop-question-bank.png'),full_page=True)
        record('Random exam, question-bank pagination, accent-free search and answer toggle')
        # Use the browser clock to test expiry, including a pending submission dialog.
        timed=browser.new_context(viewport={'width':1200,'height':900})
        timed_page=timed.new_page()
        timed_page.on('pageerror',lambda e:errors.append(str(e)))
        timed_page.clock.install()
        timed_page.goto(URL)
        begin(timed_page,minutes='10')
        timed_page.locator('[data-answer=C]').click()
        timed_page.get_by_role('button',name='Nộp bài',exact=True).click()
        timed_page.clock.fast_forward(600001)
        expect(timed_page.locator('body')).to_have_attribute('data-page','result')
        assert timed_page.locator('.score-ring strong').inner_text()=='1/10'
        assert timed_page.locator('.time-stat').inner_text()=='10:00'
        assert not timed_page.locator('#dialog').is_visible()
        record('Countdown auto-submits at deadline even while a confirmation dialog is open')
        # Isolated visitor and all-correct mobile exam.
        mobile_context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
        mobile=mobile_context.new_page()
        mobile.on('pageerror',lambda e:errors.append(str(e)))
        mobile.goto(URL)
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.screenshot(path=str(OUT/'mobile-home.png'),full_page=True)
        begin(mobile)
        for i in range(10):
            mobile.locator('[data-answer='+DATA['questions'][i]['correctAnswers'][0]+']').click()
            if i<9: mobile.locator('[data-action=next]').click()
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.screenshot(path=str(OUT/'mobile-exam.png'),full_page=True)
        mobile.get_by_role('button',name='Nộp bài',exact=True).click()
        mobile.locator('#dialog-confirm').click()
        expect(mobile.locator('body')).to_have_attribute('data-page','result')
        assert mobile.locator('.score-ring strong').inner_text()=='10/10'
        assert mobile.locator('.result-stats strong').all_inner_texts()[:3]==['10/10','0','0']
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.screenshot(path=str(OUT/'mobile-results.png'),full_page=True)
        mobile.reload()
        expect(mobile.locator('body')).to_have_attribute('data-page','home')
        assert mobile.evaluate('localStorage.length')==0
        assert mobile.evaluate('sessionStorage.length')==0
        record('Independent mobile visitor, 10/10 scoring, responsive layout and no saved progress')
        for width in [320,768,1024]:
            page.goto(URL)
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
        assert not errors,errors
        assert not failures,failures
        record('320px, 768px and 1024px layouts; no JavaScript errors or CSP failures')
        browser.close()
    report={'url':URL,'sourceQuestions':len(DATA['questions']),'passed':passed,'javascriptErrors':errors,'consoleErrors':failures}
    (OUT/('live-report.json' if len(sys.argv)>1 else 'local-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
finally:
    if server:
        server.shutdown()
