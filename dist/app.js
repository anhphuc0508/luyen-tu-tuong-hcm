(() => {
  'use strict';
  const DATA = window.QUIZ_DATA;
  const questions = DATA.questions;
  const byId = new Map(questions.map(q => [q.id, q]));
  const KEY = 'on-tu-tuong:v1:' + DATA.source.sha256.slice(0, 12);
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const fresh = () => ({version:1, records:{}, saved:[], completed:0, history:[], active:null, lastResult:null});
  let state = fresh(), storageOk = true, route = '', timerStart = 0, timerBase = 0;
  let bankPage = 0, bankQuery = '', bankShowAnswers = false, reviewFilter = 'all';
  const revealed = new Set();
  let toastTimeout;

  function validSession(s) {
    return s && Array.isArray(s.ids) && s.ids.length > 0 && s.ids.every(id => byId.has(id)) &&
      new Set(s.ids).size === s.ids.length && ['practice','exam'].includes(s.mode) &&
      s.choices && typeof s.choices === 'object' && Object.entries(s.choices).every(([id,a]) => s.ids.includes(Number(id)) && byId.get(Number(id)).options.some(o => o.id === a)) &&
      Number.isInteger(s.index) && s.index >= 0 && s.index < s.ids.length && Number.isFinite(s.elapsed) && s.elapsed >= 0;
  }
  try {
    const loaded = JSON.parse(localStorage.getItem(KEY));
    if (loaded?.version === 1 && loaded.records && !Array.isArray(loaded.records)) {
      state = {...fresh(), ...loaded};
      state.saved = Array.isArray(state.saved) ? [...new Set(state.saved.filter(id => byId.has(id)))] : [];
      state.records = Object.fromEntries(Object.entries(state.records).filter(([id,r]) => byId.has(Number(id)) && r && Number.isFinite(r.attempts) && r.attempts > 0 && Number.isFinite(r.correct) && r.correct >= 0 && r.correct <= r.attempts && typeof r.lastCorrect === 'boolean'));
      state.completed = Math.max(0, Number.isFinite(state.completed) ? state.completed : 0);
      if (!validSession(state.active)) state.active = null;
      if (!validSession(state.lastResult)) state.lastResult = null;
    }
  } catch { storageOk = false; }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { storageOk = false; }
    updateBadges();
  }
  function toast(text) {
    $('#toast').textContent = text;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 2800);
  }
  function updateBadges() {
    $('#wrong-count').textContent = wrongIds().length;
    $('#saved-count').textContent = state.saved.length;
    $('.nav-count').textContent = questions.length;
  }
  const wrongIds = () => questions.filter(q => state.records[q.id]?.lastCorrect === false).map(q => q.id);
  const isCorrect = (q, choice) => q.correctAnswers.includes(choice);
  const formatTime = seconds => {
    const s = Math.floor(seconds);
    return (s >= 3600 ? String(Math.floor(s / 3600)).padStart(2,'0') + ':' : '') + String(Math.floor(s / 60) % 60).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
  };
  const pages = q => `Trang ${q.sourcePages.join('–')} · Câu gốc ${q.id}`;
  function syncElapsed() { if (state.active) state.active.elapsed = timerBase + Math.floor((Date.now() - timerStart) / 1000); }
  function beginClock() { timerBase = state.active?.elapsed || 0; timerStart = Date.now(); }
  beginClock();
  setInterval(() => {
    if (!state.active) return;
    syncElapsed();
    const el = $('#elapsed');
    if (el) el.textContent = formatTime(state.active.elapsed);
    if (state.active.elapsed % 10 === 0) persist();
  }, 1000);
  window.addEventListener('pagehide', () => { syncElapsed(); persist(); });

  function navigate(target) {
    if (location.hash.slice(1) === target) render();
    else location.hash = target;
  }
  function render() {
    route = location.hash.slice(1) || 'home';
    if (!['home','bank','wrong','saved','quiz','result'].includes(route)) route = 'home';
    if (route === 'quiz' && !state.active) route = 'home';
    if (route === 'result' && !state.lastResult) route = 'home';
    document.querySelectorAll('[data-nav]').forEach(a => {
      const active = a.dataset.nav === route || (a.dataset.nav === 'home' && ['quiz','result'].includes(route));
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
    if (route === 'home') renderHome();
    else if (['bank','wrong','saved'].includes(route)) renderBank();
    else if (route === 'quiz') renderQuiz();
    else renderResult();
    if (!storageOk) $('#main').insertAdjacentHTML('afterbegin', '<p class="storage-warning" role="status">Trình duyệt không cho lưu tiến độ. Bạn vẫn có thể luyện trong phiên này; hãy cho phép lưu dữ liệu nếu muốn học tiếp sau khi đóng trang.</p>');
    updateBadges();
  }

  function renderHome() {
    const records = Object.values(state.records);
    const learned = records.length;
    const attempts = records.reduce((n,r) => n + r.attempts, 0);
    const accuracy = attempts ? Math.round(records.reduce((n,r) => n + r.correct, 0) / attempts * 100) : null;
    const percent = Math.round(learned / questions.length * 100);
    $('#main').innerHTML = `
      <section class="intro"><div><span class="eyebrow">MỘT GÓC NHỎ, MỘT MỤC TIÊU LỚN</span><h1>Học từng câu.<br><em>Nhớ thật lâu.</em></h1><p>Cùng ôn lại Tư tưởng Hồ Chí Minh theo cách của bạn.<br>Chọn một bài luyện và bắt đầu từ hôm nay.</p></div><div class="source-stamp">${icon('book')}<div><strong>${questions.length}</strong><span>câu hỏi sẵn sàng để luyện</span></div></div></section>
      ${state.active ? `<div class="resume-banner"><div><h3>Bạn có một bài luyện đang làm</h3><p>${Object.keys(state.active.choices).length}/${state.active.ids.length} câu đã trả lời · ${state.active.mode === 'practice' ? 'Luyện tập' : 'Tự kiểm tra'}</p></div><button class="btn primary" data-action="resume">Học tiếp</button></div>` : ''}
      <section class="stats" aria-label="Thống kê luyện tập"><div class="stat"><span class="stat-icon">${icon('book')}</span><div><span class="stat-label">Câu hỏi đã luyện</span><strong>${learned}<small>/ ${questions.length} câu</small></strong></div></div><div class="stat"><span class="stat-icon">${icon('check')}</span><div><span class="stat-label">Tỉ lệ trả lời đúng</span><strong>${accuracy === null ? '—' : accuracy + '%'}<small>${attempts ? attempts + ' lượt trả lời' : 'Bắt đầu để xem'}</small></strong></div></div><div class="stat"><span class="stat-icon">${icon('clock')}</span><div><span class="stat-label">Bài đã hoàn thành</span><strong>${state.completed}<small>bài luyện tập</small></strong></div></div></section>
      <div class="home-grid"><section class="card"><div class="section-title"><h2>Bắt đầu một bài luyện</h2><span>THEO NHỊP CỦA BẠN</span></div><p class="card-subtitle">Một bài ngắn cũng là một bước tiến.</p>
        <form id="setup-form"><div class="setup-section"><span class="field-label" id="mode-label">Bạn muốn học thế nào?</span><div class="mode-grid" role="radiogroup" aria-labelledby="mode-label"><label class="mode-option"><input type="radio" name="mode" value="practice" checked><span class="mode-content"><span>${icon('book')}Luyện tập</span><small>Xem đáp án ngay sau mỗi câu, học đến đâu nhớ đến đó.</small></span></label><label class="mode-option"><input type="radio" name="mode" value="exam"><span class="mode-content"><span>${icon('clock')}Tự kiểm tra</span><small>Tự làm trọn bài, xem điểm và đáp án khi nộp.</small></span></label></div></div>
        <div class="field-row setup-section"><label><span class="field-label">Số câu mỗi bài</span><select name="count" id="question-count"><option value="10">10 câu · Khởi động</option><option value="20" selected>20 câu · Vừa đủ</option><option value="30">30 câu · Tập trung</option><option value="50">50 câu · Thử sức</option><option value="all">Tất cả ${questions.length} câu</option></select></label><label><span class="field-label">Chọn câu hỏi</span><select name="pool"><option value="all">Toàn bộ câu hỏi</option><option value="unseen">Câu chưa luyện (${questions.length-learned})</option><option value="wrong">Câu cần ôn lại (${wrongIds().length})</option><option value="saved">Câu đã đánh dấu (${state.saved.length})</option></select></label></div>
        <div class="setup-controls"><label class="check-label"><input type="checkbox" name="shuffle" checked>Trộn thứ tự câu hỏi</label><span class="card-subtitle">Giữ nguyên thứ tự đáp án A–D</span></div><button class="btn primary full" type="submit">${icon('book')}Bắt đầu luyện tập</button><p class="start-footnote">Không giới hạn thời gian. Tiến độ được lưu tự động.</p></form></section>
        <aside class="home-side"><section class="card progress-card"><div class="section-title"><h3>Hành trình của bạn</h3>${icon('flower')}</div><div class="progress-visual" style="--progress:${percent}%"><div><strong>${percent}%</strong><span>đã khám phá</span></div></div><p class="progress-summary">${learned ? `Bạn đã luyện ${learned} trong ${questions.length} câu hỏi.` : 'Hành trình bắt đầu từ câu hỏi đầu tiên.'}</p><div class="legend-row"><span><i class="legend-dot"></i>Đã luyện</span><strong>${learned} câu</strong></div><div class="legend-row"><span><i class="legend-dot light"></i>Chưa luyện</span><strong>${questions.length-learned} câu</strong></div></section><div class="study-tip">${icon('repeat')}<div><h3>Một mẹo nhỏ để nhớ lâu</h3><p>Làm lại những câu trả lời sai sau mỗi buổi học. Lặp lại một chút, kiến thức sẽ ở lại lâu hơn.</p></div></div></aside></div>
      <div class="privacy-note"><span>Dữ liệu học tập lưu trong trình duyệt này, không đồng bộ giữa các thiết bị.</span>${learned || state.saved.length || state.active ? '<button class="text-button" data-action="reset">Xóa tiến độ</button>' : ''}</div>`;
    $('#setup-form').addEventListener('submit', async e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const pool = selectPool(form.get('pool'));
      if (!pool.length) { toast('Nhóm này chưa có câu hỏi. Hãy chọn nhóm khác để bắt đầu.'); return; }
      if (state.active && !await confirmAction('Bắt đầu bài luyện mới?', 'Bài đang làm sẽ được thay bằng bài mới. Những câu đã luyện ở chế độ Luyện tập vẫn được lưu.', 'Bắt đầu bài mới')) return;
      startSession(pool, form.get('mode'), form.get('count') === 'all' ? pool.length : Number(form.get('count')), form.has('shuffle'));
    });
  }

  function selectPool(pool) {
    if (pool === 'wrong') return wrongIds();
    if (pool === 'saved') return [...state.saved];
    if (pool === 'unseen') return questions.filter(q => !state.records[q.id]).map(q => q.id);
    return questions.map(q => q.id);
  }
  function startSession(pool, mode, count, shuffled) {
    const ids = [...pool];
    if (shuffled) for (let i=ids.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [ids[i],ids[j]]=[ids[j],ids[i]]; }
    state.active = {ids:ids.slice(0,count), mode, choices:{}, graded:[], index:0, elapsed:0, startedAt:new Date().toISOString()};
    beginClock(); persist(); navigate('quiz'); window.scrollTo({top:0,behavior:'instant'});
  }
  function recordAnswer(id, correct) {
    const prev = state.records[id] || {attempts:0,correct:0};
    state.records[id] = {attempts:prev.attempts+1,correct:prev.correct+(correct?1:0),lastCorrect:correct};
  }
  function saveQuestion(id) {
    if (state.saved.includes(id)) state.saved=state.saved.filter(n=>n!==id); else state.saved.push(id);
    persist();
    document.querySelectorAll(`[data-action="save"][data-id="${id}"]`).forEach(b => {
      const saved = state.saved.includes(id);
      b.classList.toggle('saved',saved); b.setAttribute('aria-pressed',String(saved));
      b.setAttribute('aria-label',saved?'Bỏ đánh dấu câu '+id:'Đánh dấu câu '+id);
      b.title=saved?'Bỏ đánh dấu':'Đánh dấu để ôn sau';
    });
    if (route === 'saved') renderBank();
  }
  function saveButton(q) {
    const saved = state.saved.includes(q.id);
    return `<button class="icon-button ${saved?'saved':''}" data-action="save" data-id="${q.id}" aria-pressed="${saved}" aria-label="${saved?'Bỏ đánh dấu':'Đánh dấu'} câu ${q.id}" title="${saved?'Bỏ đánh dấu':'Đánh dấu để ôn sau'}">${icon('star')}</button>`;
  }

  function renderQuiz() {
    const s = state.active, q = byId.get(s.ids[s.index]), choice = s.choices[q.id];
    const reveal = s.mode === 'practice' && !!choice;
    const count = Object.keys(s.choices).length;
    const correct = isCorrect(q,choice);
    $('#main').innerHTML = `<div class="quiz-heading"><div><span class="eyebrow">TỪNG CÂU MỘT, BẠN ĐANG TIẾN BỘ</span><h1>${s.mode === 'practice' ? 'Luyện tập' : 'Tự kiểm tra'} <span style="color:var(--muted);font-weight:400">· ${s.ids.length} câu</span></h1></div><span class="timer">${icon('clock')}<span id="elapsed">${formatTime(s.elapsed)}</span></span></div><div class="quiz-layout"><section><div class="card question-card"><div class="question-meta"><strong>Câu ${s.index+1}<span style="font-weight:400;color:var(--muted)"> / ${s.ids.length}</span></strong><span>${pages(q)}</span>${saveButton(q)}</div><h2 class="question-text" id="question-title">${esc(q.question)}</h2><div class="options" role="group" aria-labelledby="question-title">${q.options.map(o => `<button class="option ${o.id===choice?'selected':''} ${reveal&&isCorrect(q,o.id)?'is-correct':''} ${reveal&&o.id===choice&&!correct?'is-wrong':''}" data-action="answer" data-answer="${o.id}" aria-pressed="${o.id===choice}" ${reveal?'disabled':''}><span class="option-letter">${o.id}</span><span>${esc(o.text)}</span>${reveal&&isCorrect(q,o.id)?icon('check'):''}</button>`).join('')}</div>${reveal?`<div class="feedback ${correct?'':'wrong'}" role="status"><strong>${correct?'Chính xác! Bạn đã nhớ câu này.':'Chưa chính xác. Đáp án theo tài liệu là '+q.correctAnswers.join(', ')+'.'}</strong><small>Đáp án được đánh dấu đỏ trong Scribd.pdf · ${pages(q)}.</small></div>`:''}<div class="question-footer"><button class="btn secondary" data-action="previous" ${s.index===0?'disabled':''}>Câu trước</button><div>${s.index<s.ids.length-1?'<button class="btn primary" data-action="next">Câu tiếp theo</button>':'<button class="btn primary" data-action="finish">Hoàn thành bài</button>'}</div></div></div><p class="key-hint">Dùng phím <kbd>1</kbd>–<kbd>4</kbd> chọn đáp án · <kbd>←</kbd> <kbd>→</kbd> chuyển câu</p></section><aside class="card nav-card"><h3>Tiến độ bài luyện</h3><p>${count}/${s.ids.length} câu đã trả lời</p><div class="quiz-progress"><span style="width:${count/s.ids.length*100}%"></span></div><div class="question-grid" aria-label="Chọn câu hỏi">${s.ids.map((id,i)=>{const a=s.choices[id];return `<button class="${i===s.index?'current':''} ${a?(s.mode==='practice'?(isCorrect(byId.get(id),a)?'correct':'wrong'):'answered'):''}" data-action="jump" data-index="${i}" aria-label="Câu ${i+1}${a?', đã trả lời':''}" ${i===s.index?'aria-current="step"':''}>${i+1}</button>`;}).join('')}</div><p class="nav-help">${s.mode==='practice'?'Xanh: đúng · Đỏ: cần ôn lại.':'Các câu đã chọn được tô màu.'}<br>Bạn có thể chọn số để chuyển câu.</p><button class="btn secondary full" data-action="finish">${s.mode==='exam'?'Nộp bài kiểm tra':'Kết thúc bài luyện'}</button></aside></div>`;
  }
  function choose(answer) {
    if (!state.active || route !== 'quiz') return;
    const s=state.active, q=byId.get(s.ids[s.index]);
    if (!q.options.some(o=>o.id===answer) || (s.mode==='practice' && s.choices[q.id])) return;
    s.choices[q.id]=answer;
    if (s.mode==='practice') { recordAnswer(q.id,isCorrect(q,answer)); s.graded ||= []; s.graded.push(q.id); }
    syncElapsed();persist();renderQuiz();
  }
  function move(index) {
    const s=state.active;
    if (!s || index<0 || index>=s.ids.length) return;
    s.index=index;syncElapsed();persist();renderQuiz();
  }
  async function finish() {
    const s=state.active;
    if (!s) return;
    const unanswered=s.ids.filter(id=>!s.choices[id]).length;
    const text=unanswered?`Bạn còn ${unanswered} câu chưa trả lời. Những câu này sẽ được tính là chưa đúng và đưa vào mục cần ôn lại.`:'Bạn đã trả lời tất cả câu hỏi. Nộp bài để xem điểm và ôn lại đáp án.';
    if (!await confirmAction('Hoàn thành bài luyện?',text,'Nộp và xem kết quả')) return;
    syncElapsed();
    for (const id of s.ids) if (!(s.graded||[]).includes(id)) recordAnswer(id,isCorrect(byId.get(id),s.choices[id]));
    state.lastResult=JSON.parse(JSON.stringify(s));
    state.lastResult.finishedAt=new Date().toISOString();
    const correct=s.ids.filter(id=>isCorrect(byId.get(id),s.choices[id])).length;
    state.completed++;
    state.history = [{date:state.lastResult.finishedAt,correct,total:s.ids.length,elapsed:s.elapsed},...(Array.isArray(state.history)?state.history:[])].slice(0,50);
    state.active=null;reviewFilter='all';persist();navigate('result');window.scrollTo({top:0,behavior:'instant'});
  }

  function renderResult() {
    const s=state.lastResult;
    const correct=s.ids.filter(id=>isCorrect(byId.get(id),s.choices[id])).length;
    const unanswered=s.ids.filter(id=>!s.choices[id]).length;
    const wrong=s.ids.length-correct-unanswered;
    const percent=Math.round(correct/s.ids.length*100);
    const needsReview=s.ids.filter(id=>!isCorrect(byId.get(id),s.choices[id]));
    $('#main').innerHTML=`<section class="card result-hero"><span class="eyebrow">THÊM MỘT BƯỚC TRÊN HÀNH TRÌNH HỌC</span><h1>${percent===100?'Trọn vẹn một bài luyện!':percent>=70?'Bạn đang làm rất tốt!':'Mỗi lần luyện là một lần nhớ hơn.'}</h1><div class="result-circle"><strong>${percent}%</strong><small>${correct}/${s.ids.length} câu đúng</small></div><p>${needsReview.length?`Còn ${needsReview.length} câu để cùng ôn lại. Bạn có thể luyện riêng những câu này.`:'Bạn đã trả lời đúng toàn bộ. Hãy thử thêm những câu khác để củng cố kiến thức.'}</p><div class="result-stats"><div><strong style="color:var(--green)">${correct}</strong><span>Trả lời đúng</span></div><div><strong style="color:var(--red)">${wrong}</strong><span>Trả lời sai</span></div><div><strong>${unanswered}</strong><span>Chưa trả lời</span></div><div><strong style="font-size:1.25rem">${formatTime(s.elapsed)}</strong><span>Thời gian làm bài</span></div></div><div class="result-actions">${needsReview.length?'<button class="btn primary" data-action="retry-wrong">'+icon('repeat')+'Luyện lại câu chưa đúng</button>':''}<button class="btn secondary" data-action="retry-all">Làm lại bài này</button><a class="btn secondary" href="#home">Về tổng quan</a></div></section><div class="review-header"><h2>Xem lại bài vừa làm</h2><label><span class="sr-only">Lọc câu hỏi trong kết quả</span><select id="review-filter"><option value="all" ${reviewFilter==='all'?'selected':''}>Tất cả câu hỏi</option><option value="wrong" ${reviewFilter==='wrong'?'selected':''}>Sai hoặc chưa làm</option><option value="correct" ${reviewFilter==='correct'?'selected':''}>Trả lời đúng</option></select></label></div><div class="bank-list" id="review-list">${s.ids.filter(id=>reviewFilter==='all'||(reviewFilter==='correct'?isCorrect(byId.get(id),s.choices[id]):!isCorrect(byId.get(id),s.choices[id]))).map(id=>{
      const q=byId.get(id),a=s.choices[id],ok=isCorrect(q,a);
      return `<article class="card bank-card"><div class="bank-meta"><span>CÂU ${q.id}</span><span class="review-status ${ok?'':'wrong'}">${ok?'Đúng':a?'Sai':'Chưa trả lời'}</span><span>${pages(q)}</span></div><h3 class="bank-question">${esc(q.question)}</h3><div class="bank-options">${q.options.map(o=>`<div class="bank-option ${isCorrect(q,o.id)?'correct':''}"><b>${o.id}.</b><span>${esc(o.text)}</span>${o.id===a?'<span class="selected-mark">Bạn chọn</span>':''}${isCorrect(q,o.id)?icon('check'):''}</div>`).join('')}</div><div class="bank-footer"><span class="card-subtitle">Đáp án theo PDF: ${q.correctAnswers.join(', ')}</span>${saveButton(q)}</div></article>`;
    }).join('')||'<div class="card empty-state"><h3>Không có câu hỏi trong nhóm này.</h3></div>'}</div>`;
    $('#review-filter').addEventListener('change',e=>{reviewFilter=e.target.value;renderResult();});
  }

  function renderBank() {
    const map={bank:['Ngân hàng câu hỏi','Toàn bộ câu hỏi trong tài liệu. Tra cứu, xem đáp án và đánh dấu những câu muốn ôn.','all'],wrong:['Câu cần ôn lại','Những câu bạn trả lời sai hoặc bỏ trống ở lần gần nhất. Làm đúng để đưa câu ra khỏi danh sách này.','wrong'],saved:['Câu đã đánh dấu','Gom những câu cần ghi nhớ vào một chỗ và luyện lại bất cứ lúc nào.','saved']};
    const [title,desc,pool]=map[route];
    const ids=selectPool(pool);
    $('#main').innerHTML=`<div class="page-heading"><span class="eyebrow">HỌC THEO CÁCH CỦA BẠN</span><h1>${title}</h1><p>${desc}</p></div>${ids.length?`<div class="bank-toolbar"><label class="search-wrap"><span class="sr-only">Tìm theo nội dung hoặc số câu</span>${icon('search')}<input id="bank-search" type="search" placeholder="Tìm theo nội dung hoặc số câu…" value="${esc(bankQuery)}"></label><label class="check-label"><input type="checkbox" id="show-all" ${bankShowAnswers?'checked':''}>Hiện đáp án</label><button class="btn primary" data-action="practice-pool" data-pool="${pool}">${icon('book')}Luyện ${ids.length} câu này</button></div><p id="search-count" class="card-subtitle" style="margin-bottom:16px" role="status"></p><div class="bank-list" id="bank-list"></div><div id="bank-pager"></div>`:`<section class="card empty-state">${icon(route==='saved'?'star':'check')}<h2>${route==='saved'?'Bạn chưa đánh dấu câu nào.':'Chưa có câu nào cần ôn lại.'}</h2><p>${route==='saved'?'Bấm biểu tượng ngôi sao bên cạnh câu hỏi để lưu vào đây.':'Bắt đầu một bài luyện. Những câu chưa đúng sẽ xuất hiện ở đây để bạn dễ ôn tập.'}</p><a class="btn primary" href="#${route==='saved'?'bank':'home'}">${route==='saved'?'Khám phá câu hỏi':'Bắt đầu luyện tập'}</a></section>`}`;
    if (!ids.length) return;
    $('#bank-search').addEventListener('input',e=>{bankQuery=e.target.value;bankPage=0;renderBankItems();});
    $('#show-all').addEventListener('change',e=>{bankShowAnswers=e.target.checked;renderBankItems();});
    renderBankItems();
  }
  const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  function filteredBank() {
    const ids=selectPool(route==='wrong'?'wrong':route==='saved'?'saved':'all');
    const term=normalize(bankQuery.trim());
    return ids.map(id=>byId.get(id)).filter(q=>!term||String(q.id)===term||normalize(q.question+' '+q.options.map(o=>o.text).join(' ')).includes(term));
  }
  function renderBankItems() {
    if (!$('#bank-list')) return;
    const list=filteredBank(),pageSize=12,totalPages=Math.max(1,Math.ceil(list.length/pageSize));
    bankPage=Math.max(0,Math.min(bankPage,totalPages-1));
    $('#search-count').textContent=`${list.length} câu hỏi${bankQuery?' phù hợp':''} · Đáp án theo dấu đỏ trong tài liệu gốc`;
    $('#bank-list').innerHTML=list.slice(bankPage*pageSize,(bankPage+1)*pageSize).map(q=>{
      const show=bankShowAnswers||revealed.has(q.id);
      return `<article class="card bank-card"><div class="bank-meta"><span>CÂU ${q.id}</span><span>${pages(q)}</span></div><h2 class="bank-question">${esc(q.question)}</h2><div class="bank-options">${q.options.map(o=>`<div class="bank-option ${show&&isCorrect(q,o.id)?'correct':''}"><b>${o.id}.</b><span>${esc(o.text)}</span>${show&&isCorrect(q,o.id)?icon('check'):''}</div>`).join('')}</div><div class="bank-footer"><button class="btn ghost answer-toggle" data-action="reveal" data-id="${q.id}">${show?'Đáp án: '+q.correctAnswers.join(', '):'Xem đáp án'}</button><div class="bank-actions"><button class="btn secondary" data-action="single" data-id="${q.id}">Luyện câu này</button>${saveButton(q)}</div></div></article>`;
    }).join('')||`<div class="card empty-state">${icon('search')}<h3>Chưa tìm thấy câu hỏi phù hợp.</h3><p>Thử một từ khóa ngắn hơn hoặc nhập số câu trong tài liệu.</p></div>`;
    $('#bank-pager').innerHTML=totalPages>1?`<div class="pager"><button class="btn secondary" data-action="bank-prev" ${bankPage===0?'disabled':''}>Trang trước</button><span>${bankPage+1} / ${totalPages}</span><button class="btn secondary" data-action="bank-next" ${bankPage===totalPages-1?'disabled':''}>Trang sau</button></div>`:'';
  }

  function confirmAction(title,text,label) {
    const dialog=$('#confirm-dialog');
    if (dialog.open) return Promise.resolve(false);
    $('#dialog-title').textContent=title;$('#dialog-text').textContent=text;$('#dialog-confirm').textContent=label;
    dialog.returnValue='cancel';dialog.showModal();
    return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
  }
  async function launchPool(ids) {
    if (!ids.length) return;
    if (state.active && !await confirmAction('Bắt đầu bài luyện mới?','Bài đang làm sẽ được thay bằng bài mới. Tiến độ luyện tập đã ghi nhận vẫn được giữ.','Bắt đầu bài mới')) return;
    startSession(ids,'practice',ids.length,true);
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
    const action=b.dataset.action,id=Number(b.dataset.id);
    if(action==='resume')navigate('quiz');
    else if(action==='answer')choose(b.dataset.answer);
    else if(action==='previous')move(state.active.index-1);
    else if(action==='next')move(state.active.index+1);
    else if(action==='jump')move(Number(b.dataset.index));
    else if(action==='finish')await finish();
    else if(action==='save')saveQuestion(id);
    else if(action==='retry-wrong')await launchPool(state.lastResult.ids.filter(n=>!isCorrect(byId.get(n),state.lastResult.choices[n])));
    else if(action==='retry-all')await launchPool(state.lastResult.ids);
    else if(action==='single')await launchPool([id]);
    else if(action==='practice-pool')await launchPool(selectPool(b.dataset.pool));
    else if(action==='reveal'){if(revealed.has(id))revealed.delete(id);else revealed.add(id);renderBankItems();}
    else if(action==='bank-prev'||action==='bank-next'){bankPage+=action==='bank-prev'?-1:1;renderBankItems();$('#bank-search')?.scrollIntoView({block:'start'});}
    else if(action==='reset'){
      if(await confirmAction('Xóa toàn bộ tiến độ?','Số câu đã luyện, bài đang làm, kết quả và câu đánh dấu trong trình duyệt này sẽ được xóa. Ngân hàng câu hỏi vẫn sẵn sàng để bạn bắt đầu lại.','Xóa tiến độ')){state=fresh();persist();render();toast('Đã xóa tiến độ. Bạn có thể bắt đầu lại.');}
    }
  });
  document.addEventListener('keydown',e=>{
    if(route!=='quiz'||!state.active||$('#confirm-dialog').open||e.ctrlKey||e.altKey||e.metaKey||e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
    if(['1','2','3','4'].includes(e.key)){e.preventDefault();choose('ABCD'[Number(e.key)-1]);}
    else if(e.key==='ArrowRight'){e.preventDefault();move(state.active.index+1);}
    else if(e.key==='ArrowLeft'){e.preventDefault();move(state.active.index-1);}
  });
  window.addEventListener('hashchange',()=>{bankPage=0;bankQuery='';render();window.scrollTo({top:0,behavior:'instant'});});
  $('#download-json').addEventListener('click',e=>{
    e.preventDefault();
    const blob=new Blob([JSON.stringify(DATA,null,2)+'\n'],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='Scribd.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  });
  render();
})();
