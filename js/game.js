/* 丝路法灯 · 游戏逻辑(状态与规则,不含 DOM 操作) */
var DR = window.DR || (window.DR = {});

(function () {

// 可复现的随机数:同一个种子总是生成同样的村落,存档只需要记住种子
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffledNames(parts, rand) {
  const names = [];
  parts.prefix.forEach(pf => parts.suffix.forEach(sf => names.push(pf + sf)));
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names;
}

// 棋盘版本:新游戏用最新一版;存档里记着自己是哪一版,读档时按那一版还原,棋子和法灯的位置才对得上。
//   1:每一段随机 min–max 个村落(最早的存档)
//   2:陆路、海路补到同样的步数,村落按路程分配
//   3:海路加入 6 个真实港口(站点带 since: 3),两条路线的城市一样多
const BOARD_VERSION = 3;

// 某一版棋盘上的城市(不含村落):后来加进来的站点(since 比这一版新)不算
function citiesFor(route, version) {
  const all = route === 'land' ? DR.LAND_PATH : DR.SEA_PATH;
  return all.filter(st => !st.since || st.since <= version);
}

// 生成本局棋盘:在长安与第一座城之间、以及每两座城之间,随机插入若干个小村落。
// 村落正好落在两城之间的路线上,因此地图上的路线不用改动。
// version ≥ 2(新游戏):陆路、海路都补到同样的步数(旅程长度的 steps),村落按每一段在地图上的路程分配,
//   路越远的一段村落越多(再加一点随机,每局都不一样);每个村落带上风土 region,决定村名和见闻卡。
// version 1(旧存档):每一段随机 min–max 个村落。保留原算法,旧存档才能还原出同一张棋盘。
function buildBoard(lengthKey, seed, version) {
  const len = DR.JOURNEY_LENGTHS.find(j => j.key === lengthKey) || DR.JOURNEY_LENGTHS[0];
  if (version >= 2 && len.steps) return buildBoardV2(len, seed, version);
  return buildBoardV1(len, seed);
}

function buildBoardV2(len, seed, version) {
  const rand = mulberry32(seed || 1);
  const pools = {};
  const nameFor = region => {
    const parts = DR.VILLAGE_NAME_PARTS[region] || DR.VILLAGE_NAME_PARTS.land;
    if (!pools[region]) pools[region] = shuffledNames(parts, rand);
    return pools[region].pop() || '无名村';
  };
  const board = {};
  ['land', 'sea'].forEach(route => {
    const cities = citiesFor(route, version);
    const total = Math.max(0, len.steps - cities.length);
    let prev = DR.HOME_COORD;
    const weights = cities.map(city => {
      const d = Math.hypot(city.x - prev.x, city.y - prev.y);
      prev = city;
      return d * (0.7 + 0.6 * rand());
    });
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const quota = weights.map(w => total * w / sum);
    const count = quota.map(Math.floor);
    const left = total - count.reduce((a, b) => a + b, 0);
    quota.map((q, i) => [q - count[i], i]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => { count[i]++; });
    const out = [];
    prev = DR.HOME_COORD;
    cities.forEach((city, i) => {
      const region = city.villages || route;
      const parts = DR.VILLAGE_NAME_PARTS[region] || DR.VILLAGE_NAME_PARTS[route];
      for (let v = 1; v <= count[i]; v++) {
        const t = v / (count[i] + 1);
        out.push({
          name: nameFor(region), type: 'village', route, region,
          x: Math.round((prev.x + (city.x - prev.x) * t) * 10) / 10,
          y: Math.round((prev.y + (city.y - prev.y) * t) * 10) / 10,
          blurb: parts.blurb,
        });
      }
      out.push(city);
      prev = city;
    });
    board[route] = out;
  });
  return board;
}

function buildBoardV1(len, seed) {
  const rand = mulberry32(seed || 1);
  const board = {};
  ['land', 'sea'].forEach(route => {
    const cities = citiesFor(route, 1);
    const parts = DR.VILLAGE_NAME_PARTS[route];
    const names = [];
    parts.prefix.forEach(pf => parts.suffix.forEach(sf => names.push(pf + sf)));
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const out = [];
    let prev = DR.HOME_COORD;
    cities.forEach(city => {
      const k = len.max ? len.min + Math.floor(rand() * (len.max - len.min + 1)) : 0;
      for (let v = 1; v <= k; v++) {
        const t = v / (k + 1);
        out.push({
          name: names.pop() || '无名村', type: 'village', route,
          x: Math.round((prev.x + (city.x - prev.x) * t) * 10) / 10,
          y: Math.round((prev.y + (city.y - prev.y) * t) * 10) / 10,
          blurb: parts.blurb,
        });
      }
      out.push(city);
      prev = city;
    });
    board[route] = out;
  });
  return board;
}

function useBoard(state) {
  const j = state.journey || { length: 'short', seed: 1 };
  DR.BOARD = buildBoard(j.length, j.seed, j.v);
}

function pathFor(route) {
  const b = DR.BOARD;
  if (b && b[route]) return b[route];
  return citiesFor(route, BOARD_VERSION);
}

function crossoverPos(route) {
  return pathFor(route).findIndex(s => s.crossover) + 1; // 1-based position
}

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
  if (!json || !Array.isArray(json.draw) || !Array.isArray(json.discard)) return makeDeck(sourceArray);
  if (!(json.size <= sourceArray.length)) return makeDeck(sourceArray);
  const ok = i => Number.isInteger(i) && i >= 0 && i < json.size;
  if (!json.draw.every(ok) || !json.discard.every(ok)) return makeDeck(sourceArray);
  const draw = json.draw.map(i => sourceArray[i]);
  // 存档之后新版本在最后追加的卡(比如新港口配套的问答):随机洗进还没抽的牌里,已经出过的题不会马上重复
  sourceArray.slice(json.size).forEach(card => draw.splice(Math.floor(Math.random() * (draw.length + 1)), 0, card));
  return { all: sourceArray, draw, discard: json.discard.map(i => sourceArray[i]) };
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

// 开路功德:两条路线城市一样多时,每座新城都一样(DR.CONFIG.firstArrivalBonus)。
// 城市不一样多时(旧存档的海路只有 13 座城,或老师改过站点),城少的路线按比例多给一点,一路下来拿到的差不多。
function arrivalBonusFor(route) {
  const base = DR.CONFIG.firstArrivalBonus;
  const count = r => pathFor(r).filter(st => st.type !== 'village' && st.type !== 'final').length;
  const mine = count(route), most = Math.max(count('land'), count('sea'));
  return mine ? Math.round(base * most / mine) : base;
}

// 法灯随喜的倍数:这条路线上(现在)走的队伍越少,别队停下来的机会就越少,所以每次给得多一些
function lampMultiplierFor(state, route) {
  const c = DR.CONFIG;
  const teamsHere = state.teams.filter(t => t.route === route).length;
  return c.lampLonelyRouteMultiplier && teamsHere <= (c.lampLonelyRouteTeams || 0) ? c.lampLonelyRouteMultiplier : 1;
}

// 第 n 个(从 0 起)回到长安的队伍得到的奖励
function homeBonusFor(order) {
  const list = DR.CONFIG.homeBonuses || [15];
  return list[Math.min(order, list.length - 1)];
}

// 村落见闻:每种风土一副牌。村落没有风土(旧存档)时按路线取 land / sea
function villageRegions() { return Object.keys(DR.VILLAGE_EVENTS || {}); }
function makeVillageDecks() {
  const decks = {};
  villageRegions().forEach(r => { if (DR.VILLAGE_EVENTS[r].length) decks[r] = makeDeck(DR.VILLAGE_EVENTS[r]); });
  return decks;
}
function villageDecksToJSON(decks) {
  const out = {};
  Object.keys(decks || {}).forEach(r => { out[r] = deckToJSON(decks[r]); });
  return out;
}
function villageDecksFromJSON(json) {
  const decks = {};
  villageRegions().forEach(r => {
    if (DR.VILLAGE_EVENTS[r].length) decks[r] = deckFromJSON(json && json[r], DR.VILLAGE_EVENTS[r]);
  });
  return decks;
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

  // 当前这一局的路线(城市 + 沿途村落);地图、棋子、进度条都用它
  path(route) { return pathFor(route); },
  buildBoard,
  BOARD_VERSION,
  citiesFor,
  // 某条路线上的城市(不含村落)。latest=true:按最新一版的站点表(主菜单、百科、出发准备);
  // 否则按当前这一局的棋盘(旧存档的海路没有后来加的港口,地图上的航线也要跟着它画)
  cities(route, latest) {
    if (latest || !DR.BOARD || !DR.BOARD[route]) return citiesFor(route, BOARD_VERSION);
    return DR.BOARD[route].filter(st => st.type !== 'village');
  },
  arrivalBonusFor,
  lampMultiplierFor,

  // options:{ questionChance, challenges, journey, endMode }(来自设置向导)
  // 没有倒计时:游戏在队伍回到长安时结束(endMode:'all' 全部回来 / 'first' 第一队回来后打完这一轮),
  // 老师也可以随时点"结束"。
  init(setupTeams, options) {
    const opts = Object.assign({
      questionChance: DR.CONFIG.questionChance,
      challenges: true,
      challengeChance: DR.CONFIG.challengeChance,
      journey: 'long',
      endMode: 'all',
    }, options || {});
    const bank = this.bankFor(opts.journey, setupTeams.length);
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
        stepsTaken: 0,    // 一共走了多少步(精进奖)
        homeOrder: null,  // 回到长安的名次(0 起;同一轮回来的队伍名次相同)
        homeRound: null,  // 第几轮回到长安
        lampsLit: 0,
        lampMerit: 0,     // 供在法灯里的功德(法灯长明:结算时计入总功德)
      })),
      activeIndex: 0,
      round: 1,
      bank,
      bankStart: bank,
      elapsedSeconds: 0,      // 已用时间(正计时,暂停时不走)
      finalRound: false,      // endMode='first' 时:有队伍回到长安后进入"最后一轮"
      phase: 'awaiting_roll', // awaiting_roll | ended (是否游戏已结束)
      turnPhase: 'roll',      // roll | landing | market | end (当前回合处于哪个阶段,驱动进度条)
      lastRoll: null,
      pendingQuestion: null,
      lampOwners: {},         // "route:position" -> { teamId, stationName }
      landDeck: makeDeck(DR.LAND_EVENTS),
      seaDeck: makeDeck(DR.SEA_EVENTS),
      questionDeck: makeDeck(DR.QUESTIONS),
      challengeDeck: makeDeck(DR.CHALLENGES),
      villageDecks: makeVillageDecks(),
      options: opts,
      journey: { length: opts.journey, seed: 1 + Math.floor(Math.random() * 2147483000), v: BOARD_VERSION },
      history: [],            // 每轮结束时各队的总功德,用于"战况看板"与结算页的走势图
      qlog: [],               // 本局出现过的智慧问答及作答情况
      log: [],
      startedAt: Date.now(),
      soundOn: DR.CONFIG.soundDefault,
    };
    useBoard(state);
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
    return pathFor(team.route)[team.position - 1];
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

  // 返回 { bagExpanded, bagAlreadyMax }:卡面据此显示"行囊扩充"或"行囊已经是最大的了"
  applyEffect(state, team, effect) {
    const out = {};
    if (!effect) return out;
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
        out.bagExpanded = true;
        this.log(state, `🎒 ${team.icon}${team.name} 的行囊扩充到 ${cap} 格,可以集齐六度了!`);
      } else {
        out.bagAlreadyMax = true;
      }
    }
    if (effect.fragment) {
      this.grantFragment(state, team, effect.fragment);
    }
    return out;
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
    const value = 1 + Math.floor(Math.random() * sides);
    state.lastRoll = value;
    this.activeTeam(state).turnsTaken++;
    return value;
  },

  // 功德库大小:按旅程长度与队伍数配置,足够撑到大家回到长安(只在极端情况下才会提前耗尽)
  bankFor(journeyKey, nTeams) {
    const len = DR.JOURNEY_LENGTHS.find(j => j.key === journeyKey) || DR.JOURNEY_LENGTHS[0];
    return Math.max(DR.CONFIG.bankTotal, Math.round(len.turns * nTeams * DR.CONFIG.bankPerTeamTurn / 10) * 10);
  },

  // 这次掷骰的行程(只计算,不改动状态):
  //   target —— 会走到哪里(掷几点走几步)
  //   stops  —— 路上经过的圣地:可以选择在圣地提前停下结缘(这是真正的取舍:结缘 还是 多走几步)
  //   其他城市路过就好:路过也算到访,开路功德照拿;剧情站路过也会触发剧情,所以不会因为点数大而"错过"什么。
  planMove(state) {
    const team = this.activeTeam(state);
    const path = pathFor(team.route);
    const plan = { from: team.position, target: team.position, stops: [] };
    if (team.skipNext || team.completed || state.lastRoll == null) return plan;
    plan.target = this.targetPosition(state);
    const step = team.direction === 'out' ? 1 : -1;
    for (let p = team.position + step; p !== plan.target; p += step) {
      if (p <= 0 || p > path.length) break;
      if (path[p - 1].type === 'site') plan.stops.push({ position: p, station: path[p - 1] });
    }
    return plan;
  },

  // 路过一座城(没有停下):第一次路过也算到访,拿开路功德;第一次路过剧情站,照样听到剧情(剧情卡的奖励照给);
  // 路过别队的法灯,点灯的队伍得到随喜功德(默认不给,见 DR.CONFIG)。
  // 返回这座城带来的收获(没有收获时返回 null),UI 用它在地图上飘出"+2"之类的提示、补放剧情卡。
  passThrough(state, team, pos, station) {
    const key = team.route + ':' + pos;
    const gain = { position: pos, station, arrival: 0, lamp: null, story: null };
    if (!team.visited.has(key)) {
      team.visited.add(key);
      if (pos !== pathFor(team.route).length) gain.arrival = this.changeMerit(state, team, arrivalBonusFor(team.route));
      if (gain.arrival > 0) this.log(state, `${team.icon}${team.name} 路过${station.name},获得 ${gain.arrival} 点开路功德。`);
      if (station.type === 'story' && station.story) {
        this.log(state, `⭐ ${team.icon}${team.name} 途经${station.name}:${station.story.title}`);
        gain.story = Object.assign({ story: station.story }, this.applyEffect(state, team, station.story.effect));
      }
    }
    const owner = state.lampOwners[key];
    if (owner && owner.teamId !== team.id) {
      const ownerTeam = state.teams[owner.teamId];
      const mult = lampMultiplierFor(state, team.route);
      const ownerGain = this.changeMerit(state, ownerTeam, (DR.CONFIG.lampPassOwner || 0) * mult);
      const visitorGain = this.changeMerit(state, team, (DR.CONFIG.lampPassVisitor || 0) * mult);
      if (ownerGain > 0 || visitorGain > 0) {
        gain.lamp = { ownerTeam, ownerGain, visitorGain };
        this.log(state, `🪔 ${team.icon}${team.name} 路过${ownerTeam.icon}${ownerTeam.name}点亮的法灯,${ownerTeam.name} 随喜获得 ${ownerGain} 点功德。`);
      }
    }
    return gain.arrival > 0 || gain.lamp || gain.story ? gain : null;
  },

  drawVillageCard(state, station) {
    if (!state.villageDecks) state.villageDecks = makeVillageDecks();
    const decks = state.villageDecks;
    const deck = decks[station.region] || decks[station.route] || decks.land;
    return deck ? drawFromDeck(deck) : { title: '歇脚', text: '商队在村里歇了歇脚。', effect: { merit: 1 } };
  },

  targetPosition(state) {
    const team = this.activeTeam(state);
    const path = pathFor(team.route);
    return team.direction === 'out'
      ? Math.min(team.position + state.lastRoll, path.length)
      : Math.max(team.position - state.lastRoll, 0);
  },

  // 前进 + 落地结算。stopAt:可选,在路过的圣地提前停下(必须是 planMove().stops 里的位置)。
  // 返回描述对象供 UI 渲染;passed 列出一路上路过的城带来的收获(开路功德、别队法灯)。
  moveAndResolve(state, stopAt) {
    const team = this.activeTeam(state);

    if (team.skipNext) {
      team.skipNext = false;
      this.log(state, `${team.icon}${team.name} 暂停一回合,原地休整。`);
      return { skipped: true, team };
    }

    const path = pathFor(team.route);
    const plan = this.planMove(state);
    const early = stopAt != null && plan.stops.some(c => c.position === stopAt);
    const dest = early ? stopAt : plan.target;
    const from = team.position;
    const step = team.direction === 'out' ? 1 : -1;
    const passed = [];
    for (let p = from + step; p !== dest; p += step) {
      if (p <= 0 || p > path.length) break;
      if (path[p - 1].type === 'village') continue;
      const gain = this.passThrough(state, team, p, path[p - 1]);
      if (gain) passed.push(gain);
    }
    team.position = dest;
    team.stepsTaken = (team.stepsTaken || 0) + Math.abs(dest - from);
    if (early) this.log(state, `${team.icon}${team.name} 选择在${path[stopAt - 1].name}停下结缘。`);

    if (team.direction === 'back' && team.position === 0) {
      // 名次按"第几轮回来"算:同一轮回来的队伍名次相同(不会因为本轮先掷骰就多拿奖励)
      const order = state.teams.filter(t => t.completed && (t.homeRound == null || t.homeRound < state.round)).length;
      team.completed = true;
      team.homeOrder = order;
      team.homeRound = state.round;
      const bonus = this.changeMerit(state, team, homeBonusFor(order));
      this.log(state, `🎉 ${team.icon}${team.name} 第 ${order + 1} 个回到长安,功德圆满!获得 ${bonus} 点功德奖励。`);
      const startsFinalRound = state.options.endMode === 'first' && !state.finalRound;
      if (startsFinalRound) {
        state.finalRound = true;
        this.log(state, `🏁 ${team.name} 第一个回到长安:这一轮结束后游戏结算。`);
      }
      return { arrivedHome: true, team, startsFinalRound, passed, homeOrder: order, homeBonus: bonus };
    }

    const station = path[team.position - 1];
    const visitKey = team.route + ':' + team.position;
    const firstTime = !team.visited.has(visitKey);

    const result = { team, station, visitKey, firstTime, passed, canTrade: station.type === 'site' || station.type === 'final' };

    // 沿途村落:抽一张"村落见闻"(一句丝路生活小知识 + 一点小奖励),读完就轮到下一队
    if (station.type === 'village') {
      result.type = 'village';
      result.card = this.drawVillageCard(state, station);
      Object.assign(result, this.applyEffect(state, team, result.card.effect));
      this.log(state, `🏡 ${team.icon}${team.name} 在${station.name}歇脚:${result.card.title}`);
      return Object.assign(result, { canTrade: false, canCrossover: false, lampCost: null, canLightLamp: false });
    }

    if (firstTime) {
      team.visited.add(visitKey);
      if (team.position !== path.length) {
        // 终点站的奖励已包含在剧情卡中,避免重复给
        const bonus = this.changeMerit(state, team, arrivalBonusFor(team.route));
        if (bonus > 0) this.log(state, `${team.icon}${team.name} 初至 ${station.name},获得 ${bonus} 点开路功德。`);
        result.arrivalBonus = bonus;
      }
    }

    // 停在其他队伍点亮的法灯:双方都能获得随喜功德(正向的"结缘"互动)
    const lampOwner = state.lampOwners[visitKey];
    if (lampOwner && lampOwner.teamId !== team.id) {
      const ownerTeam = state.teams[lampOwner.teamId];
      const mult = lampMultiplierFor(state, team.route);
      const visitorGain = this.changeMerit(state, team, DR.CONFIG.lampLandVisitor * mult);
      const ownerGain = this.changeMerit(state, ownerTeam, DR.CONFIG.lampLandOwner * mult);
      if (visitorGain > 0 || ownerGain > 0) {
        this.log(state, `🪔 落脚在${ownerTeam.icon}${ownerTeam.name}点亮的法灯,${team.icon}${team.name} 随喜获得 ${visitorGain} 点功德,${ownerTeam.name} 也获得 ${ownerGain} 点。`);
        result.lampBonus = { ownerTeam, visitorGain, ownerGain };
      }
    }

    const opts = state.options || {};
    // 剧情只在第一次到访时触发;归途再停在剧情站,就和普通驿站一样抽卡(剧情奖励不会领两次)
    if ((station.type === 'story' && firstTime) || station.type === 'final') {
      result.type = 'story';
      result.story = station.story;
      Object.assign(result, this.applyEffect(state, team, station.story.effect));
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
      Object.assign(result, this.applyEffect(state, team, result.card.effect));
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
    team.lampMerit = (team.lampMerit || 0) + cost;
    this.log(state, `${team.icon}${team.name} 在${station.name}点亮了一盏法灯 🪔(花费 ${cost} 功德)`);
    return { ok: true, cost };
  },

  attemptCrossover(state) {
    const team = this.activeTeam(state);
    const station = this.currentStation(state, team);
    if (!station || !station.crossover || team.hasSwitched || team.direction !== 'out') return { ok: false };
    team.route = team.route === 'land' ? 'sea' : 'land';
    team.position = crossoverPos(team.route);
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

  // 是否该结算了(不含老师手动结束):都在这一轮打完时才结算,保证每队掷骰(或讲经)的次数一样多。
  //   全部回到长安 → 'allHome';"第一队回来就结束"模式下,有队伍回来的那一轮打完 → 'firstHome'
  shouldEnd(state, startingNewRound) {
    if (!startingNewRound) return null;
    if (this.allCompleted(state)) return 'allHome';
    if (state.finalRound) return 'firstHome';
    return null;
  },

  isAutoTurn(state) {
    return this.activeTeam(state).completed;
  },

  autoResolveTurn(state) {
    const team = this.activeTeam(state);
    const gain = this.changeMerit(state, team, DR.CONFIG.homeTurnMerit != null ? DR.CONFIG.homeTurnMerit : 1);
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

  // 到访过的城市数(旧存档的到访记录里还混着村落,这里只数城)
  citiesVisited(team) {
    let n = 0;
    team.visited.forEach(key => {
      const [route, pos] = key.split(':');
      const st = pathFor(route)[+pos - 1];
      if (st && st.type !== 'village') n++;
    });
    return n;
  },

  // 法灯长明:点灯时供奉的功德一直算在总功德里,不会白白花掉
  lampValue(team) {
    return team.lampMerit || 0;
  },

  totalScore(team) {
    return team.merit + this.fragmentValue(team) + this.lampValue(team);
  },

  // 某队在哪些站点点亮过法灯(用于队伍详情面板展示)。
  teamLampStations(state, team) {
    return Object.values(state.lampOwners)
      .filter(o => o.teamId === team.id)
      .map(o => o.stationName);
  },

  journeyProgressPct(team) {
    if (team.completed) return 100;
    const path = pathFor(team.route);
    const frac = path.length ? team.position / path.length : 0;
    return Math.round(team.direction === 'back' ? 50 + (1 - frac) * 50 : frac * 50);
  },

  computeResults(state) {
    const rows = state.teams.map(team => {
      const fragCount = backpackCount(team);
      const fullSet = hasFullSet(team);
      const fragValue = this.fragmentValue(team);
      const lampValue = this.lampValue(team);
      return {
        team,
        fragCount,
        fullSet,
        fragValue,
        lampValue,
        total: team.merit + fragValue + lampValue,
      };
    }).sort((a, b) => b.total - a.total);

    const badges = rows.map(() => []);
    if (rows.length) badges[0].push('🏆 功德第一');

    let bestWisdomIdx = -1, bestWisdom = 0;
    let bestVigorIdx = -1, bestVigor = -1;
    let bestLampIdx = -1, bestLamp = 0;
    let bestChallengeIdx = -1, bestChallenge = 0;
    // 精进奖看"一共走了多少步"(旧存档没有步数时退回看掷骰次数);掷骰次数大家几乎一样,比它总会平局
    const vigorOf = t => (t.stepsTaken || 0) * 100 + (t.turnsTaken || 0);
    rows.forEach((r, i) => {
      if (r.team.correctAnswers > bestWisdom) { bestWisdom = r.team.correctAnswers; bestWisdomIdx = i; }
      if (vigorOf(r.team) > bestVigor) { bestVigor = vigorOf(r.team); bestVigorIdx = i; }
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
      bankStart: state.bankStart,
      elapsedSeconds: state.elapsedSeconds,
      finalRound: state.finalRound,
      lampOwners: state.lampOwners,
      decks: {
        land: deckToJSON(state.landDeck),
        sea: deckToJSON(state.seaDeck),
        question: deckToJSON(state.questionDeck),
        challenge: deckToJSON(state.challengeDeck),
        village: villageDecksToJSON(state.villageDecks),
      },
      options: state.options,
      journey: state.journey,
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
        stepsTaken: t.stepsTaken || 0,
        homeOrder: t.homeOrder != null ? t.homeOrder : null,
        homeRound: t.homeRound != null ? t.homeRound : null,
      })),
      activeIndex: Math.min(data.activeIndex || 0, data.teams.length - 1),
      round: data.round || 1,
      bank: data.bank,
      bankStart: data.bankStart || DR.CONFIG.bankTotal,
      // 旧存档是倒计时:换算成已用时间
      elapsedSeconds: data.elapsedSeconds != null ? data.elapsedSeconds
        : Math.max(0, (data.totalSeconds || 0) - (data.timerSeconds || 0)),
      finalRound: !!data.finalRound,
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
      villageDecks: villageDecksFromJSON(data.decks && data.decks.village),
      options: data.options || {},
      // 旧存档没有村落:按"短途"还原,棋子位置才对得上
      journey: data.journey || { length: 'short', seed: 1 },
      history: data.history || [],
      qlog: data.qlog || [],
      log: data.log || [],
      startedAt: data.startedAt || Date.now(),
      soundOn: true,
    };
    useBoard(state);
    // 旧存档没有记录供在法灯里的功德:按当年实际付的点灯花费补上(旧版驿站 4、圣地 7)
    state.teams.forEach(t => {
      if (t.lampMerit != null) return;
      t.lampMerit = Object.keys(state.lampOwners)
        .filter(k => state.lampOwners[k].teamId === t.id)
        .reduce((sum, k) => {
          const [route, pos] = k.split(':');
          const st = pathFor(route)[+pos - 1];
          return sum + (st ? (st.type === 'site' ? 7 : 4) : 0);
        }, 0);
    });
    return state;
  },
};

})();
