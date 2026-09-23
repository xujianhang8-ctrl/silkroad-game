/* 丝路法灯 · 地图渲染(SVG 地形/路线 + HTML 站点标记与棋子) */
var DR = window.DR || (window.DR = {});

(function () {

const W = 1080, H = 640;
function pctX(x) { return (x / W * 100) + '%'; }
function pctY(y) { return (y / H * 100) + '%'; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function $(id) { return document.getElementById(id); }

// ---------------- 地图缩放与平移(0~100% 对应 1x~MAX_SCALE 倍) ----------------

const MAX_SCALE = 3.2;
let zoomPct = 0, mapScale = 1, panX = 0, panY = 0;
let lastWrapW = 0, lastWrapH = 0;
let isPanning = false, panStart = null;

function scaleFromPct(pct) { return 1 + (pct / 100) * (MAX_SCALE - 1); }

function clampPan(wrapW, wrapH, scale) {
  const minX = wrapW * (1 - scale), minY = wrapH * (1 - scale);
  panX = Math.min(0, Math.max(minX, panX));
  panY = Math.min(0, Math.max(minY, panY));
}

function applyMapTransform() {
  const canvas = $('map-canvas');
  const wrap = $('map-wrap');
  if (!canvas || !wrap) return;
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${mapScale})`;
  // 站点/棋子反向缩放(只随放大略微变大),放大地图时它们之间的距离被拉开,不再互相遮挡。
  canvas.style.setProperty('--marker-scale', (Math.pow(mapScale, 0.35) / mapScale).toFixed(4));
  wrap.classList.toggle('zoomed', mapScale > 1.001);
  const slider = $('zoom-slider');
  if (slider && +slider.value !== zoomPct) slider.value = zoomPct;
  const label = $('zoom-pct');
  if (label) label.textContent = zoomPct + '%';
}

// anchorClientX/Y(可选,视口坐标):缩放时让该点在屏幕上的位置保持不变;
// 不传则以地图正中心为缩放锚点(滑块、＋/－按钮都是这种情况)。
function setZoom(newPct, anchorClientX, anchorClientY) {
  const wrap = $('map-wrap');
  if (!wrap) return;
  newPct = Math.max(0, Math.min(100, Math.round(newPct)));
  const rect = wrap.getBoundingClientRect();
  const wrapW = rect.width, wrapH = rect.height;
  const oldScale = mapScale;
  const newScale = scaleFromPct(newPct);
  const ax = anchorClientX == null ? wrapW / 2 : anchorClientX - rect.left;
  const ay = anchorClientY == null ? wrapH / 2 : anchorClientY - rect.top;
  const contentX = (ax - panX) / oldScale;
  const contentY = (ay - panY) / oldScale;
  panX = ax - contentX * newScale;
  panY = ay - contentY * newScale;
  zoomPct = newPct;
  mapScale = newScale;
  hideStationTooltip();
  clampPan(wrapW, wrapH, mapScale);
  applyMapTransform();
}

function resetZoom() {
  zoomPct = 0; mapScale = 1; panX = 0; panY = 0;
  applyMapTransform();
}

function onMapWheel(e) {
  if (e.target.closest('.map-toolbar')) return;
  e.preventDefault();
  setZoom(zoomPct + (e.deltaY > 0 ? -6 : 6), e.clientX, e.clientY);
}

function onMapPointerDown(e) {
  if (mapScale <= 1.001 || e.button !== 0) return;
  if (e.target.closest('.station-marker, .token, .map-toolbar, .map-legend')) return;
  isPanning = true;
  hideStationTooltip();
  panStart = { x: e.clientX, y: e.clientY, panX, panY };
  const wrap = $('map-wrap');
  wrap.classList.add('panning');
  try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* touch/pen without capture support: fine, drag still tracks via move */ }
}

function onMapPointerMove(e) {
  if (!isPanning || !panStart) return;
  const wrap = $('map-wrap');
  const rect = wrap.getBoundingClientRect();
  panX = panStart.panX + (e.clientX - panStart.x);
  panY = panStart.panY + (e.clientY - panStart.y);
  clampPan(rect.width, rect.height, mapScale);
  applyMapTransform();
}

function onMapPointerUp(e) {
  if (!isPanning) return;
  isPanning = false; panStart = null;
  const wrap = $('map-wrap');
  wrap.classList.remove('panning');
  try { wrap.releasePointerCapture(e.pointerId); } catch (_) { /* already released or unsupported */ }
}

function wireMapZoomPan() {
  const wrap = $('map-wrap');
  const slider = $('zoom-slider');
  if (!wrap || !slider) return;
  wrap.addEventListener('wheel', onMapWheel, { passive: false });
  wrap.addEventListener('pointerdown', onMapPointerDown);
  wrap.addEventListener('pointermove', onMapPointerMove);
  wrap.addEventListener('pointerup', onMapPointerUp);
  wrap.addEventListener('pointerleave', onMapPointerUp);
  wrap.addEventListener('pointercancel', onMapPointerUp);
  slider.addEventListener('input', () => setZoom(+slider.value));
  $('btn-zoom-in').addEventListener('click', () => setZoom(zoomPct + 15));
  $('btn-zoom-out').addEventListener('click', () => setZoom(zoomPct - 15));
  // 下方操作区的高度会随阶段进度条、行动按钮、"下一队"按钮的出现而变化,
  // 用 ResizeObserver 统一重新适配地图尺寸,避免掷骰按钮被挤出屏幕。
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { if (DR.state) fitMapBox(); });
    ro.observe($('main-stage'));
    ro.observe($('turn-control'));
  }
}

function pathOf(routeKey) { return routeKey === 'land' ? DR.LAND_PATH : DR.SEA_PATH; }

function coordFor(routeKey, position) {
  if (position === 0) return DR.HOME_COORD;
  return pathOf(routeKey)[position - 1];
}

function iconForStation(st) {
  if (st.icon) return st.icon;
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

function cornerBracket(x, y, dx, dy) {
  return `<path d="M${x},${y} L${x + dx * 26},${y} M${x},${y} L${x},${y + dy * 26}"
      stroke="#8a6a2f" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.55" />
    <circle cx="${x}" cy="${y}" r="2.6" fill="#8a6a2f" opacity="0.55" />`;
}

function renderMapChrome() {
  const svg = $('map-svg');
  const landCoords = [DR.HOME_COORD, ...DR.LAND_PATH];
  const seaCoords = [DR.HOME_COORD, ...DR.SEA_PATH];

  const mountainSpots = [
    { x: 600, y: 205, snow: false }, { x: 300, y: 218, snow: false },
    { x: 330, y: 248, snow: true }, { x: 270, y: 292, snow: true },
    { x: 246, y: 338, snow: true }, { x: 225, y: 378, snow: true },
  ];
  const waveSpots = [[760, 258], [680, 300], [600, 330], [520, 360], [440, 385], [370, 410], [305, 432]];
  const oasisSpots = [[698, 150], [485, 145], [395, 195], [230, 465]];
  const duneSpots = [[900, 160], [820, 195], [730, 175], [640, 210], [560, 195], [480, 210], [400, 230], [340, 260]];
  const caravanSpots = [{ x: 828, y: 96, r: -6 }, { x: 724, y: 108, r: 4 }, { x: 417, y: 158, r: -4 }, { x: 276, y: 308, r: 10 }];
  const sailSpots = [{ x: 700, y: 215 }, { x: 500, y: 340 }, { x: 345, y: 396 }];
  const cloudSpots = [[680, 55], [430, 50], [215, 78], [885, 52]];
  const birdSpots = [[555, 62], [592, 70], [630, 60]];
  const dolphinSpots = [{ x: 630, y: 292, r: -8 }, { x: 460, y: 372, r: 6 }];
  const lanternSpots = [[957, 173], [612, 197], [382, 262]];

  svg.innerHTML = `
    <defs>
      <linearGradient id="terrainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#eee0ba" />
        <stop offset="30%" stop-color="#e2cf98" />
        <stop offset="50%" stop-color="#cdc48a" />
        <stop offset="68%" stop-color="#9dbd93" />
        <stop offset="84%" stop-color="#5f9bab" />
        <stop offset="100%" stop-color="#3f7ea3" />
      </linearGradient>
      <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
        <stop offset="60%" stop-color="#000" stop-opacity="0" />
        <stop offset="100%" stop-color="#000" stop-opacity="0.18" />
      </radialGradient>
      <pattern id="grainPattern" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1.4" cy="1.4" r="0.6" fill="#000" opacity="0.5" />
      </pattern>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35" />
      </filter>
    </defs>

    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#terrainGrad)" />
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#grainPattern)" opacity="0.05" />

    <g class="deco-river" fill="none" stroke="#5a9fc7" stroke-width="6" opacity="0.35" stroke-linecap="round">
      <path d="M120,640 C160,560 175,520 205,478 C230,445 232,420 210,390" />
    </g>

    <g class="deco-dunes" stroke="#b98f4e" stroke-width="2" fill="none" opacity="0.3" stroke-linecap="round">
      ${duneSpots.map(([x, y]) => `<path d="M${x - 14},${y} q7,-6 14,0 q7,6 14,0" />`).join('')}
    </g>

    <g class="deco-mountains" opacity="0.75">
      ${mountainSpots.map(({ x, y, snow }) => `
        <g>
          <polygon points="${x - 14},${y + 12} ${x},${y - 13} ${x},${y + 12}" fill="#8a7355" />
          <polygon points="${x},${y - 13} ${x + 14},${y + 12} ${x},${y + 12}" fill="#6b5940" />
          ${snow ? `<polygon points="${x - 4},${y - 3} ${x},${y - 13} ${x + 4},${y - 3} ${x},${y + 1}" fill="#eef2f6" opacity="0.9" />` : ''}
        </g>
      `).join('')}
    </g>

    <g class="deco-oasis">
      ${oasisSpots.map(([x, y]) => `
        <g opacity="0.7">
          <ellipse cx="${x}" cy="${y + 5}" rx="10" ry="4" fill="#3f7d63" opacity="0.3" />
          <circle cx="${x}" cy="${y}" r="7" fill="#6fae6f" stroke="#3f7d63" stroke-width="1.5" />
          <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11">🌴</text>
        </g>
      `).join('')}
    </g>

    <g class="deco-waves" stroke="#2f6483" stroke-width="2.5" fill="none" opacity="0.4" stroke-linecap="round">
      ${waveSpots.map(([x, y]) => `<path d="M${x - 18},${y} q9,-8 18,0 q9,8 18,0" />`).join('')}
    </g>
    <g class="deco-sails" opacity="0.85">
      ${sailSpots.map(s => `<text x="${s.x}" y="${s.y}" text-anchor="middle" font-size="15">⛵</text>`).join('')}
    </g>
    <g class="deco-dolphins" opacity="0.75">
      ${dolphinSpots.map(d => `<text x="${d.x}" y="${d.y}" text-anchor="middle" font-size="13" transform="rotate(${d.r} ${d.x} ${d.y})">🐬</text>`).join('')}
    </g>
    <g class="deco-caravan" opacity="0.8">
      ${caravanSpots.map(c => `<text x="${c.x}" y="${c.y}" text-anchor="middle" font-size="14" transform="rotate(${c.r} ${c.x} ${c.y})">🐫</text>`).join('')}
    </g>
    <g class="deco-lanterns" opacity="0.85">
      ${lanternSpots.map(([x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="12">🏮</text>`).join('')}
    </g>
    <g class="deco-clouds" fill="#fff" opacity="0.55">
      ${cloudSpots.map(([x, y]) => `
        <g>
          <ellipse cx="${x}" cy="${y}" rx="17" ry="6.5" />
          <ellipse cx="${x - 11}" cy="${y + 2}" rx="9" ry="5.5" />
          <ellipse cx="${x + 12}" cy="${y + 2}" rx="9" ry="5" />
        </g>
      `).join('')}
    </g>
    <g class="deco-birds" stroke="#5a4a30" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.5">
      ${birdSpots.map(([x, y]) => `<path d="M${x - 6},${y} Q${x - 3},${y - 4} ${x},${y} Q${x + 3},${y - 4} ${x + 6},${y}" />`).join('')}
    </g>

    <path class="route-line route-land-casing" d="${pathD(landCoords)}" />
    <path class="route-line route-land" d="${pathD(landCoords)}" />
    <path class="route-line route-sea-casing" d="${pathD(seaCoords)}" />
    <path class="route-line route-sea" d="${pathD(seaCoords)}" />

    <g class="compass" transform="translate(975,400)" filter="url(#softShadow)">
      <circle r="32" fill="#f4ecd8" stroke="#8a6a2f" stroke-width="2" opacity="0.92" />
      <circle r="25" fill="none" stroke="#8a6a2f" stroke-width="1" opacity="0.5" />
      <g stroke="#8a6a2f" stroke-width="1.2" opacity="0.6">
        <line x1="0" y1="-25" x2="0" y2="-19" /><line x1="0" y1="25" x2="0" y2="19" />
        <line x1="-25" y1="0" x2="-19" y2="0" /><line x1="25" y1="0" x2="19" y2="0" />
        <line x1="-17.7" y1="-17.7" x2="-13.4" y2="-13.4" /><line x1="17.7" y1="-17.7" x2="13.4" y2="-13.4" />
        <line x1="-17.7" y1="17.7" x2="-13.4" y2="13.4" /><line x1="17.7" y1="17.7" x2="13.4" y2="13.4" />
      </g>
      <path d="M0,-23 L6,0 L0,5 L-6,0 Z" fill="#b2503b" />
      <path d="M0,23 L4,3 L0,0 L-4,3 Z" fill="#8a6a2f" opacity="0.7" />
      <text y="-36" text-anchor="middle" class="compass-label">北</text>
    </g>

    <g class="scale-bar" transform="translate(903,452)" filter="url(#softShadow)">
      <rect width="144" height="34" rx="6" fill="#f4ecd8" stroke="#8a6a2f" stroke-width="1.5" opacity="0.92" />
      <line x1="12" y1="25" x2="132" y2="25" stroke="#5a4a30" stroke-width="2" />
      <line x1="12" y1="20" x2="12" y2="30" stroke="#5a4a30" stroke-width="2" />
      <line x1="72" y1="21" x2="72" y2="29" stroke="#5a4a30" stroke-width="1.3" />
      <line x1="132" y1="20" x2="132" y2="30" stroke="#5a4a30" stroke-width="2" />
      <text x="72" y="13" text-anchor="middle" class="scale-bar-label">约 500 里</text>
    </g>

    <g class="cartouche" transform="translate(55,32)" filter="url(#softShadow)">
      <rect width="225" height="72" rx="10" fill="#f4ecd8" stroke="#8a6a2f" stroke-width="2" opacity="0.95" />
      <rect x="4" y="4" width="217" height="64" rx="7" fill="none" stroke="#8a6a2f" stroke-width="1" opacity="0.4" />
      <text x="20" y="43" text-anchor="middle" font-size="15">🪷</text>
      <text x="113" y="27" text-anchor="middle" class="cartouche-title">丝路法灯古地图</text>
      <line x1="40" y1="35" x2="186" y2="35" stroke="#c9992f" stroke-width="1" opacity="0.6" />
      <text x="113" y="51" text-anchor="middle" class="cartouche-sub">长安 —— 那烂陀寺</text>
      <text x="206" y="43" text-anchor="middle" font-size="15">🪔</text>
    </g>

    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)" />

    <g class="deco-frame">
      <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#8a6a2f" stroke-width="2" opacity="0.55" />
      <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="#8a6a2f" stroke-width="1" opacity="0.35" />
      ${cornerBracket(18, 18, 1, 1)}
      ${cornerBracket(W - 18, 18, -1, 1)}
      ${cornerBracket(18, H - 18, 1, -1)}
      ${cornerBracket(W - 18, H - 18, -1, -1)}
    </g>
  `;

  renderMarkers();
  resetZoom();
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

function stationTypeLabel(st) {
  if (st.type === 'final') return '🪷 终点圣地';
  if (st.type === 'site') return '🛕 圣地 · 可结缘';
  if (st.type === 'story') return '⭐ 剧情站';
  if (st.type === 'way') return '📍 普通驿站';
  return '🏯 起点 · 都城';
}

function showStationTooltip(markerEl, station) {
  const tip = $('station-tooltip');
  tip.querySelector('.st-tip-type').textContent = stationTypeLabel(station);
  tip.querySelector('.st-tip-title').textContent = station.name;
  tip.querySelector('.st-tip-body').textContent = station.blurb || '';
  const offersEl = tip.querySelector('.st-tip-offers');
  if (station.offers && station.offers.length) {
    offersEl.innerHTML = '可结缘:' + station.offers.map(key => {
      const p = DR.PARAMITAS.find(pp => pp.key === key);
      return p ? `<span class="st-offer-chip" style="background:${p.color}">${p.icon}${p.name}</span>` : '';
    }).join('');
    offersEl.classList.remove('hidden');
  } else {
    offersEl.classList.add('hidden');
  }
  tip.classList.remove('hidden');
  const r = markerEl.getBoundingClientRect();
  const tipH = tip.offsetHeight;
  const left = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
  // 默认显示在站点上方;上方空间不够(靠近地图顶部的站点)时改为显示在下方,避免被屏幕顶部截断。
  const below = r.top - 12 - tipH < 8;
  tip.classList.toggle('below', below);
  tip.style.left = left + 'px';
  tip.style.top = (below ? Math.min(r.bottom + 12, window.innerHeight - tipH - 8) : r.top - 12) + 'px';
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

// ---------------- 驿站法灯标记 ----------------

function markLamp(routeKey, pos, team) {
  const el = document.querySelector(`.station-marker[data-route="${routeKey}"][data-pos="${pos}"]`);
  if (!el) return;
  el.classList.add('lit');
  let badge = el.querySelector('.lamp-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'lamp-badge';
    badge.textContent = '🪔';
    el.appendChild(badge);
  }
  badge.style.background = team.color;
  badge.title = `${team.name} 的法灯`;
}

// ---------------- 到访足迹(每个站点下方,标出曾经过此地的队伍色点) ----------------

function updateVisitedMarks(state) {
  ['land', 'sea'].forEach(routeKey => {
    pathOf(routeKey).forEach((st, idx) => {
      const pos = idx + 1;
      const key = routeKey + ':' + pos;
      const el = document.querySelector(`.station-marker[data-route="${routeKey}"][data-pos="${pos}"]`);
      if (!el) return;
      // 陆路、海路的终点(那烂陀寺)是同一个地点,两个标记重叠在一起,到访记录要合并显示。
      const visitors = st.type === 'final'
        ? state.teams.filter(t => t.visited.has('land:' + DR.LAND_PATH.length) || t.visited.has('sea:' + DR.SEA_PATH.length))
        : state.teams.filter(t => t.visited.has(key));
      let dots = el.querySelector('.visited-dots');
      if (!visitors.length) { if (dots) dots.remove(); return; }
      if (!dots) {
        dots = document.createElement('span');
        dots.className = 'visited-dots';
        el.querySelector('.sm-icon').appendChild(dots);
      }
      dots.innerHTML = visitors.map(t => `<i style="background:${t.color}"></i>`).join('');
      dots.title = visitors.map(t => t.name).join('、') + ' 曾到访';
    });
  });
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
      el.style.transform = `translate(-50%, -50%) scale(var(--marker-scale, 1)) translateX(${offsetX}px)`;
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
    el.style.transform = 'translate(-50%, -50%) scale(var(--marker-scale, 1))';
    DR.Audio.hop();
    await sleep(230);
  }
  el.style.zIndex = '';
  layoutTokens(state);
}

// #map-wrap 需要严格保持 W:H 比例,才能让 HTML 标记的百分比坐标
// 与 SVG viewBox 完全对齐。可用空间的宽高比并不固定(侧边队伍栏、下方操作区
// 都会挤占空间),所以用 JS 按"能放下的最大等比矩形"来定宽高,而不是纯 CSS。
function fitMapBox() {
  const stage = $('main-stage');
  const wrap = $('map-wrap');
  const turnControl = $('turn-control');
  if (!stage || !wrap || !turnControl) return;
  const cs = getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const gap = parseFloat(cs.rowGap) || 0;
  const availW = stage.clientWidth - padX;
  const availH = stage.clientHeight - padY - turnControl.offsetHeight - gap - 4;
  if (availW <= 0 || availH <= 0) return;
  const ratio = W / H;
  let w = availW, h = w / ratio;
  if (h > availH) { h = availH; w = h * ratio; }
  w = Math.floor(w); h = Math.floor(h);
  wrap.style.width = w + 'px';
  wrap.style.height = h + 'px';
  // 尺寸真的变了(如窗口缩放、放大/缩小整体视图)才需要重新夹紧平移量,
  // 避免回合中频繁调用 fitMapBox 把玩家正在查看的缩放/平移重置掉。
  if (w !== lastWrapW || h !== lastWrapH) {
    lastWrapW = w; lastWrapH = h;
    clampPan(w, h, mapScale);
    applyMapTransform();
  }
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
  markLamp,
  updateVisitedMarks,
  wireMapZoomPan,
  resetZoom,
};

})();
