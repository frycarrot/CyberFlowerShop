/*
 * 赛博花店 · 花材目录 + 订单标记解析
 * 浏览器里挂在 window.CF 上；Node 里可以 require() 直接用（给 Astra 做后端/正则替换时复用）。
 *
 * 标记格式（推荐写法，详见 HANDOFF.md）：
 *   [花束:玫瑰1×3,向日葵2×1|包装纸3|丝带1|卡片:心形2|To:小兔|From:阿机|寄语:今天也很想你]
 */
(function (root) {
  'use strict';

  var CATALOG = {
    maxWeight: 10, // 一束花最多 10「支」，绣球按 2 支算
    flowers: {
      rose: {
        name: '玫瑰', aliases: ['玫瑰花', '玫瑰', 'rose'],
        meaning: '永恒的爱', quote: '我永远热烈地爱你',
        weight: 1, size: 0.15,
        colors: [
          { name: '烟粉', hex: '#DDA7A2' },
          { name: '豆沙红', hex: '#B9706B' },
          { name: '奶油白', hex: '#F1E4D3' },
          { name: '杏橘', hex: '#E4B48F' },
          { name: '香槟', hex: '#E8CFA9' }
        ]
      },
      forgetmenot: {
        name: '勿忘我', aliases: ['勿忘我', 'forgetmenot'],
        meaning: '永恒的记忆', quote: '即使记忆消失过千万次，我也想再一次与你相遇。',
        weight: 1, size: 0.12,
        colors: [
          { name: '雾蓝', hex: '#9DB4CE' },
          { name: '淡紫', hex: '#B6A9CB' },
          { name: '樱粉', hex: '#DDB4B9' },
          { name: '奶白', hex: '#F0E9DD' }
        ]
      },
      hyacinth: {
        name: '紫风信子', aliases: ['紫风信子', '风信子', 'hyacinth'],
        meaning: '无法弥补的歉意', quote: '如果我让你难过，请原谅我仍然舍不得离开。',
        weight: 1, size: 0.11,
        colors: [
          { name: '灰紫', hex: '#9F8FB8' },
          { name: '丁香紫', hex: '#BBA6CB' },
          { name: '雾蓝紫', hex: '#9AA3C4' }
        ]
      },
      sunflower: {
        name: '向日葵', aliases: ['向日葵', 'sunflower'],
        meaning: '明目张胆的偏爱', quote: '我永远会朝向你。',
        weight: 1, size: 0.18,
        colors: [
          { name: '奶黄', hex: '#E9C97E' },
          { name: '杏橙', hex: '#E2AA70' },
          { name: '柠檬奶', hex: '#ECDC9E' },
          { name: '酒红', hex: '#B97F68' }
        ]
      },
      hydrangea: {
        name: '绣球花', aliases: ['绣球花', '绣球', 'hydrangea'],
        meaning: '满满当当的爱', quote: '有好多喜欢你的理由，多到装不下。',
        weight: 2, size: 0.24,
        colors: [
          { name: '雾蓝', hex: '#A8BBD6' },
          { name: '雾紫', hex: '#BBA8CB' },
          { name: '樱粉', hex: '#DFB5BF' },
          { name: '奶绿', hex: '#C8D2AE' },
          { name: '奶白', hex: '#F0E8DA' }
        ]
      }
    },
    wrap: {
      name: '包装纸', aliases: ['包装纸', '包装', 'wrap'],
      colors: [
        { name: '牛皮纸', hex: '#D6BC98' },
        { name: '奶白', hex: '#F1E8D9' },
        { name: '雾粉', hex: '#E5C7C2' },
        { name: '鼠尾草绿', hex: '#B8C3A6' },
        { name: '雾蓝', hex: '#B6C4D2' },
        { name: '奶咖', hex: '#A98F7B' }
      ]
    },
    ribbon: {
      name: '丝带', aliases: ['蝴蝶结', '丝带', '绑带', 'ribbon'],
      colors: [
        { name: '豆沙', hex: '#B9817A' },
        { name: '奶白', hex: '#F3ECE0' },
        { name: '雾蓝', hex: '#8EA2B8' },
        { name: '橄榄', hex: '#8A9A78' },
        { name: '可可', hex: '#8C6F5E' },
        { name: '雾紫', hex: '#A898B5' }
      ]
    },
    card: {
      name: '卡片', aliases: ['卡片', '贺卡', 'card'],
      shapes: {
        heart: { name: '心形', aliases: ['心形', '爱心', '心', 'heart'] },
        square: { name: '方形', aliases: ['方形', '正方形', '方', 'square'] },
        round: { name: '圆形', aliases: ['圆形', '圆', 'round'] }
      },
      colors: [
        { name: '奶白', hex: '#F6EFE3' },
        { name: '雾粉', hex: '#EFD3CF' },
        { name: '奶黄', hex: '#F2E2B8' },
        { name: '雾蓝', hex: '#D3DEE8' },
        { name: '薄荷', hex: '#D7E3D0' }
      ]
    },
    limits: { to: 20, from: 20, message: 300 }
  };

  var DEFAULT_ORDER = {
    flowers: [{ type: 'rose', color: 1, count: 3 }],
    wrap: 1, ribbon: 1, card: { shape: 'heart', color: 1 },
    to: '', from: '', message: ''
  };

  // ---------- 小工具 ----------
  function lowerAliases(list) { return list.map(function (a) { return a.toLowerCase(); }); }

  // 按「别名最长优先」在字符串开头匹配
  function matchPrefix(str, table) {
    var s = str.toLowerCase(), best = null;
    Object.keys(table).forEach(function (key) {
      lowerAliases(table[key].aliases).forEach(function (a) {
        if (s.indexOf(a) === 0 && (!best || a.length > best.alias.length)) best = { key: key, alias: a };
      });
    });
    return best;
  }

  function startsWithAlias(str, aliases) {
    var s = str.toLowerCase();
    var sorted = lowerAliases(aliases).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < sorted.length; i++) if (s.indexOf(sorted[i]) === 0) return sorted[i].length;
    return 0;
  }

  // 只规范化「结构部分」，寄语原文不动
  function normHead(s) {
    return s
      .replace(/[：]/g, ':').replace(/[｜]/g, '|')
      .replace(/[＃]/g, '#').replace(/[，、;；]/g, ',')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\s+/g, '');
  }

  function pickColor(n, palette, label, warnings) {
    if (n == null || n === '') return 1;
    var i = parseInt(n, 10);
    if (!(i >= 1 && i <= palette.length)) {
      warnings.push(label + '没有 ' + n + ' 号色，已换成 1 号');
      return 1;
    }
    return i;
  }

  function clip(s, max) {
    s = (s || '').trim();
    return Array.from(s).slice(0, max).join('');
  }

  var KEY_TO = /^(to|给|致|送给)\s*[:：]/i;
  var KEY_FROM = /^(from|来自|署名|落款)\s*[:：]/i;
  var KEY_MSG = /(寄语|留言|message)\s*[:：]/i;
  var START = /[\[【［]\s*花束\s*[:：]/;
  var CLOSERS = [']', '】', '］'];

  function lastCloser(s) {
    var idx = -1;
    CLOSERS.forEach(function (c) { idx = Math.max(idx, s.lastIndexOf(c)); });
    return idx;
  }

  // ---------- 解析 ----------
  /**
   * 解析一段包含 [花束:...] 的文本。
   * 返回 { ok, order, warnings }；order 结构同 DEFAULT_ORDER。
   */
  function parseMarker(text) {
    var warnings = [];
    var order = {
      flowers: [], wrap: 1, ribbon: 1, card: { shape: 'heart', color: 1 },
      to: '', from: '', message: ''
    };
    text = String(text || '');
    var m = START.exec(text);
    var body;
    if (m) body = text.slice(m.index + m[0].length);
    else {
      var loose = text.indexOf('花束');
      if (loose < 0) return { ok: false, order: order, warnings: ['没找到 [花束:...] 标记'] };
      body = text.slice(loose + 2).replace(/^\s*[:：]/, '');
    }

    var head, message = null;
    var mm = KEY_MSG.exec(body);
    if (mm) {
      head = body.slice(0, mm.index);
      var rest = body.slice(mm.index + mm[0].length);
      var end = lastCloser(rest);
      message = end >= 0 ? rest.slice(0, end) : rest;
      // 家机把 To/From 写在寄语后面时，从尾巴上剥下来
      for (var guard = 0; guard < 2; guard++) {
        var bar = Math.max(message.lastIndexOf('|'), message.lastIndexOf('｜'));
        if (bar < 0) break;
        var tail = message.slice(bar + 1).trim();
        if (KEY_TO.test(tail) || KEY_FROM.test(tail)) { head += '|' + tail; message = message.slice(0, bar); }
        else break;
      }
    } else {
      var firstClose = -1;
      CLOSERS.forEach(function (c) {
        var i = body.indexOf(c);
        if (i >= 0 && (firstClose < 0 || i < firstClose)) firstClose = i;
      });
      head = firstClose >= 0 ? body.slice(0, firstClose) : body;
    }

    // To/From 的名字保留原样，只去掉首尾空格
    var rawSegs = head.split(/[|｜]/);
    var weight = 0;

    rawSegs.forEach(function (raw) {
      var seg = raw.trim();
      if (!seg) return;
      if (KEY_TO.test(seg)) { order.to = clip(seg.replace(KEY_TO, ''), CATALOG.limits.to); return; }
      if (KEY_FROM.test(seg)) { order.from = clip(seg.replace(KEY_FROM, ''), CATALOG.limits.from); return; }

      var s = normHead(seg);
      var n;
      if ((n = startsWithAlias(s, CATALOG.card.aliases))) {
        var cs = s.slice(n).replace(/^:/, '');
        var shape = matchPrefix(cs, CATALOG.card.shapes);
        if (shape) { order.card.shape = shape.key; cs = cs.slice(shape.alias.length); }
        else if (cs) warnings.push('卡片形状没看懂：「' + seg + '」，用了心形');
        var cm = /^#?(\d+)/.exec(cs);
        order.card.color = pickColor(cm && cm[1], CATALOG.card.colors, '卡片', warnings);
        return;
      }
      if ((n = startsWithAlias(s, CATALOG.wrap.aliases))) {
        var wm = /^:?#?(\d+)/.exec(s.slice(n));
        order.wrap = pickColor(wm && wm[1], CATALOG.wrap.colors, '包装纸', warnings);
        return;
      }
      if ((n = startsWithAlias(s, CATALOG.ribbon.aliases))) {
        var rm = /^:?#?(\d+)/.exec(s.slice(n));
        order.ribbon = pickColor(rm && rm[1], CATALOG.ribbon.colors, '丝带', warnings);
        return;
      }

      // 其余当作花材列表
      s.replace(/^花材?:/, '').split(',').forEach(function (item) {
        if (!item) return;
        var f = matchPrefix(item, CATALOG.flowers);
        if (!f) { warnings.push('不认识的花材：「' + item + '」，已跳过'); return; }
        var spec = CATALOG.flowers[f.key];
        var rest = item.slice(f.alias.length);
        var im = /^:?#?(\d{1,2})?(?:号|色)?(?:[×xX*✕✖](\d{1,2}))?(?:支|朵|枝)?$/.exec(rest);
        if (!im) { warnings.push('花材写法没看懂：「' + item + '」，按 1 支 1 号色处理'); im = []; }
        var color = pickColor(im[1], spec.colors, spec.name, warnings);
        var count = Math.max(1, parseInt(im[2] || '1', 10));
        var room = Math.floor((CATALOG.maxWeight - weight) / spec.weight);
        if (room <= 0) { warnings.push('超过 ' + CATALOG.maxWeight + ' 支上限，' + spec.name + '没放进去'); return; }
        if (count > room) {
          warnings.push(spec.name + '只放得下 ' + room + ' 支（上限 ' + CATALOG.maxWeight + ' 支，绣球算 2 支）');
          count = room;
        }
        weight += count * spec.weight;
        order.flowers.push({ type: f.key, color: color, count: count });
      });
    });

    if (message != null) order.message = clip(message, CATALOG.limits.message);
    if (!order.flowers.length) {
      warnings.push('没有识别到花，先放 3 支玫瑰');
      order.flowers = [{ type: 'rose', color: 1, count: 3 }];
    }
    return { ok: true, order: order, warnings: warnings };
  }

  /** 把 order 写回标准标记（示例页、重新生成链接时用） */
  function toMarker(order) {
    var F = CATALOG.flowers;
    var fl = order.flowers.map(function (f) { return F[f.type].name + f.color + '×' + f.count; }).join(',');
    var parts = [fl, '包装纸' + order.wrap, '丝带' + order.ribbon,
      '卡片:' + CATALOG.card.shapes[order.card.shape].name + order.card.color];
    if (order.to) parts.push('To:' + order.to);
    if (order.from) parts.push('From:' + order.from);
    parts.push('寄语:' + (order.message || ''));
    return '[花束:' + parts.join('|') + ']';
  }

  /** 生成链接：base 例如 https://xxx.github.io/cyber-flower-shop/ */
  function buildLink(base, marker) {
    return String(base).replace(/#.*$/, '') + '#' + encodeURIComponent(marker);
  }

  /**
   * 在一大段聊天文本里找出所有花束标记（给前端正则替换用）。
   * 结尾取「寄语之后、下一个标记之前」的最后一个右括号，所以寄语里出现 ] 也不会截断。
   */
  function findMarkers(text) {
    var out = [], re = new RegExp(START.source, 'g'), starts = [], m;
    while ((m = re.exec(text))) starts.push(m.index);
    starts.forEach(function (st, i) {
      var limit = i + 1 < starts.length ? starts[i + 1] : text.length;
      var chunk = text.slice(st, limit);
      var nl = chunk.search(/\r?\n\s*\r?\n/); // 空行视为结束
      if (nl > 0) chunk = chunk.slice(0, nl);
      var end = lastCloser(chunk);
      if (end > 0) out.push({ index: st, text: chunk.slice(0, end + 1) });
    });
    return out;
  }

  /** 生成给家机的「菜单提示词」 */
  function menuPrompt() {
    var lines = [];
    lines.push('【赛博花店菜单】想送我花的时候，在回复里单独输出一行花束标记：');
    lines.push('[花束:花名色号×数量,花名色号×数量|包装纸色号|丝带色号|卡片:形状色号|To:收花人|From:你的名字|寄语:想对我说的话]');
    lines.push('规则：最多 10 支花（绣球算 2 支）；寄语必须放在最后；寄语里不要用 [ ] | 这三个符号；标记写在同一行。');
    lines.push('');
    lines.push('花材（色号：颜色）：');
    Object.keys(CATALOG.flowers).forEach(function (k) {
      var f = CATALOG.flowers[k];
      lines.push('- ' + f.name + '（' + f.meaning + '）：' +
        f.colors.map(function (c, i) { return (i + 1) + c.name; }).join(' '));
    });
    ['wrap', 'ribbon'].forEach(function (k) {
      var g = CATALOG[k];
      lines.push('- ' + g.name + '：' + g.colors.map(function (c, i) { return (i + 1) + c.name; }).join(' '));
    });
    lines.push('- 卡片形状：心形 / 方形 / 圆形；卡片颜色：' +
      CATALOG.card.colors.map(function (c, i) { return (i + 1) + c.name; }).join(' '));
    lines.push('');
    lines.push('示例：[花束:玫瑰1×3,勿忘我1×2|包装纸2|丝带1|卡片:心形2|To:小兔|From:阿机|寄语:今天也很想你]');
    return lines.join('\n');
  }

  var api = {
    CATALOG: CATALOG, DEFAULT_ORDER: DEFAULT_ORDER,
    parseMarker: parseMarker, toMarker: toMarker, buildLink: buildLink,
    findMarkers: findMarkers, menuPrompt: menuPrompt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CF = Object.assign(root.CF || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
