(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (!window.QUIZ_DATA?.questions?.length) {
    $('#main').innerHTML = '<section class="empty card"><h1>Chưa tải được bộ câu hỏi.</h1><p>Hãy kiểm tra kết nối và tải lại trang.</p><button class="btn primary" id="reload">Tải lại trang</button></section>';
    $('#reload').addEventListener('click', () => location.reload());
    return;
  }
  const DATA = window.QUIZ_DATA;
  const allQuestions = DATA.questions;
  const questions = allQuestions.filter(q => q.status === 'ready');
  const pendingCount = allQuestions.length - questions.length;
  const chapters = DATA.chapters;
  const byId = new Map(allQuestions.map(q => [q.id, q]));
  $('.skip-link').addEventListener('click', event => { event.preventDefault(); $('#main').focus(); $('#main').scrollIntoView(); });
  // Answers exist only in this page's memory; no browser storage or cookies.
  let exam = null, result = null, route = 'home', submitting = false;
  let settings = { mode: 'practice', chapterId: 'all', count: 20, minutes: 0, shuffle: true };
  let bankQuery = '', bankPage = 0, showAnswers = false, reviewFilter = 'all', reviewPage = 0;
  let bankChapter = 'all', bankStatus = 'all';
  let toastTimeout;
  const correct = (q, answer) => q.correctAnswers.includes(answer);
  const formatTime = seconds => {
    const s = Math.max(0, Math.floor(seconds));
    return (s >= 3600 ? String(Math.floor(s / 3600)).padStart(2, '0') + ':' : '') + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const elapsed = s => Math.max(0, Math.floor(((s.finishedAt || Date.now()) - s.startedAt) / 1000));
  const remaining = s => s.deadline ? Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)) : null;
  const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const chapterPool = id => id === 'all' ? questions : questions.filter(q => q.chapterId === Number(id));
  const scopeTitle = id => id === 'all' ? `Tất cả ${chapters.length} chương` : `Chương ${id}`;
  const sourceLabel = q => `Chương ${q.chapterId} · Câu ${q.number}`;
  function chapterOptions(selected) {
    return `<option value="all" ${selected === 'all' ? 'selected' : ''}>Tất cả ${chapters.length} chương</option>` + chapters.map(c => `<option value="${c.id}" ${String(selected) === String(c.id) ? 'selected' : ''}>Chương ${c.id}</option>`).join('');
  }
  function toast(message) {
    $('#toast').textContent = message; $('#toast').classList.add('visible');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
  }
  function navigate(next) { if (location.hash.slice(1) === next) render(); else location.hash = next; }
  function render() {
    route = location.hash.slice(1) || 'home';
    if (!['home', 'exam', 'result', 'questions'].includes(route)) route = 'home';
    if (route === 'exam' && !exam) route = 'home';
    if (route === 'result' && !result) route = 'home';
    document.body.dataset.page = route;
    document.querySelectorAll('[data-nav]').forEach(link => {
      const active = link.dataset.nav === route || (link.dataset.nav === 'home' && ['exam', 'result'].includes(route));
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    document.title = ({ home: 'Ôn theo chương & thi thử', exam: exam?.mode === 'practice' ? 'Đang ôn tập' : 'Đang làm bài', result: 'Kết quả', questions: `Bộ ${questions.length} câu hỏi` }[route]) + ' · Ôn Tư tưởng';
    ({ home: renderHome, exam: renderExam, result: renderResult, questions: renderBank }[route])();
  }
  function renderHome() {
    const pool = chapterPool(settings.chapterId);
    if (settings.count !== 'all' && settings.count > pool.length) settings.count = 'all';
    const practice = settings.mode === 'practice';
    $('#main').innerHTML = `<section class="home-main"><div class="home-copy"><span class="eyebrow"><span class="tiny-square"></span>TRẮC NGHIỆM TƯ TƯỞNG HỒ CHÍ MINH</span>
      <div class="book-scene" aria-hidden="true">
        <div class="scene-ring"><i></i><i></i><i></i></div>
        <div class="book-shadow"></div>
        <div class="hero-quiz-card">
          <span class="hero-card-caption">LUYỆN TẬP MỖI NGÀY</span>
          <div class="hero-question-lines"><i></i><i></i></div>
          <div class="hero-demo-answer"><b>A</b><i></i></div>
          <div class="hero-demo-answer hero-demo-answer--correct"><b>B</b><i></i>${icon('check')}</div>
          <div class="hero-demo-answer"><b>C</b><i></i></div>
          <div class="hero-demo-answer"><b>D</b><i></i></div>
        </div>
        <div class="study-book"><div class="book-spine"></div><div class="book-cover"><span class="book-series">TỦ SÁCH ÔN TẬP</span><div class="book-star">✦</div><strong>TƯ TƯỞNG<br>HỒ CHÍ MINH</strong><div class="book-rule"></div><span class="book-subtitle">Hiểu hôm nay.<br>Vững bước ngày mai.</span><span class="book-edition">${questions.length} CÂU HỎI · ${chapters.length} CHƯƠNG</span></div></div>
        <span class="hero-spark hero-spark--one">✦</span><span class="hero-spark hero-spark--two">✧</span><span class="hero-spark hero-spark--three">✦</span>
      </div>
    </div>

      <div class="setup-column">${pendingCount ? `<div class="data-notice"><strong>Bộ mới: ${allQuestions.length} câu · 6 chương</strong><p>${pendingCount} câu đang chờ bổ sung chữ hoặc đáp án. Các câu này vẫn có trong bộ câu hỏi và chưa dùng để chấm điểm.</p><button data-action="pending">Xem các câu cần bổ sung</button> · <a href="can-bo-sung.txt" target="_blank" rel="noopener">Danh sách chi tiết</a></div>` : ''}${exam ? `<div class="resume-notice">${icon('clock')}<span>Bạn có một lượt đang làm chưa kết thúc.</span><button data-action="resume">Làm tiếp</button></div>` : ''}
      <section class="card setup-card">
      <form id="exam-setup">
        <fieldset class="mode-field"><legend>Chế độ</legend><div class="mode-options">${[['practice', 'Ôn tập', 'Hiện đáp án ngay', 'book'], ['exam', 'Thi thử', 'Xem đáp án khi nộp', 'clock']].map(([value, title, desc, ic]) => `<label><input type="radio" name="mode" value="${value}" ${settings.mode === value ? 'checked' : ''}><span>${icon(ic)}<strong>${title}</strong><small>${desc}</small></span></label>`).join('')}</div></fieldset>
        <label class="field-label" for="chapter-select">Ôn theo chương</label><select id="chapter-select" name="chapter">${chapterOptions(settings.chapterId)}</select>
        <p class="chapter-description">${esc(scopeTitle(settings.chapterId))} <strong>· ${pool.length} câu</strong></p>
        <fieldset class="count-field"><legend>Số câu mỗi lượt</legend><div class="count-options">${[10, 20, 30, 50, 'all'].map(n => `<label class="${n !== 'all' && n > pool.length ? 'unavailable' : ''}"><input type="radio" name="count" value="${n}" ${settings.count === n ? 'checked' : ''} ${n !== 'all' && n > pool.length ? 'disabled' : ''}><span>${n === 'all' ? 'Tất cả' : n}<small>${n === 'all' ? pool.length + ' câu' : 'câu'}</small></span></label>`).join('')}</div></fieldset>
        <label class="field-label" for="exam-duration">Thời gian làm bài</label><select id="exam-duration" name="minutes" ${practice ? 'disabled' : ''}>${[[0, 'Không giới hạn'], [10, '10 phút'], [15, '15 phút'], [20, '20 phút'], [30, '30 phút'], [45, '45 phút'], [60, '60 phút']].map(([v, label]) => `<option value="${v}" ${(practice ? 0 : settings.minutes) === v ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <label class="shuffle-setting"><span class="setting-description">${icon('shuffle')}<span><strong>Trộn thứ tự câu hỏi</strong><small>Tắt để ôn theo thứ tự trong tài liệu</small></span></span><span class="switch"><input type="checkbox" name="shuffle" ${settings.shuffle ? 'checked' : ''}><span></span></span></label>
        <div class="exam-info">${icon('info')}<p>${practice ? 'Đáp án hiện ngay sau khi chọn. Mỗi câu ghi nhận <strong>lần chọn đầu tiên</strong>.' : 'Mỗi câu có <strong>1 đáp án đúng</strong>. Bạn có thể đổi đáp án trước khi nộp bài.'}</p></div>
        <button class="btn primary start-button" type="submit">${practice ? 'Bắt đầu ôn tập' : 'Bắt đầu làm bài'}${icon(practice ? 'book' : 'clock')}</button>
      </form></section></div></section>
      `;
    function readForm() {
      const form = new FormData($('#exam-setup'));
      settings = { mode: form.get('mode'), chapterId: form.get('chapter'), count: form.get('count') === 'all' ? 'all' : Number(form.get('count')), minutes: Number(form.get('minutes') || 0), shuffle: form.has('shuffle') };
    }
    $('#chapter-select').addEventListener('change', () => { readForm(); renderHome(); $('#chapter-select').focus(); });
    document.querySelectorAll('[name=mode]').forEach(input => input.addEventListener('change', () => {
      readForm(); settings.minutes = settings.mode === 'practice' ? 0 : 20; renderHome();
      document.querySelector(`[name=mode][value="${settings.mode}"]`).focus();
    }));
    $('#exam-setup').addEventListener('submit', async event => {
      event.preventDefault(); readForm();
      if (exam && !await confirm('Bắt đầu lượt mới?', 'Các câu trả lời trong lượt hiện tại sẽ không được giữ lại.', 'Bắt đầu lượt mới')) return;
      startExam();
    });
  }

  function startExam(ids, previous = null) {
    let pool = ids ? [...ids] : chapterPool(settings.chapterId).map(q => q.id);
    if (!ids && settings.shuffle) for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (!ids && settings.count !== 'all') pool = pool.slice(0, settings.count);
    if (!pool.length) { toast('Chương này chưa có câu hỏi. Vui lòng chọn chương khác.'); return; }
    const mode = previous?.mode || settings.mode, chapterId = previous?.chapterId || settings.chapterId;
    const minutes = mode === 'practice' ? 0 : (previous?.minutes ?? settings.minutes);
    const now = Date.now();
    exam = { mode, chapterId, minutes, ids: pool, choices: {}, flags: [], index: 0, startedAt: now, deadline: minutes ? now + minutes * 60000 : null };
    result = null; submitting = false;
    navigate('exam'); window.scrollTo(0, 0);
  }

  function renderExam() {
    const q = byId.get(exam.ids[exam.index]), answer = exam.choices[q.id];
    const practice = exam.mode === 'practice', reveal = practice && !!answer;
    const answered = Object.keys(exam.choices).length, timeLeft = remaining(exam);
    const right = correct(q, answer), key = q.correctAnswers[0], keyText = q.options.find(o => o.id === key).text;
    const notes = (q.sourceNotes || []).map(note => `<small class="source-normalization">${esc(note)}</small>`).join('');
    $('#main').innerHTML = `<div class="exam-heading"><div><span class="eyebrow">${practice ? 'ÔN TẬP THEO CHƯƠNG' : 'BÀI THI TRẮC NGHIỆM'}</span><h1>Tư tưởng Hồ Chí Minh</h1><p>${exam.ids.length} câu hỏi <span>·</span> ${esc(scopeTitle(exam.chapterId))}</p></div><button class="btn secondary" data-action="submit">${practice ? 'Kết thúc ôn tập' : 'Nộp bài'}</button></div>
      <div class="exam-layout"><section class="card question-card" data-question-id="${q.id}"><div class="question-topline"><span class="question-number">Câu ${exam.index + 1}<small> / ${exam.ids.length}</small></span><button class="flag-button ${exam.flags.includes(q.id) ? 'flagged' : ''}" data-action="flag" aria-pressed="${exam.flags.includes(q.id)}">${icon('flag')}<span>${exam.flags.includes(q.id) ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}</span></button></div><h2 class="question-text" id="question-title">${esc(q.question)}</h2>
      <div class="answers" role="group" aria-labelledby="question-title">${q.options.map(o => `<button class="answer ${answer === o.id ? 'selected' : ''} ${reveal && correct(q, o.id) ? 'is-correct' : ''} ${reveal && answer === o.id && !right ? 'is-incorrect' : ''}" data-action="answer" data-answer="${o.id}" aria-pressed="${answer === o.id}" ${reveal ? 'disabled' : ''}><span class="answer-letter">${o.id}</span><span>${esc(o.text)}</span><span class="answer-radio">${reveal && correct(q, o.id) || !reveal && answer === o.id ? icon('check') : ''}</span></button>`).join('')}</div>
      ${reveal ? `<section class="answer-feedback ${right ? 'correct' : 'incorrect'}" role="status"><strong>${right ? 'Chính xác!' : 'Chưa chính xác.'}</strong><p>Đáp án đúng: <b>${key}.</b> ${esc(keyText)}</p>${notes}</section>` : ''}
      <div class="question-bottom"><button class="btn secondary" data-action="previous" ${exam.index === 0 ? 'disabled' : ''}>Câu trước</button><span class="question-caption">${reveal ? 'Đã ghi nhận lần chọn đầu' : answer ? 'Đã chọn đáp án ' + answer : 'Chưa chọn đáp án'}</span>${exam.index < exam.ids.length - 1 ? '<button class="btn primary" data-action="next">Câu tiếp theo</button>' : `<button class="btn primary" data-action="submit">${practice ? 'Xem kết quả ôn tập' : 'Kiểm tra & nộp bài'}</button>`}</div><p class="keyboard-hint">Phím <kbd>1</kbd>–<kbd>4</kbd> chọn A–D <span>·</span> <kbd>←</kbd> <kbd>→</kbd> chuyển câu</p></section>
      <aside class="exam-aside"><section class="card exam-tracker"><div class="timer-label">${icon('clock')}${exam.deadline ? 'Thời gian còn lại' : practice ? 'Thời gian ôn tập' : 'Thời gian làm bài'}</div><strong class="timer ${timeLeft !== null && timeLeft <= 60 ? 'urgent' : ''}" id="timer">${formatTime(timeLeft === null ? elapsed(exam) : timeLeft)}</strong><div class="tracker-progress"><span>Đã trả lời <strong>${answered}/${exam.ids.length}</strong></span><div class="progress-track"><span style="width:${answered / exam.ids.length * 100}%"></span></div></div>
      <div class="question-grid" aria-label="Chuyển đến câu hỏi">${exam.ids.map((id, index) => `<button class="${exam.choices[id] ? 'answered' : ''} ${practice && exam.choices[id] ? (correct(byId.get(id), exam.choices[id]) ? 'correct' : 'incorrect') : ''} ${exam.flags.includes(id) ? 'flagged' : ''} ${index === exam.index ? 'current' : ''}" data-action="jump" data-index="${index}" aria-label="Câu ${index + 1}${exam.choices[id] ? ', đã trả lời' : ''}${exam.flags.includes(id) ? ', đã đánh dấu' : ''}" ${index === exam.index ? 'aria-current="step"' : ''}>${index + 1}</button>`).join('')}</div>
      <div class="grid-legend"><span><i class="legend-box answered"></i>${practice ? 'Đúng' : 'Đã trả lời'}</span>${practice ? '<span><i class="legend-box incorrect"></i>Sai</span>' : ''}<span><i class="legend-box"></i>Chưa trả lời</span><span><i class="legend-box flagged"></i>Đánh dấu</span></div><button class="btn primary full" data-action="submit">${practice ? 'Kết thúc & xem kết quả' : 'Nộp bài thi'}</button></section><p class="aside-note">${icon('info')}<span>${practice ? 'Đáp án hiện sau lần chọn đầu. Ôn lại câu đã trả lời bằng cách chọn số câu.' : exam.deadline ? 'Bài tự nộp khi hết giờ. Đáp án hiện sau khi nộp bài.' : 'Bạn chủ động nộp khi hoàn thành. Đáp án hiện sau khi nộp bài.'}</span></p></aside></div>`;
  }

  function choose(answer) {
    if (!exam || submitting) return;
    if (exam.deadline && Date.now() >= exam.deadline) { submitExam(true); return; }
    const q = byId.get(exam.ids[exam.index]);
    if (!q.options.some(o => o.id === answer) || (exam.mode === 'practice' && exam.choices[q.id])) return;
    exam.choices[q.id] = answer; renderExam();
  }

  function move(index) {
    if (!exam || index < 0 || index >= exam.ids.length) return;
    exam.index = index; renderExam();
    if (innerWidth <= 760) window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function submitExam(automatic = false) {
    if (!exam || submitting) return;
    if (!automatic) {
      const unanswered = exam.ids.length - Object.keys(exam.choices).length;
      const ok = await confirm(exam.mode === 'practice' ? 'Kết thúc ôn tập?' : 'Nộp bài thi?', unanswered ? `Bạn còn ${unanswered} câu chưa trả lời. Câu bỏ trống sẽ không được tính điểm. Bạn vẫn muốn nộp bài?` : 'Bạn đã trả lời tất cả câu hỏi. Nộp bài để xem điểm và đáp án.', exam.mode === 'practice' ? 'Xem kết quả ôn tập' : 'Nộp bài & xem điểm');
      if (!ok || !exam) return;
    }
    submitting = true;
    if ($('#dialog').open) $('#dialog').close('cancel');
    result = { ...exam, finishedAt: exam.deadline ? Math.min(Date.now(), exam.deadline) : Date.now(), timedOut: automatic };
    exam = null; reviewFilter = 'all'; reviewPage = 0;
    navigate('result'); window.scrollTo(0, 0);
    if (automatic) toast('Đã hết giờ. Bài thi của bạn đã được nộp tự động.');
  }
  setInterval(() => {
    if (!exam) return;
    const timeLeft = remaining(exam), node = $('#timer');
    if (node) { node.textContent = formatTime(timeLeft === null ? elapsed(exam) : timeLeft); node.classList.toggle('urgent', timeLeft !== null && timeLeft <= 60); }
    if (timeLeft === 0) submitExam(true);
  }, 250);
  document.addEventListener('visibilitychange', () => { if (exam?.deadline && Date.now() >= exam.deadline) submitExam(true); });
  window.addEventListener('beforeunload', event => { if (exam) { event.preventDefault(); event.returnValue = ''; } });
  function renderResult() {
    const total = result.ids.length;
    const right = result.ids.filter(id => correct(byId.get(id), result.choices[id])).length;
    const empty = result.ids.filter(id => !result.choices[id]).length;
    const score = (right / total * 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
    $('#main').innerHTML = `<section class="card result-summary"><div class="result-copy"><span class="eyebrow">${result.timedOut ? 'ĐÃ HẾT THỜI GIAN LÀM BÀI' : 'BẠN ĐÃ HOÀN THÀNH'}</span><h1>${result.mode === 'practice' ? 'Lượt ôn tập đã hoàn thành.' : 'Bài thi đã hoàn thành.'}</h1><p>${esc(scopeTitle(result.chapterId))}<br>Cùng xem lại kết quả và những câu cần ôn nhé.</p><div class="result-actions"><button class="btn primary" data-action="new">Tạo đề mới</button><button class="btn secondary" data-action="retry">${icon('refresh')}Làm lại đề này</button></div></div><div class="score-ring" style="--score:${right / total * 100}%"><div><strong>${score}<small>/10</small></strong><span>ĐIỂM BÀI THI</span></div></div></section><section class="result-stats" aria-label="Chi tiết kết quả"><div><span class="result-stat-icon green">${icon('check')}</span><div><strong>${right}<small>/${total}</small></strong><span>Trả lời đúng</span></div></div><div><span class="result-stat-icon red">×</span><div><strong>${total - right - empty}</strong><span>Trả lời sai</span></div></div><div><span class="result-stat-icon gray">—</span><div><strong>${empty}</strong><span>Chưa trả lời</span></div></div><div><span class="result-stat-icon amber">${icon('clock')}</span><div><strong class="time-stat">${formatTime(elapsed(result))}</strong><span>Thời gian làm bài</span></div></div></section><div class="review-heading"><div><span class="eyebrow">HIỂU THÊM SAU MỖI LẦN THỬ</span><h2>Xem lại đáp án</h2></div><label><span class="sr-only">Lọc câu hỏi trong kết quả</span><select id="review-filter">${[['all', 'Tất cả câu hỏi'], ['incorrect', 'Sai hoặc bỏ trống'], ['correct', 'Trả lời đúng'], ['empty', 'Chưa trả lời']].map(([value, label]) => `<option value="${value}" ${reviewFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div id="review-list" class="question-list"></div><div id="review-pager"></div><p class="result-note">Kết quả chỉ hiển thị trong lượt làm bài này. Tải lại trang sẽ bắt đầu một lượt mới.</p>`;
    $('#review-filter').addEventListener('change', event => { reviewFilter = event.target.value; reviewPage = 0; renderReview(); });
    renderReview();
  }
  function questionCard(q, index, reveal = false, answer = null, reviewing = false) {
    const ok = correct(q, answer), pending = q.status !== 'ready';
    return `<article class="card bank-card ${pending ? 'needs-review' : ''}" data-question-id="${q.id}"><div class="bank-meta"><span>${reviewing ? "Câu " + index : sourceLabel(q)}</span>${reviewing ? `<span class="status ${ok ? 'correct' : answer ? 'incorrect' : 'empty'}">${ok ? 'Trả lời đúng' : answer ? 'Trả lời sai' : 'Chưa trả lời'}</span>` : pending ? '<span class="pending-badge">Cần bổ sung</span>' : `<span>Chương ${q.chapterId}</span>`}</div><h3>${esc(q.question || 'Nội dung câu hỏi bị thiếu trong PDF — chờ bổ sung.')}</h3>${pending ? `<div class="pending-details"><strong>Phần cần bổ sung</strong><ul>${q.issues.map(issue => `<li>${esc(issue.message)}</li>`).join('')}</ul><p>Câu này chưa được đưa vào bài luyện hoặc thi có chấm điểm.</p></div>` : ''}<div class="review-options">${q.options.map(o => `<div class="review-option ${reveal && correct(q, o.id) ? 'correct' : ''} ${reviewing && answer === o.id && !ok ? 'incorrect' : ''}"><b>${o.id}</b><span>${esc(o.text || '[Chờ bổ sung nội dung]')}</span>${reveal && correct(q, o.id) ? icon('check') : ''}${reviewing && o.id === answer ? '<small>Bạn chọn</small>' : ''}</div>`).join('')}</div>${reveal ? `<p class="source-note">Đáp án: <strong>${q.correctAnswers.length ? q.correctAnswers.join(', ') : 'Chờ bổ sung'}</strong></p>` : ''}</article>`;
  }
  function pager(page, total, kind) {
    if (total <= 1) return '';
    return `<div class="pager"><button class="btn secondary" data-action="${kind}-previous" ${page === 0 ? 'disabled' : ''}>Trang trước</button><span>Trang ${page + 1} / ${total}</span><button class="btn secondary" data-action="${kind}-next" ${page >= total - 1 ? 'disabled' : ''}>Trang sau</button></div>`;
  }
  function renderReview() {
    const ids = result.ids.filter(id => reviewFilter === 'all' || (reviewFilter === 'correct' ? correct(byId.get(id), result.choices[id]) : reviewFilter === 'empty' ? !result.choices[id] : !correct(byId.get(id), result.choices[id])));
    const totalPages = Math.max(1, Math.ceil(ids.length / 10));
    reviewPage = Math.max(0, Math.min(reviewPage, totalPages - 1));
    $('#review-list').innerHTML = ids.slice(reviewPage * 10, reviewPage * 10 + 10).map(id => questionCard(byId.get(id), result.ids.indexOf(id) + 1, true, result.choices[id], true)).join('') || '<div class="card empty"><h3>Không có câu hỏi trong nhóm này.</h3><p>Chọn một bộ lọc khác để xem lại bài thi.</p></div>';
    $('#review-pager').innerHTML = pager(reviewPage, totalPages, 'review');
  }
  function renderBank() {
    $('#main').innerHTML = `<div class="page-heading"><span class="eyebrow">HỆ THỐNG LẠI KIẾN THỨC</span><h1>Bộ câu hỏi theo chương</h1><p>${allQuestions.length} câu theo 6 file mới. ${questions.length} câu sẵn sàng luyện; ${pendingCount} câu cần bổ sung.</p><p class="bank-source-note">File “Tổng hợp LMS” được xếp vào chương 1. <a href="can-bo-sung.txt" target="_blank" rel="noopener">Danh sách cần bổ sung</a> · <a href="mau-bo-sung.json" download>Mẫu điền JSON</a></p></div><div class="bank-filters"><div class="bank-chapter-filter"><label class="field-label" for="bank-chapter">Chọn chương</label><select id="bank-chapter">${chapterOptions(bankChapter)}</select></div><div class="bank-chapter-filter"><label class="field-label" for="bank-status">Trạng thái câu hỏi</label><select id="bank-status">${[['all', 'Tất cả câu hỏi'], ['ready', 'Sẵn sàng luyện'], ['needs_review', 'Cần bổ sung']].map(([value, label]) => `<option value="${value}" ${bankStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><div class="bank-toolbar"><label class="search-input">${icon('search')}<span class="sr-only">Tìm câu hỏi theo nội dung hoặc số câu trong chương</span><input type="search" id="bank-search" placeholder="Tìm nội dung hoặc số câu trong chương…" value="${esc(bankQuery)}"></label><label class="checkbox-label"><input type="checkbox" id="show-answers" ${showAnswers ? 'checked' : ''}>Hiện đáp án</label></div><p class="search-count" id="search-count" role="status"></p><div id="bank-list" class="question-list"></div><div id="bank-pager"></div>`;
    $('#bank-chapter').addEventListener('change', event => { bankChapter = event.target.value; bankPage = 0; renderBankItems(); });
    $('#bank-status').addEventListener('change', event => { bankStatus = event.target.value; bankPage = 0; renderBankItems(); });
    $('#bank-search').addEventListener('input', event => { bankQuery = event.target.value; bankPage = 0; renderBankItems(); });
    $('#show-answers').addEventListener('change', event => { showAnswers = event.target.checked; renderBankItems(); });
    renderBankItems();
  }

  function renderBankItems() {
    const term = normalize(bankQuery.trim());
    const list = allQuestions.filter(q => (bankChapter === 'all' || q.chapterId === Number(bankChapter)) && (bankStatus === 'all' || q.status === bankStatus) && (!term || String(q.number) === term || normalize(q.question + ' ' + q.options.map(o => o.text).join(' ')).includes(term)));
    const totalPages = Math.max(1, Math.ceil(list.length / 12));
    bankPage = Math.max(0, Math.min(bankPage, totalPages - 1));
    $('#search-count').textContent = `${list.length} câu hỏi${term ? ' phù hợp' : ''}`;
    $('#bank-list').innerHTML = list.slice(bankPage * 12, bankPage * 12 + 12).map(q => questionCard(q, q.number, showAnswers)).join('') || '<div class="card empty"><h3>Chưa tìm thấy câu hỏi.</h3><p>Thử một từ khóa ngắn hơn hoặc tìm theo số câu.</p></div>';
    $('#bank-pager').innerHTML = pager(bankPage, totalPages, 'bank');
  }
  function openDialog(title, content, confirmText = 'Đã hiểu', cancelText = null) {
    const dialog = $('#dialog');
    if (dialog.open) return Promise.resolve(false);
    $('#dialog-title').textContent = title; $('#dialog-content').innerHTML = content;
    $('#dialog-confirm').textContent = confirmText;
    $('#dialog-cancel').hidden = !cancelText; $('#dialog-cancel').textContent = cancelText || 'Quay lại';
    dialog.returnValue = 'cancel'; dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
  }
  function confirm(title, text, label) { return openDialog(title, `<p>${esc(text)}</p>`, label, 'Làm tiếp'); }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'answer') choose(button.dataset.answer);
    else if (action === 'next') move(exam.index + 1);
    else if (action === 'previous') move(exam.index - 1);
    else if (action === 'jump') move(Number(button.dataset.index));
    else if (action === 'submit') await submitExam();
    else if (action === 'flag' && exam) { const id = exam.ids[exam.index]; exam.flags = exam.flags.includes(id) ? exam.flags.filter(n => n !== id) : [...exam.flags, id]; renderExam(); }
    else if (action === 'resume') navigate('exam');
    else if (action === 'new') { result = null; submitting = false; navigate('home'); }
    else if (action === 'retry') startExam(result.ids, result);
    else if (action === 'bank-next' || action === 'bank-previous') { bankPage += action === 'bank-next' ? 1 : -1; renderBankItems(); $('.bank-toolbar').scrollIntoView({ block: 'start' }); }
    else if (action === 'review-next' || action === 'review-previous') { reviewPage += action === 'review-next' ? 1 : -1; renderReview(); $('.review-heading').scrollIntoView({ block: 'start' }); }
    else if (action === 'pending') { bankStatus = 'needs_review'; bankChapter = 'all'; bankQuery = ''; bankPage = 0; navigate('questions'); }
    else if (action === 'guide') await openDialog('Ôn tập và thi thử theo chương', `<ol class="guide-list"><li><strong>Chọn đề</strong><p>Chọn Ôn tập hoặc Thi thử, rồi chọn chương và số câu. Chế độ Thi thử có thể đặt thời gian.</p></li><li><strong>Làm bài</strong><p>Ôn tập hiện đáp án ngay sau lần chọn đầu, kể cả khi trả lời sai. Thi thử cho phép đổi đáp án và chỉ hiện đáp án sau khi nộp. Cả hai chế độ đều chuyển câu và đánh dấu xem lại được.</p></li><li><strong>Nộp và xem kết quả</strong><p>Nhấn Nộp bài để biết điểm và xem đáp án. Nếu có giới hạn thời gian, bài tự nộp khi hết giờ.</p></li></ol><p class="dialog-note">Không cần tài khoản. Không lưu tiến trình sau khi tải lại hoặc đóng trang.</p>`);
    else if (action === 'about') await openDialog('Về bộ câu hỏi', `<p>Bộ mới có <strong>${allQuestions.length} vị trí câu hỏi trong 6 chương</strong>, từ các file chương 1.pdf đến chương 6.pdf do người dùng cung cấp. Chương 1 có đầu đề “Tổng hợp LMS” và được xếp vào chương 1 theo yêu cầu.</p><p>${questions.length} câu đủ nội dung và đáp án để luyện. ${pendingCount} câu đang chờ bổ sung do ảnh PDF bị mất đoạn hoặc quảng cáo che chữ; xem bộ lọc “Cần bổ sung” trong Bộ câu hỏi.</p><p>Đáp án lấy từ nhãn “Đáp án đúng” trong PDF mới. Các phần còn thiếu được giữ trống và ghi rõ để bổ sung. Bộ cũ đã được thay khỏi dữ liệu đang phục vụ.</p><p>Thứ tự A–D được giữ nguyên vì có đáp án tham chiếu các lựa chọn khác. Tiến trình không lưu sau khi tải lại trang.</p>`);
  });
  document.addEventListener('keydown', event => {
    if (route !== 'exam' || !exam || $('#dialog').open || event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
    if (['1', '2', '3', '4'].includes(event.key)) { event.preventDefault(); choose('ABCD'[Number(event.key) - 1]); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); move(exam.index - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(exam.index + 1); }
  });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  render();
})();
