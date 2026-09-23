/* 丝路法灯 · 游戏逻辑(状态与规则,不含 DOM 操作) */
var DR = window.DR || (window.DR = {});

DR.CONFIG.landCrossoverPos = DR.LAND_PATH.findIndex(s => s.crossover) + 1; // 1-based position
DR.CONFIG.seaCrossoverPos = DR.SEA_PATH.findIndex(s => s.crossover) + 1;

(function () {

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDeck(sourceArray) {
  return { all: sourceArray, draw: shuffle(sourceArray), discard: [] };
}

function drawFromDeck(deck) {
  if (deck.draw.length === 0) {
    deck.draw = shuffle(deck.discard.length ? deck.discard : deck.all);
    deck.discard = [];
  }
  const card = deck.draw.pop();
  deck.discard.push(card);
  return card;
}

// 存档时牌堆只记录卡牌在原数组里的下标;读档时如果数据文件被老师改过(下标失效),就重新洗一副新牌
function deckToJSON(deck) {
  const idx = c => deck.all.indexOf(c);
  return { draw: deck.draw.map(idx), discard: deck.discard.map(idx), size: deck.all.length };
}
function deckFromJSON(json, sourceArray) {
  if (!json || json.size !== sourceArray.length) return makeDeck(sourceArray);
  const ok = i => Number.isInteger(i) && i >= 0 && i < sourceArray.length;
  if (!json.draw.every(ok) || !json.discard.every(ok)) return makeDeck(sourceArray);
  return { all: sourceArray, draw: json.draw.map(i => sourceArray[i]), discard: json.discard.map(i => sourceArray[i]) };
}

function emptyBackpack() {
  const bp = {};
  DR.PARAMITAS.forEach(p => { bp[p.key] = 0; });
  return bp;
}

function backpackCount(team) {
  return DR.PARAMITAS.reduce((sum, p) => sum + team.backpack[p.key], 0);
}

function hasFullSet(team) {
  return DR.PARAMITAS.every(p => team.backpack[p.key] >= 1);
}

function paramita(key) {
  return DR.PARAMITAS.find(p => p.key === key);
}

function lampCostFor(station) {
  return station.type === 'site' ? DR.CONFIG.lampCostSite : DR.CONFIG.lampCostWay;
}

const LOG_LIMIT = 400;

DR.Game = {
  // 每回合分为四个阶段,界面顶部的进度条会随之高亮(类似大富翁的"掷骰-移动-事件-交易"流程):
  //   roll(掷骰前进) → landing(机缘/问答/剧情) → market(结缘市集:交易/点灯/换乘) → end(回合结束)
  TURN_PHASES: [
    { key: 'roll', label: '掷骰前进', icon: '🎲' },
    { key: 'landing', label: '机缘触发', icon: '✨' },
    { key: 'market', label: '集市抉择', icon: '🛕' },
    { key: 'end', label: '回合结束', icon: '➜' },
  ],

  // options:{ questionChance, challenges }(来自设置向导)
  init(setupTeams, timerMinutes, options) {
    const opts = Object.assign({
      questionChance: DR.CONFIG.questionChance,
      challenges: true,
      challengeChance: DR.CONFIG.challengeChance,
    }, options || {});
    const state = {
      teams: setupTeams.map((t, i) => ({
        id: i,
        name: t.name,
        icon: t.icon,
        color: t.color,
        route: t.route, // 'land' | 'sea'
        position: 0,    // 0 = 长安(家), 1..N = path index+1
        direction: 'out', // 'out' | 'back'
        merit: DR.CONFIG.startMerit,
        backpack: emptyBackpack(),
        backpackCap: DR.CONFIG.backpackCapacityBase,
        visited: new Set(),
        hasSwitched: false,
        completed: false,
        skipNext: false,
        correctAnswers: 0,
        challengesDone: 0,
        turnsTaken: 0,
        lampsLit: 0,
      })),
      activeIndex: 0,
      round: 1,
      bank: DR.CONFIG.bankTotal,
      timerSeconds: timerMinutes * 60,
      totalSeconds: timerMinutes * 60,
      timerRunning: false,
      sprintActive: false,
      phase: 'awaiting_roll', // awaiting_roll | ended (是否游戏已结束)
      turnPhase: 'roll',      // roll | landing | market | end (当前回合处于哪个阶段,驱动进度条)
      lastRoll: null,
      pendingQuestion: null,
      lampOwners: {},         // "route:position" -> { teamId, stationName }
      landDeck: makeDeck(DR.LAND_EVENTS),
      seaDeck: makeDeck(DR.SEA_EVENTS),
      questionDeck: makeDeck(DR.QUESTIONS),
      challengeDeck: makeDeck(DR.CHALLENGES),
      options: opts,
      history: [],            // 每轮结束时各队的总功德,用于"战况看板"与结算页的走势图
      qlog: [],               // 本局出现过的智慧问答及作答情况
      log: [],
      startedAt: Date.now(),
      soundOn: DR.CONFIG.soundDefault,
    };
    this.recordHistory(state, 0);
    this.log(state, `§ 第 1 轮`);
    return state;
  },

  activeTeam(state) {
    return state.teams[state.activeIndex];
  },

  currentStation(state, team) {
    team = team || this.activeTeam(state);
    if (team.position === 0) return null;
    const path = team.route === 'land' ? DR.LAND_PATH : DR.SEA_PATH;
    return path[team.position - 1];
  },

  setTurnPhase(state, key) {
    state.turnPhase = key;
  },

  // "§ " 开头的记录是分隔标记(例如"第 3 轮"),日志与旅程纪事里会显示成分隔条
  log(state, msg) {
    state.log.push(msg);
    if (state.log.length > LOG_LIMIT) state.log.shift();
  },

  recordHistory(state, roundNo) {
    const scores = state.teams.map(t => this.totalScore(t));
    const last = state.history[state.history.length - 1];
    if (last && last.round === roundNo) { last.scores = scores; return; }
    state.history.push({ round: roundNo, scores });
  },

  changeMerit(state, team, delta) {
    if (delta > 0) {
      const actual = Math.min(delta, state.bank);
      state.bank -= actual;
      team.merit += actual;
      return actual;
    } else if (delta < 0) {
      // 扣掉的功德回到功德库(和买残页、点灯一样),功德总量守恒
      const loss = Math.min(-delta, team.merit);
      team.merit -= loss;
      state.bank += loss;
      return -loss;
    }
    return 0;
  },

  grantFragment(state, team, key) {
    const realKey = key === 'random'
      ? DR.PARAMITAS[Math.floor(Math.random() * DR.PARAMITAS.length)].key
      : key;
    const def = paramita(realKey);
    const used = backpackCount(team);
    if (used >= team.backpackCap) {
      const gained = this.changeMerit(state, team, def.value);
      this.log(state, `${team.icon}${team.name} 行囊已满,《${def.name}》残页换成了 ${gained} 点功德。`);
      return { converted: true, meritGained: gained };
    }
    team.backpack[realKey]++;
    this.log(state, `${team.icon}${team.name} 获得一张《${def.name}》残页 ${def.icon}`);
    return { converted: false, key: realKey };
  },

  applyEffect(state, team, effect) {
    if (!effect) return;
    if (typeof effect.merit === 'number') {
      const actual = this.changeMerit(state, team, effect.merit);
      if (effect.merit > 0) this.log(state, `${team.icon}${team.name} 获得 ${actual} 点功德。`);
      else if (actual < 0) this.log(state, `${team.icon}${team.name} 损失了 ${-actual} 点功德。`);
    }
    if (effect.skipNext) {
      team.skipNext = true;
      this.log(state, `${team.icon}${team.name} 下回合需要暂停一次。`);
    }
    if (effect.backpackBonus) {
      const cap = Math.min(team.backpackCap + effect.backpackBonus, DR.CONFIG.backpackCapacityUpgraded);
      if (cap > team.backpackCap) {
        team.backpackCap = cap;
        this.log(state, `🎒 ${team.icon}${team.name} 的行囊扩充到 ${cap} 格,可以集齐六度了!`);
      }
    }
    if (effect.fragment) {
      this.grantFragment(state, team, effect.fragment);
    }
  },

  // 被"暂停一次"的队伍:回合开始时直接原地休整,不用掷骰(也不计入掷骰次数)
  resolveSkip(state) {
    const team = this.activeTeam(state);
    if (!team.skipNext) return false;
    team.skipNext = false;
    this.log(state, `${team.icon}${team.name} 暂停一回合,原地休整。`);
    return true;
  },

  rollDice(state) {
    const sides = DR.CONFIG.diceSides;
    let value = 1 + Math.floor(Math.random() * sides);
    if (state.sprintActive) value += 1;
    state.lastRoll = value;
    this.activeTeam(state).turnsTaken++;
    return value;
  },

  // 前进 + 落地结算。返回描述对象供 UI 渲染。
  moveAndResolve(state) {
    const team = this.activeTeam(state);

    if (team.skipNext) {
      team.skipNext = false;
      this.log(state, `${team.icon}${team.name} 暂停一回合,原地休整。`);
      return { skipped: true, team };
    }

    const path = team.route === 'land' ? DR.LAND_PATH : DR.SEA_PATH;
    const dice = state.lastRoll;

    if (team.direction === 'out') {
      team.position = Math.min(team.position + dice, path.length);
    } else {
      team.position = Math.max(team.position - dice, 0);
    }

    if (team.direction === 'back' && team.position === 0) {
      team.completed = true;
      const bonus = this.changeMerit(state, team, DR.CONFIG.roundTripBonus);
      this.log(state, `🎉 ${team.icon}${team.name} 回到长安,功德圆满!获得 ${bonus} 点功德奖励。`);
      return { arrivedHome: true, team };
    }

    const station = path[team.position - 1];
    const visitKey = team.route + ':' + team.position;
    const firstTime = !team.visited.has(visitKey);
    if (firstTime) {
      team.visited.add(visitKey);
    }

    const result = { team, station, visitKey, firstTime, canTrade: station.type === 'site' || station.type === 'final' };

    if (firstTime && team.position !== path.length) {
      // 终点站的奖励已包含在剧情卡中,避免重复给
      const bonus = this.changeMerit(state, team, DR.CONFIG.firstArrivalBonus);
      if (bonus > 0) this.log(state, `${team.icon}${team.name} 初至 ${station.name},获得 ${bonus} 点开路功德。`);
    }

    // 途经其他队伍点亮的法灯:双方都能获得一点随喜功德(正向的"擦肩而过"互动)
    const lampOwner = state.lampOwners[visitKey];
    if (lampOwner && lampOwner.teamId !== team.id) {
      const ownerTeam = state.teams[lampOwner.teamId];
      const visitorGain = this.changeMerit(state, team, DR.CONFIG.lampPassBonusVisitor);
      const ownerGain = this.changeMerit(state, ownerTeam, DR.CONFIG.lampPassBonusOwner);
      if (visitorGain > 0 || ownerGain > 0) {
        this.log(state, `🪔 落脚在${ownerTeam.icon}${ownerTeam.name}点亮的法灯,${team.icon}${team.name} 随喜获得 ${visitorGain} 点功德,${ownerTeam.name} 也获得 ${ownerGain} 点。`);
        result.lampBonus = { ownerTeam, visitorGain, ownerGain };
      }
    }

    const opts = state.options || {};
    if (station.type === 'story' || station.type === 'final') {
      result.type = 'story';
      result.story = station.story;
      this.applyEffect(state, team, station.story.effect);
      if (station.type === 'final' && team.direction === 'out') {
        team.direction = 'back';
        result.turnedAround = true;
        this.log(state, `🪷 ${team.icon}${team.name} 抵达那烂陀寺,开悟之后踏上归途!`);
      }
    } else if (opts.challenges && DR.CHALLENGES && DR.CHALLENGES.length && Math.random() < (opts.challengeChance || 0)) {
      result.type = 'challenge';
      result.challenge = drawFromDeck(state.challengeDeck);
      state.pendingChallenge = result.challenge;
    } else if (Math.random() < (opts.questionChance != null ? opts.questionChance : DR.CONFIG.questionChance)) {
      result.type = 'question';
      // 每次出题都打乱选项顺序,避免正确答案总在同一个位置
      const q = drawFromDeck(state.questionDeck);
      const order = shuffle(q.options.map((_, i) => i));
      result.question = { q: q.q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer), note: q.note, src: q };
      state.pendingQuestion = result.question;
    } else {
      result.type = 'event';
      const deck = team.route === 'land' ? state.landDeck : state.seaDeck;
      result.card = drawFromDeck(deck);
      this.applyEffect(state, team, result.card.effect);
      if (result.card.effect && result.card.effect.merit < 0 && result.card.positive) {
        this.log(state, `💡 ${result.card.positive}`);
      }
    }

    result.canCrossover = !!station.crossover && !team.hasSwitched && team.direction === 'out';
    result.lampCost = (station.type === 'way' || station.type === 'site') ? lampCostFor(station) : null;
    result.canLightLamp = this.canLightLamp(state, team, station, visitKey);
    return result;
  },

  answerQuestion(state, chosenIndex) {
    const team = this.activeTeam(state);
    const q = state.pendingQuestion;
    const correct = chosenIndex === q.answer;
    if (correct) {
      team.correctAnswers++;
      const gain = this.changeMerit(state, team, 4);
      this.log(state, `✅ ${team.icon}${team.name} 答对了智慧问答,获得 ${gain} 点功德!`);
      state.teams.forEach(t => {
        if (t.id !== team.id) this.changeMerit(state, t, 1);
      });
      this.log(state, `全班随喜,其他队伍各获得 1 点功德。`);
    } else {
      state.teams.forEach(t => this.changeMerit(state, t, 1));
      this.log(state, `📖 答案揭晓,全班每队获得 1 点随喜功德,继续加油!`);
    }
    state.qlog.push({ q: DR.QUESTIONS.indexOf(q.src || q), teamId: team.id, chosenText: q.options[chosenIndex], correct, round: state.round });
    state.pendingQuestion = null;
    return { correct, note: q.note, answerIndex: q.answer };
  },

  // 课堂挑战:由老师判断是否完成。完成可得功德与对应的六度残页
  resolveChallenge(state, success) {
    const team = this.activeTeam(state);
    const ch = state.pendingChallenge;
    state.pendingChallenge = null;
    if (!ch) return { ok: false };
    if (!success) {
      this.log(state, `🎯 ${team.icon}${team.name} 这次跳过了"${ch.title}"挑战,下次再试!`);
      return { ok: true, success: false };
    }
    team.challengesDone++;
    const gain = this.changeMerit(state, team, DR.CONFIG.challengeReward);
    this.log(state, `🎯 ${team.icon}${team.name} 完成课堂挑战"${ch.title}",获得 ${gain} 点功德!`);
    const frag = this.grantFragment(state, team, ch.paramita);
    return { ok: true, success: true, gain, frag };
  },

  // ---- 结缘(交易)----
  buyFragment(state, key) {
    const team = this.activeTeam(state);
    const def = paramita(key);
    if (team.merit < def.buyCost) return { ok: false, reason: '功德不足' };
    if (backpackCount(team) >= team.backpackCap) return { ok: false, reason: '行囊已满' };
    team.merit -= def.buyCost;
    state.bank += def.buyCost;
    team.backpack[key]++;
    this.log(state, `${team.icon}${team.name} 以 ${def.buyCost} 点功德换得《${def.name}》残页 ${def.icon}`);
    return { ok: true };
  },

  // 以法结缘每回合限一次:否则"买便宜残页 → 换成贵的 → 兑换功德"可以无限循环刷功德
  swapFragment(state, giveKey, takeKey) {
    const team = this.activeTeam(state);
    if (state.swapUsed) return { ok: false, reason: '本回合已经结缘过了' };
    if (giveKey === takeKey) return { ok: false, reason: '换的是同一种残页' };
    if (team.backpack[giveKey] <= 0) return { ok: false, reason: '没有可交换的残页' };
    state.swapUsed = true;
    team.backpack[giveKey]--;
    team.backpack[takeKey]++;
    const g = paramita(giveKey);
    const t = paramita(takeKey);
    this.log(state, `${team.icon}${team.name} 以《${g.name}》结缘换得《${t.name}》`);
    return { ok: true };
  },

  sellFragments(state, keys) {
    const team = this.activeTeam(state);
    if (!keys.length) return { ok: false, reason: '未选择残页' };
    for (const k of keys) {
      if (team.backpack[k] <= 0) return { ok: false, reason: '数量不足' };
    }
    const uniqueKeys = new Set(keys);
    const isFullSet = DR.PARAMITAS.every(p => uniqueKeys.has(p.key)) && keys.length === DR.PARAMITAS.length;
    let value = keys.reduce((sum, k) => sum + paramita(k).value, 0);
    if (isFullSet) value += DR.CONFIG.fullSetBonus;
    keys.forEach(k => { team.backpack[k]--; });
    const gained = this.changeMerit(state, team, value);
    this.log(state, `${team.icon}${team.name} 译讲弘法,兑换 ${keys.length} 张残页获得 ${gained} 点功德${isFullSet ? '(集齐六度!)' : ''}`);
    return { ok: true, gained, isFullSet };
  },

  // ---- 驿站点灯(市集阶段的"投资"玩法,类似大富翁买地,但奖励是双向、正向的) ----
  canLightLamp(state, team, station, key) {
    if (!station || (station.type !== 'way' && station.type !== 'site')) return false;
    if (state.lampOwners[key]) return false;
    if (team.lampsLit >= DR.CONFIG.lampMaxPerTeam) return false;
    return team.merit >= lampCostFor(station);
  },

  lightLamp(state, key, station) {
    const team = this.activeTeam(state);
    if (!this.canLightLamp(state, team, station, key)) return { ok: false };
    const cost = lampCostFor(station);
    team.merit -= cost;
    state.bank += cost;
    state.lampOwners[key] = { teamId: team.id, stationName: station.name };
    team.lampsLit++;
    this.log(state, `${team.icon}${team.name} 在${station.name}点亮了一盏法灯 🪔(花费 ${cost} 功德)`);
    return { ok: true, cost };
  },

  attemptCrossover(state) {
    const team = this.activeTeam(state);
    const station = this.currentStation(state, team);
    if (!station || !station.crossover || team.hasSwitched || team.direction !== 'out') return { ok: false };
    team.route = team.route === 'land' ? 'sea' : 'land';
    team.position = team.route === 'land' ? DR.CONFIG.landCrossoverPos : DR.CONFIG.seaCrossoverPos;
    team.hasSwitched = true;
    const visitKey = team.route + ':' + team.position;
    team.visited.add(visitKey);
    this.log(state, `${team.icon}${team.name} 在此改换了${team.route === 'land' ? '陆路(骆驼)' : '海路(商船)'}!`);
    const newStation = this.currentStation(state, team);
    // 换乘后站在新站点上:集市里的结缘 / 点灯按钮要按新站点重新计算
    return {
      ok: true, newRoute: team.route, station: newStation, visitKey,
      canTrade: newStation.type === 'site' || newStation.type === 'final',
      lampCost: (newStation.type === 'way' || newStation.type === 'site') ? lampCostFor(newStation) : null,
    };
  },

  allCompleted(state) {
    return state.teams.every(t => t.completed);
  },

  isAutoTurn(state) {
    return this.activeTeam(state).completed;
  },

  autoResolveTurn(state) {
    const team = this.activeTeam(state);
    const gain = this.changeMerit(state, team, 1);
    this.log(state, `${team.icon}${team.name} 已功德圆满,在长安弘法讲经 +${gain}`);
  },

  // 轮到下一队;返回 true 表示开始了新的一轮
  nextTeam(state) {
    state.activeIndex = (state.activeIndex + 1) % state.teams.length;
    state.phase = 'awaiting_roll';
    state.turnPhase = 'roll';
    state.lastRoll = null;
    state.swapUsed = false;
    if (state.activeIndex === 0) {
      this.recordHistory(state, state.round);
      state.round++;
      this.log(state, `§ 第 ${state.round} 轮`);
      return true;
    }
    return false;
  },

  bankEmpty(state) {
    return state.bank <= 0;
  },

  // 残页总价值(含集齐六度奖励)——排行榜、队伍详情、结算页共用同一套算法。
  fragmentValue(team) {
    const fullSet = hasFullSet(team);
    return DR.PARAMITAS.reduce((sum, p) => sum + p.value * team.backpack[p.key], 0) + (fullSet ? DR.CONFIG.fullSetBonus : 0);
  },

  totalScore(team) {
    return team.merit + this.fragmentValue(team);
  },

  // 某队在哪些站点点亮过法灯(用于队伍详情面板展示)。
  teamLampStations(state, team) {
    return Object.values(state.lampOwners)
      .filter(o => o.teamId === team.id)
      .map(o => o.stationName);
  },

  journeyProgressPct(team) {
    if (team.completed) return 100;
    const path = team.route === 'land' ? DR.LAND_PATH : DR.SEA_PATH;
    const frac = path.length ? team.position / path.length : 0;
    return Math.round(team.direction === 'back' ? 50 + (1 - frac) * 50 : frac * 50);
  },

  computeResults(state) {
    const rows = state.teams.map(team => {
      const fragCount = backpackCount(team);
      const fullSet = hasFullSet(team);
      const fragValue = this.fragmentValue(team);
      return {
        team,
        fragCount,
        fullSet,
        fragValue,
        total: team.merit + fragValue,
      };
    }).sort((a, b) => b.total - a.total);

    const badges = rows.map(() => []);
    if (rows.length) badges[0].push('🏆 功德第一');

    let bestWisdomIdx = -1, bestWisdom = 0;
    let bestVigorIdx = -1, bestVigor = -1;
    let bestLampIdx = -1, bestLamp = 0;
    let bestChallengeIdx = -1, bestChallenge = 0;
    rows.forEach((r, i) => {
      if (r.team.correctAnswers > bestWisdom) { bestWisdom = r.team.correctAnswers; bestWisdomIdx = i; }
      if (r.team.turnsTaken > bestVigor) { bestVigor = r.team.turnsTaken; bestVigorIdx = i; }
      if (r.team.lampsLit > bestLamp) { bestLamp = r.team.lampsLit; bestLampIdx = i; }
      if ((r.team.challengesDone || 0) > bestChallenge) { bestChallenge = r.team.challengesDone; bestChallengeIdx = i; }
      if (r.team.completed) badges[i].push('🌸 圆满奖(完成往返)');
    });
    if (bestWisdomIdx >= 0 && bestWisdom > 0) badges[bestWisdomIdx].push('💡 智慧奖');
    if (bestVigorIdx >= 0 && bestVigor > 0) badges[bestVigorIdx].push('🔥 精进奖');
    if (bestLampIdx >= 0 && bestLamp > 0) badges[bestLampIdx].push('🪔 点灯奖');
    if (bestChallengeIdx >= 0 && bestChallenge > 0) badges[bestChallengeIdx].push('🎯 互动之星');
    if (rows.length > 1) badges[rows.length - 1].push('🌿 毅力奖');

    // 规则承诺"每队至少一项称号":还没有称号的队伍,按它最突出的表现补一个正向称号
    rows.forEach((r, i) => {
      if (badges[i].length) return;
      const t = r.team;
      if ((t.challengesDone || 0) > 0) badges[i].push('🎯 课堂之星');
      else if (t.correctAnswers > 0) badges[i].push('💡 好学奖');
      else if (t.lampsLit > 0) badges[i].push('🪔 护灯人');
      else if (r.fragCount >= 3) badges[i].push('🎴 集卡达人');
      else if (t.hasSwitched) badges[i].push('⇄ 换乘探险家');
      else badges[i].push(t.route === 'sea' ? '⛵ 远航者' : '🐫 丝路行者');
    });

    return rows.map((r, i) => ({ ...r, badges: badges[i] }));
  },

  backpackTotal(team) {
    return backpackCount(team);
  },

  // ---- 存档 / 读档(自动存档在每回合开始时进行) ----
  serialize(state) {
    return {
      teams: state.teams.map(t => ({ ...t, visited: Array.from(t.visited), backpack: { ...t.backpack } })),
      activeIndex: state.activeIndex,
      round: state.round,
      bank: state.bank,
      timerSeconds: state.timerSeconds,
      totalSeconds: state.totalSeconds,
      sprintActive: state.sprintActive,
      lampOwners: state.lampOwners,
      decks: {
        land: deckToJSON(state.landDeck),
        sea: deckToJSON(state.seaDeck),
        question: deckToJSON(state.questionDeck),
        challenge: deckToJSON(state.challengeDeck),
      },
      options: state.options,
      history: state.history,
      qlog: state.qlog,
      log: state.log,
      startedAt: state.startedAt,
    };
  },

  deserialize(data) {
    if (!data || !Array.isArray(data.teams) || !data.teams.length) return null;
    const state = {
      teams: data.teams.map((t, i) => ({
        ...t,
        id: i,
        visited: new Set(t.visited || []),
        backpack: Object.assign(emptyBackpack(), t.backpack || {}),
        challengesDone: t.challengesDone || 0,
      })),
      activeIndex: Math.min(data.activeIndex || 0, data.teams.length - 1),
      round: data.round || 1,
      bank: data.bank,
      timerSeconds: data.timerSeconds,
      totalSeconds: data.totalSeconds || data.timerSeconds,
      timerRunning: false,
      sprintActive: !!data.sprintActive,
      phase: 'awaiting_roll',
      turnPhase: 'roll',
      lastRoll: null,
      pendingQuestion: null,
      pendingChallenge: null,
      lampOwners: data.lampOwners || {},
      landDeck: deckFromJSON(data.decks && data.decks.land, DR.LAND_EVENTS),
      seaDeck: deckFromJSON(data.decks && data.decks.sea, DR.SEA_EVENTS),
      questionDeck: deckFromJSON(data.decks && data.decks.question, DR.QUESTIONS),
      challengeDeck: deckFromJSON(data.decks && data.decks.challenge, DR.CHALLENGES),
      options: data.options || {},
      history: data.history || [],
      qlog: data.qlog || [],
      log: data.log || [],
      startedAt: data.startedAt || Date.now(),
      soundOn: true,
    };
    return state;
  },
};

})();
