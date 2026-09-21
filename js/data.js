/* 丝路法灯 · 大乘取经记 — 游戏数据
 * 纯数据文件:棋盘、事件卡、智慧问答、六度残页与队伍预设。
 * 不含逻辑,方便老师之后自行增删内容。
 */
var DR = window.DR || (window.DR = {});

DR.CONFIG = {
  diceSides: 6,
  startMerit: 10,
  bankTotal: 220,
  backpackCapacityBase: 4,
  backpackCapacityUpgraded: 6,
  buyCost: 4,          // 功德换法:花费多少功德换 1 张残页
  sellValue: 3,         // 译讲弘法:每张残页兑换多少功德
  fullSetBonus: 8,      // 集齐六度额外奖励
  firstArrivalBonus: 3, // 首次抵达新站点奖励
  roundTripBonus: 15,   // 完成往返奖励
  questionChance: 0.35,  // 落地时抽到"智慧问答"而非事件卡的概率
  defaultTimerMinutes: 30,
  sprintMinutesLeft: 5,  // 剩余多少分钟时进入"冲刺阶段"(骰子 +1)
  soundDefault: true,
};

// 六度(六波罗蜜)—— 以残页/法宝的形式作为游戏内收集品
DR.PARAMITAS = [
  { key: 'dana',    name: '布施', icon: '🎁', color: '#e05a5a', meaning: '慷慨分享、乐于助人' },
  { key: 'sila',    name: '持戒', icon: '📿', color: '#3b82c4', meaning: '遵守约定、行为端正' },
  { key: 'kshanti', name: '忍辱', icon: '🌿', color: '#4caf6d', meaning: '遇到委屈仍能平静、宽容' },
  { key: 'virya',   name: '精进', icon: '🔥', color: '#e8892b', meaning: '努力不懈、坚持到底' },
  { key: 'dhyana',  name: '禅定', icon: '🧘', color: '#8a5fc2', meaning: '专注安定、不受干扰' },
  { key: 'prajna',  name: '般若', icon: '💡', color: '#d4af37', meaning: '看清事情真相的智慧' },
];

DR.TEAM_PRESETS = [
  { name: '莲花队', icon: '🪷', color: '#e06c9f' },
  { name: '白象队', icon: '🐘', color: '#7c8ba1' },
  { name: '雄狮队', icon: '🦁', color: '#d99a3d' },
  { name: '神鹿队', icon: '🦌', color: '#a06a3c' },
  { name: '明灯队', icon: '🪔', color: '#e0a83d' },
  { name: '祥云队', icon: '☁️', color: '#6fa8c9' },
];

// ---------- 棋盘 ----------
// type: 'way'(普通驿站,随机抽卡) / 'site'(圣地,可结缘 + 随机抽卡) / 'story'(固定剧情) / 'final'(终点:那烂陀寺)
// crossover: 可在此地由陆路改海路(或反向),每队限一次
// x,y: 地图坐标(1000×600 画布空间);blurb: 点击站点时显示的一句历史小知识
DR.HOME_COORD = { x: 870, y: 70 };

DR.LAND_PATH = [
  { name: '陇西驿道', type: 'way', x: 770, y: 100,
    blurb: '长安通往西域的第一段官道,商旅、僧侣由此踏上万里征途。' },
  { name: '河西走廊', type: 'way', x: 680, y: 125,
    blurb: '夹在祁连山与沙漠之间的狭长通道,是丝路最重要的交通命脉。' },
  { name: '敦煌·莫高窟', type: 'site', offers: ['prajna', 'kshanti', 'dana'], crossover: true, x: 590, y: 150,
    blurb: '开凿于沙漠悬崖上的千年石窟,壁画中留下了"九色鹿"等佛教故事。' },
  { name: '高昌', type: 'story', x: 560, y: 90,
    blurb: '西域古国,国王麹文泰曾倾力资助玄奘西行求法。',
    story: {
      title: '高昌王的情谊',
      text: '高昌国王麹文泰十分敬重你,与你结为兄弟,赠予丰厚盘缠,还派士兵护送一程。',
      effect: { merit: 5 },
    } },
  { name: '火焰山驿站', type: 'way', x: 500, y: 115,
    blurb: '干燥炎热的红色山脉,后来成为《西游记》中的著名场景。' },
  { name: '龟兹', type: 'site', offers: ['prajna', 'virya', 'sila'], x: 430, y: 140,
    blurb: '西域佛教文化中心,伟大译经家鸠摩罗什的故乡。' },
  { name: '姑墨驿站', type: 'way', x: 370, y: 165,
    blurb: '丝路北道上的重要绿洲驿站,商队在此补给休整。' },
  { name: '葱岭雪道', type: 'way', x: 330, y: 210,
    blurb: '即帕米尔高原,山高路险、终年积雪,是丝路上最艰难的路段之一。' },
  { name: '迦湿弥罗', type: 'site', offers: ['dhyana', 'sila', 'kshanti'], x: 300, y: 270,
    blurb: '今克什米尔地区,古代佛教学术十分兴盛的高原之国。' },
  { name: '犍陀罗古道', type: 'way', x: 270, y: 325,
    blurb: '连接中亚与南亚的山间要道。' },
  { name: '犍陀罗', type: 'site', offers: ['dana', 'virya', 'prajna'], x: 245, y: 380,
    blurb: '古印度西北部,希腊与印度艺术在此融合,诞生了最早的佛像雕刻风格。' },
  { name: '天竺边境', type: 'way', x: 225, y: 430,
    blurb: '终于抵达"天竺"——古代中国对印度的称呼。' },
  { name: '王舍城外', type: 'way', x: 210, y: 475,
    blurb: '摩揭陀国故都近郊,佛陀曾在此长期说法。' },
  { name: '灵鹫山脚', type: 'way', x: 200, y: 520,
    blurb: '佛陀讲说《法华经》等大乘经典的圣地就在山上。' },
  { name: '那烂陀寺', type: 'final', offers: ['dana', 'sila', 'kshanti', 'virya', 'dhyana', 'prajna'], x: 195, y: 565,
    blurb: '古代世界最大的佛教学府,玄奘曾在此拜戒贤法师为师,潜心求学多年。',
    story: {
      title: '灵鹫山下,豁然开朗',
      text: '你终于抵达那烂陀寺,聆听高僧讲法,只觉心中豁然开朗!',
      effect: { merit: 6, fragment: 'random' },
    } },
];

DR.SEA_PATH = [
  { name: '广州港', type: 'way', x: 790, y: 230,
    blurb: '古代海上丝绸之路的重要起点,商船由此扬帆南下。' },
  { name: '交趾', type: 'way', crossover: true, x: 720, y: 280,
    blurb: '今越南北部,汉文化与东南亚文化交汇之地。' },
  { name: '占婆', type: 'site', offers: ['dana', 'kshanti', 'virya'], x: 650, y: 320,
    blurb: '古代中南半岛沿海古国,商船南下的重要补给站。' },
  { name: '南海季风道', type: 'way', x: 580, y: 355,
    blurb: '商船依靠季风航行:冬季南下,夏季北返。' },
  { name: '室利佛逝', type: 'site', offers: ['prajna', 'dhyana', 'virya'], x: 510, y: 390,
    blurb: '今苏门答腊一带的海上强国,高僧义净曾在此停留多年翻译佛经。' },
  { name: '马六甲海峡', type: 'way', x: 440, y: 415,
    blurb: '连接南海与印度洋的咽喉要道,自古商船云集。' },
  { name: '狮子国', type: 'site', offers: ['sila', 'kshanti', 'dhyana'], x: 370, y: 435,
    blurb: '今斯里兰卡,自古相传保存有佛陀的珍贵舍利与法物。' },
  { name: '南天竺外海', type: 'way', x: 320, y: 470,
    blurb: '临近印度南端的海域,风浪多变,考验着每一位航海者。' },
  { name: '南天竺登岸', type: 'story', x: 275, y: 505,
    blurb: '商船终于靠岸,踏上天竺的土地。',
    story: {
      title: '有惊无险',
      text: '商船在南天竺外海遭遇风浪,幸而平安靠岸,大家都松了一口气。',
      effect: { merit: 3 },
    } },
  { name: '恒河渡口', type: 'way', x: 235, y: 538,
    blurb: '圣河恒河岸边,渡河后便可直达佛教圣地。' },
  { name: '那烂陀寺', type: 'final', offers: ['dana', 'sila', 'kshanti', 'virya', 'dhyana', 'prajna'], x: 195, y: 565,
    blurb: '古代世界最大的佛教学府,玄奘曾在此拜戒贤法师为师,潜心求学多年。',
    story: {
      title: '灵鹫山下,豁然开朗',
      text: '你终于抵达那烂陀寺,聆听高僧讲法,只觉心中豁然开朗!',
      effect: { merit: 6, fragment: 'random' },
    } },
];

// ---------- 陆路机缘卡 ----------
DR.LAND_EVENTS = [
  { title: '驼铃遇故人', text: '途中遇见一位云游僧人,分享了几句安心的话与干粮。', effect: { merit: 3 } },
  { title: '抄经结缘', text: '你在驿站帮忙抄写了一页经文,心生欢喜。', effect: { fragment: 'random' } },
  { title: '施粥济困', text: '路边小庙正在施粥救济灾民,你也上前帮了一把。', effect: { merit: 2 } },
  { title: '商队互助', text: '邻近商队的骆驼生病了,你出手相助,对方以经卷相赠。', effect: { fragment: 'random' } },
  { title: '月夜共修', text: '夜宿驿站,大家围坐诵经,内心格外安定。', effect: { merit: 4 } },
  { title: '义结同心', text: '一位当地向导主动带路,商队少走了许多冤枉路。', effect: { merit: 3 } },
  { title: '沙漠骤起风沙', text: '商队被迫停下避风,前进的脚步慢了下来。', effect: { skipNext: true },
    positive: '这也是学习"忍辱"的好机会——风沙总会过去的。' },
  { title: '遇到拦路的假商人', text: '一名假商人想骗走你的钱财,幸好被你识破了大半。', effect: { merit: -3 },
    positive: '保持"般若"智慧,才能看清真假。' },
  { title: '水囊漏水', text: '途中水囊破损,损失了一些补给。', effect: { merit: -2 },
    positive: '从容面对小麻烦,也是一种修行。' },
  { title: '高原反应', text: '翻越雪山时身体有些不适,只好放慢脚步。', effect: { skipNext: true },
    positive: '精进不是急躁,而是稳步向前。' },
  { title: '驿站奇遇', text: '你在驿站的旧书堆里,意外翻到一页残破的经文。', effect: { fragment: 'random' } },
  { title: '香客相赠', text: '一位虔诚的香客见你远行辛苦,赠送了一些盘缠。', effect: { merit: 3 } },
  { title: '迷路小插曲', text: '商队走错了岔路,绕了一小段远路。', effect: { merit: -2 },
    positive: '走错路不可怕,能及时发现、调整方向就好。' },
  { title: '意外发现古井', text: '沙漠中意外发现一口清泉古井,商队士气大振。', effect: { merit: 4 } },
];

// ---------- 海路机缘卡 ----------
DR.SEA_EVENTS = [
  { title: '顺风启航', text: '出港时恰逢顺风,船行得又快又稳。', effect: { merit: 3 } },
  { title: '渔民相助', text: '友善的渔民送来新鲜的补给。', effect: { merit: 2 } },
  { title: '海上诵经', text: '船上僧人带领大家诵经祈福,人心安定。', effect: { merit: 3 } },
  { title: '拾得漂流经卷', text: '甲板上意外拾得一页被海浪冲来的经文残页。', effect: { fragment: 'random' } },
  { title: '商船互市', text: '与另一艘商船的僧侣交流心得,收获一页经卷。', effect: { fragment: 'random' } },
  { title: '海豚引路', text: '一群海豚跃出海面,仿佛在为商船引路。', effect: { merit: 4 } },
  { title: '突遇暴风雨', text: '船只在风浪中颠簸,损失了一些货物。', effect: { merit: -3 },
    positive: '惊涛骇浪之中保持镇定,正是"禅定"的功夫。' },
  { title: '桅杆受损', text: '桅杆在风浪中受损,不得不减速修理。', effect: { skipNext: true },
    positive: '修复的过程,也是精进的过程。' },
  { title: '淡水不足', text: '淡水储备告急,大家只好节约用水。', effect: { merit: -2 },
    positive: '学会知足与忍耐,也是一种智慧。' },
  { title: '遇见采珠人', text: '当地采珠人送给你一份小礼物。', effect: { merit: 3 } },
  { title: '迷航小插曲', text: '夜间辨认星象出了偏差,多绕了一段路。', effect: { merit: -2 },
    positive: '及时校正方向,继续前行就好。' },
  { title: '港口善缘', text: '靠岸休整时,当地寺院僧众热情款待。', effect: { fragment: 'random' } },
];

// ---------- 智慧问答(全班共答) ----------
DR.QUESTIONS = [
  { q: '佛教中的"六度",是菩萨修行的六种方法。下面哪一个不属于"六度"?',
    options: ['布施', '持戒', '孝顺', '精进'], answer: 2,
    note: '六度是布施、持戒、忍辱、精进、禅定、般若。孝顺很重要,但不在"六度"之中。' },
  { q: '"布施"最主要的意思是什么?',
    options: ['努力读书', '慷慨分享、乐于助人', '遵守纪律', '安静打坐'], answer: 1,
    note: '布施就是乐于分享、帮助他人,不一定是给钱,一句鼓励的话也是布施。' },
  { q: '唐朝高僧玄奘西行,主要目的是什么?',
    options: ['做生意赚钱', '去印度取回真经、弄懂佛法', '游山玩水', '寻找黄金'], answer: 1,
    note: '玄奘历经千辛万苦到天竺(印度)的那烂陀寺求学,带回大量佛经并翻译。' },
  { q: '玄奘取经的故事,后来被明代作家吴承恩写成了哪部小说?',
    options: ['《三国演义》', '《西游记》', '《水浒传》', '《封神演义》'], answer: 1,
    note: '《西游记》就是根据玄奘取经的真实历史改编、想象出来的神话小说。' },
  { q: '敦煌莫高窟壁画中"九色鹿"舍己救人却被恩将仇报的故事,主要告诉我们什么道理?',
    options: ['要诚实守信、知恩图报', '要跑得快', '要会游泳', '要多存钱'], answer: 0,
    note: '被救的人贪图赏金出卖了九色鹿,故事提醒我们要懂得感恩、信守承诺。' },
  { q: '观音菩萨在大乘佛教中,最常代表哪一种精神?',
    options: ['智慧', '慈悲', '勇敢', '富贵'], answer: 1,
    note: '观音菩萨"闻声救苦",象征着对众生的慈悲与关爱。' },
  { q: '文殊菩萨常手持宝剑、骑着狮子,他主要代表什么?',
    options: ['力量', '慈悲', '智慧', '长寿'], answer: 2,
    note: '文殊菩萨代表"大智",宝剑象征斩断烦恼的智慧。' },
  { q: '普贤菩萨的坐骑通常是什么动物?',
    options: ['狮子', '大象', '仙鹤', '老虎'], answer: 1,
    note: '普贤菩萨代表"大行"(脚踏实地去实践),白象象征稳重踏实。' },
  { q: '地藏菩萨最著名的大愿是"地狱不空,__"。',
    options: ['誓不成佛', '绝不回家', '永不睡觉', '绝不认输'], answer: 0,
    note: '这体现了大乘佛法"不为自己求安乐,但愿众生得离苦"的菩萨精神。' },
  { q: '弥勒菩萨常被画成笑口常开的样子,他代表什么样的心态?',
    options: ['骄傲自大', '包容乐观、大肚能容', '斤斤计较', '害怕困难'], answer: 1,
    note: '笑口常开、大肚能容,提醒我们要心胸开阔、乐观待人。' },
  { q: '古代"丝绸之路"除了运送丝绸、香料等货物,还传播了什么重要的思想文化?',
    options: ['佛教', '足球规则', '圣诞节', '万圣节'], answer: 0,
    note: '佛教就是通过丝绸之路,从古印度逐渐传入西域,再传入中国的。' },
  { q: '高僧鸠摩罗什的故乡,是丝路上的哪个古国?',
    options: ['龟兹', '大食', '波斯', '罗马'], answer: 0,
    note: '鸠摩罗什是历史上最伟大的佛经翻译家之一,来自西域古国龟兹。' },
  { q: '高僧义净西行取经,主要走的是哪条路线?',
    options: ['陆路', '海路', '骑马加坐飞机', '一直没出发'], answer: 1,
    note: '义净搭乘商船,经过室利佛逝(今苏门答腊)等地前往印度,并在当地翻译佛经多年。' },
  { q: '如果看到同学不小心弄坏了别人的东西,吓得不知所措,符合"慈悲"精神的做法是?',
    options: ['嘲笑他', '安慰他并帮他一起想办法', '告诉全班同学看笑话', '假装没看见'], answer: 1,
    note: '慈悲不是嘴上说说,而是在别人遇到困难时,真正伸出援手。' },
  { q: '"忍辱"并不是说什么都不能生气,而是指什么?',
    options: ['遇到委屈或挫折时能保持平静、不被怒气控制', '永远不能表达自己的想法',
      '必须什么都答应别人', '只能忍气吞声,不能解决问题'], answer: 0,
    note: '忍辱是一种智慧和力量,不是软弱,也不是压抑自己。' },
  { q: '"精进"最好的意思是?',
    options: ['三天打鱼两天晒网', '努力不懈,坚持完成目标', '一开始很努力后来就放弃', '什么都不做'], answer: 1,
    note: '精进就是认准目标后,持续努力、不轻易放弃。' },
  { q: '练习"禅定"的时候,最重要的是做到什么?',
    options: ['又唱又跳', '让心安静专注下来', '大声说话', '东张西望'], answer: 1,
    note: '禅定就是训练自己的心保持安定、专注,不容易被外界打扰。' },
  { q: '"般若"读作"bō rě",意思接近于?',
    options: ['财富', '武力', '看清事物真相的智慧', '长得漂亮'], answer: 2,
    note: '般若是一种能看透事物本质的智慧,是六度中最深的一度。' },
  { q: '大乘佛法特别强调,修行人不仅要自己觉悟,还要怎么样?',
    options: ['一个人躲起来修行就好', '发愿帮助所有众生一起离苦得乐',
      '只帮助自己的家人', '追求个人的财富自由'], answer: 1,
    note: '这就是"上求菩提,下化众生"的菩萨道精神,也是"大乘"(能载很多人的大车)这个名字的由来。' },
  { q: '那烂陀寺在古代是一座非常有名的什么场所?',
    options: ['王宫', '佛教最高学府,来自各国的僧人在此求学', '军事要塞', '商业市场'], answer: 1,
    note: '玄奘就曾在那烂陀寺跟随戒贤法师学习多年。' },
];
