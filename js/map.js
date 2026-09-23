/* 丝路法灯 · 地图交互层
 * 底图美术由 js/mapart.js 生成;本文件负责:站点与名胜标记、队伍棋子、缩放与平移、
 * 细节分级(LOD)、鹰眼小地图、图层开关、定位/跟随当前队伍。
 */
var DR = window.DR || (window.DR = {});

(function () {

const W = 1080, H = 640;
function pctX(x) { return (x / W * 100) + '%'; }
function pctY(y) { return (y / H * 100) + '%'; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function $(id) { return document.getElementById(id); }

// ---------------- 缩放与平移(0~100% 对应 1x~MAX_SCALE 倍) ----------------

const MAX_SCALE = 3.2;
let zoomPct = 0, mapScale = 1, panX = 0, panY = 0;
let lastWrapW = 0, lastWrapH = 0;
let isPanning = false, panStart = null;
let interactTimer = null, viewAnim = null;
let reducedMotion = false;

function scaleFromPct(pct) { return 1 + (pct / 100) * (MAX_SCALE - 1); }
function pctFromScale(scale) { return (scale - 1) / (MAX_SCALE - 1) * 100; }

// 地图框内侧(不含边框)的尺寸与屏幕位置
function wrapBox() {
  const wrap = $('map-wrap');
  const rect = wrap.getBoundingClientRect();
  return { w: wrap.clientWidth, h: wrap.clientHeight, left: rect.left + wrap.clientLeft, top: rect.top + wrap.clientTop };
}

function clampPan(wrapW, wrapH, scale) {
  const minX = wrapW * (1 - scale), minY = wrapH * (1 - scale);
  panX = Math.min(0, Math.max(minX, panX));
  panY = Math.min(0, Math.max(minY, panY));
}

// 缩放/拖动进行中临时开启 will-change,让浏览器直接缩放位图,操作更顺滑;
// 停下来之后再关掉,浏览器会按新的倍率重新绘制,矢量地图恢复清晰。
function markInteracting() {
  const canvas = $('map-canvas');
  if (!canvas) return;
  canvas.style.willChange = 'transform';
  clearTimeout(interactTimer);
  interactTimer = setTimeout(() => {
    canvas.style.willChange = '';
    layoutStationLabels();
  }, 280);
}

function lodFor(wrapW) {
  const eff = mapScale * (wrapW || W) / W; // 地图 1 个单位在屏幕上占多少像素
  return eff >= 2.3 ? 2 : (eff >= 1.45 ? 1 : 0);
}

function applyMapTransform() {
  const canvas = $('map-canvas');
  const wrap = $('map-wrap');
  if (!canvas || !wrap) return;
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${mapScale})`;
  // 站点/棋子反向缩放(只随放大略微变大),放大地图时它们之间的距离被拉开,不再互相遮挡;
  // 同时随地图在屏幕上的大小整体缩放(小屏幕上标记小一些,投影大屏上大一些)。
  const base = Math.max(0.85, Math.min(1.2, (wrap.clientWidth || W) / 1100));
  canvas.style.setProperty('--marker-scale', (base * Math.pow(mapScale, 0.35) / mapScale).toFixed(4));
  // HTML 地名标注的字号以"地图单位"计:1 个地图单位 = 地图框宽度 / 1080 像素
  canvas.style.setProperty('--mapu', ((wrap.clientWidth || W) / W).toFixed(4) + 'px');
  wrap.classList.toggle('zoomed', mapScale > 1.001);
  wrap.classList.toggle('compact', wrap.clientWidth > 0 && wrap.clientWidth < 900);
  const lod = String(lodFor(wrap.clientWidth));
  if (wrap.dataset.lod !== lod) wrap.dataset.lod = lod;
  const shown = Math.round(zoomPct);
  const slider = $('zoom-slider');
  if (slider && +slider.value !== shown) slider.value = shown;
  const label = $('zoom-pct');
  if (label) label.textContent = shown + '%';
  updateMinimapView();
}

// anchorClientX/Y(可选,视口坐标):缩放时让该点在屏幕上的位置保持不变;
// 不传则以地图正中心为缩放锚点(滑块、＋/－按钮都是这种情况)。
function setZoom(newPct, anchorClientX, anchorClientY, animate) {
  const wrap = $('map-wrap');
  if (!wrap || !wrap.clientWidth) return;
  newPct = Math.max(0, Math.min(100, newPct));
  const { w, h, left, top } = wrapBox();
  const newScale = scaleFromPct(newPct);
  const ax = anchorClientX == null ? w / 2 : anchorClientX - left;
  const ay = anchorClientY == null ? h / 2 : anchorClientY - top;
  const contentX = (ax - panX) / mapScale;
  const contentY = (ay - panY) / mapScale;
  let px = ax - contentX * newScale, py = ay - contentY * newScale;
  px = Math.min(0, Math.max(w * (1 - newScale), px));
  py = Math.min(0, Math.max(h * (1 - newScale), py));
  hideStationTooltip();
  if (animate) { animateView(newScale, px, py, 320); return; }
  cancelAnimationFrame(viewAnim);
  zoomPct = newPct; mapScale = newScale; panX = px; panY = py;
  markInteracting();
  applyMapTransform();
}

function zoomBy(delta) { setZoom(zoomPct + delta, null, null, true); }

function panBy(dx, dy) {
  if (mapScale <= 1.001) return;
  const { w, h } = wrapBox();
  const px = Math.min(0, Math.max(w * (1 - mapScale), panX + dx));
  const py = Math.min(0, Math.max(h * (1 - mapScale), panY + dy));
  animateView(mapScale, px, py, 180);
}

function resetZoom() {
  cancelAnimationFrame(viewAnim);
  zoomPct = 0; mapScale = 1; panX = 0; panY = 0;
  applyMapTransform();
}

function animateView(targetScale, targetX, targetY, ms) {
  cancelAnimationFrame(viewAnim);
  const s0 = mapScale, x0 = panX, y0 = panY;
  if (reducedMotion || !ms) {
    mapScale = targetScale; panX = targetX; panY = targetY; zoomPct = pctFromScale(mapScale);
    markInteracting(); applyMapTransform();
    return;
  }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    mapScale = s0 + (targetScale - s0) * e;
    panX = x0 + (targetX - x0) * e;
    panY = y0 + (targetY - y0) * e;
    zoomPct = pctFromScale(mapScale);
    markInteracting();
    applyMapTransform();
    if (k < 1) viewAnim = requestAnimationFrame(step);
  };
  viewAnim = requestAnimationFrame(step);
}

// 把地图坐标 (mx,my) 移到视野正中,可同时改变缩放
function centerOn(mx, my, pct, ms) {
  const wrap = $('map-wrap');
  if (!wrap || !wrap.clientWidth) return;
  const { w, h } = wrapBox();
  const scale = scaleFromPct(pct == null ? zoomPct : pct);
  let px = w / 2 - mx / W * w * scale, py = h / 2 - my / H * h * scale;
  px = Math.min(0, Math.max(w * (1 - scale), px));
  py = Math.min(0, Math.max(h * (1 - scale), py));
  hideStationTooltip();
  animateView(scale, px, py, ms == null ? 450 : ms);
}

function isInView(mx, my, margin) {
  const { w, h } = wrapBox();
  const sx = panX + mx / W * w * mapScale, sy = panY + my / H * h * mapScale;
  return sx >= margin && sx <= w - margin && sy >= margin && sy <= h - margin;
}

function onMapWheel(e) {
  if (e.target.closest('.map-toolbar, .map-layers, .minimap')) return;
  e.preventDefault();
  const delta = Math.max(-12, Math.min(12, -e.deltaY * (e.deltaMode === 1 ? 2 : 0.06)));
  setZoom(zoomPct + delta, e.clientX, e.clientY);
}

const NO_PAN = '.station-marker, .landmark-marker, .token, .map-toolbar, .map-layers, .minimap, .map-legend';

function onMapPointerDown(e) {
  if (mapScale <= 1.001 || e.button !== 0) return;
  if (e.target.closest(NO_PAN)) return;
  cancelAnimationFrame(viewAnim);
  isPanning = true;
  hideStationTooltip();
  panStart = { x: e.clientX, y: e.clientY, panX, panY };
  const wrap = $('map-wrap');
  wrap.classList.add('panning');
  try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* 触屏/手写笔不支持捕获也没关系 */ }
}

function onMapPointerMove(e) {
  if (!isPanning || !panStart) return;
  const { w, h } = wrapBox();
  panX = panStart.panX + (e.clientX - panStart.x);
  panY = panStart.panY + (e.clientY - panStart.y);
  clampPan(w, h, mapScale);
  markInteracting();
  applyMapTransform();
}

function onMapPointerUp(e) {
  if (!isPanning) return;
  isPanning = false; panStart = null;
  const wrap = $('map-wrap');
  wrap.classList.remove('panning');
  try { wrap.releasePointerCapture(e.pointerId); } catch (_) { /* 已释放 */ }
}

function onMapDblClick(e) {
  if (e.target.closest(NO_PAN)) return;
  setZoom(zoomPct >= 99 ? 0 : zoomPct + 30, e.clientX, e.clientY, true);
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
  wrap.addEventListener('dblclick', onMapDblClick);
  // 地图框的宽高带有过渡动画;动画结束后按最终尺寸重新计算标记大小与站名位置
  wrap.addEventListener('transitionend', e => {
    if (e.target !== wrap || (e.propertyName !== 'width' && e.propertyName !== 'height')) return;
    applyMapTransform();
    scheduleLabelLayout();
  });
  slider.addEventListener('input', () => setZoom(+slider.value));
  $('btn-zoom-in').addEventListener('click', () => zoomBy(15));
  $('btn-zoom-out').addEventListener('click', () => zoomBy(-15));
  $('btn-map-focus').addEventListener('click', () => { DR.Audio.click(); focusActiveTeam(); });
  $('btn-map-layers').addEventListener('click', e => { e.stopPropagation(); toggleLayerPanel(); });
  wireMinimap();
  // 下方操作区的高度会随阶段进度条、行动按钮、"下一队"按钮的出现而变化,
  // 用 ResizeObserver 统一重新适配地图尺寸,避免掷骰按钮被挤出屏幕。
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { if (DR.state && $('screen-game').classList.contains('active')) fitMapBox(); });
    ro.observe($('main-stage'));
    ro.observe($('turn-control'));
  }
}

// ---------------- 鹰眼小地图 ----------------

function renderMinimap() {
  const svg = $('minimap-svg');
  if (svg) svg.innerHTML = DR.MapArt.minimap(true);
}

function updateMinimapView() {
  const mm = $('minimap');
  const wrap = $('map-wrap');
  if (!mm || !wrap) return;
  mm.classList.toggle('show', mapScale > 1.001);
  const rect = mm.querySelector('.mm-view');
  if (!rect || !wrap.clientWidth) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  rect.setAttribute('x', (-panX / (w * mapScale) * W).toFixed(1));
  rect.setAttribute('y', (-panY / (h * mapScale) * H).toFixed(1));
  rect.setAttribute('width', (W / mapScale).toFixed(1));
  rect.setAttribute('height', (H / mapScale).toFixed(1));
}

function updateMinimapTokens(state) {
  const g = document.querySelector('#minimap .mm-tokens');
  if (!g || !state) return;
  g.innerHTML = state.teams.map((t, i) => {
    const c = coordFor(t.route, t.position);
    const active = i === state.activeIndex;
    return `<circle cx="${c.x}" cy="${c.y}" r="${active ? 22 : 15}" fill="${t.color}" stroke="#fff" stroke-width="${active ? 7 : 5}"/>`;
  }).join('');
}

function wireMinimap() {
  const mm = $('minimap');
  if (!mm) return;
  let dragging = false;
  const toMap = e => {
    const r = mm.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  mm.addEventListener('pointerdown', e => {
    e.stopPropagation();
    dragging = true;
    try { mm.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = toMap(e);
    centerOn(p.x, p.y, null, 200);
  });
  mm.addEventListener('pointermove', e => {
    if (!dragging) return;
    const p = toMap(e);
    centerOn(p.x, p.y, null, 0);
  });
  const stop = e => { dragging = false; try { mm.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
  mm.addEventListener('pointerup', stop);
  mm.addEventListener('pointercancel', stop);
}

// ---------------- 图层 ----------------

const LAYERS = [
  { key: 'labels', label: '🏷️ 地名注记', offClass: 'hide-labels' },
  { key: 'terrain', label: '⛰️ 山川地貌', offClass: 'hide-terrain' },
  { key: 'landmarks', label: '🏛️ 名胜古迹', offClass: 'hide-landmarks' },
  { key: 'history', label: '🧭 玄奘真实路线', offClass: 'hide-history' },
  { key: 'deco', label: '⛵ 船只驼队与装饰', offClass: 'hide-deco' },
  { key: 'footprints', label: '👣 到访足迹', offClass: 'hide-footprints' },
  { key: 'grid', label: '▦ 计里画方网格', onClass: 'show-grid' },
];

function currentLayers() {
  const s = DR.Store && DR.Store.settings;
  return (s && s.layers) || {};
}

function applyLayers() {
  const wrap = $('map-wrap');
  if (!wrap) return;
  const layers = currentLayers();
  LAYERS.forEach(l => {
    const on = layers[l.key] !== false;
    if (l.offClass) wrap.classList.toggle(l.offClass, !on);
    if (l.onClass) wrap.classList.toggle(l.onClass, on);
  });
  renderLayerPanel();
}

function renderLayerPanel() {
  const panel = $('map-layers');
  if (!panel) return;
  const layers = currentLayers();
  panel.innerHTML = `<div class="ml-title">🗂 地图图层</div>` + LAYERS.map(l => `
    <label class="ml-row"><input type="checkbox" data-layer="${l.key}" ${layers[l.key] !== false ? 'checked' : ''}><span>${l.label}</span></label>
  `).join('') + `<div class="ml-hint">放大地图后会显示更多小地名、河名和名胜古迹</div>`;
}

function toggleLayerPanel(force) {
  const panel = $('map-layers');
  if (!panel) return;
  const show = force == null ? panel.classList.contains('hidden') : force;
  panel.classList.toggle('hidden', !show);
  $('btn-map-layers').classList.toggle('active', show);
  if (show) renderLayerPanel();
}

function wireLayerPanel() {
  const panel = $('map-layers');
  if (!panel) return;
  panel.addEventListener('change', e => {
    const key = e.target.dataset.layer;
    if (!key || !DR.Store) return;
    DR.Store.settings.layers[key] = e.target.checked;
    DR.Store.saveSettings();
    applyLayers();
  });
  panel.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', e => {
    if (!panel.classList.contains('hidden') && !e.target.closest('#map-layers, #btn-map-layers')) toggleLayerPanel(false);
  });
}

function setReducedMotion(on) {
  reducedMotion = !!on;
  const wrap = $('map-wrap');
  if (wrap) wrap.classList.toggle('no-anim', reducedMotion);
  ['map-svg', 'map-travelers', 'home-map'].forEach(id => {
    const svg = $(id);
    try {
      if (svg && svg.pauseAnimations) { if (reducedMotion) svg.pauseAnimations(); else svg.unpauseAnimations(); }
    } catch (_) { /* 旧浏览器不支持 SMIL 控制 */ }
  });
}

// ---------------- 沿航线行进的商队与船只 ----------------
// 每 120 毫秒挪动一次(约 8 帧/秒):驼队走得很慢,看起来依旧连贯,却比逐帧动画省下大量计算。
let travelerTimer = null;
function startTravelers() {
  clearInterval(travelerTimer);
  const svg = $('map-travelers');
  if (!svg) return;
  const items = Array.from(svg.querySelectorAll('.traveler')).map(g => {
    const path = svg.querySelector('#dr-route-' + g.dataset.route);
    return path ? { g, path, len: path.getTotalLength(), dur: +g.dataset.dur, begin: +g.dataset.begin, reverse: g.dataset.reverse === '1' } : null;
  }).filter(Boolean);
  if (!items.length) return;
  const tick = () => {
    if (reducedMotion || document.hidden || !$('screen-game').classList.contains('active')) return;
    const now = performance.now() / 1000;
    items.forEach(it => {
      const t = ((((now - it.begin) % it.dur) + it.dur) % it.dur) / it.dur;
      const p = it.path.getPointAtLength((it.reverse ? 1 - t : t) * it.len);
      const fade = Math.max(0, Math.min(1, t / 0.04, (1 - t) / 0.04));
      it.g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      it.g.setAttribute('opacity', fade.toFixed(2));
    });
  };
  tick();
  travelerTimer = setInterval(tick, 120);
}

// ---------------- 站点坐标与图标 ----------------

// 本局的路线(城市 + 沿途村落)
function pathOf(routeKey) { return DR.Game.path(routeKey); }

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

// ---------------- 底图与标记 ----------------

function renderMapChrome() {
  $('map-svg').innerHTML = DR.MapArt.svg();
  $('map-travelers').innerHTML = DR.MapArt.travelersSvg('js');
  startTravelers();
  $('map-labels').innerHTML = DR.MapArt.labelsHtml();
  renderMinimap();
  renderMarkers();
  applyLayers();
  setReducedMotion(reducedMotion);
  resetZoom();
  lastWrapW = 0; lastWrapH = 0; // 强制下一次 fitMapBox 重新计算标签位置
  scheduleLabelLayout();
}

function renderMarkers() {
  const wrap = $('map-markers');
  wrap.innerHTML = '';

  const home = document.createElement('div');
  home.className = 'station-marker home-marker label-below';
  home.dataset.labelPref = 'below';
  home.style.left = pctX(DR.HOME_COORD.x);
  home.style.top = pctY(DR.HOME_COORD.y);
  home.innerHTML = `<span class="sm-icon">🏯</span><span class="sm-label">长安</span>`;
  home.addEventListener('click', () => showStationTooltip(home, { name: '长安', type: 'home', blurb: '大唐的都城,商队与求法僧人从这里踏上丝绸之路的起点。' }));
  wrap.appendChild(home);

  // 沿途村落:路线上的小圆点,放大地图或鼠标移上去时才显示村名(先画,压在城市标记下面)
  ['land', 'sea'].forEach(routeKey => {
    pathOf(routeKey).forEach((st, idx) => {
      if (st.type !== 'village') return;
      const el = document.createElement('div');
      el.className = `village-marker ${routeKey}`;
      el.style.left = pctX(st.x);
      el.style.top = pctY(st.y);
      el.dataset.route = routeKey;
      el.dataset.pos = idx + 1;
      el.innerHTML = `<span class="vm-dot"></span><span class="vm-label">${st.name}</span>`;
      el.addEventListener('click', () => showStationTooltip(el, st));
      wrap.appendChild(el);
    });
  });

  ['land', 'sea'].forEach(routeKey => {
    pathOf(routeKey).forEach((st, idx) => {
      if (st.type === 'village') return;
      const pos = idx + 1;
      const el = document.createElement('div');
      const labelPos = st.label || (pos % 2 === 0 ? 'below' : 'above');
      el.className = `station-marker ${st.type} ${st.crossover ? 'crossover' : ''} label-${labelPos}`;
      el.dataset.labelPref = labelPos;
      el.style.left = pctX(st.x);
      el.style.top = pctY(st.y);
      el.innerHTML = `<span class="sm-icon">${iconForStation(st)}</span><span class="sm-label">${st.name}</span>`;
      el.addEventListener('click', () => showStationTooltip(el, st));
      el.dataset.route = routeKey;
      el.dataset.pos = pos;
      wrap.appendChild(el);
    });
  });

  (DR.LANDMARKS || []).forEach(lm => {
    const el = document.createElement('div');
    el.className = `landmark-marker lod${lm.lod || 1}`;
    el.style.left = pctX(lm.x);
    el.style.top = pctY(lm.y);
    el.innerHTML = `<span class="lm-icon">${lm.icon}</span><span class="lm-label">${lm.name}</span>`;
    el.addEventListener('click', () => showStationTooltip(el, { name: lm.name, blurb: lm.blurb, kind: lm.kind, landmarkKey: lm.key }));
    wrap.appendChild(el);
  });
}

// ---------------- 站名标签自动避让 ----------------
// 依重要程度(终点 > 起点 > 圣地 > 剧情 > 驿站)依次摆放站名:先试站点设定的方位,再试下/上/右/左,
// 找不到不重叠的位置就暂时隐藏(鼠标移上去仍会显示;放大地图后空间变大,会重新出现)。

const LABEL_POSITIONS = ['below', 'above', 'right', 'left'];
function labelPriority(el) {
  if (el.classList.contains('final')) return 5;
  if (el.classList.contains('home-marker')) return 4;
  if (el.classList.contains('site')) return 3;
  if (el.classList.contains('story')) return 2;
  return 1;
}
function setLabelPos(el, pos) {
  LABEL_POSITIONS.forEach(p => el.classList.toggle('label-' + p, p === pos));
}
function rectsOverlap(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
}
let labelLayoutPending = false;
function layoutStationLabels() {
  const wrap = $('map-markers');
  if (!wrap || !wrap.offsetParent) return;
  const markers = Array.from(wrap.querySelectorAll('.station-marker'));
  if (!markers.length) return;
  markers.forEach(m => m.classList.remove('label-hidden'));
  const icons = markers.map(m => m.querySelector('.sm-icon').getBoundingClientRect());
  const placed = icons.slice();
  const order = markers.map((m, i) => i).sort((a, b) => labelPriority(markers[b]) - labelPriority(markers[a]) || a - b);
  order.forEach(i => {
    const m = markers[i];
    const pref = m.dataset.labelPref || 'below';
    const tries = [pref, ...LABEL_POSITIONS.filter(p => p !== pref)];
    for (const pos of tries) {
      setLabelPos(m, pos);
      const r = m.querySelector('.sm-label').getBoundingClientRect();
      if (!placed.some((p, k) => k !== i && rectsOverlap(p, r))) { placed.push(r); return; }
    }
    setLabelPos(m, pref);
    m.classList.add('label-hidden');
  });
}
function scheduleLabelLayout() {
  if (labelLayoutPending) return;
  labelLayoutPending = true;
  requestAnimationFrame(() => { labelLayoutPending = false; layoutStationLabels(); });
}

// ---------------- 站点小知识提示框 ----------------

function stationTypeLabel(st) {
  if (st.landmarkKey) return '🏛️ 名胜古迹 · ' + st.kind;
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
  // 站点/名胜都能一键跳到"丝路百科"里对应的条目
  const more = tip.querySelector('.st-tip-more');
  if (more) more.classList.toggle('hidden', station.type === 'village'); // 村落每局随机生成,百科里没有条目
  if (more) {
    more.dataset.tab = station.landmarkKey ? 'landmarks' : 'stations';
    more.dataset.key = station.landmarkKey || station.name;
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
function hideStationTooltip() {
  const tip = $('station-tooltip');
  if (tip) tip.classList.add('hidden');
}

function wireTooltipDismiss() {
  document.addEventListener('click', e => {
    if (e.target.closest('.station-marker, .village-marker, .landmark-marker, #station-tooltip')) return;
    hideStationTooltip();
  });
  const tip = $('station-tooltip');
  tip.querySelector('.st-tip-close').addEventListener('click', hideStationTooltip);
  const more = tip.querySelector('.st-tip-more');
  if (more) {
    more.addEventListener('click', () => {
      hideStationTooltip();
      if (DR.Screens) DR.Screens.openCodex(more.dataset.tab, more.dataset.key);
    });
  }
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

// 读档后按记录重新点亮所有法灯
function refreshLamps(state) {
  Object.keys(state.lampOwners || {}).forEach(key => {
    const [routeKey, pos] = key.split(':');
    const team = state.teams[state.lampOwners[key].teamId];
    if (team) markLamp(routeKey, +pos, team);
  });
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
        ? state.teams.filter(t => t.visited.has('land:' + pathOf('land').length) || t.visited.has('sea:' + pathOf('sea').length))
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
  wrap.querySelectorAll('.token').forEach(el => el.remove());
  state.teams.forEach(team => {
    const el = document.createElement('div');
    el.className = 'token';
    el.id = 'token-' + team.id;
    el.style.borderColor = team.color;
    el.style.setProperty('--team-color', team.color);
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
  state.teams.forEach((team, i) => {
    const el = $('token-' + team.id);
    if (el) el.classList.toggle('active', i === state.activeIndex && state.phase !== 'ended');
  });
  updateMinimapTokens(state);
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
    // 放大查看时,棋子走出视野就让镜头跟过去
    if (mapScale > 1.001 && !isInView(c.x, c.y, 50)) centerOn(c.x, c.y, null, reducedMotion ? 0 : 260);
    await sleep(230);
  }
  el.style.zIndex = '';
  layoutTokens(state);
}

// 定位当前队伍:放大到至少 45%,并把当前队伍的棋子移到视野中央
function focusActiveTeam() {
  const state = DR.state;
  if (!state) return;
  const team = DR.Game.activeTeam(state);
  const c = coordFor(team.route, team.position);
  centerOn(c.x, c.y, Math.max(zoomPct, 45));
  pulseTeamToken(team.id);
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
    const inner = wrapBox();
    clampPan(inner.w, inner.h, mapScale);
    applyMapTransform();
    scheduleLabelLayout();
  }
}

function pulseTeamToken(teamId) {
  const el = $('token-' + teamId);
  if (!el) return;
  el.classList.remove('token-pulse');
  void el.offsetWidth; // 强制重排,确保动画可以重新触发
  el.classList.add('token-pulse');
}

// 点击队伍卡片:闪烁棋子;如果地图正处于放大状态,顺便把镜头移过去
function showTeam(teamId) {
  pulseTeamToken(teamId);
  const state = DR.state;
  if (!state || mapScale <= 1.001) return;
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;
  const c = coordFor(team.route, team.position);
  centerOn(c.x, c.y);
}

DR.Map = {
  renderMapChrome,
  initTokens,
  layoutTokens,
  animateActiveMove,
  pulseTeamToken,
  showTeam,
  focusActiveTeam,
  wireTooltipDismiss,
  hideStationTooltip,
  fitMapBox,
  markLamp,
  refreshLamps,
  updateVisitedMarks,
  wireMapZoomPan,
  wireLayerPanel,
  applyLayers,
  toggleLayerPanel,
  setReducedMotion,
  resetZoom,
  zoomBy,
  panBy,
  coordFor,
  layoutStationLabels: scheduleLabelLayout,
  get zoomed() { return mapScale > 1.001; },
};

})();
