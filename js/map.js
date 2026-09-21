/* 丝路法灯 · 地图渲染(SVG 地形/路线 + HTML 站点标记与棋子) */
var DR = window.DR || (window.DR = {});

(function () {

const W = 1000, H = 600;
function pctX(x) { return (x / W * 100) + '%'; }
function pctY(y) { return (y / H * 100) + '%'; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function $(id) { return document.getElementById(id); }

function pathOf(routeKey) { return routeKey === 'land' ? DR.LAND_PATH : DR.SEA_PATH; }

function coordFor(routeKey, position) {
  if (position === 0) return DR.HOME_COORD;
  return pathOf(routeKey)[position - 1];
}

function iconForStation(st) {
  if (st.type === 'final') return '🪷';
  if (st.type === 'site') return '🛕';
  if (st.type === 'story') return '⭐';
  return '📍';
}

function svgNS(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

function pathD(coords) {
  return coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x + ',' + c.y).join(' ');
}

// ---------------- 静态地图底图(地形/航线/站点/装饰,只需渲染一次) ----------------

function renderMapChrome() {
  const svg = $('map-svg');
  const landCoords = [DR.HOME_COORD, ...DR.LAND_PATH];
  const seaCoords = [DR.HOME_COORD, ...DR.SEA_PATH];

  const mountainSpots = [[345, 190], [366, 206], [316, 236], [281, 286], [256, 326]];
  const waveSpots = [[700, 250], [610, 295], [520, 335], [440, 365], [365, 392], [300, 415]];

  svg.innerHTML = `
    <defs>
      <linearGradient id="terrainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e9d7ab" />
        <stop offset="45%" stop-color="#dcc98f" />
        <stop offset="68%" stop-color="#a9c3a1" />
        <stop offset="100%" stop-color="#3f7ea3" />
      </linearGradient>
      <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
        <stop offset="60%" stop-color="#000" stop-opacity="0" />
        <stop offset="100%" stop-color="#000" stop-opacity="0.18" />
      </radialGradient>
    </defs>

    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#terrainGrad)" />

    <g class="deco-mountains" fill="#8a7355" opacity="0.55">
      ${mountainSpots.map(([x, y]) => `<polygon points="${x - 13},${y + 11} ${x},${y - 12} ${x + 13},${y + 11}" />`).join('')}
    </g>

    <g class="deco-waves" stroke="#2f6483" stroke-width="2.5" fill="none" opacity="0.4" stroke-linecap="round">
      ${waveSpots.map(([x, y]) => `<path d="M${x - 18},${y} q9,-8 18,0 q9,8 18,0" />`).join('')}
    </g>

    <path class="route-line route-land" d="${pathD(landCoords)}" />
    <path class="route-line route-sea" d="${pathD(seaCoords)}" />

    <g class="compass" transform="translate(905,375)">
      <circle r="30" fill="#f4ecd8" stroke="#8a6a2f" stroke-width="2" opacity="0.9" />
      <path d="M0,-24 L7,0 L0,24 L-7,0 Z" fill="#b2503b" />
      <text y="-34" text-anchor="middle" class="compass-label">北</text>
    </g>

    <g class="cartouche" transform="translate(55,35)">
      <rect width="215" height="72" rx="10" fill="#f4ecd8" stroke="#8a6a2f" stroke-width="2" opacity="0.92" />
      <text x="108" y="30" text-anchor="middle" class="cartouche-title">丝路法灯古地图</text>
      <text x="108" y="54" text-anchor="middle" class="cartouche-sub">长安 —— 那烂陀寺</text>
    </g>

    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)" />
  `;

  renderMarkers();
}

function renderMarkers() {
  const wrap = $('map-markers');
  wrap.innerHTML = '';

  const home = document.createElement('div');
  home.className = 'station-marker home-marker';
  home.style.left = pctX(DR.HOME_COORD.x);
  home.style.top = pctY(DR.HOME_COORD.y);
  home.innerHTML = `<span class="sm-icon">🏯</span><span class="sm-label">长安</span>`;
  home.addEventListener('click', () => showStationTooltip(home, { name: '长安', blurb: '大唐的都城,商队与求法僧人从这里踏上丝绸之路的起点。' }));
  wrap.appendChild(home);

  ['land', 'sea'].forEach(routeKey => {
    pathOf(routeKey).forEach((st, idx) => {
      const pos = idx + 1;
      const el = document.createElement('div');
      el.className = `station-marker ${st.type} ${st.crossover ? 'crossover' : ''} label-${pos % 2 === 0 ? 'below' : 'above'}`;
      el.style.left = pctX(st.x);
      el.style.top = pctY(st.y);
      el.innerHTML = `<span class="sm-icon">${iconForStation(st)}</span><span class="sm-label">${st.name}</span>`;
      el.addEventListener('click', () => showStationTooltip(el, st));
      wrap.appendChild(el);
      el.dataset.route = routeKey;
      el.dataset.pos = pos;
    });
  });
}

// ---------------- 站点小知识提示框 ----------------

function showStationTooltip(markerEl, station) {
  const tip = $('station-tooltip');
  tip.querySelector('.st-tip-title').textContent = station.name;
  tip.querySelector('.st-tip-body').textContent = station.blurb || '';
  const r = markerEl.getBoundingClientRect();
  const left = Math.min(Math.max(r.left + r.width / 2, 170), window.innerWidth - 170);
  const top = Math.max(r.top - 12, 90);
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.classList.remove('hidden');
  DR.Audio.click();
}
function hideStationTooltip() { $('station-tooltip').classList.add('hidden'); }

function wireTooltipDismiss() {
  document.addEventListener('click', e => {
    if (e.target.closest('.station-marker') || e.target.closest('#station-tooltip')) return;
    hideStationTooltip();
  });
  $('station-tooltip').querySelector('.st-tip-close').addEventListener('click', hideStationTooltip);
}

// ---------------- 队伍棋子 ----------------

function initTokens(state) {
  const wrap = $('map-markers');
  state.teams.forEach(team => {
    const el = document.createElement('div');
    el.className = 'token';
    el.id = 'token-' + team.id;
    el.style.borderColor = team.color;
    el.textContent = team.icon;
    el.title = team.name;
    wrap.appendChild(el);
  });
  layoutTokens(state);
}

function layoutTokens(state) {
  const groups = new Map();
  state.teams.forEach(team => {
    const key = team.position === 0 ? 'home' : team.route + ':' + team.position;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(team);
  });

  groups.forEach(teamsHere => {
    const n = teamsHere.length;
    teamsHere.forEach((team, i) => {
      const coord = coordFor(team.route, team.position);
      const el = $('token-' + team.id);
      if (!el) return;
      const offsetX = (i - (n - 1) / 2) * 20;
      el.style.left = pctX(coord.x);
      el.style.top = pctY(coord.y);
      el.style.transform = `translate(-50%, -50%) translateX(${offsetX}px)`;
    });
  });
}

async function animateActiveMove(state, fromPos) {
  const team = DR.Game.activeTeam(state);
  const toPos = team.position;
  const route = team.route;
  const el = $('token-' + team.id);
  const dir = toPos > fromPos ? 1 : (toPos < fromPos ? -1 : 0);

  if (dir === 0 || !el) { layoutTokens(state); return; }

  el.style.zIndex = 30;
  let cur = fromPos;
  while (cur !== toPos) {
    cur += dir;
    const c = coordFor(route, cur);
    el.style.left = pctX(c.x);
    el.style.top = pctY(c.y);
    el.style.transform = 'translate(-50%, -50%)';
    DR.Audio.hop();
    await sleep(230);
  }
  el.style.zIndex = '';
  layoutTokens(state);
}

// #map-wrap 需要严格保持 1000:600 比例,才能让 HTML 标记的百分比坐标
// 与 SVG viewBox 完全对齐。可用空间的宽高比并不固定(侧边队伍栏、下方操作区
// 都会挤占空间),所以用 JS 按"能放下的最大等比矩形"来定宽高,而不是纯 CSS。
function fitMapBox() {
  const stage = $('main-stage');
  const wrap = $('map-wrap');
  const turnControl = $('turn-control');
  if (!stage || !wrap || !turnControl) return;
  const availW = stage.clientWidth;
  const availH = stage.clientHeight - turnControl.offsetHeight - 16;
  if (availW <= 0 || availH <= 0) return;
  const ratio = W / H;
  let w = availW, h = w / ratio;
  if (h > availH) { h = availH; w = h * ratio; }
  wrap.style.width = Math.floor(w) + 'px';
  wrap.style.height = Math.floor(h) + 'px';
}

function pulseTeamToken(teamId) {
  const el = $('token-' + teamId);
  if (!el) return;
  el.classList.remove('token-pulse');
  void el.offsetWidth; // 强制重排,确保动画可以重新触发
  el.classList.add('token-pulse');
}

DR.Map = {
  renderMapChrome,
  initTokens,
  layoutTokens,
  animateActiveMove,
  pulseTeamToken,
  wireTooltipDismiss,
  hideStationTooltip,
  fitMapBox,
};

})();
