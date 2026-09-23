/* 丝路法灯 · 启动与全局绑定(计时器、快捷键、屏幕切换) */
var DR = window.DR || (window.DR = {});

(function () {
  function $(id) { return document.getElementById(id); }

  DR.setup = {
    teams: DR.TEAM_PRESETS.slice(0, 5).map((p, i) => ({
      name: p.name, icon: p.icon, color: p.color, route: i % 2 === 0 ? 'land' : 'sea',
    })),
    timerMinutes: DR.CONFIG.defaultTimerMinutes,
    soundOn: DR.CONFIG.soundDefault,
  };

  let timerHandle = null;

  function tick() {
    const state = DR.state;
    if (!state || state.phase === 'ended') {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      return;
    }
    state.timerSeconds--;
    state.sprintActive = state.timerSeconds > 0 && state.timerSeconds <= DR.CONFIG.sprintMinutesLeft * 60;
    DR.UI.renderTimer(state);
    DR.UI.renderPhaseBanner(state);
    if (state.timerSeconds <= 0) {
      DR.UI.finishGame('timeup');
    }
  }

  function startGame() {
    const teams = DR.setup.teams.map((t, i) => ({
      name: (t.name || '').trim() || DR.TEAM_PRESETS[i].name,
      icon: t.icon,
      color: t.color,
      route: t.route,
    }));
    DR.state = DR.Game.init(teams, DR.setup.timerMinutes);
    DR.state.soundOn = DR.setup.soundOn;
    $('btn-mute').textContent = DR.state.soundOn ? '🔊' : '🔇';
    DR.UI.showScreen('screen-game');
    DR.UI.resetSideTabs();
    DR.Map.renderMapChrome();
    DR.Map.initTokens(DR.state);
    DR.Map.fitMapBox();
    DR.UI.renderParamitaLegend();
    DR.UI.beginTurn();
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(tick, 1000);
  }

  function wireGameEvents() {
    $('btn-roll').addEventListener('click', DR.UI.onRollClick);
    $('btn-next-team').addEventListener('click', DR.UI.onNextTeamClick);
    $('btn-toggle-map').addEventListener('click', DR.UI.toggleMapExpand);

    $('btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    });

    $('btn-mute').addEventListener('click', () => {
      if (!DR.state) return;
      DR.state.soundOn = !DR.state.soundOn;
      $('btn-mute').textContent = DR.state.soundOn ? '🔊' : '🔇';
    });

    $('btn-end-game').addEventListener('click', () => {
      if (!DR.state || DR.state.phase === 'ended') return;
      DR.UI.showModal('confirmEnd', {});
    });

    $('btn-restart').addEventListener('click', () => {
      DR.UI.renderTeamConfigList();
      DR.UI.showScreen('screen-setup');
    });
  }

  function wireKeyboard() {
    document.addEventListener('keydown', e => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);

      if (e.key === 'Escape' && DR.UI.rulesOpen()) {
        DR.UI.closeRules();
        return;
      }
      if ((e.key === 'r' || e.key === 'R') && !typing) {
        e.preventDefault();
        if (DR.UI.rulesOpen()) DR.UI.closeRules(); else DR.UI.openRules();
        return;
      }
      if (DR.UI.rulesOpen()) return; // 规则手册打开时,不响应游戏内快捷键

      if (!DR.state || DR.state.phase === 'ended') return;

      if ((e.key === 'm' || e.key === 'M') && !typing) {
        e.preventDefault();
        DR.UI.toggleMapExpand();
        return;
      }
      const overlayOpen = !$('modal-overlay').classList.contains('hidden');

      if (e.code === 'Space') {
        e.preventDefault();
        if (!overlayOpen && !$('btn-roll').disabled) DR.UI.onRollClick();
        return;
      }
      if (e.key === 'Enter') {
        if (overlayOpen) {
          const confirmBtn = document.querySelector('.modal-confirm');
          if (confirmBtn) confirmBtn.click();
        } else if (!$('btn-next-team').classList.contains('hidden')) {
          DR.UI.onNextTeamClick();
        } else if (!$('btn-roll').disabled) {
          DR.UI.onRollClick();
        }
        return;
      }
      if (/^[1-4]$/.test(e.key)) {
        if (overlayOpen && DR.UI.modalMode === 'question') {
          const idx = +e.key - 1;
          const btns = document.querySelectorAll('#modal-box .option-btn');
          if (btns[idx] && !btns[idx].disabled) btns[idx].click();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('team-count-display').textContent = DR.setup.teams.length;
    DR.UI.renderTeamConfigList();
    DR.UI.wireSetupEvents();

    $('btn-start-game').addEventListener('click', startGame);

    wireGameEvents();
    wireKeyboard();
    DR.UI.wireTeamsPanelClick();
    DR.UI.wireSideTabs();
    DR.UI.wireRulesEvents();
    DR.Map.wireTooltipDismiss();
    DR.Map.wireMapZoomPan();
    window.addEventListener('resize', () => { if (DR.state) DR.Map.fitMapBox(); });
  });
})();
