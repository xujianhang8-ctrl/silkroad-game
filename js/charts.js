/* 丝路法灯 · 战况看板、结算页与奖状
 * 图表规范:队伍颜色 = 队伍身份(与地图棋子一致),每处颜色旁边都有队伍图标与名字,不单靠颜色辨认;
 * 线条 2px、端点圆点带一圈底色描边、网格为浅色细实线;悬停/键盘聚焦可查看数值,并提供表格视图。
 */
var DR = window.DR || (window.DR = {});

(function () {

function $(id) { return document.getElementById(id); }
function esc(s) { return DR.UI.escapeHtml(s); }
const INK = '#2c2418', INK2 = '#5a4a30', MUTED = '#6f6556', GRID = '#e7e0cf', AXIS = '#c9bfa8', SURFACE = '#fffdf8';

// ---------------- 通用悬停提示框(内容一律用 textContent 写入) ----------------

let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip hidden';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
// rows: [{ color, value, label }]
function showTip(x, y, title, rows) {
  const el = tip();
  el.textContent = '';
  const h = document.createElement('div');
  h.className = 'ct-title';
  h.textContent = title;
  el.appendChild(h);
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'ct-row';
    const key = document.createElement('i');
    key.className = 'ct-key';
    key.style.background = r.color || MUTED;
    const v = document.createElement('b');
    v.textContent = r.value;
    const l = document.createElement('span');
    l.textContent = r.label;
    row.append(key, v, l);
    el.appendChild(row);
  });
  el.classList.remove('hidden');
  const w = el.offsetWidth, hh = el.offsetHeight;
  let left = x + 16, top = y + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 16;
  if (top + hh > window.innerHeight - 8) top = window.innerHeight - hh - 8;
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = Math.max(8, top) + 'px';
}
function hideTip() { if (tipEl) tipEl.classList.add('hidden'); }

function niceStep(max, count) {
  const raw = Math.max(1, max) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

function roundLabel(r, live) {
  if (r === 0) return '出发';
  return live ? `第${r}轮·进行中` : `第${r}轮`;
}

// 走势数据:每轮结束时的记录 + (游戏进行中时)当前这一刻
function trendPoints(state) {
  const pts = state.history.map(h => ({ round: h.round, scores: h.scores.slice(), live: false }));
  const last = pts[pts.length - 1];
  if (state.phase !== 'ended' && (!last || last.round < state.round)) {
    pts.push({ round: state.round, scores: state.teams.map(t => DR.Game.totalScore(t)), live: true });
  }
  return pts;
}

// ---------------- 折线图:总功德走势 ----------------

function renderTrendChart(container, state) {
  const pts = trendPoints(state);
  const teams = state.teams;
  // 画布宽度跟随容器,这样坐标轴文字始终是设定的像素大小(容器不可见时先按 640 画,切换到该页时会重画)
  const cw = container.clientWidth;
  const VW = cw > 0 ? Math.max(420, Math.min(1000, cw - 4)) : 640, VH = 250;
  const m = { l: 40, r: 70, t: 14, b: 36 };
  const pw = VW - m.l - m.r, ph = VH - m.t - m.b;
  const maxVal = Math.max(10, ...pts.map(p => Math.max(...p.scores)));
  const step = niceStep(maxVal, 4);
  const yMax = Math.ceil(maxVal / step) * step;
  const n = pts.length;
  const xAt = i => m.l + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const yAt = v => m.t + ph - (v / yMax) * ph;

  let svg = `<svg class="trend-svg" viewBox="0 0 ${VW} ${VH}" role="img" tabindex="0" aria-label="各队总功德随轮次变化的折线图,可用左右方向键查看每一轮的数值">`;
  for (let v = 0; v <= yMax + 0.001; v += step) {
    const y = yAt(v).toFixed(1);
    svg += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" stroke="${v === 0 ? AXIS : GRID}" stroke-width="1"/>`;
    svg += `<text x="${m.l - 8}" y="${(+y + 4).toFixed(1)}" text-anchor="end" class="ax-tick">${v}</text>`;
  }
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  pts.forEach((p, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
    svg += `<text x="${xAt(i).toFixed(1)}" y="${m.t + ph + 18}" text-anchor="middle" class="ax-tick">${p.round === 0 ? '出发' : p.round}</text>`;
  });
  svg += `<text x="${m.l + pw / 2}" y="${VH - 4}" text-anchor="middle" class="ax-title">轮次</text>`;

  // 折线与端点
  teams.forEach((t, ti) => {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.scores[ti] || 0).toFixed(1)}`).join('');
    svg += `<path d="${d}" fill="none" stroke="${t.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // 直接标注:线尾的队伍图标 + 数值;挤在一起时用引线错开,不把标签硬挪离线条
  const ends = teams.map((t, ti) => ({ t, v: pts[n - 1].scores[ti] || 0, y: yAt(pts[n - 1].scores[ti] || 0) }))
    .sort((a, b) => a.y - b.y);
  const minGap = 15;
  ends.forEach((e, i) => { e.ly = i === 0 ? e.y : Math.max(e.y, ends[i - 1].ly + minGap); });
  const overflow = ends.length ? ends[ends.length - 1].ly - (m.t + ph + 6) : 0;
  if (overflow > 0) ends.forEach(e => { e.ly -= overflow; });
  const xe = xAt(n - 1);
  ends.forEach(e => {
    svg += `<circle cx="${xe.toFixed(1)}" cy="${e.y.toFixed(1)}" r="4.5" fill="${e.t.color}" stroke="${SURFACE}" stroke-width="2"/>`;
    const moved = Math.abs(e.ly - e.y) > 2;
    if (moved) svg += `<path d="M${(xe + 6).toFixed(1)},${e.y.toFixed(1)} L${(xe + 14).toFixed(1)},${e.ly.toFixed(1)}" stroke="${AXIS}" stroke-width="1" fill="none"/>`;
    svg += `<text x="${(xe + 16).toFixed(1)}" y="${(e.ly + 4).toFixed(1)}" class="end-label">${e.t.icon} ${e.v}</text>`;
  });
  // 悬停层:十字准线吸附到最近的一轮
  svg += `<line class="trend-cross hidden" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" stroke="${INK2}" stroke-width="1"/>`;
  svg += `<g class="trend-hover-dots"></g>`;
  svg += `<rect class="trend-hit" x="${m.l - 10}" y="${m.t}" width="${pw + 20}" height="${ph}" fill="transparent"/>`;
  svg += '</svg>';

  const legend = `<div class="chart-legend">${teams.map(t => `<span class="lg-item"><i class="lg-line" style="background:${t.color}"></i>${t.icon} ${esc(t.name)}</span>`).join('')}</div>`;
  const table = `<div class="chart-table hidden"><table><thead><tr><th>轮次</th>${teams.map(t => `<th>${t.icon} ${esc(t.name)}</th>`).join('')}</tr></thead>
    <tbody>${pts.map(p => `<tr><td>${roundLabel(p.round, p.live)}</td>${p.scores.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  container.innerHTML = `<div class="chart-toolbar">${legend}<button type="button" class="chart-view-toggle">📋 表格</button></div>
    <div class="chart-plot">${svg}</div>${table}`;

  const svgEl = container.querySelector('svg');
  const cross = svgEl.querySelector('.trend-cross');
  const dotsG = svgEl.querySelector('.trend-hover-dots');
  let cur = n - 1;
  const showAt = (i, clientX, clientY) => {
    cur = Math.max(0, Math.min(n - 1, i));
    const x = xAt(cur);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x);
    cross.classList.remove('hidden');
    dotsG.innerHTML = teams.map((t, ti) => `<circle cx="${x.toFixed(1)}" cy="${yAt(pts[cur].scores[ti] || 0).toFixed(1)}" r="4.5" fill="${t.color}" stroke="${SURFACE}" stroke-width="2"/>`).join('');
    const rows = teams.map((t, ti) => ({ color: t.color, value: String(pts[cur].scores[ti] || 0), label: `${t.icon} ${t.name}`, v: pts[cur].scores[ti] || 0 }))
      .sort((a, b) => b.v - a.v);
    if (clientX == null) {
      const r = svgEl.getBoundingClientRect();
      clientX = r.left + (x / VW) * r.width;
      clientY = r.top + r.height * 0.3;
    }
    showTip(clientX, clientY, roundLabel(pts[cur].round, pts[cur].live) + ' · 总功德', rows);
  };
  const clear = () => { cross.classList.add('hidden'); dotsG.innerHTML = ''; hideTip(); };
  const hit = svgEl.querySelector('.trend-hit');
  hit.addEventListener('pointermove', e => {
    const r = svgEl.getBoundingClientRect();
    const vx = (e.clientX - r.left) / r.width * VW;
    const i = n <= 1 ? 0 : Math.round((vx - m.l) / pw * (n - 1));
    showAt(i, e.clientX, e.clientY);
  });
  hit.addEventListener('pointerleave', clear);
  svgEl.addEventListener('focus', () => showAt(cur));
  svgEl.addEventListener('blur', clear);
  svgEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      showAt(cur + (e.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  const toggle = container.querySelector('.chart-view-toggle');
  toggle.addEventListener('click', () => {
    const tbl = container.querySelector('.chart-table');
    const plot = container.querySelector('.chart-plot');
    const showTable = tbl.classList.contains('hidden');
    tbl.classList.toggle('hidden', !showTable);
    plot.classList.toggle('hidden', showTable);
    toggle.textContent = showTable ? '📈 图表' : '📋 表格';
  });
}

// ---------------- 排名条形图:功德 + 残页价值 ----------------

function renderRanking(container, state) {
  const rows = state.teams.map(t => ({ t, merit: t.merit, frag: DR.Game.fragmentValue(t), total: DR.Game.totalScore(t) }))
    .sort((a, b) => b.total - a.total);
  const max = Math.max(10, ...rows.map(r => r.total));
  const medal = ['🥇', '🥈', '🥉'];
  container.innerHTML = `
    <div class="rank-legend"><span><i class="rk-key solid"></i>手中功德</span><span><i class="rk-key light"></i>残页价值(浅色)</span></div>
    ${rows.map((r, i) => `
      <div class="rank-row" tabindex="0" data-i="${i}">
        <span class="rank-medal">${medal[i] || '#' + (i + 1)}</span>
        <span class="rank-name"><i class="rank-dot" style="background:${r.t.color}"></i>${r.t.icon} ${esc(r.t.name)}</span>
        <span class="rank-track">
          <span class="rank-bar" style="width:calc((100% - 52px) * ${(r.total / max).toFixed(4)})">
            ${r.merit > 0 ? `<span class="rank-seg solid" style="flex:${r.merit};background:${r.t.color}"></span>` : ''}
            ${r.frag > 0 ? `<span class="rank-seg light" style="flex:${r.frag};background:${r.t.color}"></span>` : ''}
          </span>
          <span class="rank-total">${r.total}</span>
        </span>
      </div>`).join('')}`;
  container.querySelectorAll('.rank-row').forEach(el => {
    const r = rows[+el.dataset.i];
    const show = e => {
      const box = el.getBoundingClientRect();
      showTip(e && e.clientX != null ? e.clientX : box.right - 60, e && e.clientY != null ? e.clientY : box.top, `${r.t.icon} ${r.t.name} · 总功德 ${r.total}`, [
        { color: r.t.color, value: String(r.merit), label: '手中功德' },
        { color: r.t.color, value: String(r.frag), label: '残页价值' },
      ]);
    };
    el.addEventListener('pointermove', show);
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', () => show());
    el.addEventListener('blur', hideTip);
  });
}

function renderCollection(container, state) {
  container.innerHTML = `<div class="coll-wrap"><table class="coll-table">
    <thead><tr><th>队伍</th>${DR.PARAMITAS.map(p => `<th title="${p.meaning}"><span class="coll-head-icon" style="background:${p.color}">${p.icon}</span>${p.name}</th>`).join('')}<th>残页价值</th></tr></thead>
    <tbody>${state.teams.map(t => {
      const full = DR.PARAMITAS.every(p => t.backpack[p.key] >= 1);
      return `<tr><td class="coll-team"><i class="rank-dot" style="background:${t.color}"></i>${t.icon} ${esc(t.name)}</td>
        ${DR.PARAMITAS.map(p => `<td class="${t.backpack[p.key] ? 'has' : 'none'}">${t.backpack[p.key] ? `<b>${t.backpack[p.key]}</b>` : '·'}</td>`).join('')}
        <td class="coll-value">${DR.Game.fragmentValue(t)}${full ? ' <span class="coll-full">集齐!</span>' : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function fmtClock(sec) {
  sec = Math.max(0, sec | 0);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function renderClassStats(container, state) {
  const asked = state.qlog.length;
  const right = state.qlog.filter(q => q.correct).length;
  const challenges = state.teams.reduce((s, t) => s + (t.challengesDone || 0), 0);
  const lamps = state.teams.reduce((s, t) => s + t.lampsLit, 0);
  const trips = state.teams.filter(t => t.completed).length;
  const used = state.totalSeconds - Math.max(0, state.timerSeconds);
  const bankPct = Math.max(0, Math.min(100, state.bank / (state.bankStart || DR.CONFIG.bankTotal) * 100));
  container.innerHTML = `
    <div class="kpi-row">
      <div class="kpi"><span>轮次</span><b>${state.round}</b></div>
      <div class="kpi"><span>答对问答</span><b>${right}<small> / ${asked}</small></b></div>
      <div class="kpi"><span>完成挑战</span><b>${challenges}</b></div>
      <div class="kpi"><span>点亮法灯</span><b>${lamps}</b></div>
      <div class="kpi"><span>完成往返</span><b>${trips}<small> 队</small></b></div>
      <div class="kpi"><span>已用时间</span><b>${fmtClock(used)}</b></div>
    </div>
    <div class="meter-block">
      <div class="meter-label"><span>🏦 功德库剩余</span><b>${state.bank} / ${state.bankStart || DR.CONFIG.bankTotal}</b></div>
      <div class="meter"><div class="meter-fill" style="width:${bankPct.toFixed(1)}%"></div></div>
    </div>
    <div class="race">
      <div class="race-scale"><span>长安出发</span><span>🪷 那烂陀寺</span><span>回到长安</span></div>
      ${state.teams.map(t => {
        const pct = DR.Game.journeyProgressPct(t);
        return `<div class="race-row"><span class="race-name">${t.icon} ${esc(t.name)}</span>
          <span class="race-track"><i class="race-mid"></i><i class="race-fill" style="width:${pct}%;background:${t.color}"></i>
          <span class="race-token" style="left:${pct}%;border-color:${t.color}">${t.icon}</span></span>
          <span class="race-pct">${pct}%</span></div>`;
      }).join('')}
      <p class="race-note">进度 = 去程占一半、归程占一半(陆路 ${DR.Game.path('land').length} 步 / 海路 ${DR.Game.path('sea').length} 步,含沿途村落)</p>
    </div>`;
}

function openStats() {
  const state = DR.state;
  if (!state) return;
  $('stats-sub').textContent = `第 ${state.round} 轮 · 剩余 ${fmtClock(state.timerSeconds)} · 功德库 ${state.bank}`;
  // 先显示浮层再画图:走势图要按容器的实际宽度来画
  DR.Screens.openOverlay('stats-overlay');
  renderRanking($('stats-ranking'), state);
  renderTrendChart($('stats-trend'), state);
  renderCollection($('stats-collection'), state);
  renderClassStats($('stats-class'), state);
  DR.Audio.page();
}

function toggleStats() {
  if (DR.Screens.isOpen('stats-overlay')) { DR.Screens.closeOverlay('stats-overlay'); hideTip(); }
  else openStats();
}

// ---------------- 结算页 ----------------

let endContext = null;

function renderEnd(state, results, reason) {
  endContext = { state, results, reason };
  const reasonText = { timeup: '⏰ 时间到', bankEmpty: '🏦 功德库已用完', manual: '🏁 老师结束了本局', allHome: '🌸 所有队伍都已功德圆满' }[reason] || '';
  const used = Math.max(1, Math.round((state.totalSeconds - Math.max(0, state.timerSeconds)) / 60));
  $('end-sub').textContent = `${reasonText} · 共进行 ${state.round} 轮 · 用时约 ${used} 分钟 · 答对 ${state.qlog.filter(q => q.correct).length} 道智慧问答`;

  // 颁奖台(前三名)
  const order = [1, 0, 2];
  const heights = [118, 150, 96];
  $('podium').innerHTML = order.filter(i => results[i]).map(i => {
    const r = results[i];
    return `<div class="podium-col p${i + 1}" style="--team-color:${r.team.color};--h:${heights[order.indexOf(i)]}px">
      <div class="podium-team"><span class="podium-icon">${r.team.icon}</span><b>${esc(r.team.name)}</b><span class="podium-score">${r.total} 功德</span></div>
      <div class="podium-block"><span>${i + 1}</span></div>
    </div>`;
  }).join('');

  const medal = ['🥇', '🥈', '🥉'];
  $('results-list').innerHTML = results.map((r, i) => `
    <div class="result-row" style="border-left-color:${r.team.color}">
      <div class="result-rank">${medal[i] || (i + 1)}</div>
      <div class="result-info">
        <div class="result-name">${r.team.icon} ${esc(r.team.name)}</div>
        <div class="result-detail">功德 ${r.team.merit} + 残页价值 ${r.fragValue}(${r.fragCount} 张${r.fullSet ? ' · 集齐六度' : ''}) · 🪔 点灯 ${r.team.lampsLit} · 💡 答对 ${r.team.correctAnswers}</div>
        <div class="result-badges">${r.badges.map(b => `<span class="badge">${esc(b)}</span>`).join('')}</div>
      </div>
      <div class="result-total">${r.total}</div>
    </div>
  `).join('');

  // 旅程数据:走势图 + 表格
  renderTrendChart($('end-chart'), state);
  $('end-table-wrap').innerHTML = `<table class="end-table">
    <thead><tr><th>队伍</th><th>路线</th><th>总功德</th><th>功德</th><th>残页价值</th><th>答对问答</th><th>完成挑战</th><th>点亮法灯</th><th>掷骰次数</th><th>到访站点</th><th>往返</th></tr></thead>
    <tbody>${results.map(r => `<tr>
      <td class="coll-team"><i class="rank-dot" style="background:${r.team.color}"></i>${r.team.icon} ${esc(r.team.name)}</td>
      <td>${r.team.route === 'land' ? '🐫 陆路' : '⛵ 海路'}${r.team.hasSwitched ? '(换乘)' : ''}</td>
      <td><b>${r.total}</b></td><td>${r.team.merit}</td><td>${r.fragValue}</td>
      <td>${r.team.correctAnswers}</td><td>${r.team.challengesDone || 0}</td><td>${r.team.lampsLit}</td>
      <td>${r.team.turnsTaken}</td><td>${r.team.visited.size}</td><td>${r.team.completed ? '✅' : '—'}</td></tr>`).join('')}</tbody></table>`;

  // 问答回顾
  const qlog = state.qlog;
  $('end-quiz').innerHTML = qlog.length ? `<p class="end-quiz-sum">本局共出现 ${qlog.length} 道智慧问答,答对 ${qlog.filter(q => q.correct).length} 道。课后可以一起回顾这些知识:</p>` +
    qlog.map((entry, i) => {
      const q = DR.QUESTIONS[entry.q];
      const team = state.teams[entry.teamId];
      if (!q || !team) return '';
      return `<div class="quiz-card ${entry.correct ? 'ok' : 'no'}">
        <div class="qc-head"><span class="qc-no">第 ${i + 1} 题</span><span class="qc-team"><i class="rank-dot" style="background:${team.color}"></i>${team.icon} ${esc(team.name)} · 第 ${entry.round} 轮</span><span class="qc-verdict">${entry.correct ? '✅ 答对' : '❌ 答错'}</span></div>
        <div class="qc-q">${esc(q.q)}</div>
        <div class="qc-a">正确答案:<b>${esc(q.options[q.answer])}</b>${entry.correct ? '' : `<span class="qc-chosen">(当时选择:${esc(entry.chosenText || '')})</span>`}</div>
        <div class="qc-note">📖 ${esc(q.note)}</div>
      </div>`;
    }).join('') : '<p class="end-empty">本局没有出现智慧问答。</p>';

  // 旅程纪事:按轮分组,按时间先后排列
  const groups = [];
  state.log.forEach(msg => {
    if (msg.startsWith('§ ')) groups.push({ title: msg.slice(2), items: [] });
    else {
      if (!groups.length) groups.push({ title: '旅程开始', items: [] });
      groups[groups.length - 1].items.push(msg);
    }
  });
  $('end-chronicle').innerHTML = groups.filter(g => g.items.length).map(g => `
    <section class="chron-group"><h4>${esc(g.title)}</h4><ul>${g.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul></section>`).join('') || '<p class="end-empty">暂无记录。</p>';

  setEndTab('awards');
}

function setEndTab(tab) {
  document.querySelectorAll('.end-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.end-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
  hideTip();
  // 走势图在隐藏的标签页里无法测量宽度,切换过来时按实际宽度重画一次
  if (tab === 'data' && endContext) renderTrendChart($('end-chart'), endContext.state);
}

// ---------------- 奖状打印 ----------------

function printCertificates() {
  if (!endContext) return;
  const { results } = endContext;
  const d = new Date();
  const dateText = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  $('print-area').innerHTML = results.map((r, i) => `
    <div class="cert">
      <div class="cert-inner">
        <div class="cert-top">丝路法灯 · 大乘取经记</div>
        <h1 class="cert-title">荣 誉 证 书</h1>
        <p class="cert-to">授予 <b>${r.team.icon} ${esc(r.team.name)}</b> 全体队员:</p>
        <p class="cert-body">在"丝路求法"课堂旅程中,你们沿着${r.team.route === 'land' ? '陆上丝绸之路' : '海上丝绸之路'}勇敢前行,
          以布施、持戒、忍辱、精进、禅定、般若的精神互相帮助、共同学习,共获得 <b>${r.total}</b> 点总功德,位列第 <b>${i + 1}</b> 名,荣获:</p>
        <div class="cert-badges">${r.badges.map(b => `<span>${esc(b)}</span>`).join('')}</div>
        <p class="cert-wish">愿你们像玄奘法师一样,心怀理想、坚持不懈,把智慧与善意带给身边的每一个人。</p>
        <div class="cert-foot"><span>${dateText}</span><span class="cert-seal">丝路<br>法灯</span></div>
      </div>
    </div>`).join('');
  setTimeout(() => window.print(), 60);
}

function wireEnd() {
  $('end-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.end-tab-btn');
    if (!btn) return;
    DR.Audio.page();
    setEndTab(btn.dataset.tab);
  });
  $('btn-print-cert').addEventListener('click', printCertificates);
  $('btn-end-home').addEventListener('click', () => DR.Screens.goHome());
  $('btn-end-setup').addEventListener('click', () => DR.Screens.openSetup());
  $('btn-stats').addEventListener('click', toggleStats);
  document.addEventListener('scroll', hideTip, true);
}

DR.Stats = {
  wire: wireEnd,
  openStats,
  toggleStats,
  renderEnd,
  printCertificates,
  hideTip,
};

})();
