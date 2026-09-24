/* 丝路法灯 · 古地图美术层(静态底图)
 * 生成整张地图的矢量底图:海陆轮廓与岛屿、山脉、沙漠、绿洲、森林、河流湖泊、长城关隘、
 * 地名注记、罗盘玫瑰与航线、计里画方网格、回纹边框、商队与帆船动画等,以及右下角的鹰眼小地图。
 * - 全部是 SVG 矢量图形,放大后依旧清晰;
 * - 细节按缩放级别分层:.lod1(放大一些后出现)、.lod2(放大很多后出现),避免默认视图太拥挤;
 * - 图层用 .lay-* 分组,方便在"图层"面板里单独开关;
 * - 海岸线由少量控制点经"分形抖动"生成,随机数使用固定种子,所以每次打开地图都一模一样。
 * 坐标系与站点数据一致:1080×640 画布。
 */
var DR = window.DR || (window.DR = {});

(function () {

const W = 1080, H = 640;

// ---------------- 通用小工具 ----------------

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const f1 = n => Math.round(n * 10) / 10;

function linePath(pts, closed) {
  return 'M' + pts.map(p => f1(p[0]) + ',' + f1(p[1])).join('L') + (closed ? 'Z' : '');
}

// Catmull-Rom 样条 → 三次贝塞尔:河流、山脊、长城等需要圆润的曲线
function curvePath(pts, closed) {
  const n = pts.length;
  if (n < 3) return linePath(pts, closed);
  const get = i => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = 'M' + f1(pts[0][0]) + ',' + f1(pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f1(c1x)},${f1(c1y)} ${f1(c2x)},${f1(c2y)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

// 分形抖动:反复在每一段的中点沿法线方向随机偏移。控制点本身不动,
// 所以放在海岸控制点上的港口站点始终正好落在海岸线上。
function roughen(ctrl, closed, seed, amp, depth) {
  const rand = mulberry32(seed);
  let pts = ctrl.map(p => p.slice());
  for (let d = 0; d < depth; d++) {
    const out = [];
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 2.5) continue;
      const off = (rand() - 0.5) * 2 * amp * len;
      out.push([(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off]);
    }
    if (!closed) out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 沿折线等距取样(用于在山脊上排布山峰、在长城上放烽燧、在航线上放箭头)
function samplePolyline(pts, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t <= len) {
      const k = len ? t / len : 0;
      out.push({ x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) });
      t += step;
    }
    carry = t - len;
  }
  return out;
}

// ---------------- 地理形状(控制点) ----------------
// 这是一张"示意性"的古地图:整体方位是上北下南、左西右东,但为了让陆路、海路都放得下,
// 天竺被安排在左下角,孟加拉湾、南海在右下方。港口站点直接写在海岸控制点里。

const MAINLAND = [
  [-40, -40], [1120, -40], [1120, 200],
  // 华南海岸(自东向西)
  [1062, 204], [1024, 209], [988, 214], [952, 219], [916, 224], [882, 228], [852, 232], [834, 236],
  [822, 240], // 广州
  [810, 244], [798, 248],
  // 雷州半岛
  [789, 255], [784, 266], [777, 277], [770, 279], [764, 270], [757, 263],
  // 北部湾(合浦)
  [747, 262], [736, 266], [726, 274], [718, 283],
  [714, 290], // 交趾(红河三角洲)
  [707, 296],
  // 越南海岸南下
  [703, 306], [706, 318], [704, 330], [701, 341], [695, 355], [687, 369], [677, 381], [667, 391],
  // 湄公河三角洲
  [659, 397], [649, 400], [640, 396],
  // 暹罗湾北岸
  [630, 388], [618, 378], [604, 368], [590, 360], [578, 356],
  // 马来半岛东岸南下
  [570, 362], [563, 372], [557, 382], [552, 390], [546, 400], [537, 414], [527, 427], [517, 437], [509, 445],
  [503, 447], // 半岛南端
  // 马来半岛西岸北上
  [497, 440], [494, 428], [490, 414], [486, 400], [482, 386], [478, 374],
  // 安达曼海、缅甸海岸向西北
  [469, 368], [457, 366], [445, 370], [433, 376], [419, 382], [404, 388], [389, 392], [371, 394],
  [354, 396], [337, 398], [322, 402], [310, 408],
  // 天竺东海岸南下
  [300, 418], [294, 432], [290, 448], [287, 464], [285, 480], [283, 496], [281, 510],
  [280, 524], [281, 538], [283, 552], [285, 566], [287, 580], [289, 596], [291, 612], [293, 632], [296, 680],
  [-40, 680],
];

const ISLANDS = {
  hainan: [[772, 297], [790, 291], [808, 296], [813, 306], [801, 317], [783, 317], [770, 309]],
  taiwan: [[1001, 234], [1009, 231], [1013, 247], [1007, 266], [999, 262], [996, 248]],
  srilanka: [[356, 436], [366, 443], [372, 458], [368, 474], [358, 483], [347, 475], [343, 459], [347, 444]],
  sumatra: [[410, 450], [425, 444], [445, 451], [470, 461], [495, 471], [520, 482], [545, 494], [566, 508],
    [573, 522], [560, 531], [535, 523], [505, 509], [475, 495], [447, 481], [425, 469], [411, 461]],
  java: [[578, 548], [610, 545], [650, 551], [690, 555], [725, 561], [741, 571], [706, 575], [665, 571], [625, 566], [590, 562]],
  borneo: [[675, 448], [705, 437], [745, 442], [785, 436], [815, 455], [822, 490], [806, 525], [775, 552],
    [735, 560], [700, 548], [678, 518], [668, 482]],
  luzon: [[1040, 296], [1058, 290], [1076, 306], [1084, 352], [1068, 362], [1050, 340], [1040, 320]],
  palawan: [[918, 412], [926, 410], [912, 440], [893, 470], [884, 470], [900, 440]],
  mindanao: [[1010, 420], [1040, 414], [1060, 432], [1052, 458], [1024, 460], [1008, 444]],
  sulawesi: [[852, 470], [872, 462], [880, 480], [866, 500], [884, 518], [870, 530], [852, 506]],
  bali: [[748, 574], [760, 572], [764, 579], [752, 581]],
  lombok: [[770, 575], [784, 573], [786, 581], [772, 583]],
  andaman1: [[405, 398], [409, 396], [411, 408], [406, 410]],
  andaman2: [[409, 418], [413, 416], [414, 428], [409, 429]],
  nicobar: [[411, 431], [416, 429], [418, 436], [413, 439]],
};

// 区域色块(用径向渐变的椭圆柔和地叠在陆地上,再裁剪到陆地范围内)
const TINTS = [
  { c: '#e7cd8a', x: 482, y: 214, rx: 150, ry: 55, o: 0.85 },   // 塔克拉玛干
  { c: '#e7cd8a', x: 612, y: 186, rx: 60, ry: 30, o: 0.6 },     // 库姆塔格
  { c: '#ddcb97', x: 720, y: 58, rx: 140, ry: 42, o: 0.75 },    // 戈壁
  { c: '#cfd3a0', x: 440, y: 52, rx: 190, ry: 40, o: 0.7 },     // 北方草原
  { c: '#cdc4b4', x: 520, y: 305, rx: 210, ry: 62, o: 0.8 },    // 青藏高原
  { c: '#cdc4b4', x: 640, y: 262, rx: 90, ry: 40, o: 0.6 },
  { c: '#c6d39a', x: 950, y: 168, rx: 170, ry: 70, o: 0.75 },   // 中原
  { c: '#b9cf8c', x: 880, y: 210, rx: 120, ry: 34, o: 0.6 },    // 岭南
  { c: '#d6d49e', x: 742, y: 132, rx: 120, ry: 20, o: 0.6 },    // 河西走廊
  { c: '#c9d49a', x: 165, y: 520, rx: 170, ry: 125, o: 0.75 },  // 天竺
  { c: '#e3cf94', x: 70, y: 470, rx: 70, ry: 50, o: 0.55 },     // 塔尔沙漠
  { c: '#b3cc88', x: 630, y: 330, rx: 90, ry: 55, o: 0.75 },    // 中南半岛雨林
  { c: '#b3cc88', x: 480, y: 355, rx: 60, ry: 30, o: 0.6 },     // 缅甸
  { c: '#abc783', x: 520, y: 415, rx: 40, ry: 40, o: 0.7 },     // 马来半岛
  { c: '#abc783', x: 745, y: 495, rx: 85, ry: 65, o: 0.8 },     // 婆罗洲
  { c: '#abc783', x: 490, y: 488, rx: 90, ry: 30, o: 0.8 },     // 苏门答腊
  { c: '#abc783', x: 660, y: 562, rx: 85, ry: 18, o: 0.8 },     // 爪哇
];

// 山脉:山脊折线 + 山峰大小 + 积雪概率 + 配色
const RANGES = [
  { key: 'tianshan', pts: [[318, 98], [360, 92], [405, 87], [452, 86], [500, 88], [545, 83], [592, 74], [630, 66]], step: 13, s: [7, 10], snow: 0.6, pal: 'rock', back: true },
  { key: 'kunlun', pts: [[352, 262], [405, 271], [458, 274], [510, 269], [560, 257], [604, 238], [636, 214]], step: 13, s: [7, 10], snow: 0.55, pal: 'rock', back: true },
  { key: 'qilian', pts: [[656, 174], [696, 163], [736, 155], [780, 151], [818, 147]], step: 12, s: [6, 8.5], snow: 0.35, pal: 'rock' },
  { key: 'qinling', pts: [[884, 130], [922, 123], [962, 121], [1002, 119], [1044, 123]], step: 12, s: [5.5, 7.5], snow: 0, pal: 'green' },
  { key: 'pamir', pts: [[300, 208], [292, 232], [304, 258], [340, 262], [350, 236], [340, 212]], step: 11, s: [7, 10], snow: 0.9, pal: 'snow' },
  { key: 'hindukush', pts: [[296, 256], [262, 262], [226, 268], [188, 272], [148, 276], [104, 284], [60, 294]], step: 13, s: [6, 9], snow: 0.45, pal: 'rock' },
  { key: 'himalaya', pts: [[322, 266], [346, 292], [372, 316], [404, 334], [440, 347], [472, 353]], step: 11, s: [8, 11], snow: 0.9, pal: 'snow', back: true },
  { key: 'hengduan', pts: [[652, 228], [664, 252], [676, 276]], step: 11, s: [6, 8], snow: 0.3, pal: 'rock' },
  { key: 'annamite', pts: [[690, 302], [684, 322], [676, 344], [664, 364]], step: 11, s: [5, 6.5], snow: 0, pal: 'green' },
  { key: 'burma', pts: [[500, 330], [520, 342], [540, 352]], step: 11, s: [5, 6.5], snow: 0, pal: 'green' },
  { key: 'borneo', pts: [[716, 470], [744, 484], [770, 500]], step: 12, s: [5, 6.5], snow: 0, pal: 'green' },
  { key: 'barisan', pts: [[430, 466], [470, 482], [510, 500]], step: 13, s: [4, 5.5], snow: 0, pal: 'green' },
  { key: 'vindhya', pts: [[70, 596], [110, 604], [150, 610]], step: 13, s: [5, 6.5], snow: 0, pal: 'green' },
];

const PALETTES = {
  rock:  { lit: '#cdb183', shade: '#9b7e53', line: '#5e4a30' },
  snow:  { lit: '#c7b69a', shade: '#8f7c63', line: '#544534' },
  green: { lit: '#a9be85', shade: '#7b945e', line: '#4b5f38' },
};

// 河流:控制点(自源头向下游);label 为河名注记所在的一小段(从左向右书写)
const RIVERS = [
  { key: 'huanghe', name: '黄河', color: '#c29a45', w: 2.4, lod: 0,
    pts: [[694, 209], [722, 200], [752, 192], [790, 178], [812, 160], [828, 138], [836, 112], [840, 86], [846, 60], [862, 44], [890, 36], [920, 34], [946, 40], [958, 52], [963, 66], [974, 73], [1002, 75], [1032, 78], [1062, 80], [1100, 84]],
    label: [[866, 42], [890, 36], [920, 34], [944, 39]] },
  { key: 'weihe', name: '渭水', color: '#5b93b8', w: 1.4, lod: 1,
    pts: [[850, 114], [880, 101], [910, 93], [940, 87], [963, 74]], label: [[880, 101], [905, 94], [930, 89]] },
  { key: 'changjiang', name: '长江', color: '#4f8ab5', w: 2.4, lod: 0,
    pts: [[606, 262], [640, 262], [668, 258], [696, 250], [722, 240], [750, 226], [780, 212], [812, 200], [846, 194], [884, 190], [922, 186], [960, 184], [1000, 180], [1040, 176], [1100, 172]],
    label: [[900, 188], [930, 185], [962, 183], [990, 181]] },
  { key: 'zhujiang', name: '珠江', color: '#5b93b8', w: 1.3, lod: 1,
    pts: [[742, 234], [770, 232], [796, 236], [818, 239]], label: [[752, 232], [772, 231], [792, 234]] },
  { key: 'honghe', name: '红河', color: '#b9785a', w: 1.3, lod: 1,
    pts: [[652, 262], [672, 272], [692, 281], [712, 290]], label: [[656, 264], [674, 273], [690, 280]] },
  { key: 'mekong', name: '湄公河', color: '#5b93b8', w: 1.6, lod: 0,
    pts: [[610, 250], [621, 276], [631, 302], [640, 328], [647, 354], [652, 378], [655, 396]],
    label: [[622, 286], [630, 300], [637, 318]] },
  { key: 'tarim', name: '塔里木河', color: '#5b93b8', w: 1.5, lod: 0,
    pts: [[372, 214], [396, 194], [424, 186], [458, 188], [492, 186], [526, 184], [556, 186], [576, 192]],
    label: [[430, 190], [460, 191], [492, 189], [522, 187]] },
  { key: 'indus', name: '印度河', color: '#5b93b8', w: 1.8, lod: 0,
    pts: [[282, 300], [252, 316], [226, 330], [204, 346], [178, 366], [150, 390], [118, 418], [86, 448], [54, 476], [16, 500]],
    label: [[92, 442], [120, 416], [150, 390]] },
  { key: 'ganges', name: '恒河', color: '#5b93b8', w: 2.2, lod: 0,
    pts: [[114, 424], [134, 456], [152, 488], [166, 516], [184, 540], [208, 552], [232, 556], [250, 557], [268, 562], [286, 571]],
    label: [[196, 548], [214, 553], [234, 556]] },
  { key: 'irrawaddy', name: '伊洛瓦底江', color: '#5b93b8', w: 1.2, lod: 2,
    pts: [[500, 318], [496, 338], [488, 356], [476, 370]], label: [[482, 362], [490, 348], [496, 334]] },
  { key: 'brahmaputra', name: '', color: '#5b93b8', w: 1.2, lod: 2,
    pts: [[380, 296], [410, 304], [440, 318], [462, 336], [468, 360], [462, 372]], label: null },
];

const LAKES = [
  { name: '青海湖', x: 752, y: 174, rx: 12, ry: 6.5, lod: 1 },
  { name: '罗布泊', x: 584, y: 194, rx: 14, ry: 8.5, dry: true, lod: 1 },
  { name: '热海', x: 410, y: 66, rx: 22, ry: 6.5, lod: 1 },
  { name: '玛旁雍错', x: 388, y: 286, rx: 6, ry: 4, lod: 2 },
  { name: '洞里萨湖', x: 638, y: 366, rx: 7, ry: 4.5, lod: 2 },
];

// 长城(明代走向示意)与汉长城(残垣,虚线)
const GREAT_WALL = [[680, 111], [702, 106], [732, 102], [762, 100], [792, 99], [816, 96], [834, 88], [852, 72], [880, 64], [910, 60], [942, 56], [976, 52], [1010, 48], [1046, 44], [1100, 40]];
const HAN_WALL = [[612, 104], [632, 107], [656, 110], [680, 111]];

// 玄奘真实走过的路线中,与游戏路线不同的两段(放大后以红色点线显示):
// 去程从龟兹翻越凌山、经热海(伊塞克湖)、碎叶、飒秣建(撒马尔罕)、梵衍那(巴米扬)南下犍陀罗;
// 归程翻越葱岭后走丝路南道,经于阗、楼兰故地回到敦煌。
const XUANZANG_OUT = [[440, 148], [428, 118], [418, 84], [392, 70], [344, 64], [296, 104], [238, 138], [206, 160], [186, 196], [172, 236], [192, 290], [214, 340], [240, 385]];
const XUANZANG_BACK = [[355, 195], [386, 232], [422, 247], [470, 251], [520, 247], [562, 234], [592, 208], [620, 178], [645, 140]];

// 地名注记:[文字, x, y, 字号, 样式类, lod, 旋转角]
const LABELS = [
  ['西 域', 452, 60, 22, 'lbl-region', 0, 0],
  ['粟 特', 150, 176, 17, 'lbl-region', 0, 0],
  ['大 唐', 952, 152, 24, 'lbl-region', 0, 0],
  ['天 竺', 104, 552, 24, 'lbl-region', 0, 0],
  ['吐 蕃', 528, 312, 19, 'lbl-region', 0, 0],
  ['南 海', 905, 330, 26, 'lbl-sea', 0, 0],
  ['孟加拉湾', 372, 560, 15, 'lbl-sea', 0, 0],
  ['印 度 洋', 470, 604, 17, 'lbl-sea', 0, 0],
  ['塔克拉玛干沙漠', 486, 226, 11, 'lbl-desert', 0, 0],
  ['戈  壁', 722, 66, 12, 'lbl-desert', 0, 0],
  ['河西走廊', 752, 142, 7.5, 'lbl-minor', 1, -4],
  ['青藏高原', 560, 290, 9, 'lbl-minor', 1, 0],
  ['中南半岛', 632, 340, 8, 'lbl-minor', 1, 0],
  ['马来半岛', 520, 408, 6.5, 'lbl-minor', 1, 62],
  ['天 山', 520, 102, 8, 'lbl-mount', 1, 0],
  ['昆 仑 山', 470, 286, 8, 'lbl-mount', 1, 2],
  ['祁 连 山', 738, 170, 7, 'lbl-mount', 1, -6],
  ['秦 岭', 964, 134, 7.5, 'lbl-mount', 1, 0],
  ['葱岭(帕米尔高原)', 330, 276, 6.5, 'lbl-mount', 1, 0],
  ['喜 马 拉 雅 山', 420, 326, 8, 'lbl-mount', 1, 33],
  ['兴都库什山', 168, 262, 7, 'lbl-mount', 1, -3],
  ['横断山', 646, 244, 6, 'lbl-mount', 2, 62],
  ['长山山脉', 670, 336, 5.5, 'lbl-mount', 2, -68],
  ['婆罗洲', 745, 520, 9, 'lbl-island', 1, 0],
  ['苏门答腊', 470, 490, 7, 'lbl-island', 1, 24],
  ['爪 哇', 656, 566, 7, 'lbl-island', 1, 4],
  ['海南岛', 800, 300, 5.5, 'lbl-island', 1, 0],
  ['台湾岛', 1022, 262, 5.5, 'lbl-island', 2, 0],
  ['吕宋', 1062, 330, 6, 'lbl-island', 2, 0],
  ['爪 哇 海', 640, 530, 8, 'lbl-sea-minor', 1, 0],
  ['暹罗湾', 606, 386, 6, 'lbl-sea-minor', 2, 0],
  ['安达曼海', 440, 398, 6, 'lbl-sea-minor', 2, 0],
  ['北部湾', 740, 278, 5, 'lbl-sea-minor', 2, 0],
  ['计里画方 · 每方约百里', 168, 118, 5.5, 'lbl-note lay-grid', 1, 0],
  ['冬季东北风 → 商船南下', 868, 372, 5.5, 'lbl-note', 2, 0],
  ['夏季西南风 → 商船北归', 868, 384, 5.5, 'lbl-note', 2, 0],
  ['流沙千里 · 四顾茫然', 480, 246, 5, 'lbl-note', 2, 0],
  ['雪山终年积雪', 404, 346, 5, 'lbl-note', 2, 33],
  ['此处多风浪', 322, 506, 5, 'lbl-note', 2, 0],
  ['胡杨林', 550, 174, 4.5, 'lbl-note', 2, 0],
  ['吐火罗', 110, 232, 7, 'lbl-minor', 1, 0],
  ['玄奘去程(北道)', 330, 120, 5, 'lbl-history lay-history', 1, -32],
  ['玄奘归程(南道)', 470, 256, 5, 'lbl-history lay-history', 1, 0],
];

// ---------------- 站点 / 航线避让 ----------------

// 航线坐标:游戏地图按当前这一局的棋盘画(旧存档里没有后来新加的港口,航线要跟着它走);
// 主菜单、百科、出发准备(latest=true)按最新的站点表画。
function routeCoords(route, latest) {
  const cities = DR.Game && DR.Game.cities ? DR.Game.cities(route, latest) : (route === 'land' ? DR.LAND_PATH : DR.SEA_PATH);
  return [DR.HOME_COORD, ...cities].map(s => [s.x, s.y]);
}
// 不同版本的航线分开缓存(按两条路线的站数区分)
function routeSig(latest) {
  return routeCoords('land', latest).length + '/' + routeCoords('sea', latest).length;
}

let boardPts = null, boardSegs = null, landmarkPts = null;
function initBoardGeometry() {
  // 装饰物要同时避开新、旧两版航线:读旧存档时,地图上画的是旧航线
  const routes = [];
  ['land', 'sea'].forEach(r => {
    const all = r === 'land' ? DR.LAND_PATH : DR.SEA_PATH;
    routes.push([DR.HOME_COORD, ...all]);
    if (DR.Game && DR.Game.citiesFor) routes.push([DR.HOME_COORD, ...DR.Game.citiesFor(r, 2)]);
  });
  boardPts = [DR.HOME_COORD, ...DR.LAND_PATH, ...DR.SEA_PATH].map(s => [s.x, s.y]);
  boardSegs = [];
  routes.forEach(path => {
    for (let i = 0; i < path.length - 1; i++) boardSegs.push([path[i].x, path[i].y, path[i + 1].x, path[i + 1].y]);
  });
  landmarkPts = (DR.LANDMARKS || []).map(l => [l.x, l.y]);
}
// 装饰物(山峰、树木、沙丘……)不能盖住站点、航线与名胜标记,否则棋盘就看不清了
function nearBoard(x, y, rStation, rRoute) {
  for (const p of boardPts) if (Math.hypot(p[0] - x, p[1] - y) < rStation) return true;
  for (const s of boardSegs) if (distToSeg(x, y, s[0], s[1], s[2], s[3]) < rRoute) return true;
  for (const p of landmarkPts) if (Math.hypot(p[0] - x, p[1] - y) < rStation * 0.55) return true;
  return false;
}

// ---------------- 形状缓存 ----------------

let shapes = null;
function buildShapes() {
  if (shapes) return shapes;
  initBoardGeometry();
  const mainland = roughen(MAINLAND, true, 7, 0.16, 3);
  const islands = {};
  let seed = 100;
  Object.keys(ISLANDS).forEach(k => { islands[k] = roughen(ISLANDS[k], true, seed++, 0.2, 3); });
  const polys = [mainland, ...Object.values(islands)];
  const landD = linePath(mainland, true) + Object.values(islands).map(p => linePath(p, true)).join('');
  const rivers = RIVERS.map((r, i) => {
    const pts = roughen(r.pts, false, 300 + i, 0.07, 2);
    return { ...r, d: curvePath(pts, false), labelD: r.label ? curvePath(r.label, false) : null };
  });
  shapes = { mainland, islands, polys, landD, rivers };
  return shapes;
}
function isLand(x, y) {
  return buildShapes().polys.some(p => inPoly(x, y, p));
}
function landMargin(x, y, m) {
  // 离海岸线至少 m 个单位:在四个方向上都还是陆地
  return isLand(x, y) && isLand(x + m, y) && isLand(x - m, y) && isLand(x, y + m) && isLand(x, y - m);
}
function seaMargin(x, y, m) {
  return !isLand(x, y) && !isLand(x + m, y) && !isLand(x - m, y) && !isLand(x, y + m) && !isLand(x, y - m);
}

// ---------------- 绘制:各类图形小件 ----------------

function mountainGlyph(x, y, s, snowy, pal, rand) {
  const h = s * (1.2 + rand() * 0.5);
  const px = x + (rand() - 0.5) * s * 0.4;
  const top = y - h;
  const sl = [x - s * 0.5, y - h * 0.52], sr = [x + s * 0.52, y - h * 0.46];
  const mid = px + s * 0.08;
  let g = `<path d="M${f1(x - s)},${f1(y)}L${f1(sl[0])},${f1(sl[1])}L${f1(px)},${f1(top)}L${f1(mid)},${f1(y)}Z" fill="${pal.lit}"/>`;
  g += `<path d="M${f1(px)},${f1(top)}L${f1(sr[0])},${f1(sr[1])}L${f1(x + s)},${f1(y)}L${f1(mid)},${f1(y)}Z" fill="${pal.shade}"/>`;
  if (snowy) {
    g += `<path d="M${f1(px - h * 0.2)},${f1(top + h * 0.3)}L${f1(px)},${f1(top)}L${f1(px + h * 0.22)},${f1(top + h * 0.32)}` +
      `L${f1(px + h * 0.08)},${f1(top + h * 0.24)}L${f1(px - h * 0.04)},${f1(top + h * 0.33)}Z" fill="#f8fafc"/>`;
  }
  g += `<path d="M${f1(x - s)},${f1(y)}L${f1(sl[0])},${f1(sl[1])}L${f1(px)},${f1(top)}L${f1(sr[0])},${f1(sr[1])}L${f1(x + s)},${f1(y)}" fill="none" stroke="${pal.line}" stroke-width=".7" stroke-linejoin="round"/>`;
  g += `<path d="M${f1(px)},${f1(top)}L${f1(mid + s * 0.05)},${f1(y - h * 0.3)}M${f1(sr[0])},${f1(sr[1])}L${f1(sr[0] - s * 0.1)},${f1(y - h * 0.12)}" stroke="${pal.line}" stroke-width=".45" opacity=".55" fill="none"/>`;
  return g;
}

function duneGlyph(x, y, s) {
  return `<path d="M${f1(x - s)},${f1(y)}Q${f1(x)},${f1(y - s * 0.95)} ${f1(x + s)},${f1(y)}Q${f1(x + s * 0.1)},${f1(y - s * 0.35)} ${f1(x - s)},${f1(y)}Z"/>`;
}

function treeGlyph(kind, x, y, rand) {
  if (kind === 'conifer') {
    return `<path d="M${f1(x)},${f1(y - 6.5)}L${f1(x + 2.8)},${f1(y - 1)}L${f1(x - 2.8)},${f1(y - 1)}Z" fill="#5d7c50"/>` +
      `<path d="M${f1(x)},${f1(y - 4)}L${f1(x + 3.4)},${f1(y + 0.8)}L${f1(x - 3.4)},${f1(y + 0.8)}Z" fill="#4f6d44"/>`;
  }
  if (kind === 'palm') {
    const lean = (rand() - 0.5) * 2;
    const tx = x + lean, ty = y - 6;
    return `<path d="M${f1(x)},${f1(y)}Q${f1(x + lean * 0.3)},${f1(y - 3)} ${f1(tx)},${f1(ty)}" stroke="#7a5d3a" stroke-width=".8" fill="none"/>` +
      `<path d="M${f1(tx)},${f1(ty)}q-3,-.4 -4.2,1.8M${f1(tx)},${f1(ty)}q3,-.4 4.2,1.8M${f1(tx)},${f1(ty)}q-1.5,-2.2 -3.6,-2.2M${f1(tx)},${f1(ty)}q1.5,-2.2 3.6,-2.2" stroke="#4f7a3e" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  }
  if (kind === 'poplar') { // 胡杨:金黄色
    return `<path d="M${f1(x)},${f1(y)}V${f1(y - 2.2)}" stroke="#7a5d3a" stroke-width=".7"/>` +
      `<ellipse cx="${f1(x)}" cy="${f1(y - 4.2)}" rx="2.4" ry="3.2" fill="#d6b24a"/>` +
      `<ellipse cx="${f1(x - 0.6)}" cy="${f1(y - 4.8)}" rx="1.1" ry="1.6" fill="#ecd07a"/>`;
  }
  // broadleaf
  const r = 2.4 + rand() * 0.9;
  return `<path d="M${f1(x)},${f1(y)}V${f1(y - 2)}" stroke="#6b4f33" stroke-width=".7"/>` +
    `<circle cx="${f1(x)}" cy="${f1(y - r - 1.4)}" r="${f1(r)}" fill="#6f8f50"/>` +
    `<circle cx="${f1(x - r * 0.35)}" cy="${f1(y - r - 2)}" r="${f1(r * 0.5)}" fill="#95b173"/>`;
}

// 中式帆船(平底、红色硬帆)。dir=-1 朝左(西)行驶,dir=1 朝右
function junkShip(x, y, sc, dir) {
  const t = `translate(${f1(x)},${f1(y)}) scale(${sc * dir},${sc})`;
  return `<g transform="${t}">
    <path d="M-11,0 L11,0 L8,4.2 L-9,4.2 Z" fill="#6b4a2b" stroke="#3e2a18" stroke-width=".5"/>
    <path d="M-12,-1.5 L-9,0 L9,0 L12.5,-2.5" fill="none" stroke="#3e2a18" stroke-width=".6"/>
    <path d="M-2,-14 L-2,0 M5,-10 L5,0" stroke="#3e2a18" stroke-width=".7"/>
    <path d="M-2,-14 Q-8,-11 -9,-2 L-2,-2 Z" fill="#c2533f" stroke="#7a2e22" stroke-width=".4"/>
    <path d="M-7.6,-10 L-2,-10.5 M-8.6,-6.5 L-2,-6.8" stroke="#7a2e22" stroke-width=".35"/>
    <path d="M5,-10 Q0.5,-8 0,-2 L5,-2 Z" fill="#d9744f" stroke="#7a2e22" stroke-width=".4"/>
    <path d="M-2,-14 L-5,-17" stroke="#b2503b" stroke-width=".5"/><path d="M-5,-17 l2.4,1 l-2.4,1z" fill="#b2503b"/>
  </g>`;
}

// 阿拉伯三角帆船(印度洋上常见)
function dhowShip(x, y, sc, dir) {
  const t = `translate(${f1(x)},${f1(y)}) scale(${sc * dir},${sc})`;
  return `<g transform="${t}">
    <path d="M-12,-1 Q0,5 11,-2 L8,2.5 Q0,6 -9,2.5 Z" fill="#8a6440" stroke="#4a331f" stroke-width=".5"/>
    <path d="M0,0 L0,-13" stroke="#4a331f" stroke-width=".7"/>
    <path d="M-9,-3 L6,-15 Q4,-7 0,-2 Z" fill="#f1e6cf" stroke="#8a7458" stroke-width=".5"/>
  </g>`;
}

function camelGlyph(x, y, sc, dir, color) {
  const t = `translate(${f1(x)},${f1(y)}) scale(${sc * dir},${sc})`;
  const c = color || '#6b4a2b';
  return `<g transform="${t}" fill="${c}">
    <path d="M-7,0 L-6,-5 Q-6,-8 -3,-8.5 Q-1.6,-11 0.4,-8.8 Q2.2,-11.2 4,-8.6 Q5.6,-8 6,-6.6 L8.4,-9.6 L9.6,-9.4 L10,-8.2 L7.2,-5.2 L6.4,-3.6 L6.4,0 L5.2,0 L5.2,-3.2 L-4.6,-3.4 L-5.4,0 Z"/>
    <path d="M-2,-8.6 l0.8,-2.6 l1.6,0.2 z" fill="#b2503b"/>
  </g>`;
}

function monkGlyph(x, y, sc, dir) {
  const t = `translate(${f1(x)},${f1(y)}) scale(${sc * dir},${sc})`;
  return `<g transform="${t}">
    <circle cx="0" cy="-8.2" r="1.7" fill="#e3c39a"/>
    <path d="M-2.4,0 L-1.8,-6.2 Q0,-7.4 1.8,-6.2 L2.6,0 Z" fill="#c9722f"/>
    <path d="M-1.5,-6.3 L2.2,-1" stroke="#8f3f1c" stroke-width=".6"/>
    <path d="M-3.4,-7 L-3.4,0.4" stroke="#6b4a2b" stroke-width=".5"/>
    <path d="M1.4,-4.2 Q3.8,-4.8 4,-7.6 L2.4,-8.4 Q0.8,-6 1.4,-4.2Z" fill="#8a6440"/>
  </g>`;
}

function lanternGlyph(x, y) {
  return `<g transform="translate(${f1(x)},${f1(y)})">
    <path d="M0,-7 V-5" stroke="#6b4a2b" stroke-width=".5"/>
    <rect x="-2" y="-5.4" width="4" height="1" rx=".4" fill="#c9992f"/>
    <ellipse cx="0" cy="-2" rx="3.2" ry="3" fill="#d24a35"/>
    <ellipse cx="-0.9" cy="-2.6" rx="1" ry="1.4" fill="#f08a5d" opacity=".8"/>
    <rect x="-2" y=".8" width="4" height="1" rx=".4" fill="#c9992f"/>
    <path d="M0,1.8 V4.6" stroke="#c9992f" stroke-width=".6"/>
  </g>`;
}

// 水上漂浮的莲花灯(海路一侧的"法灯")
function lotusLampGlyph(x, y) {
  return `<g transform="translate(${f1(x)},${f1(y)})">
    <ellipse cx="0" cy="1.2" rx="5" ry="1.4" fill="#2f6483" opacity=".25"/>
    <path d="M-4.6,0 Q-3.6,-3 -1.6,-1.2 Q0,-4.6 1.6,-1.2 Q3.6,-3 4.6,0 Q0,1.8 -4.6,0Z" fill="#f3a3b6" stroke="#b5566f" stroke-width=".4"/>
    <path d="M-2,-.6 Q0,-3 2,-.6" fill="#fbd3dc" stroke="#b5566f" stroke-width=".3"/>
    <path d="M0,-2 q-.9,-1.6 0,-3.4 q.9,1.6 0,3.4" fill="#f6b73c"/>
  </g>`;
}

function elephantGlyph(x, y, sc, dir) {
  const t = `translate(${f1(x)},${f1(y)}) scale(${sc * dir},${sc})`;
  return `<g transform="${t}">
    <path d="M-9,0 L-8.6,-6.4 Q-8,-11 -2,-11.2 Q4,-11.4 5.6,-8 Q8.6,-8.6 9.2,-5 Q9.6,-1.6 8.4,0.6 L7.2,0.6 Q8,-2 7.4,-4 L6.8,-4.2 L6.6,0 L4.4,0 L4.2,-3 L-4.4,-3 L-4.6,0 L-6.8,0 L-7,-3.4 L-7.6,0 Z" fill="#8f8c86" stroke="#55524d" stroke-width=".5"/>
    <path d="M2.8,-9 Q1.4,-6 3.2,-4.6" fill="none" stroke="#55524d" stroke-width=".5"/>
    <circle cx="6.2" cy="-7.4" r=".6" fill="#2a2a2a"/>
    <path d="M-6,-11 Q-3,-13.6 1,-11.2 L-1,-9.6 Q-3,-10.6 -6,-11Z" fill="#b2503b"/>
  </g>`;
}

function hutGlyph(x, y, sc) {
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})">
    <path d="M-3.6,0 V-3 H3.6 V0 Z" fill="#d8c3a0" stroke="#7a5a3a" stroke-width=".4"/>
    <path d="M-4.6,-2.8 L0,-6.2 L4.6,-2.8 Z" fill="#a6763f" stroke="#6b4a2b" stroke-width=".4"/>
    <rect x="-.8" y="-2" width="1.6" height="2" fill="#6b4a2b"/>
  </g>`;
}

function pagodaGlyph(x, y, sc) {
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})" class="glyph-pagoda">
    <path d="M-4,0 H4 V-1.4 H-4 Z" fill="#7a5a3a"/>
    <path d="M-3,-1.4 H3 L2.6,-4.2 H-2.6 Z" fill="#b89b72"/>
    <path d="M-4.4,-4 H4.4 L3,-5 H-3 Z" fill="#6b4a2b"/>
    <path d="M-2.4,-5 H2.4 L2,-7.6 H-2 Z" fill="#b89b72"/>
    <path d="M-3.6,-7.4 H3.6 L2.4,-8.4 H-2.4 Z" fill="#6b4a2b"/>
    <path d="M-1.8,-8.4 H1.8 L1.5,-10.6 H-1.5 Z" fill="#b89b72"/>
    <path d="M-2.8,-10.4 H2.8 L1.8,-11.4 H-1.8 Z" fill="#6b4a2b"/>
    <path d="M0,-11.4 V-14.4" stroke="#6b4a2b" stroke-width=".7"/>
  </g>`;
}

function stupaGlyph(x, y, sc) {
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})">
    <path d="M-5,0 H5 V-1.6 H-5 Z" fill="#9b8466"/>
    <path d="M-4,-1.6 Q-4,-7 0,-7 Q4,-7 4,-1.6 Z" fill="#efe6d2" stroke="#9b8466" stroke-width=".5"/>
    <path d="M-1.2,-7 H1.2 V-8.4 H-1.2Z" fill="#9b8466"/>
    <path d="M0,-8.4 V-12.5" stroke="#c9992f" stroke-width=".9"/>
    <path d="M-1.4,-9.6 H1.4 M-1,-10.8 H1" stroke="#c9992f" stroke-width=".6"/>
  </g>`;
}

function cavesGlyph(x, y, sc) { // 石窟:崖壁上的小窟龛
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})">
    <path d="M-9,0 L-8,-7 L-3,-9 L4,-8.4 L9,-6 L10,0 Z" fill="#c9a06a" stroke="#7a5a3a" stroke-width=".5"/>
    <path d="M-6,-4.6 a1,1.4 0 0 1 2,0 v1.6 h-2z M-2,-5.6 a1,1.4 0 0 1 2,0 v1.6 h-2z M2,-5 a1,1.4 0 0 1 2,0 v1.6 h-2z M5.4,-3.8 a1,1.4 0 0 1 2,0 v1.6 h-2z M-4,-1.8 a.9,1.2 0 0 1 1.8,0 v1.2 h-1.8z M0.6,-2 a.9,1.2 0 0 1 1.8,0 v1.2 h-1.8z" fill="#5a3f26"/>
  </g>`;
}

function waveGlyph(x, y, s) {
  return `<path d="M${f1(x - s * 1.5)},${f1(y)}q${f1(s * 0.75)},${f1(-s * 0.7)} ${f1(s * 1.5)},0q${f1(s * 0.75)},${f1(s * 0.7)} ${f1(s * 1.5)},0"/>`;
}

function cloudScroll(x, y, sc) { // 祥云
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})">
    <path d="M-16,4 Q-20,4 -20,0 Q-20,-5 -14,-5 Q-13,-11 -6,-10 Q-2,-15 4,-12 Q10,-14 12,-8 Q19,-8 19,-2 Q19,4 13,4 Z" fill="#fbf6ea" stroke="#b89b72" stroke-width=".8"/>
    <path d="M-12,0 q3,-4 6,0 q-2,2 -4,0 M2,-4 q3,-4 6,0 q-2,2 -4,0" fill="none" stroke="#b89b72" stroke-width=".7"/>
  </g>`;
}

function craneGlyph(x, y, sc) { // 仙鹤剪影
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})" fill="none" stroke="#3b3024" stroke-width=".9" stroke-linecap="round">
    <path d="M-8,-2 Q-3,-7 0,-1 Q3,-7 8,-2"/>
    <path d="M0,-1 L0,1.6 M0,1.6 L-3,4.5" />
    <path d="M0,-1 l2.6,-1.8" stroke="#c0392b" stroke-width="1.1"/>
  </g>`;
}

function whaleGlyph(x, y, sc) {
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})">
    <path d="M-16,0 Q-14,-8 -2,-8 Q10,-8 14,-2 Q18,-4 21,-9 Q21,-2 18,1 Q21,4 22,8 Q16,5 13,3 Q6,6 -6,5 Q-15,4 -16,0Z" fill="#5d7f96" stroke="#2f4a5c" stroke-width=".7"/>
    <path d="M-14,1 Q-2,4 11,2" fill="none" stroke="#dfe9ee" stroke-width=".8"/>
    <circle cx="-10" cy="-3" r=".9" fill="#1c2c36"/>
    <path d="M-4,-8 Q-6,-14 -9,-15 M-4,-8 Q-3,-15 -1,-16 M-4,-8 Q-5,-13 -4,-17" fill="none" stroke="#8fb8cf" stroke-width=".8" stroke-linecap="round"/>
  </g>`;
}

function turtleGlyph(x, y, sc) {
  return `<g transform="translate(${f1(x)},${f1(y)}) scale(${sc})">
    <path d="M-3,-3.4 l-2.2,-2 M3,-3.4 l2.2,-2 M-3,3.4 l-2.2,2 M3,3.4 l2.2,2" stroke="#8aa56c" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="6.2" cy="0" r="1.6" fill="#8aa56c" stroke="#3f5230" stroke-width=".4"/>
    <ellipse cx="0" cy="0" rx="5.2" ry="3.8" fill="#6f8a55" stroke="#3f5230" stroke-width=".5"/>
    <ellipse cx="0" cy="0" rx="3" ry="2.1" fill="#86a266" stroke="#3f5230" stroke-width=".35"/>
    <path d="M-3,0 H-5 M3,0 H5 M0,-2.1 V-3.7 M0,2.1 V3.7" stroke="#3f5230" stroke-width=".35"/>
  </g>`;
}

function dolphinGlyph(x, y, sc, rot) {
  return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${rot}) scale(${sc})">
    <path d="M-9,1 Q-6,-5 2,-4 Q7,-3.6 9,-1 L12,-2 L10.4,0.4 Q8,2 2,1.8 Q-4,1.6 -9,1Z" fill="#6f93ab" stroke="#35556a" stroke-width=".5"/>
    <path d="M0,-4 L2,-7 L3,-4" fill="#6f93ab" stroke="#35556a" stroke-width=".5"/>
    <path d="M-9,1 L-12,-2 M-9,1 L-12,3" stroke="#35556a" stroke-width=".8" stroke-linecap="round"/>
  </g>`;
}

// 罗盘玫瑰(16 方位)+ 汉字方位
function windRose(cx, cy, r) {
  const pt = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
  let g = `<g class="wind-rose">`;
  g += `<circle cx="${cx}" cy="${cy}" r="${f1(r * 1.02)}" fill="#f4ecd8" fill-opacity=".85" stroke="#8a6a2f" stroke-width="1.2"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${f1(r * 0.86)}" fill="none" stroke="#8a6a2f" stroke-width=".5" stroke-dasharray="1.5 1.5"/>`;
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2;
    const [x1, y1] = pt(a, r * 0.94), [x2, y2] = pt(a, r * (i % 4 === 0 ? 0.84 : 0.9));
    g += `<path d="M${f1(x1)},${f1(y1)}L${f1(x2)},${f1(y2)}" stroke="#8a6a2f" stroke-width="${i % 4 === 0 ? 0.9 : 0.45}"/>`;
  }
  const star = (count, len, width, lit, shade, offset) => {
    let s = '';
    for (let i = 0; i < count; i++) {
      const a = offset + i / count * Math.PI * 2 - Math.PI / 2;
      const tip = pt(a, len), l = pt(a - Math.PI / 2, width), rr = pt(a + Math.PI / 2, width);
      s += `<path d="M${f1(cx)},${f1(cy)}L${f1(l[0])},${f1(l[1])}L${f1(tip[0])},${f1(tip[1])}Z" fill="${lit}" stroke="#5a4a30" stroke-width=".3"/>`;
      s += `<path d="M${f1(cx)},${f1(cy)}L${f1(rr[0])},${f1(rr[1])}L${f1(tip[0])},${f1(tip[1])}Z" fill="${shade}" stroke="#5a4a30" stroke-width=".3"/>`;
    }
    return s;
  };
  g += star(8, r * 0.55, r * 0.07, '#e8dcc0', '#b2503b', Math.PI / 8);
  g += star(4, r * 0.66, r * 0.09, '#f3ead6', '#6b8e7a', Math.PI / 4);
  g += star(4, r * 0.84, r * 0.12, '#fbf6ea', '#2f4a5c', 0);
  g += `<circle cx="${cx}" cy="${cy}" r="${f1(r * 0.09)}" fill="#c9992f" stroke="#5a4a30" stroke-width=".4"/>`;
  return g + '</g>';
}

function rhumbLines(cx, cy) {
  let g = '';
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const x2 = cx + Math.cos(a) * 1500, y2 = cy + Math.sin(a) * 1500;
    const cls = i % 4 === 0 ? 'rhumb rhumb-main' : (i % 2 === 0 ? 'rhumb rhumb-half' : 'rhumb rhumb-quarter');
    g += `<path class="${cls}" d="M${cx},${cy}L${f1(x2)},${f1(y2)}"/>`;
  }
  return g;
}

function sealStamp(x, y, s, chars, rot) {
  const [a, b, c, d] = chars;
  return `<g transform="translate(${x},${y}) rotate(${rot || 0})" class="seal">
    <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${f1(s * 0.12)}" fill="#b8332a" opacity=".86"/>
    <rect x="${f1(-s / 2 + s * 0.08)}" y="${f1(-s / 2 + s * 0.08)}" width="${f1(s * 0.84)}" height="${f1(s * 0.84)}" rx="${f1(s * 0.08)}" fill="none" stroke="#fbe9dc" stroke-width="${f1(s * 0.035)}" opacity=".9"/>
    <text x="${f1(s * 0.2)}" y="${f1(-s * 0.04)}" text-anchor="middle" class="seal-text" font-size="${f1(s * 0.34)}">${a}</text>
    <text x="${f1(s * 0.2)}" y="${f1(s * 0.34)}" text-anchor="middle" class="seal-text" font-size="${f1(s * 0.34)}">${b}</text>
    <text x="${f1(-s * 0.2)}" y="${f1(-s * 0.04)}" text-anchor="middle" class="seal-text" font-size="${f1(s * 0.34)}">${c}</text>
    <text x="${f1(-s * 0.2)}" y="${f1(s * 0.34)}" text-anchor="middle" class="seal-text" font-size="${f1(s * 0.34)}">${d}</text>
  </g>`;
}

// ---------------- 纸张纹理(用 canvas 生成一次噪点贴图) ----------------

let paperURL = null;
function paperTexture() {
  if (paperURL !== null) return paperURL;
  paperURL = '';
  try {
    const size = 192;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    if (!ctx) return paperURL;
    const img = ctx.createImageData(size, size);
    const rand = mulberry32(42);
    for (let i = 0; i < size * size; i++) {
      const v = 200 + rand() * 55;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.96; img.data[i * 4 + 2] = v * 0.86;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // 纤维纹路
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#6b5236';
    for (let i = 0; i < 70; i++) {
      const x = rand() * size, y = rand() * size, len = 6 + rand() * 18, a = rand() * Math.PI;
      ctx.lineWidth = 0.4 + rand() * 0.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
    paperURL = cv.toDataURL('image/png');
  } catch (_) { paperURL = ''; }
  return paperURL;
}

// ---------------- 分层生成 ----------------

function defsBlock() {
  const tex = paperTexture();
  return `<defs>
    <linearGradient id="dr-sea" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#b6d4d8"/><stop offset="45%" stop-color="#8dbccb"/><stop offset="100%" stop-color="#4f86a8"/>
    </linearGradient>
    <radialGradient id="dr-sea-glow" cx="70%" cy="70%" r="60%">
      <stop offset="0%" stop-color="#3f7aa0" stop-opacity=".35"/><stop offset="100%" stop-color="#3f7aa0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="dr-land" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f1e5c3"/><stop offset="100%" stop-color="#e6d3a1"/>
    </linearGradient>
    <radialGradient id="dr-vignette" cx="50%" cy="46%" r="76%">
      <stop offset="62%" stop-color="#3b2a14" stop-opacity="0"/><stop offset="100%" stop-color="#3b2a14" stop-opacity=".26"/>
    </radialGradient>
    <radialGradient id="dr-stain"><stop offset="0%" stop-color="#8a6a2f" stop-opacity=".16"/><stop offset="70%" stop-color="#8a6a2f" stop-opacity=".05"/><stop offset="100%" stop-color="#8a6a2f" stop-opacity="0"/></radialGradient>
    ${TINTS.map((t, i) => `<radialGradient id="dr-tint${i}"><stop offset="0%" stop-color="${t.c}" stop-opacity="${t.o}"/><stop offset="70%" stop-color="${t.c}" stop-opacity="${f1(t.o * 0.55)}"/><stop offset="100%" stop-color="${t.c}" stop-opacity="0"/></radialGradient>`).join('')}
    <pattern id="dr-seawave" width="34" height="16" patternUnits="userSpaceOnUse">
      <path d="M0,8 q4.25,-4.4 8.5,0 t8.5,0 t8.5,0 t8.5,0" fill="none" stroke="#2f6483" stroke-width=".55"/>
    </pattern>
    <pattern id="dr-stipple" width="9" height="9" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r=".7" fill="#a88a55"/><circle cx="6.5" cy="6" r=".55" fill="#a88a55"/>
    </pattern>
    <pattern id="dr-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <path d="M0,0 V6" stroke="#8f7f67" stroke-width=".5"/>
    </pattern>
    <pattern id="dr-meander" width="16" height="16" patternUnits="userSpaceOnUse">
      <rect width="16" height="16" fill="#e9d9b0"/>
      <path d="M2,14 V2 H14 V11 H5 V5 H11 V8" fill="none" stroke="#8a6a2f" stroke-width="1.3" stroke-linecap="square"/>
    </pattern>
    ${tex ? `<pattern id="dr-paper" width="192" height="192" patternUnits="userSpaceOnUse"><image href="${tex}" width="192" height="192"/></pattern>` : ''}
    <clipPath id="dr-landclip"><path d="${buildShapes().landD}"/></clipPath>
    <filter id="dr-soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity=".3"/>
    </filter>
  </defs>`;
}

function seaLayer() {
  const { landD } = buildShapes();
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#dr-sea)"/>`;
  g += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#dr-sea-glow)"/>`;
  g += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#dr-seawave)" opacity=".16"/>`;
  g += `<g class="lay-deco">${rhumbLines(955, 494)}${rhumbLines(440, 572)}</g>`;
  // 近岸浅水:把陆地轮廓描上几圈半透明的浅色宽边,形成一圈圈的"等深线"
  g += `<path d="${landD}" fill="none" stroke="#e6f1ee" stroke-width="30" stroke-opacity=".16" stroke-linejoin="round"/>`;
  g += `<path d="${landD}" fill="none" stroke="#e6f1ee" stroke-width="18" stroke-opacity=".22" stroke-linejoin="round"/>`;
  g += `<path d="${landD}" fill="none" stroke="#e9f3ef" stroke-width="8" stroke-opacity=".45" stroke-linejoin="round"/>`;
  g += `<path d="${landD}" fill="none" stroke="#4f86a8" stroke-width="13" stroke-opacity=".18" stroke-dasharray="1 5" stroke-linejoin="round"/>`;
  return g;
}

function landLayer() {
  const { landD } = buildShapes();
  let g = `<path d="${landD}" fill="url(#dr-land)"/>`;
  g += `<g clip-path="url(#dr-landclip)">`;
  TINTS.forEach((t, i) => { g += `<ellipse cx="${t.x}" cy="${t.y}" rx="${t.rx}" ry="${t.ry}" fill="url(#dr-tint${i})"/>`; });
  // 青藏高原的细斜线,表示高耸的台地
  g += `<ellipse class="lay-terrain" cx="520" cy="302" rx="190" ry="44" fill="url(#dr-hatch)" opacity=".28"/>`;
  g += `<ellipse class="lay-terrain" cx="486" cy="214" rx="128" ry="40" fill="url(#dr-stipple)" opacity=".55"/>`;
  g += `<ellipse class="lay-terrain" cx="722" cy="60" rx="120" ry="30" fill="url(#dr-stipple)" opacity=".4"/>`;
  g += `</g>`;
  g += `<path d="${landD}" fill="none" stroke="#6b5a3e" stroke-width="1.1" stroke-linejoin="round"/>`;
  g += `<path d="${landD}" fill="none" stroke="#fff8e6" stroke-width=".6" stroke-opacity=".7" stroke-linejoin="round" transform="translate(-.9,-.9)"/>`;
  return g;
}

function gridLayer() {
  let g = `<g class="lay-grid map-grid">`;
  for (let x = 40; x < W; x += 40) g += `<path d="M${x},0V${H}"/>`;
  for (let y = 40; y < H; y += 40) g += `<path d="M0,${y}H${W}"/>`;
  return g + '</g>';
}

function reliefLayer() {
  const rand = mulberry32(2024);
  let out = '';

  // --- 沙丘 ---
  let dunes = '';
  const duneFields = [
    { x: 486, y: 214, rx: 118, ry: 36, n: 90, s: [3.5, 6] },
    { x: 612, y: 184, rx: 34, ry: 16, n: 14, s: [3, 5] },
    { x: 722, y: 60, rx: 100, ry: 26, n: 18, s: [2.5, 4] },
    { x: 72, y: 470, rx: 44, ry: 32, n: 16, s: [3, 4.5] },
  ];
  duneFields.forEach(fld => {
    for (let i = 0; i < fld.n; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
      const x = fld.x + Math.cos(a) * r * fld.rx, y = fld.y + Math.sin(a) * r * fld.ry;
      if (!isLand(x, y) || nearBoard(x, y, 17, 7)) continue;
      dunes += duneGlyph(x, y, fld.s[0] + rand() * (fld.s[1] - fld.s[0]));
    }
  });
  out += `<g class="lay-terrain dunes" fill="#d9b36a" stroke="#ae884a" stroke-width=".45">${dunes}</g>`;

  // --- 戈壁碎石 ---
  let pebbles = '';
  for (let i = 0; i < 120; i++) {
    const x = 610 + rand() * 230, y = 34 + rand() * 60;
    if (!isLand(x, y) || nearBoard(x, y, 14, 6)) continue;
    pebbles += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.5 + rand() * 0.7)}"/>`;
  }
  out += `<g class="lay-terrain" fill="#9b8563" opacity=".55">${pebbles}</g>`;

  // --- 草原小草 ---
  let tufts = '';
  const grassAreas = [
    { x0: 300, x1: 620, y0: 30, y1: 76, n: 60 },
    { x0: 820, x1: 1060, y0: 30, y1: 46, n: 18 },
    { x0: 40, x1: 280, y0: 300, y1: 400, n: 36 },
  ];
  grassAreas.forEach(a => {
    for (let i = 0; i < a.n; i++) {
      const x = a.x0 + rand() * (a.x1 - a.x0), y = a.y0 + rand() * (a.y1 - a.y0);
      if (!isLand(x, y) || nearBoard(x, y, 14, 6)) continue;
      tufts += `<path d="M${f1(x - 1.6)},${f1(y)}l.6,-2.4M${f1(x)},${f1(y)}v-3M${f1(x + 1.6)},${f1(y)}l-.6,-2.4"/>`;
    }
  });
  out += `<g class="lay-terrain" stroke="#7f8f4f" stroke-width=".55" fill="none" stroke-linecap="round" opacity=".8">${tufts}</g>`;

  // --- 树木:先收集后按 y 排序,近处的树压在远处的树上 ---
  const trees = [];
  const forests = [
    { kind: 'broadleaf', x0: 830, x1: 1064, y0: 136, y1: 212, n: 70 },
    { kind: 'conifer', x0: 870, x1: 1050, y0: 126, y1: 146, n: 22 },
    { kind: 'conifer', x0: 330, x1: 600, y0: 100, y1: 112, n: 20 },
    { kind: 'broadleaf', x0: 30, x1: 280, y0: 400, y1: 620, n: 110 },
    { kind: 'palm', x0: 40, x1: 290, y0: 540, y1: 625, n: 16 },
    { kind: 'broadleaf', x0: 560, x1: 700, y0: 290, y1: 395, n: 45 },
    { kind: 'palm', x0: 470, x1: 560, y0: 370, y1: 450, n: 22 },
    { kind: 'broadleaf', x0: 420, x1: 580, y0: 350, y1: 380, n: 20 },
    { kind: 'palm', x0: 410, x1: 575, y0: 448, y1: 532, n: 30 },
    { kind: 'broadleaf', x0: 668, x1: 822, y0: 436, y1: 562, n: 55 },
    { kind: 'palm', x0: 578, x1: 742, y0: 545, y1: 578, n: 22 },
    { kind: 'palm', x0: 770, x1: 815, y0: 290, y1: 318, n: 6 },
    { kind: 'palm', x0: 342, x1: 374, y0: 434, y1: 484, n: 6 },
  ];
  forests.forEach(f => {
    for (let i = 0; i < f.n; i++) {
      const x = f.x0 + rand() * (f.x1 - f.x0), y = f.y0 + rand() * (f.y1 - f.y0);
      if (!landMargin(x, y, 3) || nearBoard(x, y, 16, 7)) continue;
      trees.push({ kind: f.kind, x, y });
    }
  });
  // 绿洲胡杨林 + 小水塘
  let ponds = '';
  const oases = [[578, 178], [372, 214], [456, 164], [506, 152], [636, 160], [708, 146], [410, 190]];
  oases.forEach(([ox, oy]) => {
    if (!nearBoard(ox, oy, 12, 5)) ponds += `<ellipse cx="${ox}" cy="${oy}" rx="4.2" ry="2.2" fill="#7fb1c2" stroke="#4f86a8" stroke-width=".5"/>`;
    for (let i = 0; i < 6; i++) {
      const x = ox + (rand() - 0.5) * 22, y = oy + (rand() - 0.5) * 12;
      if (nearBoard(x, y, 14, 6)) continue;
      trees.push({ kind: 'poplar', x, y });
    }
  });
  trees.sort((a, b) => a.y - b.y);
  out += `<g class="lay-terrain">${ponds}${trees.map(t => treeGlyph(t.kind, t.x, t.y, rand)).join('')}</g>`;

  // --- 山脉 ---
  const peaks = [];
  RANGES.forEach(rg => {
    const pal = PALETTES[rg.pal];
    const samples = samplePolyline(rg.pts, rg.step);
    const rows = rg.back ? [{ dy: -7, k: 0.72 }, { dy: 0, k: 1 }] : [{ dy: 0, k: 1 }];
    rows.forEach(row => {
      samples.forEach((p, i) => {
        const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
        const j = (rand() - 0.5) * 7;
        const x = p.x + nx * j + (rg.back && row.dy ? rand() * 4 : 0);
        const y = p.y + ny * j + row.dy;
        const s = (rg.s[0] + rand() * (rg.s[1] - rg.s[0])) * row.k;
        if (!isLand(x, y) || nearBoard(x, y - s * 0.6, 15 + s, 6)) return;
        peaks.push({ x, y, s, snowy: rand() < rg.snow, pal });
      });
    });
  });
  peaks.sort((a, b) => a.y - b.y);
  out += `<g class="lay-terrain mountains">${peaks.map(p => mountainGlyph(p.x, p.y, p.s, p.snowy, p.pal, rand)).join('')}</g>`;
  return out;
}

function waterLayer() {
  const { rivers } = buildShapes();
  let g = '<g class="rivers">';
  rivers.forEach(r => {
    const lodCls = r.lod ? ` lod${r.lod}` : '';
    g += `<g class="river${lodCls}">`;
    g += `<path d="${r.d}" fill="none" stroke="#eef5f1" stroke-width="${f1(r.w + 2.4)}" stroke-opacity=".55" stroke-linecap="round" stroke-linejoin="round"/>`;
    g += `<path id="dr-river-${r.key}" d="${r.d}" fill="none" stroke="${r.color}" stroke-width="${r.w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    g += '</g>';
  });
  // 恒河三角洲的汊流
  g += `<path d="M268,562 Q276,556 286,557 M270,564 Q278,572 288,579" fill="none" stroke="#5b93b8" stroke-width="1.1" stroke-linecap="round"/>`;
  g += '</g>';
  g += '<g class="lakes">';
  LAKES.forEach(l => {
    const lodCls = l.lod > 1 ? ` lod${l.lod}` : '';
    g += `<g class="lake${lodCls}">`;
    g += `<ellipse cx="${l.x}" cy="${l.y}" rx="${l.rx}" ry="${l.ry}" fill="${l.dry ? '#cfe0d6' : '#8ec0d0'}" stroke="#4f86a8" stroke-width=".8"${l.dry ? ' stroke-dasharray="2 1.4"' : ''}/>`;
    if (!l.dry) g += `<ellipse cx="${f1(l.x - l.rx * 0.2)}" cy="${f1(l.y - l.ry * 0.2)}" rx="${f1(l.rx * 0.5)}" ry="${f1(l.ry * 0.35)}" fill="none" stroke="#e8f4f6" stroke-width=".6" opacity=".8"/>`;
    g += '</g>';
  });
  g += '</g>';
  return g;
}

function wallLayer() {
  const wallD = curvePath(GREAT_WALL, false);
  let g = '<g class="great-wall">';
  g += `<path d="${wallD}" fill="none" stroke="#7a5a3a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  g += `<path d="${wallD}" fill="none" stroke="#d9bf8f" stroke-width="1.5" stroke-dasharray="1.6 1.3" stroke-linejoin="round"/>`;
  samplePolyline(GREAT_WALL, 34).forEach((p, i) => {
    if (i === 0 || nearBoard(p.x, p.y, 13, 0)) return;
    g += `<rect x="${f1(p.x - 2.2)}" y="${f1(p.y - 3.6)}" width="4.4" height="4.4" fill="#8b6a45" stroke="#4d3822" stroke-width=".4"/>`;
  });
  g += `<path d="${curvePath(HAN_WALL, false)}" fill="none" stroke="#8b6a45" stroke-width="1.3" stroke-dasharray="3 2.2" opacity=".75"/>`;
  // 河西走廊的烽燧(放大后可见)
  let beacons = '';
  [[662, 118], [676, 136], [722, 118], [775, 112], [826, 106]].forEach(([x, y]) => {
    if (nearBoard(x, y, 11, 4)) return;
    beacons += `<g transform="translate(${x},${y})"><path d="M-1.8,0 L-1.2,-4.5 H1.2 L1.8,0 Z" fill="#9b7a50" stroke="#4d3822" stroke-width=".35"/><path d="M0,-4.6 q-1,-2 .4,-3.2 q.6,1 -.4,3.2" fill="#e0763c"/></g>`;
  });
  g += `<g class="lod1">${beacons}</g>`;
  return g + '</g>';
}

// withFlow=false 时不画会流动的虚线(游戏地图把流动虚线放在单独的小 SVG 里,见 buildTravelersSvg)
function routeLayer(withFlow, latest) {
  const landCoords = routeCoords('land', latest);
  const seaCoords = routeCoords('sea', latest);
  const landD = linePath(landCoords, false), seaD = linePath(seaCoords, false);
  let g = `<path class="route-line route-land-casing" d="${landD}"/>`;
  if (withFlow) g += `<path class="route-line route-land" d="${landD}"/>`;
  g += `<path class="route-line route-sea-casing" d="${seaD}"/>`;
  if (withFlow) g += `<path class="route-line route-sea" d="${seaD}"/>`;
  // 放大后在航线上显示前进方向的小箭头
  let chevrons = '';
  [[landCoords, '#6b4424'], [seaCoords, '#1f5b8a']].forEach(([coords, color]) => {
    samplePolyline(coords, 26).forEach((p, i) => {
      if (i === 0 || nearBoard(p.x, p.y, 17, -1)) return;
      const deg = f1(p.ang * 180 / Math.PI);
      chevrons += `<path d="M-2,-2.2 L1.4,0 L-2,2.2" transform="translate(${f1(p.x)},${f1(p.y)}) rotate(${deg})" stroke="${color}"/>`;
    });
  });
  g += `<g class="lod1 route-chevrons" fill="none" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${chevrons}</g>`;
  // 玄奘真实路线(历史图层)
  g += `<g class="lod1 lay-history history-route">` +
    `<path d="${curvePath(XUANZANG_OUT, false)}"/><path d="${curvePath(XUANZANG_BACK, false)}"/></g>`;
  return g;
}

function decoLayer() {
  const rand = mulberry32(77);
  let g = '<g class="lay-deco">';

  // 海浪小纹
  let waves = '';
  for (let i = 0; i < 150; i++) {
    const x = 300 + rand() * 770, y = 250 + rand() * 380;
    if (!seaMargin(x, y, 9) || nearBoard(x, y, 20, 10)) continue;
    waves += waveGlyph(x, y, 2.4 + rand() * 1.6);
  }
  g += `<g class="sea-waves" fill="none" stroke="#2f6483" stroke-width=".7" stroke-linecap="round" opacity=".5">${waves}</g>`;

  // 海中生灵与船只(静态)
  g += whaleGlyph(984, 388, 1);
  g += turtleGlyph(628, 492, 1.1);
  g += dolphinGlyph(870, 290, 0.95, -8) + dolphinGlyph(884, 300, 0.8, 6);
  g += dolphinGlyph(420, 548, 0.8, 10);
  g += junkShip(960, 262, 0.95, -1);
  g += junkShip(846, 446, 0.85, 1);
  g += dhowShip(330, 612, 0.9, 1);
  g += dhowShip(452, 516, 0.8, -1);

  // 沙漠里的驼队、僧人(静态点缀)
  g += camelGlyph(526, 240, 0.9, -1) + camelGlyph(542, 241, 0.9, -1) + monkGlyph(512, 241, 0.9, -1);
  g += camelGlyph(760, 80, 0.75, 1) + camelGlyph(773, 80, 0.75, 1);

  // 石窟、佛塔等地标小画
  g += cavesGlyph(628, 166, 1);          // 莫高窟
  g += cavesGlyph(424, 128, 0.8);        // 克孜尔千佛洞
  g += pagodaGlyph(980, 108, 1);         // 大雁塔
  g += pagodaGlyph(1024, 100, 0.85);     // 洛阳白马寺
  g += stupaGlyph(222, 368, 1);          // 犍陀罗佛塔
  g += stupaGlyph(236, 604, 1.1);        // 菩提伽耶
  g += stupaGlyph(362, 481, 0.6);        // 狮子国
  g += stupaGlyph(682, 564, 0.8);        // 婆罗浮屠
  g += pagodaGlyph(858, 222, 0.8);       // 广州光孝寺

  // 法灯:陆上挂灯笼,海上放莲花灯
  [[957, 172], [612, 204], [382, 256], [256, 452], [736, 312], [560, 432], [640, 420], [404, 470], [760, 300], [322, 440]].forEach(([x, y]) => {
    if (nearBoard(x, y, 12, 5)) return;
    g += isLand(x, y) ? lanternGlyph(x, y) : lotusLampGlyph(x, y);
  });

  // 天竺风物:大象、村落
  g += elephantGlyph(150, 596, 1, 1) + elephantGlyph(167, 600, 0.7, 1);
  [[70, 520], [84, 526], [150, 452], [256, 596], [58, 408], [166, 604]].forEach(([x, y]) => {
    if (!nearBoard(x, y, 12, 5)) g += hutGlyph(x, y, 1);
  });

  // 祥云与仙鹤
  g += `<g class="anim-drift">${cloudScroll(642, 40, 0.9)}${cloudScroll(318, 132, 0.7)}${cloudScroll(1032, 132, 0.75)}</g>`;
  g += `<g class="anim-drift anim-drift-slow">${cloudScroll(790, 30, 0.6)}${cloudScroll(140, 214, 0.65)}</g>`;
  g += `<g class="anim-bob">${craneGlyph(560, 48, 1)}${craneGlyph(578, 58, 0.8)}${craneGlyph(594, 46, 0.7)}</g>`;
  g += `<g class="anim-bob anim-bob-slow">${craneGlyph(160, 440, 0.8)}${craneGlyph(174, 432, 0.65)}</g>`;
  g += '</g>';
  return g;
}

// 沿航线缓缓行进的商队与船只(切换"简洁动画"时整体隐藏)。
// mode='smil':用 SVG 自带的动画(主菜单背景);mode='js':只输出图形与参数,由 map.js 低频率地移动它们(游戏地图,更省电脑)
function travelersLayer(mode) {
  const fade = `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.04;.96;1" dur="DUR" begin="BEGIN" repeatCount="indefinite"/>`;
  const mover = (inner, route, dur, begin, reverse) => mode === 'js'
    ? `<g class="anim traveler" data-route="${route}" data-dur="${dur}" data-begin="${begin}" data-reverse="${reverse ? 1 : 0}" opacity="0">${inner}</g>`
    : `<g class="anim traveler" opacity="0">${inner}` +
      `<animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite"${reverse ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}><mpath href="#dr-route-${route}"/></animateMotion>` +
      fade.replace(/DUR/g, dur + 's').replace('BEGIN', begin + 's') + '</g>';
  const caravanWest = `<g transform="translate(0,-4)">${monkGlyph(-12, 0, 0.8, -1)}${camelGlyph(-2, 0, 0.75, -1)}${camelGlyph(10, 0, 0.75, -1)}</g>`;
  const caravanEast = `<g transform="translate(0,6)">${camelGlyph(-8, 0, 0.7, 1, '#7d5733')}${camelGlyph(3, 0, 0.7, 1, '#7d5733')}</g>`;
  const shipWest = `<g transform="translate(0,-2)">${junkShip(0, 0, 0.75, -1)}</g>`;
  const shipEast = `<g transform="translate(0,7)">${dhowShip(0, 0, 0.7, 1)}</g>`;
  return `<g class="lay-deco travelers">` +
    mover(caravanWest, 'land', 150, -20) +
    mover(caravanEast, 'land', 170, -95, true) +
    mover(shipWest, 'sea-water', 110, -10) +
    mover(shipEast, 'sea-water', 125, -70, true) +
    '</g>';
}

// 所有地图文字先整理成统一的"标注描述",再分别渲染成 SVG 文字(主菜单背景图)或 HTML 标注层(游戏地图)。
// 游戏地图用 HTML:缩放地图时 Chrome 需要为每个 SVG 文字重新排版(很慢),HTML 文字则不需要。
const ROSE = { x: 955, y: 494, r: 40 };
let textCache = null;
function textItems() {
  if (textCache) return textCache;
  const { rivers } = buildShapes();
  const items = [];
  LABELS.forEach(([text, x, y, size, cls, lod, rot]) => {
    const extra = cls.includes('lay-') ? '' : ' lay-labels';
    items.push({ text, x, y, size, cls: cls + extra, lod, rot: rot || 0 });
  });
  // 河流名称:取标注段的中点,顺着河道方向略微倾斜
  rivers.forEach(r => {
    if (!r.label) return;
    const pts = r.label;
    const mid = pts[Math.floor(pts.length / 2)];
    const a = pts[0], b = pts[pts.length - 1];
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    items.push({ text: r.name, x: mid[0], y: mid[1] - 2, size: r.lod === 2 ? 5 : 6.5, cls: `lbl-river lay-labels${r.key === 'huanghe' ? ' lbl-huanghe' : ''}`, lod: Math.max(1, r.lod), rot: f1(ang) });
  });
  LAKES.forEach(l => items.push({ text: l.name, x: l.x, y: f1(l.y + l.ry + 6), size: 5, cls: 'lbl-lake lay-labels', lod: Math.max(1, l.lod), rot: 0 }));
  items.push({ text: '长 城', x: 700, y: 96, size: 5, cls: 'lbl-note lay-labels', lod: 1, rot: 0 });
  items.push({ text: '汉长城遗址', x: 628, y: 98, size: 4.5, cls: 'lbl-note lay-labels', lod: 2, rot: 0 });
  // 罗盘上的汉字方位
  ['北', '东北', '东', '东南', '南', '西南', '西', '西北'].forEach((n, i) => {
    const a = i / 8 * Math.PI * 2 - Math.PI / 2;
    const big = i % 2 === 0;
    items.push({ text: n, x: f1(ROSE.x + Math.cos(a) * ROSE.r * 1.2), y: f1(ROSE.y + Math.sin(a) * ROSE.r * 1.2 + (big ? 3.4 : 2.4)),
      size: big ? 9 : 6, cls: 'rose-label' + (big ? ' rose-main' : ''), lod: 0, rot: 0 });
  });
  // 玄奘誓言(竖排题跋,从右往左读)
  [['宁', '可', '就', '西', '而', '死'], ['岂', '归', '东', '而', '生']].forEach((col, ci) => {
    col.forEach((ch, i) => items.push({ text: ch, x: 48 - ci * 13, y: 512 + i * 12.5, size: 11, cls: 'lbl-vow lay-labels', lod: 0, rot: 0 }));
  });
  items.push({ text: '—玄奘', x: 36, y: 592, size: 6, cls: 'lbl-vow-sign lay-labels', lod: 0, rot: 0 });
  textCache = items;
  return items;
}

function labelLayerSvg() {
  let g = '<g class="map-labels">';
  textItems().forEach(t => {
    const lodCls = t.lod ? ` lod${t.lod}` : '';
    const tr = t.rot ? ` transform="rotate(${t.rot} ${t.x} ${t.y})"` : '';
    g += `<text x="${t.x}" y="${t.y}" font-size="${t.size}" text-anchor="middle" class="${t.cls}${lodCls}"${tr}>${t.text}</text>`;
  });
  return g + '</g>';
}

function labelsHtml() {
  return textItems().map(t => {
    const lodCls = t.lod ? ` lod${t.lod}` : '';
    return `<span class="ml ${t.cls}${lodCls}" style="left:${f1(t.x / W * 100 * 100) / 100}%;top:${f1(t.y / H * 100 * 100) / 100}%;--fs:${t.size};--rot:${t.rot}deg">${t.text}</span>`;
  }).join('');
}

function chromeLayer() {
  let g = '';
  // 罗盘玫瑰与比例尺
  g += `<g filter="url(#dr-soft)">${windRose(ROSE.x, ROSE.y, ROSE.r)}</g>`;
  g += `<g class="lay-deco" opacity=".9">${windRose(440, 572, 18)}</g>`;
  g += `<g class="scale-bar" transform="translate(884,560)" filter="url(#dr-soft)">
      <rect width="142" height="30" rx="6" fill="#f4ecd8" stroke="#8a6a2f" stroke-width="1.3" opacity=".94"/>
      <path d="M12,21 H130" stroke="#5a4a30" stroke-width="1.6"/>
      <path d="M12,17 V25 M130,17 V25 M71,18 V24 M41.5,19 V23 M100.5,19 V23" stroke="#5a4a30" stroke-width="1.2"/>
      <path d="M12,21 H41.5" stroke="#5a4a30" stroke-width="3.2"/><path d="M71,21 H100.5" stroke="#5a4a30" stroke-width="3.2"/>
      <text x="71" y="12" text-anchor="middle" class="scale-bar-label">约 五 百 里</text>
    </g>`;

  // 题签(标题框)
  g += `<g class="cartouche" transform="translate(40,30)" filter="url(#dr-soft)">
      <path d="M-8,8 Q-14,36 -8,64 L4,60 Q0,36 4,12 Z" fill="#d8c496" stroke="#8a6a2f" stroke-width="1"/>
      <path d="M241,8 Q247,36 241,64 L229,60 Q233,36 229,12 Z" fill="#d8c496" stroke="#8a6a2f" stroke-width="1"/>
      <rect x="0" y="0" width="233" height="72" rx="8" fill="#f6eedb" stroke="#8a6a2f" stroke-width="2"/>
      <rect x="5" y="5" width="223" height="62" rx="5" fill="none" stroke="#b2503b" stroke-width=".8" opacity=".6"/>
      <text x="116" y="30" text-anchor="middle" class="cartouche-title">丝 路 求 法 图</text>
      <path d="M44,38 H188" stroke="#c9992f" stroke-width="1"/>
      <text x="116" y="52" text-anchor="middle" class="cartouche-sub">长安 —— 那烂陀寺 · 陆海双程</text>
      <text x="116" y="63" text-anchor="middle" class="cartouche-era">大唐贞观年间 · 取经路线示意</text>
    </g>`;
  g += sealStamp(262, 94, 20, ['丝', '路', '法', '灯'], -4);
  g += `<g class="lay-labels">${sealStamp(86, 600, 15, ['玄', '奘', '西', '行'], 3)}</g>`;

  return g;
}

function paperAndFrame() {
  let g = '';
  const tex = paperTexture();
  if (tex) g += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#dr-paper)" opacity=".28" style="mix-blend-mode:multiply" pointer-events="none"/>`;
  [[160, 470, 90], [860, 120, 70], [610, 590, 60], [980, 560, 50]].forEach(([x, y, r]) => {
    g += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#dr-stain)"/>`;
  });
  g += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#dr-vignette)" pointer-events="none"/>`;
  // 回纹边框
  const b = 16, o = 5;
  g += `<g class="map-frame">`;
  g += `<rect x="${o}" y="${o}" width="${W - o * 2}" height="${b}" fill="url(#dr-meander)"/>`;
  g += `<rect x="${o}" y="${H - o - b}" width="${W - o * 2}" height="${b}" fill="url(#dr-meander)"/>`;
  g += `<rect x="${o}" y="${o}" width="${b}" height="${H - o * 2}" fill="url(#dr-meander)"/>`;
  g += `<rect x="${W - o - b}" y="${o}" width="${b}" height="${H - o * 2}" fill="url(#dr-meander)"/>`;
  g += `<rect x="${o}" y="${o}" width="${W - o * 2}" height="${H - o * 2}" fill="none" stroke="#6b5230" stroke-width="1.6"/>`;
  g += `<rect x="${o + b}" y="${o + b}" width="${W - (o + b) * 2}" height="${H - (o + b) * 2}" fill="none" stroke="#6b5230" stroke-width="1.2"/>`;
  [[o, o], [W - o - b, o], [o, H - o - b], [W - o - b, H - o - b]].forEach(([x, y]) => {
    g += `<rect x="${x}" y="${y}" width="${b}" height="${b}" fill="#b2503b" stroke="#6b5230" stroke-width="1"/>`;
    g += `<circle cx="${x + b / 2}" cy="${y + b / 2}" r="4.2" fill="none" stroke="#f1dcb0" stroke-width="1.2"/>`;
    g += `<circle cx="${x + b / 2}" cy="${y + b / 2}" r="1.4" fill="#f1dcb0"/>`;
  });
  g += `</g>`;
  return g;
}

// ---------------- 对外接口 ----------------

const svgCache = {};
// withText=true:主菜单背景(文字画进 SVG,航线按最新站点表);false:游戏地图(航线按当前棋盘)
function buildSvg(withText) {
  const key = (withText ? 'text' : 'plain') + ':' + routeSig(withText);
  if (svgCache[key]) return svgCache[key];
  buildShapes();
  svgCache[key] = defsBlock() +
    `<g class="map-sea">${seaLayer()}</g>` +
    `<g class="map-land">${landLayer()}</g>` +
    gridLayer() +
    `<g class="map-relief">${reliefLayer()}</g>` +
    `<g class="map-water">${waterLayer()}</g>` +
    wallLayer() +
    decoLayer() +
    `<g class="map-routes">${routeLayer(withText, withText)}</g>` +
    (withText ? buildTravelersSvg('smil') : '') +
    (withText ? labelLayerSvg() : '') +
    `<g class="map-chrome">${chromeLayer()}</g>` +
    paperAndFrame();
  return svgCache[key];
}

// 鹰眼小地图:只保留海陆轮廓、主要河流与航线。withView=true 时带有视野框与棋子层(游戏内鹰眼),
// 否则只是一张干净的小地图(丝路百科里的"定位图")。
const miniCache = {};
function buildMinimap(withView) {
  const latest = !withView; // 游戏内鹰眼跟着当前棋盘;百科、出发准备的定位图按最新站点表
  const k = (withView ? 'v' : 'p') + ':' + routeSig(latest);
  if (miniCache[k]) return miniCache[k];
  const s = buildShapes();
  const landCoords = routeCoords('land', latest);
  const seaCoords = routeCoords('sea', latest);
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="#9cc4d0"/>`;
  g += `<path d="${s.landD}" fill="#ecdcb2" stroke="#6b5a3e" stroke-width="3"/>`;
  s.rivers.filter(r => !r.lod).forEach(r => { g += `<path d="${r.d}" fill="none" stroke="#5b93b8" stroke-width="5"/>`; });
  g += `<path d="${linePath(landCoords, false)}" fill="none" stroke="#8a5a2f" stroke-width="9" stroke-linejoin="round"/>`;
  g += `<path d="${linePath(seaCoords, false)}" fill="none" stroke="#2f6aa3" stroke-width="9" stroke-linejoin="round"/>`;
  if (withView) {
    g += `<g class="mm-tokens"></g>`;
    g += `<rect class="mm-view" x="0" y="0" width="${W}" height="${H}" fill="rgba(255,255,255,.2)" stroke="#b2503b" stroke-width="12"/>`;
  } else {
    g += `<g class="mm-pins"></g>`;
  }
  miniCache[k] = g;
  return g;
}

// 同一页面里需要第二份完整地图(主菜单背景)时,给所有内部 id 换一个前缀,避免与游戏地图的 id 冲突
// 游戏地图上的商队与船只放在一张单独的小 SVG 里:它们每一帧都在动,
// 如果画在几千个图形的大地图里,浏览器每一帧都要重绘整张地图。
const travelersCache = {};
function buildTravelersSvg(mode) {
  mode = mode || 'js';
  const latest = mode !== 'js'; // 'js' 是游戏地图(跟着当前棋盘),'smil' 是主菜单背景
  const key = mode + ':' + routeSig(latest);
  if (travelersCache[key]) return travelersCache[key];
  const landCoords = routeCoords('land', latest);
  const seaCoords = routeCoords('sea', latest);
  const flow = mode === 'js'
    ? `<path class="route-line route-land" d="${linePath(landCoords, false)}"/><path class="route-line route-sea" d="${linePath(seaCoords, false)}"/>`
    : '';
  travelersCache[key] = flow +
    `<path id="dr-route-land" d="${linePath(landCoords, false)}" fill="none" stroke="none"/>` +
    `<path id="dr-route-sea-water" d="${linePath(seaCoords.slice(1), false)}" fill="none" stroke="none"/>` +
    travelersLayer(mode);
  return travelersCache[key];
}

// 游戏地图(prefix 为空):不含 SVG 文字,地名由 labelsHtml() 生成的 HTML 标注层显示;
// 主菜单背景(prefix='hm'):静态展示,直接把文字画进 SVG。
const prefixed = {};
function buildSvgWithPrefix(prefix) {
  if (!prefix || prefix === 'dr') return buildSvg(false);
  if (!prefixed[prefix]) prefixed[prefix] = buildSvg(true).replace(/dr-/g, prefix + '-');
  return prefixed[prefix];
}

DR.MapArt = {
  W, H,
  svg: buildSvgWithPrefix,
  labelsHtml,
  travelersSvg: buildTravelersSvg,
  minimap: buildMinimap,
  isLand,
};

})();
