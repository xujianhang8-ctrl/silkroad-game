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

DR.Game = {
  // 每回合分为四个阶段,界面顶部的进度条会随之高亮(类似大富翁的"掷骰-移动-事件-交易"流程):
  //   roll(掷骰前进) → landing(机缘/问答/剧情) → market(结缘市集:交易/点灯/换乘) → end(回合结束)
  TURN_PHASES: [
    { key: 'roll', label: '掷骰前进', icon: '🎲' },
    { key: 'landing', label: '机缘触发', icon: '✨' },
    { key: 'market', label: '集市抉择', icon: '🛕' },
    { key: 'end', label: '回合结束', icon: '➜' },
  ],

  init(setupTeams, timerMinutes) {
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
        turnsTaken: 0,
        lampsLit: 0,
      })),
      activeIndex: 0,
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
      log: [],
      soundOn: DR.CONFIG.soundDefault,
    };
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

  log(state, msg) {
    state.log.push(msg);
    if (state.log.length > 60) state.log.shift();
  },

  changeMerit(state, team, delta) {
    if (delta > 0) {
      const actual = Math.min(delta, state.bank);
      state.bank -= actual;
      team.merit += actual;
      return actual;
    } else if (delta < 0) {
      const loss = Math.min(-delta, team.merit);
      team.merit -= loss;
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
    if (effect.fragment) {
      this.grantFragment(state, team, effect.fragment);
    }
    if (effect.skipNext) {
      team.skipNext = true;
      this.log(state, `${team.icon}${team.name} 下回合需要暂停一次。`);
    }
    if (effect.backpackBonus) {
      team.backpackCap += effect.backpackBonus;
      this.log(state, `${team.icon}${team.name} 的行囊容量增加了!`);
    }
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
        this.log(state, `🪔 路过${ownerTeam.icon}${ownerTeam.name}点亮的法灯,${team.icon}${team.name} 随喜获得 ${visitorGain} 点功德,${ownerTeam.name} 也获得 ${ownerGain} 点。`);
        result.lampBonus = { ownerTeam, visitorGain, ownerGain };
      }
    }

    if (station.type === 'story' || station.type === 'final') {
      result.type = 'story';
      result.story = station.story;
      this.applyEffect(state, team, station.story.effect);
      if (station.type === 'final' && team.direction === 'out') {
        team.direction = 'back';
        result.turnedAround = true;
      }
    } else if (Math.random() < DR.CONFIG.questionChance) {
      result.type = 'question';
      result.question = drawFromDeck(state.questionDeck);
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
    state.pendingQuestion = null;
    return { correct, note: q.note, answerIndex: q.answer };
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

  swapFragment(state, giveKey, takeKey) {
    const team = this.activeTeam(state);
    if (team.backpack[giveKey] <= 0) return { ok: false, reason: '没有可交换的残页' };
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
    if (!station || !station.crossover || team.hasSwitched) return { ok: false };
    team.route = team.route === 'land' ? 'sea' : 'land';
    team.position = team.route === 'land' ? DR.CONFIG.landCrossoverPos : DR.CONFIG.seaCrossoverPos;
    team.hasSwitched = true;
    team.visited.add(team.route + ':' + team.position);
    this.log(state, `${team.icon}${team.name} 在此改换了${team.route === 'land' ? '陆路(骆驼)' : '海路(商船)'}!`);
    return { ok: true, newRoute: team.route };
  },

  isAutoTurn(state) {
    return this.activeTeam(state).completed;
  },

  autoResolveTurn(state) {
    const team = this.activeTeam(state);
    const gain = this.changeMerit(state, team, 1);
    this.log(state, `${team.icon}${team.name} 已功德圆满,在长安弘法讲经 +${gain}`);
  },

  nextTeam(state) {
    state.activeIndex = (state.activeIndex + 1) % state.teams.length;
    state.phase = 'awaiting_roll';
    state.turnPhase = 'roll';
    state.lastRoll = null;
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
    rows.forEach((r, i) => {
      if (r.team.correctAnswers > bestWisdom) { bestWisdom = r.team.correctAnswers; bestWisdomIdx = i; }
      if (r.team.turnsTaken > bestVigor) { bestVigor = r.team.turnsTaken; bestVigorIdx = i; }
      if (r.team.lampsLit > bestLamp) { bestLamp = r.team.lampsLit; bestLampIdx = i; }
      if (r.team.completed) badges[i].push('🌸 圆满奖(完成往返)');
    });
    if (bestWisdomIdx >= 0 && bestWisdom > 0) badges[bestWisdomIdx].push('💡 智慧奖');
    if (bestVigorIdx >= 0 && bestVigor > 0) badges[bestVigorIdx].push('🔥 精进奖');
    if (bestLampIdx >= 0 && bestLamp > 0) badges[bestLampIdx].push('🪔 点灯奖');
    if (rows.length > 1) badges[rows.length - 1].push('🌿 毅力奖');

    return rows.map((r, i) => ({ ...r, badges: badges[i] }));
  },

  backpackTotal(team) {
    return backpackCount(team);
  },
};

})();
