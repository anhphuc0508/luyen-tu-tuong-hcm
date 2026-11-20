"""Exercise the actual offline page in installed Chrome, without network assets."""
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'.tools'))
from playwright.sync_api import sync_playwright

URL=(ROOT/'Luyen_trac_nghiem.html').as_uri()
data=json.loads((ROOT/'Scribd.json').read_text(encoding='utf-8'))
key='on-tu-tuong:v1:'+data['source']['sha256'][:12]
out=ROOT/'extraction'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--disable-gpu'])
    context=browser.new_context(viewport={'width':1440,'height':1040},device_scale_factor=1)
    page=context.new_page()
    errors=[]
    external_requests=[]
    page.on('request',lambda req:external_requests.append(req.url) if req.url.startswith(('http:','https:')) else None)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL)
    with page.expect_download() as download_info:
        page.locator('#download-json').click()
    download=download_info.value
    assert download.suggested_filename=='Scribd.json'
    download.save_as(str(out/'downloaded-Scribd.json'))
    assert json.loads((out/'downloaded-Scribd.json').read_text(encoding='utf-8'))==data
    page.screenshot(path=str(out/'web-desktop.png'),full_page=True)
    assert page.get_by_role('heading',name='Học từng câu. Nhớ thật lâu.').count()==1
    # Deterministic practice: original first ten questions.
    page.locator('[name=count]').select_option('10')
    page.locator('[name=shuffle]').uncheck()
    page.get_by_role('button',name='Bắt đầu luyện tập',exact=True).click()
    assert page.locator('.question-text').inner_text()==data['questions'][0]['question']
    page.locator('[data-answer=A]').click()
    assert page.locator('.feedback.wrong').count()==1
    assert page.locator('[data-answer=C]').get_attribute('class').find('is-correct')>=0
    assert page.locator('.option:disabled').count()==4
    page.locator('[data-action=save]').click()
    assert page.locator('[data-action=save]').get_attribute('aria-pressed')=='true'
    page.reload()
    assert page.locator('.feedback.wrong').count()==1
    assert page.locator('[data-action=save]').get_attribute('aria-pressed')=='true'
    page.screenshot(path=str(out/'web-practice.png'),full_page=True)
    page.locator('[data-action=next]').click()
    page.keyboard.press('4')  # Q2 D is correct.
    assert page.locator('.feedback:not(.wrong)').count()==1
    page.locator('[data-action=finish]').click()
    assert page.locator('#confirm-dialog').is_visible()
    page.locator('#dialog-confirm').click()
    assert page.locator('.result-circle strong').inner_text()=='10%'
    result=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',key)
    assert result['completed']==1
    assert len(result['records'])==10
    assert result['records']['2']['lastCorrect'] is True
    assert result['records']['1']['lastCorrect'] is False
    assert result['records']['2']['attempts']==1  # No double-counting on submission.
    assert result['saved']==[1]
    page.screenshot(path=str(out/'web-results.png'),full_page=True)
    page.get_by_role('button',name='Luyện lại câu chưa đúng',exact=True).click()
    assert page.locator('.question-grid button').count()==9
    # Submitted exam allows changing answers and hides every correct answer.
    page.locator('[data-nav=home]').click()
    page.locator('[name=mode][value=exam]').check()
    page.locator('[name=count]').select_option('10')
    page.locator('[name=shuffle]').uncheck()
    page.get_by_role('button',name='Bắt đầu luyện tập',exact=True).click()
    page.locator('#dialog-confirm').click()
    page.locator('[data-answer=A]').click()
    assert page.locator('.feedback,.is-correct,.is-wrong').count()==0
    assert page.locator('.option:disabled').count()==0
    page.locator('[data-answer=C]').click()
    assert page.locator('[data-answer=C]').get_attribute('aria-pressed')=='true'
    page.reload()
    assert page.locator('[data-answer=C]').get_attribute('aria-pressed')=='true'
    page.locator('[data-action=finish]').click()
    page.locator('#dialog-confirm').click()
    assert page.locator('.result-circle strong').inner_text()=='10%'
    result=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',key)
    assert result['records']['1']['lastCorrect'] is True
    assert result['records']['1']['attempts']==2
    page.locator('[data-nav=wrong]').click()
    assert 'CÂU 1' not in page.locator('.bank-meta').all_inner_texts()
    # Search works without Vietnamese accents; source answer visibility toggles.
    page.locator('[data-nav=bank]').click()
    page.locator('#bank-search').fill('thuat ngu')
    assert page.locator('.bank-card').count()>0
    page.locator('#bank-search').fill('349')
    assert page.locator('.bank-card').count()==1
    assert 'CÂU 349' in page.locator('.bank-meta').inner_text()
    assert page.locator('.bank-option.correct').count()==0
    page.locator('#show-all').check()
    assert page.locator('.bank-option.correct').count()==1
    page.locator('[data-nav=saved]').click()
    assert page.locator('.bank-card').count()==1
    page.locator('[data-action=save]').click()
    assert page.locator('.empty-state').count()==1
    # All-correct end-to-end exam in a clean browser profile.
    clean=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mobile=clean.new_page()
    mobile.on('pageerror',lambda e:errors.append(str(e)))
    mobile.goto(URL)
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.screenshot(path=str(out/'web-mobile.png'),full_page=True)
    mobile.locator('[name=mode][value=exam]').check()
    mobile.locator('[name=count]').select_option('10')
    mobile.locator('[name=shuffle]').uncheck()
    mobile.get_by_role('button',name='Bắt đầu luyện tập',exact=True).click()
    for i in range(10):
        mobile.locator('[data-answer='+data['questions'][i]['correctAnswers'][0]+']').click()
        assert mobile.locator('.is-correct,.is-wrong,.feedback').count()==0
        if i<9: mobile.locator('[data-action=next]').click()
    mobile.screenshot(path=str(out/'web-mobile-quiz.png'),full_page=True)
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.get_by_role('button',name='Hoàn thành bài',exact=True).click()
    mobile.locator('#dialog-confirm').click()
    assert mobile.locator('.result-circle strong').inner_text()=='100%'
    stored=mobile.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',key)
    assert sum(r['correct'] for r in stored['records'].values())==10
    assert stored['completed']==1
    mobile.locator('[data-nav=home]').click()
    mobile.locator('[name=pool]').select_option('unseen')
    mobile.locator('[name=count]').select_option('20')
    mobile.locator('[name=shuffle]').check()
    mobile.get_by_role('button',name='Bắt đầu luyện tập',exact=True).click()
    active=mobile.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).active',key)
    assert len(active['ids'])==20 and len(set(active['ids']))==20
    assert not set(active['ids']).intersection(range(1,11))
    mobile.locator('[data-nav=home]').click()
    mobile.locator('[name=count]').select_option('all')
    mobile.locator('[name=shuffle]').uncheck()
    mobile.get_by_role('button',name='Bắt đầu luyện tập',exact=True).click()
    mobile.locator('#dialog-confirm').click()
    assert mobile.locator('.question-grid button').count()==349
    mobile.locator('[data-action=jump][data-index="348"]').click()
    assert mobile.locator('.question-text').inner_text()==data['questions'][-1]['question']
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    assert not external_requests,external_requests
    report={'browser':'Installed Google Chrome, headless','offlineFileURL':True,'desktop':'1440×1040','mobile':'390×844',
            'artifact':'Luyen_trac_nghiem.html (portable single file)',
            'passed':['JSON download matches exported data','no external network requests','practice immediate feedback','practice locking','keyboard answer','saved questions','reload and resume','partial submission with unanswered scoring','no double counting','retry incorrect only','exam hides answers and permits changes','exam reload','all-correct exam scores 100%','wrong list updates after correction','accent-insensitive search','JSON question 349 searchable','bank answer visibility','remove saved question','mobile no horizontal overflow','unseen pool excludes completed questions','shuffled pool has no duplicates','all 349 questions reachable'], 'javascriptErrors':errors}
    (out/'browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
