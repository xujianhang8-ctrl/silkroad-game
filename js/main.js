/* 丝路法灯 · 启动与全局绑定(开局/读档、计时器、快捷键、屏幕切换) */
var DR = window.DR || (window.DR = {});

(function () {
  function $(id) { return document.getElementById(id); }

  let timerHandle = null;
  let lastTurnSnapshot = null;
  let warned = {};

  // ---------------- 计时器 ----------------
  function tick() {
    const state = DR.state;
    if (!state || state.phase === 'ended') return;
    const frozen = DR.Screens.timerFrozen();
    $('timer-chip').classList.toggle('frozen', frozen);
    if (frozen) return;
    state.timerSeconds--;
    const wasSprint = state.sprintActive;
    state.sprintActive = state.timerSeconds > 0 && state.timerSeconds <= DR.CONFIG.sprintMinutesLeft * 60;
    DR.UI.renderTimer(state);
    DR.UI.renderPhaseBanner(state);
    if (!wasSprint && state.sprintActive && !warned.sprint) {
      warned.sprint = true;
      DR.UI.toast(`⚡ 最后 ${DR.CONFIG.sprintMinutesLeft} 分钟:冲刺阶段开始,掷骰点数 +1!`, 'warn');
      DR.Audio.turn();
    }
    if (state.timerSeconds === 60 && !warned.oneMin) {
      warned.oneMin = true;
      DR.UI.toast('⏳ 还剩 1 分钟,准备收尾啦', 'warn');
    }
    if (state.timerSeconds <= 0) {
      DR.UI.finishGame('timeup');
      return;
    }
    // 每走 10 秒同步一次存档里的剩余时间,继续游戏时不会把已经用掉的时间"退回来"
    if (state.timerSeconds % 10 === 0) persistSnapshot(false, false);
  }

  function startTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(tick, 1000);
  }

  // ---------------- 存档快照 ----------------
  // 存档内容 = 本回合开始时的局面 + 当前剩余时间(回合进行到一半时的抽卡/交易不会被存成"半截")
  function persistSnapshot(force, announce) {
    const state = DR.state;
    if (!state || state.phase === 'ended') return false;
    if (!lastTurnSnapshot) lastTurnSnapshot = DR.Game.serialize(state);
    lastTurnSnapshot.timerSeconds = state.timerSeconds;
    lastTurnSnapshot.sprintActive = state.sprintActive;
    const ok = DR.Store.writeSnapshot(lastTurnSnapshot, DR.setup, force);
    if (ok && announce) flashSaved();
    return ok;
  }
  let savedTimer = null;
  function flashSaved() {
    const chip = $('save-chip');
    if (!chip) return;
    chip.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => chip.classList.remove('show'), 1800);
  }
  DR.captureTurnSnapshot = function (state) {
    lastTurnSnapshot = DR.Game.serialize(state);
    persistSnapshot(false, true);
  };
  // "保存并回主菜单":无论是否开启自动存档,都写入存档
  DR.saveTurnSnapshot = function () { persistSnapshot(true, false); };

  // ---------------- 开局 / 读档 ----------------
  function enterGame(state, opts) {
    DR.state = state;
    warned = { sprint: state.sprintActive, oneMin: state.timerSeconds <= 60 };
    DR.Screens.closeGameOverlays();
    DR.UI.hideModal();
    DR.UI.showScreen('screen-game');
    DR.UI.toggleMapExpand(false);
    DR.Map.renderMapChrome();
    DR.Map.initTokens(state);
    DR.Map.refreshLamps(state);
    DR.Map.fitMapBox();
    DR.UI.resetSideTabs();
    DR.UI.renderParamitaLegend();
    DR.Screens.applySettings();
    DR.UI.beginTurn(opts);
    startTimer();
  }

  function startGame() {
    const setup = DR.setup;
    const teams = setup.teams.map((t, i) => ({
      name: (t.name || '').trim() || (DR.TEAM_PRESETS[i] || DR.TEAM_PRESETS[0]).name,
      icon: t.icon,
      color: t.color,
      route: t.route,
    }));
    const freq = DR.QUESTION_FREQ.find(f => f.key === setup.questionFreq) || DR.QUESTION_FREQ[1];
    const state = DR.Game.init(teams, setup.timerMinutes, {
      questionChance: freq.chance,
      challenges: setup.challenges !== false,
    });
    state.soundOn = DR.Store.settings.soundOn;
    DR.Audio.fanfare();
    enterGame(state, { first: true });
  }

  DR.continueGame = function () {
    const loaded = DR.Store.loadGame();
    if (!loaded) {
      DR.UI.toast('😢 没有找到可以继续的存档', 'warn');
      DR.Screens.renderHome();
      return;
    }
    if (loaded.setup) DR.setup = loaded.setup;
    enterGame(loaded.state, { resumed: true, newRound: true });
  };

  // ---------------- 界面切换时的收尾 ----------------
  DR.onScreenChange = function (id) {
    DR.Stats && DR.Stats.hideTip();
    if (id !== 'screen-game') {
      const panel = $('map-layers');
      if (panel) panel.classList.add('hidden');
    }
  };

  // ---------------- 按钮 ----------------
  function wireGameEvents() {
    $('btn-roll').addEventListener('click', DR.UI.onRollClick);
    $('btn-next-team').addEventListener('click', DR.UI.onNextTeamClick);
    $('btn-toggle-map').addEventListener('click', () => DR.UI.toggleMapExpand());
    $('btn-fullscreen').addEventListener('click', DR.Screens.toggleFullscreen);
    $('btn-mute').addEventListener('click', () => {
      const s = DR.Store.settings;
      s.soundOn = !s.soundOn;
      DR.Store.saveSettings();
      DR.Screens.applySettings();
      DR.UI.toast(s.soundOn ? '🔊 音效已打开' : '🔇 已静音', 'info');
    });
    $('btn-codex-game').addEventListener('click', () => DR.Screens.openCodex());
    $('btn-end-game').addEventListener('click', () => {
      if (!DR.state || DR.state.phase === 'ended') return;
      DR.UI.showModal('confirmEnd', {});
    });
    $('btn-start-game').addEventListener('click', startGame);
    // "同样的队伍再来一局"
    $('btn-restart').addEventListener('click', startGame);
  }

  // ---------------- 快捷键 ----------------
  function wireKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ae = document.activeElement;
      const typing = ae && (['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) || ae.isContentEditable);
      const key = e.key;

      if (key === 'Escape') {
        if (DR.Screens.closeTopOverlay()) { e.preventDefault(); return; }
        if (DR.UI.closeModalByEsc()) { e.preventDefault(); return; }
        const screen = DR.Screens.activeScreenId();
        if (screen === 'screen-codex') { DR.Screens.closeCodex(); return; }
        if (screen === 'screen-honors') { DR.Screens.goHome(); return; }
        if (screen === 'screen-game' && DR.state && DR.state.phase !== 'ended' && !DR.UI.modalOpen()) { DR.Screens.pauseGame(); return; }
        return;
      }
      if (DR.Screens.isOpen('confirm-overlay')) return; // 确认框打开时只响应 Esc 与按钮本身
      if (DR.Screens.isOpen('video-overlay')) return;   // 看视频时空格等按键交给播放器,不要误触掷骰
      if (typing) return;

      if (key === 'r' || key === 'R') {
        e.preventDefault();
        if (DR.UI.rulesOpen()) DR.UI.closeRules(); else DR.UI.openRules();
        return;
      }
      if (DR.UI.rulesOpen() || DR.Screens.isOpen('settings-overlay')) return;

      const screen = DR.Screens.activeScreenId();
      if (screen !== 'screen-game' || !DR.state || DR.state.phase === 'ended') return;

      if (key === 'p' || key === 'P') { e.preventDefault(); DR.Screens.togglePause(); return; }
      if (DR.Screens.paused) return;
      if (key === 'd' || key === 'D') { e.preventDefault(); DR.Stats.toggleStats(); return; }
      if (DR.Screens.isOpen('stats-overlay')) return;
      if (key === 'b' || key === 'B') { e.preventDefault(); DR.Screens.openCodex(); return; }

      const overlayOpen = DR.UI.modalOpen();
      if (!overlayOpen) {
        if (key === 'm' || key === 'M') { e.preventDefault(); DR.UI.toggleMapExpand(); return; }
        if (key === 'f' || key === 'F') { e.preventDefault(); DR.Map.focusActiveTeam(); return; }
        if (key === '+' || key === '=') { e.preventDefault(); DR.Map.zoomBy(15); return; }
        if (key === '-' || key === '_') { e.preventDefault(); DR.Map.zoomBy(-15); return; }
        if (key === '0') { e.preventDefault(); DR.Map.resetZoom(); return; }
        const pan = { ArrowLeft: [90, 0], ArrowRight: [-90, 0], ArrowUp: [0, 90], ArrowDown: [0, -90] }[key];
        if (pan && DR.Map.zoomed) { e.preventDefault(); DR.Map.panBy(pan[0], pan[1]); return; }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!overlayOpen && !$('btn-roll').disabled) DR.UI.onRollClick();
        return;
      }
      if (key === 'Enter') {
        // 阻止浏览器对"当前聚焦按钮"的默认 Enter 点击,否则会和下面的逻辑重复触发两次操作。
        e.preventDefault();
        if (overlayOpen) {
          const confirmBtn = document.querySelector('#modal-box .modal-confirm');
          if (confirmBtn) confirmBtn.click();
        } else if (!$('btn-next-team').classList.contains('hidden') && !$('btn-next-team').disabled) {
          DR.UI.onNextTeamClick();
        } else if (!$('btn-roll').disabled) {
          DR.UI.onRollClick();
        }
        return;
      }
      if (/^[1-4]$/.test(key)) {
        if (overlayOpen && DR.UI.modalMode === 'question') {
          const idx = +key - 1;
          const btns = document.querySelectorAll('#modal-box .option-btn');
          if (btns[idx] && !btns[idx].disabled) btns[idx].click();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    DR.Screens.init();
    wireGameEvents();
    wireKeyboard();
    DR.UI.wireTeamsPanelClick();
    DR.UI.wireSideTabs();
    DR.UI.wireRulesEvents();
    DR.Map.wireTooltipDismiss();
    DR.Map.wireMapZoomPan();
    DR.Map.wireLayerPanel();
    DR.Stats.wire();
    DR.Audio.unlockOnce();
    window.addEventListener('resize', () => {
      if (DR.state && DR.Screens.activeScreenId() === 'screen-game') DR.Map.fitMapBox();
    });
    // 关闭/刷新页面、切到后台时再存一次,保证剩余时间是最新的
    const persistIfPlaying = () => {
      if (DR.Screens.activeScreenId() === 'screen-game') persistSnapshot(false, false);
    };
    window.addEventListener('pagehide', persistIfPlaying);
    // 切到别的浏览器标签页时自动暂停,回来时不会发现时间悄悄跑完了
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) persistIfPlaying();
      if (document.hidden && DR.state && DR.state.phase !== 'ended' && DR.Screens.activeScreenId() === 'screen-game' && !DR.Screens.paused) {
        DR.Screens.pauseGame();
      }
    });
  });
})();
