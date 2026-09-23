/* 丝路法灯 · 本地存储:设置、自动存档、荣誉榜
 * 全部保存在这台电脑的浏览器里(localStorage),不联网、不上传。
 * 浏览器禁用了本地存储(例如隐私模式)时,游戏照常可玩,只是不会记住设置和存档。
 */
var DR = window.DR || (window.DR = {});

(function () {

const KEYS = {
  settings: 'silkroad-fadeng.settings.v1',
  save: 'silkroad-fadeng.save.v1',
  honors: 'silkroad-fadeng.honors.v1',
};

const DEFAULT_SETTINGS = {
  soundOn: DR.CONFIG.soundDefault !== false,
  volume: 0.8,          // 音效音量 0~1
  music: false,         // 背景古琴音乐
  motion: 'full',       // 'full' 完整动画 | 'reduced' 简洁(关闭地图上的动态效果)
  bigText: false,       // 投影大字模式
  autosave: true,       // 每回合开始时自动存档
  turnSplash: true,     // 每回合开始时显示"轮到某队"的横幅
  layers: { labels: true, terrain: true, landmarks: true, history: true, deco: true, footprints: true, grid: true },
};

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function write(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}
function remove(key) {
  try { window.localStorage.removeItem(key); } catch (_) { /* 忽略 */ }
}

const savedSettings = read(KEYS.settings) || {};
const settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings, {
  layers: Object.assign({}, DEFAULT_SETTINGS.layers, savedSettings.layers || {}),
});

function saveSettings() { write(KEYS.settings, settings); }

function resetSettings() {
  Object.keys(settings).forEach(k => delete settings[k]);
  Object.assign(settings, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  saveSettings();
}

// ---------------- 存档 ----------------

// snapshot:DR.Game.serialize() 的结果(每回合开始时拍下);force=true 时忽略"自动存档"开关
function writeSnapshot(snapshot, setup, force) {
  if (!snapshot || (!force && !settings.autosave)) return false;
  return write(KEYS.save, { version: 1, savedAt: Date.now(), setup: setup || null, state: snapshot });
}

function loadGame() {
  const data = read(KEYS.save);
  if (!data || data.version !== 1 || !data.state) return null;
  try {
    const state = DR.Game.deserialize(data.state);
    return state ? { state, setup: data.setup } : null;
  } catch (_) { return null; }
}

// 主菜单"继续上次旅程"卡片上显示的摘要
function peekSave() {
  const data = read(KEYS.save);
  if (!data || data.version !== 1 || !data.state || !Array.isArray(data.state.teams)) return null;
  const st = data.state;
  return {
    savedAt: data.savedAt,
    round: st.round || 1,
    elapsedSeconds: st.elapsedSeconds != null ? st.elapsedSeconds : Math.max(0, (st.totalSeconds || 0) - (st.timerSeconds || 0)),
    teams: st.teams.map(t => ({ name: t.name, icon: t.icon, color: t.color })),
    active: st.teams[st.activeIndex || 0],
  };
}

function clearSave() { remove(KEYS.save); }

// ---------------- 荣誉榜 ----------------

const HONOR_LIMIT = 40;

function getHonors() {
  const list = read(KEYS.honors);
  return Array.isArray(list) ? list : [];
}

function addHonor(entry) {
  const list = getHonors();
  list.unshift(entry);
  write(KEYS.honors, list.slice(0, HONOR_LIMIT));
}

function clearHonors() { remove(KEYS.honors); }

DR.Store = {
  settings,
  DEFAULT_SETTINGS,
  saveSettings,
  resetSettings,
  writeSnapshot,
  loadGame,
  peekSave,
  clearSave,
  getHonors,
  addHonor,
  clearHonors,
};

})();
