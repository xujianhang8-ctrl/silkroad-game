const { chromium } = require('playwright');
const fs = require('fs');
const script = JSON.parse(fs.readFileSync('script.json'));
const durs = Object.fromEntries(JSON.parse(fs.readFileSync('durations.json')).map(d => [d.id, d.dur]));
const PAD = 0.9;               // seconds of breathing room after each narration clip
const sceneLen = id => durs[id] + PAD;
fs.rmSync('frames', { recursive: true, force: true }); fs.mkdirSync('frames');

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../../index.html'));
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('silkroad-fadeng.settings.v1', JSON.stringify({ soundOn: false, music: false, turnSplash: true }));
  });
  await p.reload(); await p.waitForTimeout(500);

  // ---------- overlay: captions, spotlight, cursor, title card ----------
  await p.addStyleTag({ content: `
    #vx-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:88%;padding:12px 30px;border-radius:16px;
      background:rgba(22,16,44,.9);color:#fde9a8;font:600 27px/1.45 "Noto Sans CJK SC","Noto Sans SC",sans-serif;letter-spacing:.5px;
      border:1.5px solid rgba(232,196,104,.7);z-index:99999;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.45);transition:opacity .35s,top .35s,bottom .35s;opacity:0;pointer-events:none}
    #vx-cap.top{bottom:auto;top:78px}
    #vx-spot{position:fixed;border:4px solid #ffd35c;border-radius:16px;box-shadow:0 0 0 200vmax rgba(8,6,20,.46),0 0 26px 6px rgba(255,211,92,.75);
      z-index:99990;pointer-events:none;transition:left .5s ease,top .5s ease,width .5s ease,height .5s ease,opacity .35s;opacity:0}
    #vx-cursor{position:fixed;left:800px;top:450px;width:34px;height:34px;z-index:100000;pointer-events:none;transition:left .6s cubic-bezier(.4,0,.2,1),top .6s cubic-bezier(.4,0,.2,1),opacity .3s;opacity:0;
      filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))}
    #vx-cursor svg{width:34px;height:34px}
    .vx-ripple{position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:3px solid #ffd35c;z-index:99999;pointer-events:none;animation:vxr .6s ease-out forwards}
    @keyframes vxr{to{transform:scale(3.4);opacity:0}}
    #vx-title{position:fixed;inset:0;z-index:99995;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
      background:radial-gradient(ellipse at center,rgba(40,28,80,.82),rgba(10,8,24,.94));color:#fde9a8;font-family:"Noto Sans CJK SC",sans-serif;opacity:0;transition:opacity .7s;pointer-events:none}
    #vx-title .t1{font-size:84px;font-weight:800;letter-spacing:8px;text-shadow:0 4px 30px rgba(255,200,90,.45)}
    #vx-title .t2{font-size:34px;letter-spacing:4px;color:#f3d98b}
    #vx-title .t3{font-size:24px;color:#cbbfe8;letter-spacing:2px}
    #vx-title .lamp{font-size:92px;animation:vxl 2.4s ease-in-out infinite}
    @keyframes vxl{50%{transform:scale(1.08);filter:drop-shadow(0 0 22px #ffcf5a)}}
  `});
  await p.evaluate(() => {
    const mk = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html || ''; document.body.appendChild(d); return d; };
    mk('vx-cap'); mk('vx-spot'); mk('vx-title');
    mk('vx-cursor', '<svg viewBox="0 0 24 24"><path d="M4 2l15 10-7 1.4L9.5 21z" fill="#fff" stroke="#222" stroke-width="1.4" stroke-linejoin="round"/></svg>');
    window.VX = {
      cap(text) {
        const c = document.getElementById('vx-cap');
        c.textContent = text; c.style.opacity = text ? 1 : 0;
      },
      spot(sel, pad) {
        const s = document.getElementById('vx-spot');
        const el = sel && (typeof sel === 'string' ? document.querySelector(sel) : sel);
        const c = document.getElementById('vx-cap');
        if (!el) { s.style.opacity = 0; c.classList.remove('top'); return; }
        const r = el.getBoundingClientRect(); pad = pad == null ? 8 : pad;
        Object.assign(s.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', opacity: 1 });
        c.classList.toggle('top', r.bottom > innerHeight * 0.7 && r.top > innerHeight * 0.45);
      },
      title(html) {
        const t = document.getElementById('vx-title');
        if (html) t.innerHTML = html;
        t.style.opacity = html ? 1 : 0;
      },
      cursorTo(sel) {
        const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
        const cur = document.getElementById('vx-cursor');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        cur.style.opacity = 1; cur.style.left = x - 6 + 'px'; cur.style.top = y - 4 + 'px';
        return [x, y];
      },
      ripple(x, y) {
        const d = document.createElement('div'); d.className = 'vx-ripple'; d.style.left = x + 'px'; d.style.top = y + 'px';
        document.body.appendChild(d); setTimeout(() => d.remove(), 700);
      },
      hideCursor() { document.getElementById('vx-cursor').style.opacity = 0; },
    };
    // 可控骰子:录制时指定点数
    const orig = DR.Game.rollDice;
    DR.Game.rollDice = function (state) {
      if (window.__nextRoll) { const v = window.__nextRoll; window.__nextRoll = null; state.lastRoll = v; this.activeTeam(state).turnsTaken++; return v; }
      return orig.call(this, state);
    };
  });

  // ---------- prepare a game (5 default teams: land/sea alternating) ----------
  await p.click('#home-new'); await p.waitForTimeout(300);
  await p.evaluate(() => { DR.setup.teams = DR.setup.teams.slice(0, 4); DR.setup.journey = 'long'; DR.setup.endMode = 'first'; });
  await p.evaluate(() => { document.getElementById('wizard-next').click(); document.getElementById('wizard-next').click(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('btn-start-game').click());
  await p.waitForTimeout(900);
  await p.evaluate(() => { DR.Screens.goHome(); });
  await p.waitForTimeout(600);

  const sleep = ms => p.waitForTimeout(ms);
  const ev = (fn, arg) => p.evaluate(fn, arg);
  async function click(sel) {
    const loc = p.locator(sel).first();
    const box = await loc.boundingBox().catch(() => null);
    if (!box) { console.log('missing', sel); return; }
    const xy = [box.x + box.width / 2, box.y + box.height / 2];
    await ev(([x, y]) => { const c = document.getElementById('vx-cursor'); c.style.opacity = 1; c.style.left = x - 6 + 'px'; c.style.top = y - 4 + 'px'; }, xy);
    await sleep(700);
    await ev(([x, y]) => VX.ripple(x, y), xy);
    await loc.click();
  }
  // 第 n 座城在本局棋盘上的位置(1 起算;村落每局随机,所以要现算)
  const cityPos = (route, n) => ev(([r, k]) => {
    let c = 0; const path = DR.Game.path(r);
    for (let i = 0; i < path.length; i++) if (path[i].type !== 'village' && ++c === k) return i + 1;
    return 1;
  }, [route, n]);
  const force = opts => ev(o => Object.assign(DR.state.options, o), opts);
  const pushCard = (deck, title) => ev(([d, t]) => {
    const src = d === 'land' ? DR.LAND_EVENTS : DR.SEA_EVENTS;
    DR.state[d + 'Deck'].draw.push(src.find(c => c.title === t));
  }, [deck, title]);

  // ---------- screencast capture ----------
  const cdp = await ctx.newCDPSession(p);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = `frames/f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await sleep(300);
  const t0 = Date.now() / 1000;
  const marks = [];

  const scenes = {
    async intro() {
      await ev(() => VX.title('<div class="lamp">🪔</div><div class="t1">丝路法灯</div><div class="t2">大乘取经记 · 三分钟学会怎么玩</div><div class="t3">AI 语音讲解</div>'));
      await sleep(sceneLen('intro') * 1000 - 900);
      await ev(() => VX.title(''));
    },
    async goal() {
      await ev(() => { DR.UI.showScreen('screen-game'); DR.UI.toggleMapExpand(true); DR.Map.fitMapBox(); DR.UI.hideTurnSplash(); });
      await sleep(1600);
      await ev(() => VX.spot('.home-marker', 14));
      await sleep(3200);
      await ev(() => VX.spot('.station-marker.final', 14));
      await sleep(3400);
      await ev(() => VX.spot('#map-wrap', 2));
    },
    async setup() {
      await ev(() => { VX.spot(null); DR.UI.toggleMapExpand(false); DR.Screens.openSetup(); });
      await sleep(1200);
      await ev(() => VX.spot('#team-config-list', 10));
      await sleep(3600);
      await ev(() => VX.spot(null));
      await click('#wizard-next');
      await sleep(600);
      await ev(() => VX.spot('#journey-choices', 8));
      await sleep(3800);
      await ev(() => VX.spot('#endmode-choices', 8));
    },
    async screen() {
      await ev(() => { VX.spot(null); VX.hideCursor(); DR.UI.showScreen('screen-game'); DR.Map.fitMapBox(); DR.UI.hideTurnSplash(); });
      await sleep(500);
      await ev(() => VX.spot('.header-mid', 8)); await sleep(1900);
      await ev(() => VX.spot('#side-panel', 4)); await sleep(1900);
      await ev(() => VX.spot('#map-wrap', 2)); await sleep(1800);
      await ev(() => VX.spot('#turn-control', 4));
    },
    async phases() {
      await ev(() => VX.spot('#phase-tracker', 10));
    },
    async roll() {
      await ev(() => VX.spot('#dice-area', 10));
      await force({ questionChance: 0, challenges: false });
      await pushCard('land', '迷路小插曲');
      // 掷出的点数正好越过第一座城,演示"进城停留"的选择
      const first = await cityPos('land', 1);
      await ev(n => { window.__nextRoll = n; }, Math.min(6, first + 1));
      await sleep(1500);
      await click('#btn-roll');
      await ev(() => VX.spot(null));
      await sleep(1400);
      await ev(() => VX.spot('#modal-box', 6));
      await sleep(sceneLen('roll') * 1000 - 7200);
      await ev(() => VX.spot(null));
      await click('.stop-btn');
      await ev(() => VX.hideCursor());
    },
    async card() {
      await sleep(600);
      await ev(() => VX.spot('#modal-box', 6));
      await sleep(sceneLen('card') * 1000 - 2800);
      await ev(() => VX.spot(null));
      await click('#modal-confirm-btn');
    },
    async question() {
      await force({ questionChance: 1, challenges: false });
      await ev(n => { window.__nextRoll = n; }, await cityPos('sea', 1));
      await click('#btn-next-team');
      await sleep(900);
      await click('#btn-roll');
      await sleep(2600);
      const idx = await ev(() => DR.state.pendingQuestion.answer);
      await sleep(1200);
      await click(`#modal-box .option-btn[data-index="${idx}"]`);
      await ev(() => VX.hideCursor());
    },
    async challenge() {
      await click('#modal-confirm-btn');
      await force({ questionChance: 0, challenges: true, challengeChance: 1 });
      await ev(n => { window.__nextRoll = n; }, await cityPos('land', 1));
      await click('#btn-next-team');
      await sleep(800);
      await click('#btn-roll');
      await sleep(sceneLen('challenge') * 1000 - 5600);
      await click('#challenge-done');
      await ev(() => VX.hideCursor());
    },
    async fragments() {
      await ev(() => { VX.spot(null); });
      await click('.side-tab-btn[data-tab="legend"]');
      await ev(() => VX.spot('#side-panel', 4));
      await sleep(5200);
      await ev(() => { VX.spot(null); document.querySelector('.side-tab-btn[data-tab="teams"]').click(); });
      await sleep(500);
      await ev(() => DR.UI.showModal('teamDetail', { teamId: 2 }));
      await sleep(300);
      await ev(() => VX.spot('.td-subhead', 10));
      await sleep(5000);
      await ev(() => { VX.spot(null); DR.UI.hideModal(); });
      // 下一队(海路)上场,掷到占婆圣地
      await force({ questionChance: 0, challenges: false });
      await pushCard('sea', '渔民相助');
      // 第四队停在占婆(圣地)旁边的村落,掷 1 进城
      await ev(() => {
        const t = DR.state.teams[3]; t.backpack.dana = 1; t.backpack.sila = 1;
        t.position = DR.Game.path('sea').findIndex(x => x.name === '占婆'); DR.Map.initTokens(DR.state);
        window.__nextRoll = 1;
      });
      await click('#btn-next-team');
      await sleep(700);
      await click('#btn-roll');
      await ev(() => VX.hideCursor());
    },
    async market() {
      await sleep(300);
      await click('#modal-confirm-btn');
      await sleep(500);
      await click('#action-area .action-btn >> nth=0');
      await sleep(300);
      await ev(() => VX.spot('#modal-box', 6));
      await sleep(1700);
      await click('.trade-tab-btn[data-tab="swap"]');
      await sleep(900);
      await click('.swap-give-btn[data-key="dana"]');
      await sleep(1300);
      await click('.trade-tab-btn[data-tab="sell"]');
      await ev(() => VX.spot('#modal-box', 6));
    },
    async lamp() {
      await ev(() => VX.spot(null));
      await click('#btn-close-trade');
      await sleep(300);
      await ev(() => VX.spot('#action-area', 8));
      await sleep(700);
      await click('#action-area .action-btn:has-text("点亮法灯")');
      await sleep(900);
      await ev(() => { VX.hideCursor(); VX.spot('.station-marker.lit', 18); });
    },
    async journey() {
      await ev(() => { VX.spot(null); DR.UI.toggleMapExpand(true); DR.Map.fitMapBox(); });
      await sleep(900);
      await ev(() => VX.spot('.station-marker.crossover[data-route="land"]', 16)); await sleep(1700);
      await ev(() => VX.spot('.station-marker.crossover[data-route="sea"]', 16)); await sleep(1900);
      await ev(() => VX.spot('.station-marker.final', 16)); await sleep(3000);
      await ev(() => VX.spot('.home-marker', 16));
    },
    async end() {
      await ev(() => { VX.spot(null); DR.UI.toggleMapExpand(false); DR.UI.finishGame('firstHome'); });
      await sleep(4200);
      await ev(() => VX.spot('#screen-end .podium, #screen-end [class*="podium"]', 10));
    },
    async outro() {
      await ev(() => { VX.spot(null); VX.title('<div class="lamp">🪔</div><div class="t1">一起踏上丝路吧!</div><div class="t2">需要讲解时,随时暂停</div>'); });
    },
  };

  for (const s of script) {
    const start = Date.now() / 1000;
    marks.push({ id: s.id, t: start - t0 });
    await ev(c => VX.cap(c), s.id === 'intro' || s.id === 'outro' ? '' : s.cap);
    await scenes[s.id]();
    const left = start + sceneLen(s.id) - Date.now() / 1000;
    if (left < 0) console.log('scene overran', s.id, left.toFixed(2));
    else await sleep(left * 1000);
  }
  await sleep(1200);
  const tEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await sleep(300);
  fs.writeFileSync('frames.json', JSON.stringify({ t0, tEnd, frames, marks }));
  console.log('frames', frames.length, 'fps', (frames.length / (tEnd - t0)).toFixed(1), 'errors', errs);
  await b.close();
})();
