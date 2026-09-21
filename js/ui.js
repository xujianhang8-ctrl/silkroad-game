/* 丝路法灯 · 渲染与交互层 */
var DR = window.DR || (window.DR = {});

(function () {

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function $(id) { return document.getElementById(id); }

const DICE_PIPS = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};
function setDieFace(value) {
  const on = new Set(DICE_PIPS[value] || []);
  document.querySelectorAll('#dice-face .pip').forEach(el => {
    el.classList.toggle('on', on.has(+el.dataset.pip));
  });
}

// ---------------- 设置界面 ----------------

function renderTeamConfigList() {
  const list = $('team-config-list');
  list.innerHTML = DR.setup.teams.map((t, i) => `
    <div class="team-config-row" data-index="${i}">
      <span class="team-icon-badge">${t.icon}</span>
      <input type="text" class="team-name-input" data-index="${i}" value="${escapeHtml(t.name)}" maxlength="8">
      <div class="route-toggle" data-index="${i}">
        <button type="button" class="route-btn ${t.route === 'land' ? 'active' : ''}" data-route="land">🐫 陆路</button>
        <button type="button" class="route-btn ${t.route === 'sea' ? 'active' : ''}" data-route="sea">⛵ 海路</button>
      </div>
    </div>
  `).join('');
}

function wireSetupEvents() {
  const list = $('team-config-list');
  list.addEventListener('input', e => {
    if (e.target.classList.contains('team-name-input')) {
      const i = +e.target.dataset.index;
      DR.setup.teams[i].name = e.target.value;
    }
  });
  list.addEventListener('click', e => {
    const btn = e.target.closest('.route-btn');
    if (!btn) return;
    const row = e.target.closest('.team-config-row');
    const i = +row.dataset.index;
    DR.setup.teams[i].route = btn.dataset.route;
    renderTeamConfigList();
  });

  $('btn-team-plus').addEventListener('click', () => {
    if (DR.setup.teams.length >= 6) return;
    const idx = DR.setup.teams.length;
    const preset = DR.TEAM_PRESETS[idx];
    DR.setup.teams.push({ name: preset.name, icon: preset.icon, color: preset.color, route: idx % 2 === 0 ? 'land' : 'sea' });
    $('team-count-display').textContent = DR.setup.teams.length;
    renderTeamConfigList();
  });
  $('btn-team-minus').addEventListener('click', () => {
    if (DR.setup.teams.length <= 2) return;
    DR.setup.teams.pop();
    $('team-count-display').textContent = DR.setup.teams.length;
    renderTeamConfigList();
  });
  $('timer-select').addEventListener('change', e => { DR.setup.timerMinutes = +e.target.value; });
  $('sound-toggle').addEventListener('change', e => { DR.setup.soundOn = e.target.checked; });
}

// ---------------- 主界面渲染 ----------------

function renderTeamsPanel(state) {
  const el = $('teams-panel');
  el.innerHTML = state.teams.map((team, i) => {
    const frags = DR.PARAMITAS.filter(p => team.backpack[p.key] > 0)
      .map(p => `<span class="frag-chip">${p.icon}${team.backpack[p.key]}</span>`).join('') || '<span class="frag-chip">空</span>';
    let posLabel;
    if (team.completed) posLabel = '已回长安';
    else if (team.position === 0) posLabel = '长安(出发前)';
    else posLabel = (team.route === 'land' ? DR.LAND_PATH : DR.SEA_PATH)[team.position - 1].name;
    return `<div class="team-card ${i === state.activeIndex ? 'active' : ''}" data-team-id="${team.id}" style="border-left-color:${team.color}">
      <div class="tc-head"><span>${team.icon} ${escapeHtml(team.name)}</span><span class="tc-merit">${team.merit} 功德</span></div>
      <div class="tc-sub">${team.route === 'land' ? '🐫 陆路' : '⛵ 海路'} · ${escapeHtml(posLabel)}
        ${team.direction === 'back' && !team.completed ? '(归途)' : ''}
        ${team.completed ? '<span class="tc-done">✓ 圆满</span>' : ''}</div>
      <div class="tc-frags">${frags}</div>
    </div>`;
  }).join('');
}

function wireTeamsPanelClick() {
  $('teams-panel').addEventListener('click', e => {
    const card = e.target.closest('.team-card');
    if (!card) return;
    DR.Map.pulseTeamToken(+card.dataset.teamId);
  });
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

function renderAll() {
  const state = DR.state;
  DR.Map.layoutTokens(state);
  renderTeamsPanel(state);
  renderBank(state);
  renderTimer(state);
  renderPhaseBanner(state);
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
  $('modal-overlay').classList.remove('hidden');
  renderModal();
}
function hideModal() {
  $('modal-overlay').classList.add('hidden');
  modalMode = null; modalData = null;
}

function renderModal() {
  if (modalMode === 'card') renderCardModal();
  else if (modalMode === 'question') renderQuestionModal();
  else if (modalMode === 'trade') renderTradeModal();
  else if (modalMode === 'home') renderHomeModal();
  else if (modalMode === 'confirmEnd') renderConfirmEndModal();
}

function renderCardModal() {
  const data = modalData;
  const box = $('modal-box');
  const merit = data.effect && typeof data.effect.merit === 'number' ? data.effect.merit : null;
  let effectHtml = '';
  if (merit !== null && merit !== 0) effectHtml += `<div class="modal-effect-line ${merit < 0 ? 'neg' : ''}">功德 ${merit > 0 ? '+' : ''}${merit}</div>`;
  if (data.effect && data.effect.fragment) effectHtml += `<div class="modal-effect-line">获得一张随机残页 🎴</div>`;
  if (data.effect && data.effect.skipNext) effectHtml += `<div class="modal-effect-line neg">下回合暂停一次 ⏸</div>`;
  box.innerHTML = `
    <h2>${escapeHtml(data.title)}</h2>
    <p class="modal-text">${escapeHtml(data.text)}</p>
    ${effectHtml}
    ${data.positive ? `<p class="modal-positive-note">💡 ${escapeHtml(data.positive)}</p>` : ''}
    ${data.turnedAround ? `<p class="modal-positive-note">🔄 已抵达终点,商队即将踏上归途,把智慧带回长安!</p>` : ''}
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
    <h2>🎉 功德圆满!</h2>
    <p class="modal-text">${data.team.icon} ${escapeHtml(data.team.name)} 完成了往返旅程,平安回到长安,将佛法带回了故乡!</p>
    <div class="modal-buttons"><button id="modal-confirm-btn" class="btn-primary modal-confirm">太好了!</button></div>
  `;
  $('modal-confirm-btn').addEventListener('click', hideModal);
}

function renderQuestionModal() {
  const q = modalData.question;
  const box = $('modal-box');
  box.innerHTML = `
    <h2>💡 全班智慧问答</h2>
    <p class="modal-text">${escapeHtml(q.q)}</p>
    <div class="q-options">${q.options.map((opt, i) => `<button class="option-btn" data-index="${i}">${i + 1}. ${escapeHtml(opt)}</button>`).join('')}</div>
  `;
  box.querySelectorAll('.option-btn').forEach(b => b.addEventListener('click', e => {
    const idx = +e.currentTarget.dataset.index;
    const res = DR.Game.answerQuestion(DR.state, idx);
    box.querySelectorAll('.option-btn').forEach((btn2, i2) => {
      btn2.disabled = true;
      if (i2 === res.answerIndex) btn2.classList.add('correct');
      else if (i2 === idx) btn2.classList.add('wrong');
    });
    if (res.correct) DR.Audio.correct(); else DR.Audio.trial();
    renderTeamsPanel(DR.state); renderBank(DR.state);
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

function renderConfirmEndModal() {
  const box = $('modal-box');
  box.innerHTML = `
    <h2>结束游戏?</h2>
    <p class="modal-text">确定要现在结束这局游戏并查看结算吗?</p>
    <div class="modal-buttons">
      <button id="btn-cancel-end" class="btn-secondary">取消</button>
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
      const canAfford = team.merit >= DR.CONFIG.buyCost;
      return `<button class="frag-btn buy-frag-btn" data-key="${key}" ${(!canAfford || full) ? 'disabled' : ''}>
        <span class="fb-icon">${def.icon}</span>${def.name}<br><small>花费 ${DR.CONFIG.buyCost} 功德</small></button>`;
    }).join('')}</div>
    <p class="tc-sub">你的功德:${team.merit} · 行囊 ${DR.Game.backpackTotal(team)}/${team.backpackCap}${full ? '(已满)' : ''}</p>`;
  } else if (tradeTab === 'swap') {
    const held = DR.PARAMITAS.filter(p => team.backpack[p.key] > 0);
    inner = `<p class="tc-sub">先选择你要交出的残页,再选择想要换取的残页:</p>
      <div class="frag-grid">${held.length ? held.map(p => `<button class="frag-btn swap-give-btn ${swapGive === p.key ? 'selected' : ''}" data-key="${p.key}">
        <span class="fb-icon">${p.icon}</span>${p.name} ×${team.backpack[p.key]}</button>`).join('') : '<p>你的行囊里还没有残页。</p>'}</div>
      <p class="tc-sub">换取(该地可结缘的残页):</p>
      <div class="frag-grid">${station.offers.map(key => {
        const def = DR.PARAMITAS.find(p => p.key === key);
        return `<button class="frag-btn swap-take-btn" data-key="${key}" ${!swapGive ? 'disabled' : ''}><span class="fb-icon">${def.icon}</span>${def.name}</button>`;
      }).join('')}</div>`;
  } else if (tradeTab === 'sell') {
    const held = DR.PARAMITAS.filter(p => team.backpack[p.key] > 0);
    const totalCount = held.reduce((s, p) => s + team.backpack[p.key], 0);
    const fullSet = DR.PARAMITAS.every(p => team.backpack[p.key] >= 1);
    const preview = totalCount * DR.CONFIG.sellValue + (fullSet ? DR.CONFIG.fullSetBonus : 0);
    inner = `<div class="frag-grid">${held.length ? held.map(p => `<div class="frag-btn"><span class="fb-icon">${p.icon}</span>${p.name} ×${team.backpack[p.key]}</div>`).join('') : '<p>行囊是空的,暂时无法兑换。</p>'}</div>
      ${held.length ? `<p class="sell-preview">预计获得:${preview} 功德 ${fullSet ? '(集齐六度奖励 +' + DR.CONFIG.fullSetBonus + ')' : ''}</p>
      <div class="modal-buttons"><button id="btn-confirm-sell" class="btn-primary">译讲弘法,全部兑换</button></div>` : ''}`;
  }

  box.innerHTML = `
    <h2>🛕 ${escapeHtml(station.name)} · 结缘</h2>
    <div class="trade-tabs">
      <button class="trade-tab-btn ${tradeTab === 'buy' ? 'active' : ''}" data-tab="buy">功德换法</button>
      <button class="trade-tab-btn ${tradeTab === 'swap' ? 'active' : ''}" data-tab="swap">以法结缘</button>
      <button class="trade-tab-btn ${tradeTab === 'sell' ? 'active' : ''}" data-tab="sell">译讲弘法</button>
    </div>
    ${inner}
    <div class="modal-buttons"><button id="btn-close-trade" class="btn-secondary">暂不结缘,继续前进</button></div>
  `;

  box.querySelectorAll('.trade-tab-btn').forEach(b => b.addEventListener('click', e => {
    tradeTab = e.currentTarget.dataset.tab; swapGive = null; renderModal();
  }));
  if (tradeTab === 'buy') {
    box.querySelectorAll('.buy-frag-btn').forEach(b => b.addEventListener('click', e => {
      DR.Game.buyFragment(DR.state, e.currentTarget.dataset.key);
      DR.Audio.click(); renderTeamsPanel(DR.state); renderBank(DR.state); renderModal();
    }));
  }
  if (tradeTab === 'swap') {
    box.querySelectorAll('.swap-give-btn').forEach(b => b.addEventListener('click', e => {
      swapGive = e.currentTarget.dataset.key; renderModal();
    }));
    box.querySelectorAll('.swap-take-btn').forEach(b => b.addEventListener('click', e => {
      if (!swapGive) return;
      DR.Game.swapFragment(DR.state, swapGive, e.currentTarget.dataset.key);
      swapGive = null; DR.Audio.click(); renderTeamsPanel(DR.state); renderModal();
    }));
  }
  if (tradeTab === 'sell') {
    const btn = $('btn-confirm-sell');
    if (btn) btn.addEventListener('click', () => {
      const keys = [];
      DR.PARAMITAS.forEach(p => { for (let i = 0; i < team.backpack[p.key]; i++) keys.push(p.key); });
      const res = DR.Game.sellFragments(DR.state, keys);
      if (res.ok) { DR.Audio.good(); renderTeamsPanel(DR.state); renderBank(DR.state); renderModal(); }
    });
  }
  $('btn-close-trade').addEventListener('click', hideModal);
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
}

function showNextOnly() {
  $('btn-next-team').classList.remove('hidden');
}

function beginTurn() {
  const state = DR.state;
  if (state.phase === 'ended') return;
  hideModal();
  $('btn-next-team').classList.add('hidden');
  $('action-area').innerHTML = '';
  setDieFace(1);
  const team = DR.Game.activeTeam(state);

  if (DR.Game.isAutoTurn(state)) {
    $('active-team-banner').innerHTML = `${team.icon} <span style="color:${team.color}">${escapeHtml(team.name)}</span> 已功德圆满 ✨`;
    $('btn-roll').disabled = true;
    DR.Game.autoResolveTurn(state);
    renderAll();
    setTimeout(() => {
      if (DR.Game.bankEmpty(state)) { DR.UI.finishGame('bankEmpty'); return; }
      DR.Game.nextTeam(state);
      beginTurn();
    }, 1100);
    return;
  }

  $('btn-roll').disabled = false;
  $('active-team-banner').innerHTML = `轮到 ${team.icon} <span style="color:${team.color}">${escapeHtml(team.name)}</span>`;
  renderAll();
}

function onRollClick() {
  const state = DR.state;
  const btn = $('btn-roll');
  if (btn.disabled) return;
  btn.disabled = true;
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
  renderTeamsPanel(state); renderBank(state);

  if (result.skipped) {
    DR.Audio.trial();
    showActionArea([]);
    showNextOnly();
    return;
  }

  await DR.Map.animateActiveMove(state, fromPos);

  if (result.arrivedHome) {
    DR.Audio.finish();
    showModal('home', { team: result.team });
    showNextOnly();
    return;
  }

  pendingPostModal = result;

  if (result.type === 'story') {
    DR.Audio.good();
    showModal('card', { title: result.story.title, text: result.story.text, effect: result.story.effect, turnedAround: result.turnedAround });
  } else if (result.type === 'event') {
    const merit = result.card.effect.merit;
    if (typeof merit === 'number' && merit < 0) DR.Audio.trial(); else DR.Audio.good();
    showModal('card', { title: result.card.title, text: result.card.text, effect: result.card.effect, positive: result.card.positive });
  } else if (result.type === 'question') {
    showModal('question', { question: result.question });
  }
}

function afterLandingModalClosed(result) {
  const state = DR.state;
  if (DR.Game.bankEmpty(state)) { DR.UI.finishGame('bankEmpty'); return; }
  renderTeamsPanel(state);
  const actions = [];
  if (result.canTrade) {
    actions.push({ label: '🛕 前往结缘', fn: () => showModal('trade', { station: result.station }) });
  }
  if (result.canCrossover) {
    actions.push({
      label: '⇄ 换乘驿站', fn: () => {
        DR.Game.attemptCrossover(state);
        DR.Audio.click();
        renderAll();
        $('action-area').innerHTML = '';
      },
    });
  }
  showActionArea(actions);
  showNextOnly();
}

function onNextTeamClick() {
  const state = DR.state;
  if (DR.Game.bankEmpty(state)) { DR.UI.finishGame('bankEmpty'); return; }
  DR.Game.nextTeam(state);
  beginTurn();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function renderEndScreen() {
  const state = DR.state;
  const results = DR.Game.computeResults(state);
  const medal = ['🥇', '🥈', '🥉'];
  $('results-list').innerHTML = results.map((r, i) => `
    <div class="result-row" style="border-left-color:${r.team.color}">
      <div class="result-rank">${medal[i] || (i + 1)}</div>
      <div class="result-info">
        <div class="result-name">${r.team.icon} ${escapeHtml(r.team.name)}</div>
        <div class="result-detail">功德 ${r.team.merit} + 残页价值 ${r.fragValue}(${r.fragCount} 张${r.fullSet ? ' · 集齐六度' : ''})</div>
        <div class="result-badges">${r.badges.join('　')}</div>
      </div>
      <div class="result-total">${r.total}</div>
    </div>
  `).join('');
}

function finishGame(reason) {
  const state = DR.state;
  if (state.phase === 'ended') return;
  state.phase = 'ended';
  hideModal();
  renderEndScreen();
  showScreen('screen-end');
}

DR.UI = {
  renderTeamConfigList,
  wireSetupEvents,
  renderAll,
  renderTeamsPanel,
  wireTeamsPanelClick,
  renderBank,
  renderTimer,
  renderPhaseBanner,
  beginTurn,
  onRollClick,
  onRolled,
  afterLandingModalClosed,
  onNextTeamClick,
  showScreen,
  showModal,
  hideModal,
  finishGame,
  renderEndScreen,
  escapeHtml,
  get modalMode() { return modalMode; },
};

})();
