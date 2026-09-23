/* 丝路法灯 · 各个界面:主菜单、出发准备向导、丝路百科、荣誉榜、设置、暂停菜单、确认框 */
var DR = window.DR || (window.DR = {});

(function () {

function $(id) { return document.getElementById(id); }
function esc(s) { return DR.UI.escapeHtml(s); }
function activeScreenId() {
  const el = document.querySelector('.screen.active');
  return el ? el.id : null;
}
function fmtClock(sec) {
  sec = Math.max(0, sec | 0);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtDate(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

// ================= 浮层管理 =================
// Esc 按这个顺序关闭最上层的浮层
const OVERLAYS = ['confirm-overlay', 'video-overlay', 'settings-overlay', 'rules-overlay', 'stats-overlay', 'pause-overlay'];
function isOpen(id) { const el = $(id); return !!el && !el.classList.contains('hidden'); }
function openOverlay(id) { $(id).classList.remove('hidden'); }
function closeOverlay(id) {
  const el = $(id);
  el.classList.add('hidden');
  el.querySelectorAll('video').forEach(v => v.pause()); // 关掉讲解视频时顺便暂停播放
}

// 三分钟讲解视频(AI 语音):主菜单、规则手册都能打开;游戏中打开时倒计时会暂停
function openVideo() {
  const v = $('rules-video');
  openOverlay('video-overlay');
  DR.Audio.click();
  if (v.ended) v.currentTime = 0;
  const p = v.play();
  if (p && p.catch) p.catch(() => {});
}

function closeTopOverlay() {
  for (const id of OVERLAYS) {
    if (!isOpen(id)) continue;
    if (id === 'confirm-overlay') resolveConfirm(false);
    else if (id === 'rules-overlay') DR.UI.closeRules();
    else if (id === 'pause-overlay') resumeGame();
    else closeOverlay(id);
    return true;
  }
  return false;
}

function metaOverlayOpen() { return OVERLAYS.some(isOpen); }

// 计时器只在"游戏界面可见、没有暂停、也没有打开规则/设置/看板等浮层"时走动
function timerFrozen() {
  if (activeScreenId() !== 'screen-game') return true;
  return paused || metaOverlayOpen();
}

function closeGameOverlays() {
  paused = false;
  ['pause-overlay', 'stats-overlay'].forEach(closeOverlay);
  const btn = $('btn-pause');
  if (btn) btn.classList.remove('active');
}

// ================= 确认框 =================
let confirmResolve = null;
function confirmDialog(opts) {
  return new Promise(resolve => {
    if (confirmResolve) confirmResolve(false);
    $('confirm-title').textContent = opts.title || '确定吗?';
    $('confirm-text').textContent = opts.text || '';
    $('confirm-ok').textContent = opts.ok || '确定';
    $('confirm-cancel').textContent = opts.cancel || '取消';
    $('confirm-ok').classList.toggle('btn-danger-solid', !!opts.danger);
    confirmResolve = resolve;
    openOverlay('confirm-overlay');
    setTimeout(() => $('confirm-ok').focus(), 30);
  });
}
function resolveConfirm(value) {
  closeOverlay('confirm-overlay');
  const r = confirmResolve;
  confirmResolve = null;
  if (r) r(value);
}
function wireConfirm() {
  $('confirm-ok').addEventListener('click', () => resolveConfirm(true));
  $('confirm-cancel').addEventListener('click', () => resolveConfirm(false));
  $('confirm-overlay').addEventListener('click', e => { if (e.target.id === 'confirm-overlay') resolveConfirm(false); });
}

// ================= 主菜单 =================
let factPool = null, factIdx = -1, factTimer = null;

function buildFactPool() {
  if (factPool) return factPool;
  factPool = [];
  Object.keys(DR.STATION_NOTES || {}).forEach(name => factPool.push({ title: name, text: DR.STATION_NOTES[name], foot: '🗺️ 丝路站点', tab: 'stations', key: name }));
  (DR.LANDMARKS || []).forEach(l => factPool.push({ title: l.name, text: l.blurb, foot: '🏛️ 名胜古迹 · ' + l.kind, tab: 'landmarks', key: l.key }));
  (DR.FIGURES || []).forEach(f => factPool.push({ title: `${f.name} · ${f.title}`, text: f.summary, foot: '👤 丝路人物', tab: 'figures', key: f.key }));
  (DR.GLOSSARY || []).forEach(g => factPool.push({ title: g.term, text: g.text, foot: '📖 小词典', tab: 'glossary', key: g.term }));
  return factPool;
}

function showFact(step) {
  const pool = buildFactPool();
  if (!pool.length) return;
  factIdx = step == null || factIdx < 0 ? Math.floor(Math.random() * pool.length) : (factIdx + step + pool.length) % pool.length;
  const f = pool[factIdx];
  $('fact-title').textContent = f.title;
  $('fact-text').textContent = f.text;
  $('fact-foot').innerHTML = `<span>${esc(f.foot)}</span><button type="button" class="fact-link" data-tab="${f.tab}" data-key="${esc(f.key)}">在百科中查看 →</button>`;
  const card = document.querySelector('.fact-card');
  if (card) { card.classList.remove('fact-swap'); void card.offsetWidth; card.classList.add('fact-swap'); }
}

function renderHome() {
  const hm = $('home-map');
  if (hm && !hm.childElementCount) hm.innerHTML = DR.MapArt.svg('hm');
  const save = DR.Store.peekSave();
  $('home-continue').classList.toggle('hidden', !save);
  if (save) {
    $('home-continue-info').textContent =
      `${save.teams.map(t => t.icon).join('')} · 第 ${save.round} 轮 · 剩余 ${fmtClock(save.timerSeconds)} · ${fmtAgo(save.savedAt)}保存`;
  }
  showFact();
  clearInterval(factTimer);
  factTimer = setInterval(() => { if (activeScreenId() === 'screen-home') showFact(1); }, 14000);
}

function goHome() {
  closeGameOverlays();
  renderHome();
  DR.UI.showScreen('screen-home');
}

function wireHome() {
  $('home-new').addEventListener('click', async () => {
    DR.Audio.click();
    if (DR.Store.peekSave()) {
      const ok = await confirmDialog({ title: '开启新旅程?', text: '上次的旅程还没有走完。开始新旅程后,上次的存档会被覆盖。', ok: '开始新旅程', cancel: '再想想' });
      if (!ok) return;
    }
    openSetup();
  });
  $('home-continue').addEventListener('click', () => { DR.Audio.click(); DR.continueGame(); });
  $('home-rules').addEventListener('click', () => DR.UI.openRules());
  $('home-video').addEventListener('click', openVideo);
  $('btn-rules-video').addEventListener('click', openVideo);
  // 两个格式都放不了(文件缺失或浏览器太旧)时,给出提示而不是一个黑框
  const sources = document.querySelectorAll('#rules-video source');
  sources[sources.length - 1].addEventListener('error', () => {
    $('rules-video').classList.add('hidden');
    $('rules-video-missing').classList.remove('hidden');
  });
  $('home-codex').addEventListener('click', () => openCodex());
  $('home-honors').addEventListener('click', () => openHonors());
  $('home-settings').addEventListener('click', () => openSettings());
  $('home-fullscreen').addEventListener('click', toggleFullscreen);
  $('fact-next').addEventListener('click', () => { DR.Audio.page(); showFact(1); });
  $('fact-foot').addEventListener('click', e => {
    const btn = e.target.closest('.fact-link');
    if (btn) openCodex(btn.dataset.tab, btn.dataset.key);
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => {});
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}

// ================= 出发准备向导 =================
let wizardStep = 1;

function ensureSetup() {
  if (DR.setup) return;
  DR.setup = {
    teams: DR.TEAM_PRESETS.slice(0, 5).map((p, i) => ({
      name: p.name, icon: p.icon, color: p.color, route: i % 2 === 0 ? 'land' : 'sea',
    })),
    timerMinutes: DR.CONFIG.defaultTimerMinutes,
    questionFreq: 'normal',
    challenges: true,
  };
}

function openSetup() {
  ensureSetup();
  renderTeamConfigList();
  renderOptionChoices();
  goStep(1);
  DR.UI.showScreen('screen-setup');
}

function goStep(n) {
  wizardStep = Math.max(1, Math.min(3, n));
  document.querySelectorAll('.wizard-page').forEach(p => p.classList.toggle('active', +p.dataset.page === wizardStep));
  document.querySelectorAll('#wizard-steps li').forEach(li => {
    const s = +li.dataset.step;
    li.classList.toggle('active', s === wizardStep);
    li.classList.toggle('done', s < wizardStep);
  });
  document.querySelectorAll('#wizard-dots i').forEach((d, i) => d.classList.toggle('on', i + 1 === wizardStep));
  $('wizard-prev').style.visibility = wizardStep === 1 ? 'hidden' : 'visible';
  $('wizard-next').classList.toggle('hidden', wizardStep === 3);
  $('btn-start-game').classList.toggle('hidden', wizardStep !== 3);
  if (wizardStep === 3) renderSetupSummary();
  const body = document.querySelector('.wizard-body');
  if (body) body.scrollTop = 0;
}

function renderTeamConfigList() {
  const list = $('team-config-list');
  $('team-count-display').textContent = DR.setup.teams.length;
  list.innerHTML = DR.setup.teams.map((t, i) => `
    <div class="team-config-row" data-index="${i}" style="--team-color:${t.color}">
      <button type="button" class="team-icon-badge" data-act="icon" title="点击更换图标">${t.icon}</button>
      <input type="text" class="team-name-input" data-index="${i}" value="${esc(t.name)}" maxlength="8" aria-label="第 ${i + 1} 队队名">
      <div class="color-swatches" role="group" aria-label="队伍颜色">
        ${DR.TEAM_COLOR_CHOICES.map(c => `<button type="button" class="swatch ${c === t.color ? 'on' : ''}" data-act="color" data-color="${c}" style="background:${c}" aria-label="颜色 ${c}"></button>`).join('')}
      </div>
      <div class="route-toggle">
        <button type="button" class="route-btn ${t.route === 'land' ? 'active' : ''}" data-route="land">🐫 陆路</button>
        <button type="button" class="route-btn ${t.route === 'sea' ? 'active' : ''}" data-route="sea">⛵ 海路</button>
      </div>
      <div class="icon-palette hidden">
        ${DR.TEAM_ICON_CHOICES.map(ic => `<button type="button" class="icon-choice ${ic === t.icon ? 'on' : ''}" data-act="pick-icon" data-icon="${ic}">${ic}</button>`).join('')}
      </div>
    </div>
  `).join('');
}

// 选择的图标/颜色如果已被其他队使用,就和那一队互换,保证每队都能一眼区分
function assignUnique(i, field, value) {
  const teams = DR.setup.teams;
  const other = teams.findIndex((t, j) => j !== i && t[field] === value);
  if (other >= 0) teams[other][field] = teams[i][field];
  teams[i][field] = value;
}

function wireSetup() {
  const list = $('team-config-list');
  list.addEventListener('input', e => {
    if (e.target.classList.contains('team-name-input')) {
      DR.setup.teams[+e.target.dataset.index].name = e.target.value;
    }
  });
  list.addEventListener('click', e => {
    const row = e.target.closest('.team-config-row');
    if (!row) return;
    const i = +row.dataset.index;
    const routeBtn = e.target.closest('.route-btn');
    if (routeBtn) {
      DR.setup.teams[i].route = routeBtn.dataset.route;
      DR.Audio.click();
      renderTeamConfigList();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'icon') {
      const pal = row.querySelector('.icon-palette');
      const wasHidden = pal.classList.contains('hidden');
      list.querySelectorAll('.icon-palette').forEach(p => p.classList.add('hidden'));
      pal.classList.toggle('hidden', !wasHidden);
      DR.Audio.click();
    } else if (act.dataset.act === 'pick-icon') {
      assignUnique(i, 'icon', act.dataset.icon);
      DR.Audio.click();
      renderTeamConfigList();
    } else if (act.dataset.act === 'color') {
      assignUnique(i, 'color', act.dataset.color);
      DR.Audio.click();
      renderTeamConfigList();
    }
  });

  $('btn-team-plus').addEventListener('click', () => {
    if (DR.setup.teams.length >= 6) return;
    const used = new Set(DR.setup.teams.map(t => t.icon));
    const preset = DR.TEAM_PRESETS.find(p => !used.has(p.icon)) || DR.TEAM_PRESETS[DR.setup.teams.length];
    const usedColors = new Set(DR.setup.teams.map(t => t.color));
    const color = usedColors.has(preset.color) ? (DR.TEAM_COLOR_CHOICES.find(c => !usedColors.has(c)) || preset.color) : preset.color;
    const idx = DR.setup.teams.length;
    DR.setup.teams.push({ name: preset.name, icon: preset.icon, color, route: idx % 2 === 0 ? 'land' : 'sea' });
    DR.Audio.click();
    renderTeamConfigList();
  });
  $('btn-team-minus').addEventListener('click', () => {
    if (DR.setup.teams.length <= 2) return;
    DR.setup.teams.pop();
    DR.Audio.click();
    renderTeamConfigList();
  });
  $('btn-random-routes').addEventListener('click', () => {
    const n = DR.setup.teams.length;
    const routes = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 'land' : 'sea'));
    for (let i = routes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [routes[i], routes[j]] = [routes[j], routes[i]];
    }
    DR.setup.teams.forEach((t, i) => { t.route = routes[i]; });
    DR.Audio.dice();
    renderTeamConfigList();
  });

  $('timer-choices').addEventListener('click', e => {
    const card = e.target.closest('[data-minutes]');
    if (!card) return;
    DR.setup.timerMinutes = +card.dataset.minutes;
    DR.Audio.click();
    renderOptionChoices();
  });
  $('qfreq-choices').addEventListener('click', e => {
    const card = e.target.closest('[data-freq]');
    if (!card) return;
    DR.setup.questionFreq = card.dataset.freq;
    DR.Audio.click();
    renderOptionChoices();
  });
  $('challenge-toggle').addEventListener('change', e => { DR.setup.challenges = e.target.checked; });
  $('sound-toggle').addEventListener('change', e => {
    DR.Store.settings.soundOn = e.target.checked;
    DR.Store.saveSettings();
    applySettings();
  });

  $('wizard-prev').addEventListener('click', () => { DR.Audio.page(); goStep(wizardStep - 1); });
  $('wizard-next').addEventListener('click', () => { DR.Audio.page(); goStep(wizardStep + 1); });
  $('wizard-steps').addEventListener('click', e => {
    const li = e.target.closest('li[data-step]');
    if (li) { DR.Audio.page(); goStep(+li.dataset.step); }
  });
  $('setup-back-home').addEventListener('click', goHome);
}

const TIMER_CHOICES = [
  { m: 20, label: '短课', sub: '适合复习课' },
  { m: 25, label: '紧凑', sub: '节奏较快' },
  { m: 30, label: '标准', sub: '推荐' },
  { m: 35, label: '从容', sub: '多些讨论' },
  { m: 45, label: '完整', sub: '一整节课' },
];

function renderOptionChoices() {
  $('timer-choices').innerHTML = TIMER_CHOICES.map(c => `
    <button type="button" class="choice-card ${DR.setup.timerMinutes === c.m ? 'on' : ''}" data-minutes="${c.m}">
      <b>${c.m}<small> 分钟</small></b><span>${c.label}</span><em>${c.sub}</em>
    </button>`).join('');
  $('qfreq-choices').innerHTML = DR.QUESTION_FREQ.map(f => `
    <button type="button" class="choice-card ${DR.setup.questionFreq === f.key ? 'on' : ''}" data-freq="${f.key}">
      <b>${f.label}</b><span>约 ${Math.round(f.chance * 100)}% 的落地</span>
    </button>`).join('');
  $('challenge-toggle').checked = DR.setup.challenges !== false;
  $('sound-toggle').checked = !!DR.Store.settings.soundOn;
}

function renderSetupSummary() {
  const teams = DR.setup.teams;
  const land = teams.filter(t => t.route === 'land');
  const sea = teams.filter(t => t.route === 'sea');
  const freq = DR.QUESTION_FREQ.find(f => f.key === DR.setup.questionFreq) || DR.QUESTION_FREQ[1];
  const teamChip = t => `<span class="sum-team" style="--team-color:${t.color}">${t.icon} ${esc((t.name || '').trim() || '未命名')}</span>`;
  $('setup-summary').innerHTML = `
    <h3>🧭 出发名单</h3>
    <div class="sum-route"><div class="sum-route-name">🐫 陆路 · ${land.length} 队</div><div class="sum-teams">${land.map(teamChip).join('') || '<em>暂无</em>'}</div>
      <p class="sum-desc">河西走廊 → 西域绿洲 → 翻越葱岭 → 天竺 · 共 ${DR.LAND_PATH.length} 站</p></div>
    <div class="sum-route"><div class="sum-route-name">⛵ 海路 · ${sea.length} 队</div><div class="sum-teams">${sea.map(teamChip).join('') || '<em>暂无</em>'}</div>
      <p class="sum-desc">广州 → 南海诸国 → 马六甲 → 狮子国 → 天竺 · 共 ${DR.SEA_PATH.length} 站</p></div>
    <div class="sum-options">
      <span>⏳ ${DR.setup.timerMinutes} 分钟</span>
      <span>💡 问答${freq.label}</span>
      <span>🎯 课堂挑战${DR.setup.challenges !== false ? '开' : '关'}</span>
      <span>${DR.Store.settings.soundOn ? '🔊 音效开' : '🔇 音效关'}</span>
    </div>
    ${(!land.length || !sea.length) ? '<p class="sum-tip">💡 小提示:两条路线都有队伍时,课堂上可以对比陆路与海路的不同风光。</p>' : ''}
  `;
  const svg = $('setup-preview-map');
  const seen = { land: 0, sea: 0 };
  const pins = teams.map((t, i) => {
    const path = t.route === 'land' ? DR.LAND_PATH : DR.SEA_PATH;
    const j = seen[t.route]++;
    const target = path[Math.min(path.length - 2, 1 + j * 3)];
    return `<g class="pv-pin" style="animation-delay:${i * 0.1}s"><circle cx="${target.x}" cy="${target.y}" r="34" fill="#fff" stroke="${t.color}" stroke-width="8"/><text x="${target.x}" y="${target.y + 13}" text-anchor="middle" font-size="36">${t.icon}</text></g>`;
  }).join('');
  const dots = [...DR.LAND_PATH, ...DR.SEA_PATH].map(s => `<circle cx="${s.x}" cy="${s.y}" r="${s.type === 'final' ? 14 : 7}" fill="${s.type === 'final' ? '#b2503b' : '#fff8e6'}" stroke="#5a4a30" stroke-width="3"/>`).join('');
  svg.innerHTML = DR.MapArt.minimap(false) + dots +
    `<circle cx="${DR.HOME_COORD.x}" cy="${DR.HOME_COORD.y}" r="18" fill="#b2503b" stroke="#fff" stroke-width="5"/>` +
    `<text x="${DR.HOME_COORD.x}" y="${DR.HOME_COORD.y - 28}" text-anchor="middle" class="pv-label">长安</text>` +
    `<text x="205" y="560" text-anchor="middle" class="pv-label">那烂陀寺</text>` + pins;
}

// ================= 丝路百科 =================
let codexTab = 'stations';
let codexKey = null;
let codexReturn = 'screen-home';

function codexItems(tab) {
  if (tab === 'stations') {
    const items = [{ key: '长安', name: '长安', icon: '🏯', group: '起点', sub: '都城 · 起点', search: '长安 ' + (DR.STATION_NOTES['长安'] || '') }];
    const seen = new Set(['长安']);
    DR.LAND_PATH.forEach((s, i) => {
      if (s.type === 'final') return;
      seen.add(s.name);
      items.push({ key: s.name, name: s.name, icon: stationIcon(s), group: '🐫 陆路', sub: `第 ${i + 1} 站 · ${typeName(s)}`, search: s.name + s.blurb });
    });
    DR.SEA_PATH.forEach((s, i) => {
      if (s.type === 'final' || seen.has(s.name)) return;
      items.push({ key: s.name, name: s.name, icon: stationIcon(s), group: '⛵ 海路', sub: `第 ${i + 1} 站 · ${typeName(s)}`, search: s.name + s.blurb });
    });
    const fin = DR.LAND_PATH[DR.LAND_PATH.length - 1];
    items.push({ key: fin.name, name: fin.name, icon: '🪷', group: '终点', sub: '陆海两路的终点', search: fin.name + fin.blurb });
    return items;
  }
  if (tab === 'landmarks') {
    return (DR.LANDMARKS || []).map(l => ({ key: l.key, name: l.name, icon: l.icon, group: l.kind, sub: l.kind, search: l.name + l.kind + l.blurb }));
  }
  if (tab === 'figures') {
    return (DR.FIGURES || []).map(f => ({ key: f.key, name: f.name, icon: f.icon, group: '', sub: f.era, search: f.name + f.title + f.summary }));
  }
  if (tab === 'paramitas') {
    return DR.PARAMITAS.map(p => ({ key: p.key, name: p.name, icon: p.icon, group: '', sub: p.meaning, color: p.color, search: p.name + p.meaning }));
  }
  return (DR.GLOSSARY || []).map(g => ({ key: g.term, name: g.term, icon: '📖', group: '', sub: '', search: g.term + g.text }));
}

function stationIcon(s) {
  if (s.icon) return s.icon;
  if (s.type === 'final') return '🪷';
  if (s.type === 'site') return '🛕';
  if (s.type === 'story') return '⭐';
  return '📍';
}
function typeName(s) {
  return { way: '普通驿站', site: '圣地', story: '剧情站', final: '终点' }[s.type] || '站点';
}

function findStation(name) {
  if (name === '长安') return { name: '长安', x: DR.HOME_COORD.x, y: DR.HOME_COORD.y, type: 'home', blurb: '大唐的都城,商队与求法僧人从这里踏上丝绸之路的起点。' };
  const land = DR.LAND_PATH.findIndex(s => s.name === name);
  const sea = DR.SEA_PATH.findIndex(s => s.name === name);
  const s = land >= 0 ? DR.LAND_PATH[land] : (sea >= 0 ? DR.SEA_PATH[sea] : null);
  if (!s) return null;
  const routes = [];
  if (land >= 0) routes.push(`🐫 陆路第 ${land + 1} 站`);
  if (sea >= 0) routes.push(`⛵ 海路第 ${sea + 1} 站`);
  return Object.assign({ routes }, s);
}

function locatorSvg(points) {
  const pins = points.map(p => `<g class="loc-pin"><circle cx="${p.x}" cy="${p.y}" r="40" class="loc-pulse"/><circle cx="${p.x}" cy="${p.y}" r="17" fill="#b2503b" stroke="#fff" stroke-width="7"/></g>`).join('');
  return `<svg class="locator" viewBox="0 0 1080 640" preserveAspectRatio="xMidYMid meet">${DR.MapArt.minimap(false)}${pins}</svg>`;
}

function offersChips(offers) {
  return (offers || []).map(k => {
    const p = DR.PARAMITAS.find(pp => pp.key === k);
    return p ? `<button type="button" class="cx-chip" style="background:${p.color}" data-goto="paramitas:${p.key}">${p.icon} ${p.name}</button>` : '';
  }).join('');
}

function renderCodexDetail() {
  const el = $('codex-detail');
  const tab = codexTab, key = codexKey;
  let html = '';
  if (tab === 'stations') {
    const s = findStation(key);
    if (!s) { el.innerHTML = ''; return; }
    const note = DR.STATION_NOTES[s.name];
    html = `
      <div class="cx-hero"><span class="cx-hero-icon">${s.type === 'home' ? '🏯' : stationIcon(s)}</span>
        <div><div class="cx-kicker">${s.type === 'home' ? '起点 · 都城' : typeName(s)}${s.routes ? ' · ' + s.routes.join(' / ') : ''}</div><h2>${esc(s.name)}</h2></div></div>
      <div class="cx-grid">
        <div class="cx-text">
          <p class="cx-lead">${esc(s.blurb || '')}</p>
          ${note ? `<div class="cx-note"><b>📜 你知道吗?</b><p>${esc(note)}</p></div>` : ''}
          ${s.story ? `<div class="cx-note cx-story"><b>⭐ 剧情 · ${esc(s.story.title)}</b><p>${esc(s.story.text)}</p></div>` : ''}
          ${s.crossover ? `<div class="cx-note"><b>⇄ 换乘点</b><p>每队限一次,可以在这里由陆路改走海路(或由海路改走陆路)。</p></div>` : ''}
          ${s.offers && s.offers.length ? `<div class="cx-offers"><b>🛕 可在此结缘的残页:</b>${offersChips(s.offers)}</div>` : ''}
        </div>
        <div class="cx-map">${locatorSvg([s])}<small>地图上的位置</small></div>
      </div>`;
  } else if (tab === 'landmarks') {
    const l = (DR.LANDMARKS || []).find(x => x.key === key);
    if (!l) { el.innerHTML = ''; return; }
    html = `
      <div class="cx-hero"><span class="cx-hero-icon">${l.icon}</span><div><div class="cx-kicker">名胜古迹 · ${esc(l.kind)}</div><h2>${esc(l.name)}</h2></div></div>
      <div class="cx-grid">
        <div class="cx-text"><p class="cx-lead">${esc(l.blurb)}</p>
          <div class="cx-note"><b>🔍 在游戏里找一找</b><p>把地图放大一些,这个名胜就会出现在地图上,点击它可以看到介绍。</p></div></div>
        <div class="cx-map">${locatorSvg([l])}<small>地图上的位置</small></div>
      </div>`;
  } else if (tab === 'figures') {
    const f = (DR.FIGURES || []).find(x => x.key === key);
    if (!f) { el.innerHTML = ''; return; }
    const trait = DR.PARAMITAS.find(p => p.name === f.trait);
    html = `
      <div class="cx-hero cx-figure"><span class="cx-hero-icon big">${f.icon}</span>
        <div><div class="cx-kicker">${esc(f.era)}</div><h2>${esc(f.name)}</h2><div class="cx-title">${esc(f.title)}</div></div></div>
      <p class="cx-lead">${esc(f.summary)}</p>
      <div class="cx-facts"><b>📌 小档案</b><ul>${f.facts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      ${trait ? `<div class="cx-offers"><b>他身上最闪亮的品质:</b><button type="button" class="cx-chip" style="background:${trait.color}" data-goto="paramitas:${trait.key}">${trait.icon} ${trait.name}</button></div>` : ''}
      ${f.key === 'xuanzang' ? '<div class="cx-note"><b>🧭 地图彩蛋</b><p>在游戏地图上放大,红色点线就是玄奘当年真实走过的去程(北道)与归程(南道)。</p></div>' : ''}`;
  } else if (tab === 'paramitas') {
    const p = DR.PARAMITAS.find(x => x.key === key);
    if (!p) { el.innerHTML = ''; return; }
    const d = (DR.PARAMITA_DETAILS || {})[p.key] || {};
    const sites = [...DR.LAND_PATH, ...DR.SEA_PATH].filter((s, i, arr) => (s.offers || []).includes(p.key) && arr.findIndex(t => t.name === s.name) === i);
    html = `
      <div class="cx-hero"><span class="cx-hero-icon" style="background:${p.color};color:#fff">${p.icon}</span>
        <div><div class="cx-kicker">六度 · ${esc(d.sanskrit || '')}</div><h2>${esc(p.name)}</h2><div class="cx-title">${esc(p.meaning)}</div></div></div>
      <p class="cx-lead">${esc(d.explain || '')}</p>
      <div class="cx-cards">
        <div class="cx-note"><b>🏫 生活中的例子</b><p>${esc(d.example || '')}</p></div>
        <div class="cx-note"><b>📜 丝路故事</b><p>${esc(d.story || '')}</p></div>
      </div>
      <div class="cx-stats"><span>🎴 残页价值 <b>${p.value}</b> 功德</span><span>🛒 买入价 <b>${p.buyCost}</b> 功德</span></div>
      <div class="cx-offers"><b>🛕 可以结缘到它的圣地:</b>${sites.map(s => `<button type="button" class="cx-chip plain" data-goto="stations:${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>`;
  } else {
    const g = (DR.GLOSSARY || []).find(x => x.term === key);
    if (!g) { el.innerHTML = ''; return; }
    html = `
      <div class="cx-hero"><span class="cx-hero-icon">📖</span><div><div class="cx-kicker">小词典</div><h2>${esc(g.term)}</h2></div></div>
      <p class="cx-lead">${esc(g.text)}</p>
      <div class="cx-glossary-all">${DR.GLOSSARY.map(x => `<button type="button" class="cx-chip plain ${x.term === g.term ? 'on' : ''}" data-goto="glossary:${esc(x.term)}">${esc(x.term)}</button>`).join('')}</div>`;
  }
  el.innerHTML = html;
  el.scrollTop = 0;
}

const CODEX_TAB_NAMES = { stations: '🗺️ 丝路站点', landmarks: '🏛️ 名胜古迹', figures: '👤 求法高僧', paramitas: '🎴 六度', glossary: '📖 小词典' };

function renderCodexList() {
  const q = ($('codex-search').value || '').trim();
  // 有搜索词时在所有栏目里一起查找,并按栏目分组显示
  const items = q
    ? Object.keys(CODEX_TAB_NAMES).flatMap(tab => codexItems(tab)
      .filter(it => it.search.includes(q) || it.name.includes(q))
      .map(it => ({ ...it, tab, group: CODEX_TAB_NAMES[tab] })))
    : codexItems(codexTab).map(it => ({ ...it, tab: codexTab }));
  if (!items.some(it => it.key === codexKey && it.tab === codexTab) && items.length && !q) codexKey = items[0].key;
  let lastGroup = null;
  $('codex-list').innerHTML = items.length ? items.map(it => {
    const head = it.group && it.group !== lastGroup ? `<div class="cx-group">${esc(it.group)}</div>` : '';
    lastGroup = it.group;
    return `${head}<button type="button" class="cx-item ${it.key === codexKey && it.tab === codexTab ? 'on' : ''}" data-key="${esc(it.key)}" data-tab="${it.tab}">
      <span class="cx-item-icon"${it.color ? ` style="background:${it.color};color:#fff"` : ''}>${it.icon}</span>
      <span class="cx-item-text"><b>${esc(it.name)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`;
  }).join('') : `<p class="cx-empty">没有找到与"${esc(q)}"相关的条目</p>`;
  const on = $('codex-list').querySelector('.cx-item.on');
  if (on && typeof on.scrollIntoView === 'function') on.scrollIntoView({ block: 'nearest' });
}

function renderCodex() {
  document.querySelectorAll('.codex-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === codexTab));
  renderCodexList();
  renderCodexDetail();
}

function openCodex(tab, key) {
  const from = activeScreenId();
  if (from && from !== 'screen-codex') codexReturn = from;
  if (isOpen('pause-overlay')) closeOverlay('pause-overlay');
  if (isOpen('stats-overlay')) closeOverlay('stats-overlay');
  codexTab = tab || codexTab || 'stations';
  codexKey = key || null;
  $('codex-search').value = '';
  renderCodex();
  DR.UI.showScreen('screen-codex');
  DR.Audio.page();
}

function closeCodex() {
  DR.UI.showScreen(codexReturn || 'screen-home');
  if (codexReturn === 'screen-game') {
    DR.Map.fitMapBox();
    if (paused) openOverlay('pause-overlay');
  } else if (codexReturn === 'screen-home') {
    renderHome();
  }
}

function wireCodex() {
  $('codex-back').addEventListener('click', () => { DR.Audio.click(); closeCodex(); });
  $('codex-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.codex-tab-btn');
    if (!btn) return;
    codexTab = btn.dataset.tab;
    codexKey = null;
    $('codex-search').value = '';
    DR.Audio.page();
    renderCodex();
  });
  $('codex-list').addEventListener('click', e => {
    const item = e.target.closest('.cx-item');
    if (!item) return;
    codexKey = item.dataset.key;
    if (item.dataset.tab && item.dataset.tab !== codexTab) {
      codexTab = item.dataset.tab;
      document.querySelectorAll('.codex-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === codexTab));
    }
    DR.Audio.click();
    renderCodexList();
    renderCodexDetail();
  });
  $('codex-search').addEventListener('input', () => {
    renderCodexList();
    const first = $('codex-list').querySelector('.cx-item');
    if (first && !$('codex-list').querySelector('.cx-item.on')) first.click();
  });
  $('codex-detail').addEventListener('click', e => {
    const chip = e.target.closest('[data-goto]');
    if (!chip) return;
    const [tab, ...rest] = chip.dataset.goto.split(':');
    codexTab = tab;
    codexKey = rest.join(':');
    $('codex-search').value = '';
    DR.Audio.page();
    renderCodex();
  });
}

// ================= 荣誉榜 =================
function openHonors() {
  renderHonors();
  DR.UI.showScreen('screen-honors');
  DR.Audio.page();
}

function renderHonors() {
  const list = DR.Store.getHonors();
  $('honors-clear').classList.toggle('hidden', !list.length);
  if (!list.length) {
    $('honors-summary').innerHTML = '';
    $('honors-list').innerHTML = `<div class="honors-empty"><div>🏆</div><p>还没有记录。</p><p>完成一局旅程后,各队的成绩与称号会自动记录在这里。</p></div>`;
    return;
  }
  let best = null;
  let roundTrips = 0, answers = 0, lamps = 0;
  list.forEach(g => g.teams.forEach(t => {
    if (!best || t.total > best.team.total) best = { team: t, date: g.date };
    if (t.completed) roundTrips++;
    answers += t.correct || 0;
    lamps += t.lamps || 0;
  }));
  $('honors-summary').innerHTML = `
    <div class="hs-card"><b>${list.length}</b><span>已完成的旅程</span></div>
    <div class="hs-card hs-best"><b>${best.team.icon} ${best.team.total}</b><span>最高总功德 · ${esc(best.team.name)}<br><small>${fmtDate(best.date)}</small></span></div>
    <div class="hs-card"><b>${roundTrips}</b><span>支队伍完成往返</span></div>
    <div class="hs-card"><b>${answers}</b><span>道智慧问答被答对</span></div>
    <div class="hs-card"><b>${lamps}</b><span>盏法灯被点亮</span></div>`;
  const medal = ['🥇', '🥈', '🥉'];
  const reasonText = { timeup: '时间到', bankEmpty: '功德库耗尽', manual: '老师结束', allHome: '全员圆满' };
  $('honors-list').innerHTML = list.map(g => `
    <article class="honor-card">
      <header><span class="hc-date">📅 ${fmtDate(g.date)}</span><span class="hc-meta">⏳ ${g.minutes} 分钟 · ${g.rounds} 轮 · ${reasonText[g.reason] || ''}</span></header>
      <div class="hc-teams">
        ${g.teams.map((t, i) => `
          <div class="hc-team ${i === 0 ? 'first' : ''}" style="--team-color:${t.color}">
            <span class="hc-rank">${medal[i] || (i + 1)}</span>
            <span class="hc-name">${t.icon} ${esc(t.name)}</span>
            <span class="hc-total">${t.total}</span>
            <span class="hc-badges">${(t.badges || []).map(esc).join(' ')}</span>
          </div>`).join('')}
      </div>
    </article>`).join('');
}

function wireHonors() {
  $('honors-back').addEventListener('click', goHome);
  $('honors-clear').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: '清空荣誉榜?', text: '所有历届旅程的记录都会被删除,且无法恢复。', ok: '清空', danger: true });
    if (!ok) return;
    DR.Store.clearHonors();
    renderHonors();
  });
}

// ================= 设置 =================
function applySettings() {
  const s = DR.Store.settings;
  document.body.classList.toggle('big-text', !!s.bigText);
  document.body.classList.toggle('motion-reduced', s.motion === 'reduced');
  DR.Map.setReducedMotion(s.motion === 'reduced');
  DR.Map.applyLayers();
  DR.Audio.setVolume(s.volume);
  DR.Audio.setMusic(!!(s.music && s.soundOn));
  const mute = $('btn-mute');
  if (mute) mute.textContent = s.soundOn ? '🔊' : '🔇';
  if (DR.state) DR.state.soundOn = s.soundOn;
  if (activeScreenId() === 'screen-game') DR.Map.fitMapBox();
}

function renderSettings() {
  const s = DR.Store.settings;
  $('set-sound').checked = !!s.soundOn;
  $('set-volume').value = Math.round(s.volume * 100);
  $('set-music').checked = !!s.music;
  $('set-bigtext').checked = !!s.bigText;
  $('set-motion').checked = s.motion !== 'reduced';
  $('set-splash').checked = s.turnSplash !== false;
  $('set-autosave').checked = s.autosave !== false;
  const layerDefs = [
    ['labels', '🏷️ 地名注记'], ['terrain', '⛰️ 山川地貌'], ['landmarks', '🏛️ 名胜古迹'], ['history', '🧭 玄奘真实路线'],
    ['deco', '⛵ 船只驼队与装饰'], ['footprints', '👣 到访足迹'], ['grid', '▦ 计里画方网格'],
  ];
  $('set-layers').innerHTML = layerDefs.map(([k, label]) => `
    <label class="set-layer"><input type="checkbox" data-layer="${k}" ${s.layers[k] !== false ? 'checked' : ''}><span>${label}</span></label>`).join('');
}

function openSettings() {
  renderSettings();
  openOverlay('settings-overlay');
  DR.Audio.page();
}

function wireSettings() {
  const s = DR.Store.settings;
  const save = () => { DR.Store.saveSettings(); applySettings(); };
  $('set-sound').addEventListener('change', e => { s.soundOn = e.target.checked; save(); if (s.soundOn) DR.Audio.click(); });
  $('set-volume').addEventListener('input', e => { s.volume = (+e.target.value) / 100; save(); });
  $('set-volume').addEventListener('change', () => DR.Audio.good());
  $('set-music').addEventListener('change', e => { s.music = e.target.checked; save(); });
  $('set-bigtext').addEventListener('change', e => { s.bigText = e.target.checked; save(); });
  $('set-motion').addEventListener('change', e => { s.motion = e.target.checked ? 'full' : 'reduced'; save(); });
  $('set-splash').addEventListener('change', e => { s.turnSplash = e.target.checked; save(); });
  $('set-autosave').addEventListener('change', e => { s.autosave = e.target.checked; save(); });
  $('set-layers').addEventListener('change', e => {
    const k = e.target.dataset.layer;
    if (!k) return;
    s.layers[k] = e.target.checked;
    save();
  });
  $('set-clear-data').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: '清除本机数据?', text: '将删除自动存档和荣誉榜记录(设置会保留)。', ok: '清除', danger: true });
    if (!ok) return;
    DR.Store.clearSave();
    DR.Store.clearHonors();
    DR.UI.toast('🗑 已清除存档与荣誉榜', 'info');
    if (activeScreenId() === 'screen-home') renderHome();
  });
  $('set-reset').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: '恢复默认设置?', text: '声音、显示、地图图层等设置都会恢复为默认值。', ok: '恢复默认' });
    if (!ok) return;
    DR.Store.resetSettings();
    applySettings();
    renderSettings();
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => { closeOverlay(btn.dataset.close); DR.Audio.click(); });
  });
  ['settings-overlay', 'stats-overlay'].forEach(id => {
    $(id).addEventListener('click', e => { if (e.target.id === id) closeOverlay(id); });
  });
}

// ================= 暂停菜单 =================
let paused = false;

function renderPauseSub() {
  const st = DR.state;
  if (!st) return;
  const team = DR.Game.activeTeam(st);
  $('pause-sub').innerHTML = `计时已暂停 · 剩余 <b>${fmtClock(st.timerSeconds)}</b> · 第 ${st.round} 轮 · 当前:${team.icon} ${esc(team.name)}`;
}

function pauseGame() {
  const st = DR.state;
  if (!st || st.phase === 'ended' || activeScreenId() !== 'screen-game') return;
  paused = true;
  renderPauseSub();
  DR.Map.hideStationTooltip();
  openOverlay('pause-overlay');
  $('btn-pause').classList.add('active');
  DR.Audio.pause();
}

function resumeGame() {
  paused = false;
  closeOverlay('pause-overlay');
  $('btn-pause').classList.remove('active');
  DR.Audio.click();
}

function togglePause() {
  if (paused) resumeGame(); else pauseGame();
}

function wirePause() {
  $('btn-pause').addEventListener('click', togglePause);
  $('pause-resume').addEventListener('click', resumeGame);
  $('pause-stats').addEventListener('click', () => DR.Stats.openStats());
  $('pause-rules').addEventListener('click', () => DR.UI.openRules());
  $('pause-codex').addEventListener('click', () => openCodex());
  $('pause-settings').addEventListener('click', openSettings);
  $('pause-save-exit').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '保存并返回主菜单?',
      text: '进度会保存到本回合开始时(当前这一步如果还没走完,下次继续时会从这一回合重新开始)。',
      ok: '保存并返回',
    });
    if (!ok) return;
    DR.saveTurnSnapshot();
    paused = false;
    $('btn-pause').classList.remove('active');
    goHome();
    DR.UI.toast('💾 旅程已保存,可在主菜单"继续上次旅程"', 'info');
  });
  $('pause-end').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: '结束这局游戏?', text: '将立即结算并颁发称号。', ok: '结束并结算', danger: true });
    if (!ok) return;
    closeGameOverlays();
    DR.UI.finishGame('manual');
  });
}

DR.Screens = {
  init() {
    ensureSetup();
    wireConfirm();
    wireHome();
    wireSetup();
    wireCodex();
    wireHonors();
    wireSettings();
    wirePause();
    applySettings();
    renderHome();
  },
  renderHome,
  goHome,
  openSetup,
  openCodex,
  closeCodex,
  openHonors,
  openSettings,
  applySettings,
  confirmDialog,
  closeTopOverlay,
  metaOverlayOpen,
  timerFrozen,
  closeGameOverlays,
  togglePause,
  pauseGame,
  resumeGame,
  toggleFullscreen,
  isOpen,
  openOverlay,
  closeOverlay,
  openVideo,
  activeScreenId,
  get paused() { return paused; },
};

})();
