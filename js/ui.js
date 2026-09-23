/* 丝路法灯 · 游戏界面层(游戏主界面的渲染、弹窗与回合流程) */
var DR = window.DR || (window.DR = {});

(function () {

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function $(id) { return document.getElementById(id); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const DICE_PIPS = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};
function setDieFace(value) {
  const on = new Set(DICE_PIPS[value] || []);
  document.querySelectorAll('#dice-face .pip').forEach(el => {
    el.classList.toggle('on', on.has(+el.dataset.pip));
  });
}

// ---------------- 提示气泡(右上角,几秒后自动消失) ----------------

function toast(html, kind) {
  const stack = $('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' toast-' + kind : '');
  el.innerHTML = html;
  stack.appendChild(el);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 360);
  }, 3000);
}

// ---------------- 回合开始横幅 ----------------

let splashTimer = null;
function showTurnSplash(team, newRound, extraLine) {
  const el = $('turn-splash');
  if (!el || !DR.Store.settings.turnSplash) return;
  const state = DR.state;
  const station = DR.Game.currentStation(state, team);
  const where = team.completed ? '已功德圆满,在长安弘法' : (station ? station.name : '长安(整装出发)');
  el.innerHTML = `
    ${newRound ? `<div class="ts-round">第 ${state.round} 轮</div>` : ''}
    <div class="ts-main"><span class="ts-icon">${team.icon}</span><span>轮到 <b>${escapeHtml(team.name)}</b></span></div>
    <div class="ts-sub">${team.route === 'land' ? '🐫 陆路' : '⛵ 海路'} · ${escapeHtml(where)}${team.direction === 'back' && !team.completed ? ' · 归途' : ''}</div>
    ${extraLine ? `<div class="ts-extra">${extraLine}</div>` : ''}`;
  el.style.setProperty('--team-color', team.color);
  el.classList.remove('hidden', 'ts-out');
  void el.offsetWidth;
  el.classList.add('ts-in');
  clearTimeout(splashTimer);
  splashTimer = setTimeout(() => {
    el.classList.add('ts-out');
    splashTimer = setTimeout(() => el.classList.add('hidden'), 420);
  }, 1500);
}

function hideTurnSplash() {
  const el = $('turn-splash');
  if (el) el.classList.add('hidden');
  clearTimeout(splashTimer);
}

// ---------------- 主界面渲染 ----------------

function renderTeamsPanel(state) {
  const el = $('teams-panel');
  const rankOf = new Map(
    state.teams.slice().sort((a, b) => DR.Game.totalScore(b) - DR.Game.totalScore(a))
      .map((t, i) => [t.id, i])
  );
  const medal = ['🥇', '🥈', '🥉'];
  el.innerHTML = state.teams.map((team, i) => {
    const frags = DR.PARAMITAS.filter(p => team.backpack[p.key] > 0)
      .map(p => `<span class="frag-chip" title="${p.name}">${p.icon}${team.backpack[p.key]}</span>`).join('') || '<span class="frag-chip">空</span>';
    let posLabel;
    if (team.completed) posLabel = '已回长安';
    else if (team.position === 0) posLabel = '长安(出发前)';
    else posLabel = (team.route === 'land' ? DR.LAND_PATH : DR.SEA_PATH)[team.position - 1].name;
    const rank = rankOf.get(team.id);
    const rankBadge = medal[rank] || `#${rank + 1}`;
    return `<div class="team-card ${i === state.activeIndex ? 'active' : ''}" data-team-id="${team.id}" style="border-left-color:${team.color}">
      <div class="tc-head">
        <span class="tc-rank" title="当前排名(功德+残页价值)">${rankBadge}</span>
        <span class="tc-name">${team.icon} ${escapeHtml(team.name)}</span>
        <span class="tc-merit">${team.merit} 功德</span>
        <button type="button" class="tc-detail-btn" data-team-id="${team.id}" title="查看队伍详情">🔍</button>
      </div>
      <div class="tc-progress"><div class="tc-progress-fill" style="width:${DR.Game.journeyProgressPct(team)}%;background:${team.color}"></div></div>
      <div class="tc-sub">${team.route === 'land' ? '🐫 陆路' : '⛵ 海路'} · ${escapeHtml(posLabel)}
        ${team.direction === 'back' && !team.completed ? '(归途)' : ''}
        ${team.completed ? '<span class="tc-done">✓ 圆满</span>' : ''}
        ${team.skipNext ? '<span class="tc-skip" title="下回合暂停一次">⏸</span>' : ''}
        ${team.lampsLit > 0 ? `<span class="tc-lamp">🪔×${team.lampsLit}</span>` : ''}</div>
      <div class="tc-frags">${frags}</div>
    </div>`;
  }).join('');
  const active = el.querySelector('.team-card.active');
  if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
}

function wireTeamsPanelClick() {
  $('teams-panel').addEventListener('click', e => {
    const detailBtn = e.target.closest('.tc-detail-btn');
    if (detailBtn) {
      showModal('teamDetail', { teamId: +detailBtn.dataset.teamId });
      return;
    }
    const card = e.target.closest('.team-card');
    if (!card) return;
    DR.Map.showTeam(+card.dataset.teamId);
  });
}

// ---------------- 侧栏标签页(队伍 / 图鉴 / 见闻) ----------------

const SIDE_TAB_PANELS = { teams: 'teams-panel', legend: 'paramita-legend', log: 'journey-log' };
let activeSideTab = 'teams';
let lastSeenLogCount = 0;

function setSideTab(tab) {
  if (!SIDE_TAB_PANELS[tab]) return;
  activeSideTab = tab;
  document.querySelectorAll('.side-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.side-view').forEach(v => v.classList.toggle('active', v.id === SIDE_TAB_PANELS[tab]));
  if (tab === 'log' && DR.state) lastSeenLogCount = DR.state.log.length;
  updateLogBadge();
}

function resetSideTabs() {
  lastSeenLogCount = DR.state ? DR.state.log.length : 0;
  setSideTab('teams');
}

function updateLogBadge() {
  const badge = $('log-badge');
  if (!badge) return;
  const unseen = DR.state ? Math.max(0, DR.state.log.length - lastSeenLogCount) : 0;
  const show = activeSideTab !== 'log' && unseen > 0;
  badge.classList.toggle('hidden', !show);
  if (show) badge.textContent = unseen > 9 ? '9+' : String(unseen);
}

function wireSideTabs() {
  $('side-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.side-tab-btn');
    if (!btn) return;
    DR.Audio.click();
    setSideTab(btn.dataset.tab);
  });
  $('paramita-legend').addEventListener('click', e => {
    const item = e.target.closest('[data-codex]');
    if (item && DR.Screens) DR.Screens.openCodex('paramitas', item.dataset.codex);
  });
}

// 六度残页速览:侧栏常驻的小图鉴,点击任意一项可以打开百科里的详细介绍
function renderParamitaLegend() {
  const el = $('paramita-legend');
  if (!el || el.childElementCount) return;
  el.innerHTML = `
    <div class="pl-title">六度残页 · 功德价值</div>
    <div class="pl-grid">
      ${DR.PARAMITAS.map(p => `
        <button type="button" class="pl-item" style="--pc:${p.color}" data-codex="${p.key}" title="${p.meaning}">
          <span class="pl-icon">${p.icon}</span>${p.name}<span class="pl-val">${p.value}</span>
        </button>
      `).join('')}
    </div>
    <p class="pl-note">买入价比价值略高;集齐六种,译讲弘法时额外 +${DR.CONFIG.fullSetBonus}。</p>
    <button type="button" class="pl-more" data-codex="dana">📚 在百科中了解"六度"</button>
  `;
}

// 道路见闻:侧栏里一直有内容可看的活动记录。"§ " 开头的是"第 N 轮"分隔条
function renderJourneyLog(state) {
  const el = $('journey-log-list');
  if (!el) return;
  const entries = state.log.slice(-40).reverse();
  el.innerHTML = entries.length
    ? entries.map(msg => msg.startsWith('§ ')
      ? `<div class="log-sep"><span>${escapeHtml(msg.slice(2))}</span></div>`
      : `<div class="log-entry">${escapeHtml(msg)}</div>`).join('')
    : '<div class="log-empty">旅程尚未开始,快掷骰子出发吧!</div>';
  updateLogBadge();
}

function renderBank(state) { $('bank-display').textContent = state.bank; }

function renderTimer(state) {
  const total = Math.max(0, state.timerSeconds);
  const m = Math.floor(total / 60), s = total % 60;
  $('timer-display').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  $('timer-chip').classList.toggle('sprint', state.sprintActive);
}

function renderPhaseBanner(state) {
  const el = $('phase-banner');
  if (state.sprintActive) { el.textContent = '⚡ 冲刺阶段,骰子 +1!'; el.classList.add('show'); }
  else { el.classList.remove('show'); }
}

function renderRound(state) {
  const chip = $('round-chip');
  if (chip) chip.textContent = `第 ${state.round} 轮`;
}

// ---------------- 回合阶段进度条(掷骰→机缘→集市→结束) ----------------

function renderPhaseTracker(state) {
  const el = $('phase-tracker');
  if (!el) return;
  if (!el.childElementCount) {
    el.innerHTML = DR.Game.TURN_PHASES.map((p, i) => (
      (i > 0 ? '<span class="phase-connector"></span>' : '') +
      `<span class="phase-step" data-phase="${p.key}"><span class="ps-icon">${p.icon}</span><span class="ps-label">${escapeHtml(p.label)}</span></span>`
    )).join('');
  }
  const order = DR.Game.TURN_PHASES.map(p => p.key);
  const curIdx = order.indexOf(state.turnPhase);
  el.querySelectorAll('.phase-step').forEach(stepEl => {
    const idx = order.indexOf(stepEl.dataset.phase);
    stepEl.classList.toggle('current', idx === curIdx);
    stepEl.classList.toggle('done', idx >= 0 && idx < curIdx);
  });
  el.querySelectorAll('.phase-connector').forEach((c, i) => {
    c.classList.toggle('done', i < curIdx);
  });
}

function renderAll() {
  const state = DR.state;
  DR.Map.fitMapBox();
  DR.Map.layoutTokens(state);
  DR.Map.updateVisitedMarks(state);
  renderTeamsPanel(state);
  renderBank(state);
  renderTimer(state);
  renderRound(state);
  renderPhaseBanner(state);
  renderPhaseTracker(state);
  renderJourneyLog(state);
}

// ---------------- 地图放大 / 缩小整体视图 ----------------

let mapExpanded = false;

function toggleMapExpand(force) {
  if (!DR.state) return;
  mapExpanded = typeof force === 'boolean' ? force : !mapExpanded;
  $('main-lower').classList.toggle('map-expanded', mapExpanded);
  const btn = $('btn-toggle-map');
  btn.textContent = mapExpanded ? '⤡' : '⤢';
  btn.title = mapExpanded ? '缩小地图(快捷键 M)' : '放大整体视图(快捷键 M)';
  DR.Audio.click();
  DR.Map.fitMapBox();
}

// ---------------- 弹窗 ----------------

let modalMode = null;
let modalData = null;
let tradeTab = 'buy';
let swapGive = null;
let pendingPostModal = null;

function showModal(mode, data) {
  modalMode = mode; modalData = data;
  if (mode === 'trade') { tradeTab = 'buy'; swapGive = null; }
  const box = $('modal-box');
  box.className = 'modal-box modal-' + mode;
  $('modal-overlay').classList.remove('hidden');
  renderModal();
}
function hideModal() {
  $('modal-overlay').classList.add('hidden');
  modalMode = null; modalData = null;
}
function modalOpen() { return !$('modal-overlay').classList.contains('hidden'); }

// Esc 只能关闭"查看类"弹窗(队伍详情、结缘、结束确认),抽卡/问答/挑战必须通过按钮完成
function closeModalByEsc() {
  if (!modalOpen()) return false;
  if (modalMode === 'teamDetail' || modalMode === 'trade' || modalMode === 'confirmEnd') { hideModal(); return true; }
  return false;
}

function renderModal() {
  if (modalMode === 'card') renderCardModal();
  else if (modalMode === 'question') renderQuestionModal();
  else if (modalMode === 'challenge') renderChallengeModal();
  else if (modalMode === 'trade') renderTradeModal();
  else if (modalMode === 'home') renderHomeModal();
  else if (modalMode === 'confirmEnd') renderConfirmEndModal();
  else if (modalMode === 'teamDetail') renderTeamDetailModal();
}

function lampBonusLine(result) {
  if (!result || !result.lampBonus) return '';
  const lb = result.lampBonus;
  return `<p class="modal-positive-note">🪔 路过 ${lb.ownerTeam.icon}${escapeHtml(lb.ownerTeam.name)} 点亮的法灯,双方随喜获得功德!</p>`;
}

function teamTag(team) {
  return `<span class="modal-team-tag" style="--team-color:${team.color}">${team.icon} ${escapeHtml(team.name)}</span>`;
}

function renderCardModal() {
  const data = modalData;
  const box = $('modal-box');
  const merit = data.effect && typeof data.effect.merit === 'number' ? data.effect.merit : null;
  let effectHtml = '';
  if (merit !== null && merit !== 0) effectHtml += `<div class="modal-effect-line ${merit < 0 ? 'neg' : ''}">功德 ${merit > 0 ? '+' : ''}${merit}</div>`;
  if (data.effect && data.effect.fragment) effectHtml += `<div class="modal-effect-line">获得一张随机残页 🎴</div>`;
  if (data.effect && data.effect.skipNext) effectHtml += `<div class="modal-effect-line neg">下回合暂停一次 ⏸</div>`;
  const kind = data.kind === 'story' ? '⭐ 剧情' : (merit !== null && merit < 0) || (data.effect && data.effect.skipNext) ? '🌧️ 小考验' : '🌤️ 善缘';
  box.innerHTML = `
    <div class="card-kicker">${kind}${data.stationName ? ' · ' + escapeHtml(data.stationName) : ''}${data.team ? teamTag(data.team) : ''}</div>
    <h2>${escapeHtml(data.title)}</h2>
    <p class="modal-text">${escapeHtml(data.text)}</p>
    <div class="modal-effects">${effectHtml}</div>
    ${data.positive ? `<p class="modal-positive-note">💡 ${escapeHtml(data.positive)}</p>` : ''}
    ${data.turnedAround ? `<p class="modal-positive-note">🔄 已抵达终点,商队即将踏上归途,把智慧带回长安!</p>` : ''}
    ${lampBonusLine(pendingPostModal)}
    <div class="modal-buttons"><button id="modal-confirm-btn" class="btn-primary modal-confirm">确定</button></div>
  `;
  $('modal-confirm-btn').addEventListener('click', () => {
    hideModal();
    DR.UI.afterLandingModalClosed(pendingPostModal);
  });
}

function renderHomeModal() {
  const data = modalData;
  const box = $('modal-box');
  box.innerHTML = `
    <div class="home-celebrate">🎉</div>
    <h2>功德圆满!</h2>
    <p class="modal-text">${data.team.icon} ${escapeHtml(data.team.name)} 完成了往返旅程,平安回到长安,将佛法带回了故乡!</p>
    <div class="modal-effects"><div class="modal-effect-line">往返奖励 +${DR.CONFIG.roundTripBonus} 功德</div></div>
    <div class="modal-buttons"><button id="modal-confirm-btn" class="btn-primary modal-confirm">太好了!</button></div>
  `;
  $('modal-confirm-btn').addEventListener('click', hideModal);
}

function renderTeamDetailModal() {
  const state = DR.state;
  const team = state.teams.find(t => t.id === modalData.teamId);
  const box = $('modal-box');
  if (!team) { hideModal(); return; }

  const path = team.route === 'land' ? DR.LAND_PATH : DR.SEA_PATH;
  let posLabel;
  if (team.completed) posLabel = '已回长安 · 功德圆满';
  else if (team.position === 0) posLabel = '长安(出发前)';
  else posLabel = path[team.position - 1].name + (team.direction === 'back' ? '(归途)' : '');

  const fragValue = DR.Game.fragmentValue(team);
  const fullSet = DR.PARAMITAS.every(p => team.backpack[p.key] >= 1);
  const fragRows = DR.PARAMITAS.map(p => {
    const count = team.backpack[p.key];
    return `<div class="td-frag-row ${count ? '' : 'td-frag-empty'}">
      <span class="td-frag-icon" style="background:${p.color}">${p.icon}</span>
      <span class="td-frag-name">${p.name}</span>
      <span class="td-frag-count">×${count}</span>
      <span class="td-frag-value">${count ? '值 ' + (count * p.value) : '—'}</span>
    </div>`;
  }).join('');
  const lampStations = DR.Game.teamLampStations(state, team);
  const progress = DR.Game.journeyProgressPct(team);

  box.innerHTML = `
    <h2><span class="modal-team-tag big" style="--team-color:${team.color}">${team.icon} ${escapeHtml(team.name)}</span> 队伍详情</h2>
    <div class="td-progress-row">
      <div class="tc-progress td-progress-big"><div class="tc-progress-fill" style="width:${progress}%;background:${team.color}"></div></div>
      <span class="td-progress-label">${progress}% · ${escapeHtml(posLabel)}</span>
    </div>
    <div class="td-stats-grid">
      <div class="td-stat"><b>${team.merit}</b><span>功德</span></div>
      <div class="td-stat"><b>${fragValue}</b><span>残页价值</span></div>
      <div class="td-stat"><b>${team.correctAnswers}</b><span>答对问答</span></div>
      <div class="td-stat"><b>${team.challengesDone || 0}</b><span>完成挑战</span></div>
      <div class="td-stat"><b>${team.lampsLit}/${DR.CONFIG.lampMaxPerTeam}</b><span>点亮法灯</span></div>
      <div class="td-stat"><b>${team.visited.size}</b><span>到访站点</span></div>
    </div>
    <h3 class="td-subhead">🎴 六度残页行囊(${DR.Game.backpackTotal(team)}/${team.backpackCap})${fullSet ? ' · 已集齐!' : ''}</h3>
    <div class="td-frag-list">${fragRows}</div>
    ${lampStations.length ? `<h3 class="td-subhead">🪔 点亮的法灯</h3><p class="td-lamp-list">${lampStations.map(escapeHtml).join('、')}</p>` : ''}
    <div class="modal-buttons"><button id="modal-confirm-btn" class="btn-secondary modal-confirm">关闭</button></div>
  `;
  $('modal-confirm-btn').addEventListener('click', hideModal);
}

function renderQuestionModal() {
  const q = modalData.question;
  const box = $('modal-box');
  const team = DR.Game.activeTeam(DR.state);
  box.innerHTML = `
    <div class="card-kicker">💡 全班智慧问答 · 第 ${DR.state.qlog.length + 1} 题 ${teamTag(team)}</div>
    <h2 class="question-title">${escapeHtml(q.q)}</h2>
    <div class="q-options">${q.options.map((opt, i) => `<button class="option-btn" data-index="${i}"><span class="opt-key">${i + 1}</span>${escapeHtml(opt)}</button>`).join('')}</div>
    <p class="q-hint">全班可以一起讨论,再由 ${escapeHtml(team.name)} 的操盘小法师作答(也可以按键盘 1–4)</p>
    ${lampBonusLine(pendingPostModal)}
  `;
  box.querySelectorAll('.option-btn').forEach(b => b.addEventListener('click', e => {
    const idx = +e.currentTarget.dataset.index;
    const res = DR.Game.answerQuestion(DR.state, idx);
    box.querySelectorAll('.option-btn').forEach((btn2, i2) => {
      btn2.disabled = true;
      if (i2 === res.answerIndex) btn2.classList.add('correct');
      else if (i2 === idx) btn2.classList.add('wrong');
    });
    const hint = box.querySelector('.q-hint');
    if (hint) hint.remove();
    if (res.correct) DR.Audio.correct(); else DR.Audio.trial();
    renderTeamsPanel(DR.state); renderBank(DR.state); renderJourneyLog(DR.state);
    const verdict = document.createElement('div');
    verdict.className = 'q-verdict ' + (res.correct ? 'ok' : 'no');
    verdict.textContent = res.correct ? `✅ 回答正确!${team.name} +4 功德,其他队各 +1` : '📖 答案揭晓!全班每队 +1 随喜功德';
    box.appendChild(verdict);
    const note = document.createElement('p');
    note.className = 'modal-positive-note';
    note.textContent = '📖 ' + res.note;
    box.appendChild(note);
    const btns = document.createElement('div');
    btns.className = 'modal-buttons';
    btns.innerHTML = `<button id="modal-confirm-btn" class="btn-primary modal-confirm">继续</button>`;
    box.appendChild(btns);
    $('modal-confirm-btn').addEventListener('click', () => {
      hideModal();
      DR.UI.afterLandingModalClosed(pendingPostModal);
    });
  }));
}

function renderChallengeModal() {
  const ch = modalData.challenge;
  const p = DR.PARAMITAS.find(pp => pp.key === ch.paramita) || DR.PARAMITAS[0];
  const box = $('modal-box');
  const team = DR.Game.activeTeam(DR.state);
  box.innerHTML = `
    <div class="card-kicker">🎯 课堂互动挑战 · ${p.name} ${teamTag(team)}</div>
    <div class="challenge-head" style="--pc:${p.color}">
      <span class="ch-badge">${p.icon}</span>
      <h2>${escapeHtml(ch.title)}</h2>
    </div>
    <p class="modal-text">${escapeHtml(ch.text)}</p>
    <p class="modal-positive-note">💡 ${escapeHtml(ch.tip)}</p>
    ${lampBonusLine(pendingPostModal)}
    <p class="q-hint">由老师判断是否完成挑战</p>
    <div class="modal-buttons">
      <button id="challenge-skip" class="btn-ghost">↷ 这次先跳过</button>
      <button id="challenge-done" class="btn-primary modal-confirm">✅ 挑战成功:+${DR.CONFIG.challengeReward} 功德 + 《${p.name}》残页</button>
    </div>
  `;
  const finish = success => {
    const res = DR.Game.resolveChallenge(DR.state, success);
    if (success && res.success) {
      DR.Audio.good();
      toast(`🎯 ${team.icon}${escapeHtml(team.name)} 完成挑战"${escapeHtml(ch.title)}"!`, 'good');
    } else {
      DR.Audio.click();
    }
    hideModal();
    DR.UI.afterLandingModalClosed(pendingPostModal);
  };
  $('challenge-done').addEventListener('click', () => finish(true));
  $('challenge-skip').addEventListener('click', () => finish(false));
}

function renderConfirmEndModal() {
  const box = $('modal-box');
  box.innerHTML = `
    <h2>结束游戏?</h2>
    <p class="modal-text">确定要现在结束这局游戏并查看结算吗?</p>
    <div class="modal-buttons">
      <button id="btn-cancel-end" class="btn-ghost">取消</button>
      <button id="btn-confirm-end" class="btn-primary">结束并结算</button>
    </div>
  `;
  $('btn-cancel-end').addEventListener('click', hideModal);
  $('btn-confirm-end').addEventListener('click', () => { hideModal(); DR.UI.finishGame('manual'); });
}

function renderTradeModal() {
  const data = modalData;
  const box = $('modal-box');
  const team = DR.Game.activeTeam(DR.state);
  const station = data.station;
  let inner = '';

  if (tradeTab === 'buy') {
    const full = DR.Game.backpackTotal(team) >= team.backpackCap;
    inner = `<div class="frag-grid">${station.offers.map(key => {
      const def = DR.PARAMITAS.find(p => p.key === key);
      const canAfford = team.merit >= def.buyCost;
      const why = full ? '行囊已满' : (!canAfford ? '功德不足' : '');
      return `<button class="frag-btn buy-frag-btn" data-key="${key}" style="--pc:${def.color}" ${why ? `disabled title="${why}"` : ''}>
        <span class="fb-icon">${def.icon}</span>${def.name}<br><small>花费 ${def.buyCost} 功德</small>${why ? `<br><small class="fb-why">${why}</small>` : ''}</button>`;
    }).join('')}</div>
    <p class="tc-sub">你的功德:${team.merit} · 行囊 ${DR.Game.backpackTotal(team)}/${team.backpackCap}${full ? '(已满)' : ''}</p>`;
  } else if (tradeTab === 'swap') {
    const held = DR.PARAMITAS.filter(p => team.backpack[p.key] > 0);
    inner = `<p class="tc-sub">先选择你要交出的残页,再选择想要换取的残页(1 换 1,不分价值):</p>
      <div class="frag-grid">${held.length ? held.map(p => `<button class="frag-btn swap-give-btn ${swapGive === p.key ? 'selected' : ''}" data-key="${p.key}" style="--pc:${p.color}">
        <span class="fb-icon">${p.icon}</span>${p.name} ×${team.backpack[p.key]}</button>`).join('') : '<p>你的行囊里还没有残页。</p>'}</div>
      <p class="tc-sub">换取(该地可结缘的残页):</p>
      <div class="frag-grid">${station.offers.map(key => {
        const def = DR.PARAMITAS.find(p => p.key === key);
        return `<button class="frag-btn swap-take-btn" data-key="${key}" style="--pc:${def.color}" ${!swapGive ? 'disabled' : ''}><span class="fb-icon">${def.icon}</span>${def.name}</button>`;
      }).join('')}</div>`;
  } else if (tradeTab === 'sell') {
    const held = DR.PARAMITAS.filter(p => team.backpack[p.key] > 0);
    const totalValue = held.reduce((s, p) => s + p.value * team.backpack[p.key], 0);
    const totalCount = held.reduce((s, p) => s + team.backpack[p.key], 0);
    const fullSet = DR.PARAMITAS.every(p => team.backpack[p.key] >= 1);
    const preview = totalValue + (fullSet ? DR.CONFIG.fullSetBonus : 0);
    inner = `${held.length ? '<p class="tc-sub">点击某张残页可单独兑换一张,或点击下方按钮全部兑换:</p>' : ''}
      <div class="frag-grid">${held.length ? held.map(p => `<button class="frag-btn sell-frag-btn" data-key="${p.key}" style="--pc:${p.color}"><span class="fb-icon">${p.icon}</span>${p.name} ×${team.backpack[p.key]}<br><small>每张值 ${p.value}</small></button>`).join('') : '<p>行囊是空的,暂时无法兑换。</p>'}</div>
      ${held.length ? `<p class="sell-preview">全部兑换可得:${preview} 功德(共 ${totalCount} 张${fullSet ? ' · 集齐六度奖励 +' + DR.CONFIG.fullSetBonus : ''})</p>
      <div class="modal-buttons"><button id="btn-confirm-sell" class="btn-primary">译讲弘法,全部兑换</button></div>` : ''}`;
  }

  box.innerHTML = `
    <div class="card-kicker">🛕 圣地结缘 ${teamTag(team)}</div>
    <h2>${escapeHtml(station.name)} · 结缘</h2>
    <div class="trade-tabs">
      <button class="trade-tab-btn ${tradeTab === 'buy' ? 'active' : ''}" data-tab="buy">功德换法</button>
      <button class="trade-tab-btn ${tradeTab === 'swap' ? 'active' : ''}" data-tab="swap">以法结缘</button>
      <button class="trade-tab-btn ${tradeTab === 'sell' ? 'active' : ''}" data-tab="sell">译讲弘法</button>
    </div>
    ${inner}
    <div class="modal-buttons"><button id="btn-close-trade" class="btn-ghost">暂不结缘,继续前进</button></div>
  `;

  box.querySelectorAll('.trade-tab-btn').forEach(b => b.addEventListener('click', e => {
    tradeTab = e.currentTarget.dataset.tab; swapGive = null; DR.Audio.page(); renderModal();
  }));
  if (tradeTab === 'buy') {
    box.querySelectorAll('.buy-frag-btn').forEach(b => b.addEventListener('click', e => {
      DR.Game.buyFragment(DR.state, e.currentTarget.dataset.key);
      DR.Audio.click(); renderTeamsPanel(DR.state); renderBank(DR.state); renderJourneyLog(DR.state); renderModal();
    }));
  }
  if (tradeTab === 'swap') {
    box.querySelectorAll('.swap-give-btn').forEach(b => b.addEventListener('click', e => {
      swapGive = e.currentTarget.dataset.key; renderModal();
    }));
    box.querySelectorAll('.swap-take-btn').forEach(b => b.addEventListener('click', e => {
      if (!swapGive) return;
      DR.Game.swapFragment(DR.state, swapGive, e.currentTarget.dataset.key);
      swapGive = null; DR.Audio.click(); renderTeamsPanel(DR.state); renderJourneyLog(DR.state); renderModal();
    }));
  }
  if (tradeTab === 'sell') {
    box.querySelectorAll('.sell-frag-btn').forEach(b => b.addEventListener('click', e => {
      const res = DR.Game.sellFragments(DR.state, [e.currentTarget.dataset.key]);
      if (res.ok) { DR.Audio.good(); renderTeamsPanel(DR.state); renderBank(DR.state); renderJourneyLog(DR.state); renderModal(); }
    }));
    const btn = $('btn-confirm-sell');
    if (btn) btn.addEventListener('click', () => {
      const keys = [];
      DR.PARAMITAS.forEach(p => { for (let i = 0; i < team.backpack[p.key]; i++) keys.push(p.key); });
      const res = DR.Game.sellFragments(DR.state, keys);
      if (res.ok) {
        DR.Audio.good();
        if (res.isFullSet) toast(`🎴 ${team.icon}${escapeHtml(team.name)} 集齐六度,译讲弘法获得 ${res.gained} 功德!`, 'good');
        renderTeamsPanel(DR.state); renderBank(DR.state); renderJourneyLog(DR.state); renderModal();
      }
    });
  }
  $('btn-close-trade').addEventListener('click', hideModal);
}

// ---------------- 规则手册(菜单式说明页) ----------------

function renderRulesDynamicContent() {
  const table = $('rules-items-table');
  if (table && !table.childElementCount) {
    table.innerHTML = `
      <div class="rit-row rit-head"><span>残页</span><span>意涵</span><span>买入价</span><span>卖出值</span></div>
      ${DR.PARAMITAS.map(p => `
        <div class="rit-row">
          <span class="rit-name"><span class="rit-icon" style="background:${p.color}">${p.icon}</span>${escapeHtml(p.name)}</span>
          <span class="rit-meaning">${escapeHtml(p.meaning)}</span>
          <span class="rit-buy">${p.buyCost} 功德</span>
          <span class="rit-sell">${p.value} 功德</span>
        </div>
      `).join('')}
    `;
  }
  const lampList = $('rules-lamp-list');
  if (lampList && !lampList.childElementCount) {
    lampList.innerHTML = `
      <li>在<b>普通驿站</b>点灯花费 <b>${DR.CONFIG.lampCostWay}</b> 功德,在<b>圣地</b>点灯花费 <b>${DR.CONFIG.lampCostSite}</b> 功德(人气更旺、更贵)。</li>
      <li>每队最多能点亮 <b>${DR.CONFIG.lampMaxPerTeam}</b> 盏法灯,一个站点先到先得,点亮后地图上会显示你队伍颜色的 🪔。</li>
      <li>之后别的队伍路过你点亮的法灯,你会获得 <b>${DR.CONFIG.lampPassBonusOwner}</b> 点随喜功德,路过的队伍自己也会获得 <b>${DR.CONFIG.lampPassBonusVisitor}</b> 点——双方都开心,不会互相扣分。</li>
    `;
  }
  const reward = $('rules-challenge-reward');
  if (reward) reward.textContent = DR.CONFIG.challengeReward;
}

function openRules() {
  renderRulesDynamicContent();
  $('rules-overlay').classList.remove('hidden');
  DR.Audio.page();
}
function closeRules() {
  $('rules-overlay').classList.add('hidden');
}

function wireRulesEvents() {
  $('btn-open-rules-setup').addEventListener('click', openRules);
  $('btn-open-rules-game').addEventListener('click', openRules);
  $('btn-rules-close').addEventListener('click', closeRules);
  $('rules-overlay').addEventListener('click', e => {
    if (e.target.id === 'rules-overlay') closeRules();
  });
  $('rules-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.rules-tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.rules-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.rules-section').forEach(s => s.classList.toggle('active', s.dataset.panel === tab));
  });
}

function rulesOpen() {
  return !$('rules-overlay').classList.contains('hidden');
}

// ---------------- 回合流程 ----------------

function showActionArea(actions) {
  const area = $('action-area');
  area.innerHTML = '';
  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = a.label;
    btn.addEventListener('click', a.fn);
    area.appendChild(btn);
  });
  DR.Map.fitMapBox();
}

function showNextOnly() {
  $('btn-next-team').classList.remove('hidden');
  $('btn-next-team').disabled = false;
  DR.Map.fitMapBox();
}

let bankWarned = false;

// opts.newRound:这一回合是否开启了新的一轮;opts.first:整局第一回合;opts.resumed:刚刚读档
function beginTurn(opts) {
  opts = opts || {};
  const state = DR.state;
  if (state.phase === 'ended') return;
  hideModal();
  $('btn-next-team').classList.add('hidden');
  $('action-area').innerHTML = '';
  setDieFace(1);
  const team = DR.Game.activeTeam(state);
  if (opts.first) bankWarned = false;

  // 每回合开始时拍下存档快照(此时没有进行到一半的抽卡/交易,读档后可以干净地从这里继续)
  if (DR.captureTurnSnapshot) DR.captureTurnSnapshot(state);

  if (DR.Game.isAutoTurn(state)) {
    state.turnPhase = 'end';
    $('active-team-banner').innerHTML = `<span class="team-chip" style="--team-color:${team.color}">${team.icon} ${escapeHtml(team.name)}</span> 已功德圆满 ✨`;
    $('btn-roll').disabled = true;
    DR.Game.autoResolveTurn(state);
    renderAll();
    setTimeout(() => {
      if (state.phase === 'ended' || DR.state !== state) return;
      if (DR.Game.bankEmpty(state)) { DR.UI.finishGame('bankEmpty'); return; }
      const newRound = DR.Game.nextTeam(state);
      beginTurn({ newRound });
    }, 1100);
    return;
  }

  $('btn-roll').disabled = false;
  $('active-team-banner').innerHTML = `轮到 <span class="team-chip" style="--team-color:${team.color}">${team.icon} ${escapeHtml(team.name)}</span>`;
  renderAll();
  showTurnSplash(team, opts.newRound || opts.first, opts.resumed ? '💾 已从存档继续' : '');
  if (opts.newRound || opts.first) DR.Audio.turn();
  if (!bankWarned && state.bank <= 40) {
    bankWarned = true;
    toast(`🏦 功德库只剩 ${state.bank} 点,耗尽时游戏就会结算`, 'warn');
  }
}

function onRollClick() {
  const state = DR.state;
  const btn = $('btn-roll');
  if (btn.disabled || !state || state.phase === 'ended') return;
  btn.disabled = true;
  hideTurnSplash();
  const diceEl = $('dice-face');
  diceEl.classList.add('rolling');
  DR.Audio.dice();
  let ticks = 0;
  const spin = setInterval(() => {
    setDieFace(1 + Math.floor(Math.random() * 6));
    ticks++;
    if (ticks > 8) {
      clearInterval(spin);
      diceEl.classList.remove('rolling');
      if (state.phase === 'ended' || DR.state !== state) return;
      const value = DR.Game.rollDice(state);
      setDieFace(Math.min(value, 6));
      onRolled();
    }
  }, 70);
}

async function onRolled() {
  const state = DR.state;
  const fromPos = DR.Game.activeTeam(state).position;
  const result = DR.Game.moveAndResolve(state);
  renderTeamsPanel(state); renderBank(state); renderJourneyLog(state);

  if (result.skipped) {
    state.turnPhase = 'end';
    renderPhaseTracker(state);
    DR.Audio.trial();
    toast(`⏸ ${result.team.icon}${escapeHtml(result.team.name)} 这回合原地休整`, 'warn');
    showActionArea([]);
    showNextOnly();
    return;
  }

  await DR.Map.animateActiveMove(state, fromPos);
  if (state.phase === 'ended' || DR.state !== state) return;

  if (result.arrivedHome) {
    state.turnPhase = 'end';
    renderPhaseTracker(state);
    DR.Audio.finish();
    showModal('home', { team: result.team });
    showNextOnly();
    return;
  }

  state.turnPhase = 'landing';
  renderPhaseTracker(state);
  pendingPostModal = result;
  if (result.firstTime) DR.Map.updateVisitedMarks(state);

  if (result.type === 'story') {
    DR.Audio.good();
    showModal('card', { kind: 'story', title: result.story.title, text: result.story.text, effect: result.story.effect, turnedAround: result.turnedAround, stationName: result.station.name, team: result.team });
  } else if (result.type === 'event') {
    const merit = result.card.effect.merit;
    if (typeof merit === 'number' && merit < 0) DR.Audio.trial(); else DR.Audio.good();
    showModal('card', { title: result.card.title, text: result.card.text, effect: result.card.effect, positive: result.card.positive, stationName: result.station.name, team: result.team });
  } else if (result.type === 'question') {
    DR.Audio.page();
    showModal('question', { question: result.question });
  } else if (result.type === 'challenge') {
    DR.Audio.turn();
    showModal('challenge', { challenge: result.challenge });
  }
}

function afterLandingModalClosed(result) {
  const state = DR.state;
  if (!state || state.phase === 'ended') return;
  if (DR.Game.bankEmpty(state)) { DR.UI.finishGame('bankEmpty'); return; }
  const team = DR.Game.activeTeam(state);
  state.turnPhase = 'market';
  renderPhaseTracker(state);
  renderTeamsPanel(state);
  renderBank(state);
  renderJourneyLog(state);
  const actions = [];
  if (result.canTrade) {
    actions.push({ label: '🛕 前往结缘', fn: () => showModal('trade', { station: result.station }) });
  }
  if (result.canLightLamp) {
    actions.push({
      label: `🪔 点亮法灯(花费 ${result.lampCost} 功德)`,
      fn: () => {
        const res = DR.Game.lightLamp(state, result.visitKey, result.station);
        if (!res.ok) return;
        DR.Audio.lamp();
        DR.Map.markLamp(team.route, team.position, team);
        toast(`🪔 ${team.icon}${escapeHtml(team.name)} 在${escapeHtml(result.station.name)}点亮了法灯`, 'good');
        renderAll();
        afterLandingModalClosed({ ...result, canLightLamp: false });
      },
    });
  }
  if (result.canCrossover) {
    actions.push({
      label: '⇄ 换乘驿站', fn: () => {
        const res = DR.Game.attemptCrossover(state);
        DR.Audio.click();
        renderAll();
        $('action-area').innerHTML = '';
        if (res.ok) {
          const st = DR.Game.currentStation(state, team);
          toast(`⇄ ${team.icon}${escapeHtml(team.name)} 改走${res.newRoute === 'land' ? '陆路' : '海路'},来到${escapeHtml(st.name)}`, 'info');
        }
      },
    });
  }
  showActionArea(actions);
  showNextOnly();
}

let turnEndTransitioning = false;
async function onNextTeamClick() {
  const state = DR.state;
  if (turnEndTransitioning || !state || state.phase === 'ended') return;
  if (DR.Game.bankEmpty(state)) { DR.UI.finishGame('bankEmpty'); return; }
  turnEndTransitioning = true;
  $('btn-next-team').disabled = true;
  state.turnPhase = 'end';
  renderPhaseTracker(state);
  await sleep(280);
  turnEndTransitioning = false;
  if (state.phase === 'ended' || DR.state !== state) return;
  const newRound = DR.Game.nextTeam(state);
  beginTurn({ newRound });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  DR.Map.hideStationTooltip();
  hideTurnSplash();
  if (DR.onScreenChange) DR.onScreenChange(id);
}

function finishGame(reason) {
  const state = DR.state;
  if (!state || state.phase === 'ended') return;
  state.phase = 'ended';
  DR.Game.recordHistory(state, state.round);
  hideModal();
  DR.Map.hideStationTooltip();
  if (DR.Screens) DR.Screens.closeGameOverlays();
  DR.Store.clearSave();
  const results = DR.Game.computeResults(state);
  DR.Store.addHonor({
    date: Date.now(),
    minutes: Math.max(1, Math.round((state.totalSeconds - Math.max(0, state.timerSeconds)) / 60)),
    rounds: state.round,
    reason,
    teams: results.map(r => ({
      name: r.team.name, icon: r.team.icon, color: r.team.color, route: r.team.route,
      total: r.total, merit: r.team.merit, fragValue: r.fragValue, badges: r.badges,
      completed: r.team.completed, correct: r.team.correctAnswers, lamps: r.team.lampsLit,
    })),
  });
  DR.Stats.renderEnd(state, results, reason);
  showScreen('screen-end');
  DR.Audio.fanfare();
}

DR.UI = {
  escapeHtml,
  toast,
  renderAll,
  renderTeamsPanel,
  wireTeamsPanelClick,
  renderBank,
  renderTimer,
  renderRound,
  renderPhaseBanner,
  renderPhaseTracker,
  renderParamitaLegend,
  renderJourneyLog,
  wireSideTabs,
  resetSideTabs,
  toggleMapExpand,
  beginTurn,
  onRollClick,
  onRolled,
  afterLandingModalClosed,
  onNextTeamClick,
  showScreen,
  showModal,
  hideModal,
  modalOpen,
  closeModalByEsc,
  showTurnSplash,
  hideTurnSplash,
  finishGame,
  wireRulesEvents,
  openRules,
  closeRules,
  rulesOpen,
  get modalMode() { return modalMode; },
  get mapExpanded() { return mapExpanded; },
};

})();
