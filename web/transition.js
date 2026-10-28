// Переход между страницами при входе и выходе: от нажатой кнопки разлетаются белые снежинки и заливают
// экран, на секунду по центру идут медведь и олень на фоне леса, а на новой странице заливка
// рассыпается обратно в снежинки. Так открываются вход с карты, кабинет после входа, регистрации
// и гостевого входа, вход после выхода из аккаунта.
//
// Анимация запечена, чтобы не нагружать телефоны: восемь снежинок при нажатии один раз рисуются
// в атлас квадратиков вместе со всеми кадрами их жизни, дальше на каждом кадре готовые квадратики
// только копируются на холст. Шаг лап тоже
// посчитан заранее — 16 поз на цикл, между ними браузер переходит сам (SVG <animate>).
//
// <a href="login.html" data-transition> — ссылка с переходом.
// Из скрипта: PageTransition.go('account.html', {from:кнопка, replace:true}) — волна идёт от кнопки,
// replace — без записи в историю (как location.replace). Такие кнопки тоже помечены data-transition:
// кадры снежинок запекаются уже при нажатии.
// На каждой странице сайта: transition.js в <head> и <script>PageTransition.resume()</script> сразу
// после <body> — тогда белый экран с животными есть уже на первой отрисовке новой страницы.
// PageTransition.revealed — промис: страница открылась (выполнен сразу, если перехода не было).
(function () {
  const storeKey = 'gazprom1-transition';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // мс: snow — жизнь одной снежинки, spread — запаздывание волны в дальнем углу, fade — появление сцены,
  // hold — сцена перед уходом со страницы, settle — сцена на новой странице, wait — дольше загрузку не ждём
  const timing = {snow:520, spread:420, fade:240, hold:760, settle:320, wait:1500};
  const flakeFrames = 20;
  const flakeTurns = 2;
  const baked = new Map();
  let revealDone;
  const revealed = new Promise(resolve => { revealDone = resolve; });
  let busy = false;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  // Шаг сетки снежинок и размер квадратика атласа (снежинка вырастает до 3.6 шага)
  const flakeGap = width => width < 720 ? 14 : 18;
  const flakeCell = (gap, dpr) => Math.min(96, Math.ceil(gap * 3.6 * dpr));
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
  const round = value => Math.round(value * 10) / 10;

  function seeded(seed) {
    return () => {
      seed = seed * 16807 % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  // Снежинки по образцам: шесть лучей, на луче веточки-галочки [где от центра, длина] в долях луча,
  // ring — шестиугольник между лучами на этом расстоянии. Первые четыре толстые, остальные тонкие.
  const flakeShapes = [
    {width:0.2, branches:[[0.5, 0.34], [0.78, 0.18]]},
    {width:0.2, ring:0.42, branches:[[0.7, 0.26]]},
    {width:0.18, branches:[[0.36, 0.22], [0.64, 0.3]]},
    {width:0.18, ring:0.3, branches:[[0.58, 0.34]]},
    {width:0.11, branches:[[0.62, 0.34]]},
    {width:0.11, ring:0.5, branches:[[0.8, 0.16]]},
    {width:0.11, branches:[[0.3, 0.2], [0.58, 0.26], [0.84, 0.12]]},
    {width:0.11, branches:[[0.45, 0.3], [0.72, 0.2]]}
  ];

  function drawFlake(ctx, shape, ray) {
    const at = (along, angle) => [Math.cos(angle) * along * ray, Math.sin(angle) * along * ray];
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const angle = k * Math.PI / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(...at(1, angle));
      for (const [along, length] of shape.branches) {
        const [bx, by] = at(along, angle);
        for (const side of [-1, 1]) {
          const twig = angle + side * Math.PI * 0.3;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(twig) * length * ray, by + Math.sin(twig) * length * ray);
        }
      }
      if (shape.ring) {
        ctx.moveTo(...at(shape.ring, angle));
        ctx.lineTo(...at(shape.ring, angle + Math.PI / 3));
      }
    }
    ctx.stroke();
  }

  // Снежинки запекаются в атлас квадратиков cell×cell: строка — узор и стартовый поворот (вращается
  // каждая в свою сторону), столбец — кадр жизни снежинки. Она плавно проявляется маленькой и крутится,
  // потом растёт, лучи толстеют и между ними заливается шестиугольник: последний кадр — сплошной белый
  // шестиугольник на весь квадратик. Соседние перекрываются, и экран становится белым без единой точки.
  function bakeFlakes(cell) {
    if (baked.has(cell)) return baked.get(cell);
    const atlas = document.createElement('canvas');
    atlas.width = cell * flakeFrames;
    atlas.height = cell * flakeShapes.length * flakeTurns;
    const ctx = atlas.getContext('2d');
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    flakeShapes.forEach((shape, index) => {
      for (let turn = 0; turn < flakeTurns; turn++) {
        for (let frame = 1; frame < flakeFrames; frame++) {
          const u = frame / (flakeFrames - 1);
          const late = Math.max(0, (u - 0.6) / 0.4);
          const radius = cell / 2 * (u < 0.6 ? 0.28 + 0.2 * u : 0.4 + 0.6 * late * late);
          const width = radius * (shape.width + (0.9 - shape.width) * late * late);
          const hexagon = late > 0.5 ? radius * (late - 0.5) * 2 : 0;
          ctx.save();
          ctx.translate(frame * cell + cell / 2, (index * flakeTurns + turn) * cell + cell / 2);
          ctx.rotate(turn * Math.PI / 6 + (turn ? -0.6 : 0.6) * u);
          ctx.globalAlpha = Math.min(1, u / 0.2);
          ctx.lineWidth = width;
          drawFlake(ctx, shape, radius - width / 2 - 0.5);
          if (hexagon) {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) ctx.lineTo(Math.cos(k * Math.PI / 3) * hexagon, Math.sin(k * Math.PI / 3) * hexagon);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    });
    baked.set(cell, atlas);
    return atlas;
  }

  // Шум Перлина: в узлах сетки случайные направления, между узлами плавное смешивание (−0.7…0.7)
  function perlin(random) {
    const angles = Array.from({length:256}, () => random() * Math.PI * 2);
    const perm = Array.from({length:256}, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const k = Math.floor(random() * (i + 1));
      [perm[i], perm[k]] = [perm[k], perm[i]];
    }
    const corner = (i, j, x, y) => {
      const angle = angles[perm[(perm[i & 255] + j) & 255]];
      return Math.cos(angle) * (x - i) + Math.sin(angle) * (y - j);
    };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => {
      const i = Math.floor(x), j = Math.floor(y);
      const u = fade(x - i), v = fade(y - j);
      const a = corner(i, j, x, y), b = corner(i + 1, j, x, y);
      const c = corner(i, j + 1, x, y), d = corner(i + 1, j + 1, x, y);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  // Снежинки по всему экрану на неровной сетке, у каждой свой узор, поворот и размер. Когда какой
  // проявиться, решают расстояние от origin и шум Перлина: фронт неровный, ничего не повторяется,
  // и каждый переход рисует новый узор. Кадр — только копирование готовых квадратиков из атласа.
  // reverse — обратно: из белого в снежинки и в пустоту. Первый кадр рисуется сразу, до возврата.
  function playSnow(canvas, origin, reverse) {
    const dpr = pixelRatio();
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const gap = flakeGap(width);
    const cell = flakeCell(gap, dpr);
    const atlas = bakeFlakes(cell);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    const random = seeded(1 + Math.floor(Math.random() * 2147483645));
    const noise = perlin(random);
    const far = Math.max(...[[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => Math.hypot(x - origin.x, y - origin.y)));
    const flakes = [];
    let latest = 0;
    for (let row = -1; row * gap < height + gap; row++) {
      for (let column = -1; column * gap < width + gap; column++) {
        const x = (column + 0.5 + (random() - 0.5) * 0.6) * gap;
        const y = (row + 0.5 + (random() - 0.5) * 0.6) * gap;
        const patch = Math.min(1, Math.max(0, 0.5 + 0.6 * (noise(x / 260, y / 260) + 0.5 * noise(x / 110, y / 110))));
        const delay = timing.spread * (0.55 * Math.hypot(x - origin.x, y - origin.y) / far + 0.45 * patch) + random() * 0.15 * timing.snow;
        const size = gap * 3 * (0.9 + random() * 0.3);
        flakes.push({x:x - size / 2, y:y - size / 2, size, row:Math.floor(random() * flakeShapes.length * flakeTurns) * cell, delay});
        latest = Math.max(latest, delay);
      }
    }
    const total = latest + timing.snow;
    return new Promise(resolve => {
      const started = performance.now();
      function frame(now) {
        const time = now - started;
        ctx.clearRect(0, 0, width, height);
        if (time >= total) {
          if (!reverse) ctx.fillRect(0, 0, width, height);
          resolve();
          return;
        }
        for (const flake of flakes) {
          const progress = Math.min(1, Math.max(0, (time - flake.delay) / timing.snow));
          const index = Math.round((reverse ? 1 - progress : progress) * (flakeFrames - 1));
          if (index) ctx.drawImage(atlas, index * cell, flake.row, cell, cell, flake.x, flake.y, flake.size, flake.size);
        }
        requestAnimationFrame(frame);
      }
      frame(started);
    });
  }

  // Гладкий контур через точки (Catmull-Rom); точка с третьим элементом 1 — острый угол
  function smooth(points, closed = false) {
    const n = points.length;
    const at = i => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    const tangent = i => {
      if (at(i)[2]) return [0, 0];
      const a = at(i - 1), b = at(i + 1);
      return [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6];
    };
    let d = `M${round(points[0][0])} ${round(points[0][1])}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p = at(i), q = at(i + 1), t1 = tangent(i), t2 = tangent(i + 1);
      d += `C${round(p[0] + t1[0])} ${round(p[1] + t1[1])} ${round(q[0] - t2[0])} ${round(q[1] - t2[1])} ${round(q[0])} ${round(q[1])}`;
    }
    return closed ? `${d}Z` : d;
  }

  // Нога в фазе шага u (0…1): сначала лапа стоит и уезжает назад, потом по дуге переносится вперёд.
  // Колено находится по длинам бедра и голени: передние ноги сгибаются коленом вперёд, задние — назад.
  function legPath(leg, u) {
    const [hx, hy] = leg.hip;
    const [l1, l2] = leg.lengths;
    let shift, lift = 0, swing = 0;
    if (u < leg.stance) shift = leg.stride * (1 - 2 * u / leg.stance);
    else {
      const v = (u - leg.stance) / (1 - leg.stance);
      shift = leg.stride * (2 * v * v * (3 - 2 * v) - 1);
      lift = leg.lift * Math.sin(Math.PI * v);
      swing = Math.sin(Math.PI * v);
    }
    const tx = hx + shift, ty = leg.ground - leg.height - lift;
    const reach = Math.min(Math.hypot(tx - hx, ty - hy), l1 + l2 - 0.01);
    const bend = Math.acos(Math.min(1, (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach)));
    const thigh = Math.atan2(ty - hy, tx - hx) + (leg.front ? -bend : bend);
    const knee = [hx + Math.cos(thigh) * l1, hy + Math.sin(thigh) * l1];
    const shin = Math.atan2(ty - knee[1], tx - knee[0]);
    const ankle = [knee[0] + Math.cos(shin) * l2, knee[1] + Math.sin(shin) * l2];
    const kneeAngle = (thigh + shin) / 2;
    const [wHip, wKnee, wAnkle] = leg.widths;
    // sign -1 — передний край ноги, 1 — задний
    const edge = (point, angle, width, sign) => [point[0] - Math.sin(angle) * width / 2 * sign, point[1] + Math.cos(angle) * width / 2 * sign];
    // Стопа в своей системе: x — вперёд по земле, y — вниз от лодыжки; в переносе подворачивается на curl
    const turn = leg.curl * swing;
    const foot = ([x, y]) => [ankle[0] + x * Math.cos(turn) - y * Math.sin(turn), ankle[1] + x * Math.sin(turn) + y * Math.cos(turn)];
    const h = leg.height;
    return smooth([
      edge(leg.hip, thigh, wHip, -1),
      edge(knee, kneeAngle, wKnee, -1),
      edge(ankle, shin, wAnkle, -1),
      foot([wAnkle / 2 + 0.6, h * 0.55]),
      foot([leg.toe, h - 1.4]),
      foot([leg.toe - 1.6, h]),
      foot([1 - leg.heel, h]),
      foot([-leg.heel, h - 1.6]),
      edge(ankle, shin, wAnkle, 1),
      edge(knee, kneeAngle, wKnee, 1),
      edge(leg.hip, thigh, wHip, 1)
    ]);
  }

  function walkingLeg(leg, cycle, begin) {
    const poses = 16;
    const values = Array.from({length:poses + 1}, (_, i) => legPath(leg, (i / poses + leg.phase) % 1));
    return `<path${leg.far ? ' class="pt-far"' : ''} d="${values[0]}"><animate attributeName="d" dur="${cycle}s" begin="${begin}" repeatCount="indefinite" values="${values.join(';')}"/></path>`;
  }

  // Фаза ноги: лапы ставятся по очереди — ближняя задняя, ближняя передняя, дальняя задняя, дальняя передняя
  function legs(hips, front, hind) {
    const [farHind, farFront, nearHind, nearFront] = hips;
    return [
      {...hind, hip:farHind, phase:0.5, far:true},
      {...front, hip:farFront, phase:0.25, far:true},
      {...hind, hip:nearHind, phase:0},
      {...front, hip:nearFront, phase:0.75}
    ];
  }

  const bearLeg = {ground:100, height:7, toe:10, heel:5, stride:10, lift:7, stance:0.62};
  const deerLeg = {ground:160, height:4, toe:3.2, heel:2, stride:10, lift:9, stance:0.62};

  const animals = [
    {
      // Медведь: координаты в своей рамке, земля на y = 100
      place:'translate(181 160) scale(.78)',
      stroke:2.3,
      cycle:1.1,
      body:[
        [16, 47], [21, 35], [38, 28], [62, 26], [84, 21], [98, 18], [111, 21], [122, 29],
        [129, 35, 1], [131, 30], [136, 29], [139, 34, 1],
        [147, 38], [158, 45], [166, 51], [166, 56], [158, 59], [148, 60], [138, 58],
        [128, 59], [118, 63], [96, 66], [60, 66], [36, 65], [24, 62], [17, 55]
      ],
      details:'<circle class="pt-ink" cx="148" cy="42" r="1.6"/><circle class="pt-ink" cx="164.6" cy="53.4" r="2.4"/>',
      legs:legs(
        [[44, 56], [100, 56], [34, 56], [110, 56]],
        {...bearLeg, front:true, lengths:[21, 20], widths:[20, 15, 13], curl:1.1},
        {...bearLeg, front:false, lengths:[21, 20], widths:[24, 16, 13], curl:0.5}
      )
    },
    {
      // Олень: земля на y = 160, рога выше головы
      place:'translate(352 121) scale(.72)',
      stroke:2.5,
      cycle:1,
      behind:'<path class="pt-open pt-far" d="M112 38C114 29 112 20 118 10M114 25L122 19M116 15L124 10"/>',
      body:[
        [24, 75], [46, 73], [70, 73], [86, 70], [94, 57], [101, 45],
        [104, 41, 1], [98, 37], [93, 35, 1], [100, 34], [107, 37, 1],
        [114, 38], [123, 43], [129, 47, 1], [128, 51], [120, 53], [113, 52],
        [109, 56], [106, 66], [101, 82], [98, 94], [91, 101], [68, 102], [44, 101], [30, 98], [20, 90],
        [17, 82], [14, 76, 1], [19, 76, 1]
      ],
      details:'<path class="pt-open" d="M108 38C106 29 100 21 102 9M104 24L113 16M102 15L95 7M102 9L108 1"/>' +
        '<circle class="pt-ink" cx="117" cy="42" r="1.3"/><circle class="pt-ink" cx="127.6" cy="48.4" r="1.4"/>',
      legs:legs(
        [[40, 94], [82, 94], [31, 94], [90, 94]],
        {...deerLeg, front:true, lengths:[31, 32], widths:[10, 5.5, 4.5], curl:1.2},
        {...deerLeg, front:false, lengths:[32, 32], widths:[12, 6, 4.5], curl:0.5}
      )
    }
  ];

  function animalMarkup(animal, begin) {
    const far = animal.legs.filter(leg => leg.far).map(leg => walkingLeg(leg, animal.cycle, begin)).join('');
    const near = animal.legs.filter(leg => !leg.far).map(leg => walkingLeg(leg, animal.cycle, begin)).join('');
    return `<g class="pt-animal" transform="${animal.place}" stroke-width="${animal.stroke}">${far}` +
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -.8;0 0;0 -.8;0 0" dur="${animal.cycle}s" begin="${begin}" repeatCount="indefinite"/>` +
      `${animal.behind || ''}<path d="${smooth(animal.body, true)}"/>${animal.details}</g>${near}</g>`;
  }

  // Ель-«ёлочка»: ствол и ветки галочками
  function spruce(x, base, height) {
    const tiers = Math.max(3, Math.round(height / 12));
    let d = `M${x} ${base}V${base - height}`;
    for (let i = 0; i < tiers; i++) {
      const y = base - height * 0.16 - height * 0.8 * i / tiers;
      const w = height * 0.28 * (1 - i / tiers) + 2.5;
      d += `M${round(x - w)} ${round(y + w * 0.6)}L${x} ${round(y)}L${round(x + w)} ${round(y + w * 0.6)}`;
    }
    return `<path d="${d}"/>`;
  }

  // Ель ярусами: три треугольника и ствол, залита белым и закрывает горы за собой
  function fir(x, base, height) {
    const top = base - height;
    const tiers = [[0.36, 0.17], [0.62, 0.25], [0.86, 0.32]];
    const steps = tiers.flatMap(([at, half], i) => {
      const y = round(top + height * at), w = height * half;
      return [[w, y], [i === tiers.length - 1 ? 2 : w * 0.45, y]];
    });
    const right = steps.map(([w, y]) => `L${round(x + w)} ${y}`).join('');
    const left = steps.reverse().map(([w, y]) => `L${round(x - w)} ${y}`).join('');
    return `<path class="pt-fill" d="M${x} ${top}${right}L${x + 2} ${base}L${x - 2} ${base}${left}Z"/>`;
  }

  function sun(x, y, r) {
    let d = `M${x - r} ${y}A${r} ${r} 0 1 0 ${x + r} ${y}A${r} ${r} 0 1 0 ${x - r} ${y}`;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      d += `M${round(x + Math.cos(a) * (r + 5))} ${round(y + Math.sin(a) * (r + 5))}L${round(x + Math.cos(a) * (r + 10))} ${round(y + Math.sin(a) * (r + 10))}`;
    }
    return `<path d="${d}"/>`;
  }

  const forest = () => [
    '<path d="M30 236L80 166L100 188L134 128L176 196L188 186L214 236"/>',
    '<path d="M71.4 178L76 173.5L80 180L85 174.5L90.9 178M123.8 146L129 141L133 148L138 142L145.1 146"/>',
    '<path d="M436 236L470 190L484 204L520 136L552 178L568 160L612 236"/>',
    '<path d="M510.5 154L515 149L519 156L525 150L533.7 154M559.1 170L563 166L567 172L573.8 170"/>',
    sun(428, 66, 14),
    '<path class="pt-fill" d="M214 98H262A9 9 0 0 0 255 84A13 13 0 0 0 230 79A10 10 0 0 0 215 91A7 7 0 0 0 214 98Z"/>',
    '<path d="M180 106H204M270 92H292M276 100H288"/>',
    spruce(48, 236, 64), fir(72, 236, 88), spruce(98, 236, 106), fir(124, 236, 60), spruce(150, 236, 42),
    spruce(474, 236, 52), fir(498, 236, 94), spruce(524, 236, 72), fir(552, 236, 110), spruce(580, 236, 64), spruce(604, 236, 44),
    '<path d="M24 236H616"/>'
  ].join('');

  // Сцена: статичный лес, бегущие штрихи земли и животные. elapsed — сколько секунд они уже идут
  // (на новой странице шаг продолжается с той же фазы, что был на карте).
  function scene(elapsed) {
    const begin = `${-Math.max(0, elapsed).toFixed(2)}s`;
    return `<svg viewBox="0 0 640 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
      `<g class="pt-forest">${forest()}</g>` +
      `<g class="pt-trail"><path d="M0 247H640" stroke-dasharray="22 38"><animate attributeName="stroke-dashoffset" from="0" to="60" dur="2.6s" begin="${begin}" repeatCount="indefinite"/></path>` +
      `<path d="M0 255H640" stroke-dasharray="6 54"><animate attributeName="stroke-dashoffset" from="0" to="60" dur="2.1s" begin="${begin}" repeatCount="indefinite"/></path></g>` +
      animals.map(animal => animalMarkup(animal, begin)).join('') +
      '</svg>';
  }

  function createOverlay(elapsed) {
    const overlay = document.createElement('div');
    overlay.className = 'page-transition';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `<canvas class="pt-snow" aria-hidden="true"></canvas><div class="pt-scene">${scene(elapsed)}<p class="pt-caption">Пожалуйста, подождите</p></div>`;
    return overlay;
  }

  function settle(overlay) {
    if (reduceMotion) overlay.querySelector('svg').pauseAnimations();
  }

  // Цвет полосы браузера на телефоне: белый, пока закрыт экран, потом — цвет страницы
  function tint(color) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    if (!meta.dataset.pageColor) meta.dataset.pageColor = meta.content;
    meta.content = color || meta.dataset.pageColor;
  }

  function centerOf(element) {
    if (!element) return {x:innerWidth / 2, y:innerHeight / 2};
    const rect = element.getBoundingClientRect();
    return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
  }

  async function go(href, {origin, from, replace = false} = {}) {
    if (busy) return;
    busy = true;
    origin = origin || centerOf(from);
    const overlay = createOverlay(0);
    document.body.append(overlay);
    settle(overlay);
    const sceneStart = Date.now();
    const prefetch = document.createElement('link');
    prefetch.rel = 'prefetch';
    prefetch.href = href;
    document.head.append(prefetch);
    if (!reduceMotion) await playSnow(overlay.querySelector('.pt-snow'), origin, false);
    overlay.classList.add('is-solid', 'show-scene');
    tint('#ffffff');
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({at:Date.now(), scene:sceneStart}));
    } catch (error) {
      // без sessionStorage новая страница просто откроется без обратной анимации
    }
    await wait(timing.fade + timing.hold);
    if (replace) location.replace(href);
    else location.href = href;
  }

  // Метка перехода стирается только при открытии: если страница сразу уводит дальше
  // (кабинет без входа → страница входа), белый экран с животными достаётся следующей
  function forget() {
    try {
      sessionStorage.removeItem(storeKey);
    } catch (error) {
      // нечего стирать
    }
  }

  function resume() {
    let state = null;
    try {
      state = JSON.parse(sessionStorage.getItem(storeKey));
    } catch (error) {
      state = null;
    }
    if (!state || Date.now() - state.at > 10000) {
      forget();
      revealDone();
      return;
    }
    const root = document.documentElement;
    root.classList.add('pt-enter');
    tint('#ffffff');
    const overlay = createOverlay((Date.now() - state.scene) / 1000);
    overlay.classList.add('is-solid', 'show-scene');
    document.body.prepend(overlay);
    settle(overlay);
    const shown = Date.now();
    const loaded = new Promise(resolve => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, {once:true});
    });
    Promise.race([loaded, wait(timing.wait)])
      .then(() => wait(timing.settle - (Date.now() - shown)))
      .then(async () => {
        forget();
        overlay.classList.remove('show-scene');
        await wait(timing.fade);
        overlay.querySelector('.pt-scene').hidden = true;
        root.classList.remove('pt-enter');
        tint();
        revealDone();
        if (!reduceMotion) {
          const playing = playSnow(overlay.querySelector('.pt-snow'), {x:innerWidth / 2, y:innerHeight / 2}, true);
          overlay.classList.remove('is-solid');
          await playing;
        }
        overlay.remove();
        baked.clear();
      });
  }

  // Кадры запекаются, пока кнопка мыши или палец ещё нажаты, — к клику они уже готовы
  document.addEventListener('pointerdown', event => {
    if (!reduceMotion && event.target.closest && event.target.closest('[data-transition]')) {
      bakeFlakes(flakeCell(flakeGap(document.documentElement.clientWidth), pixelRatio()));
    }
  });

  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a[data-transition]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(link.href, event.detail ? {origin:{x:event.clientX, y:event.clientY}} : {from:link});
  });

  // Назад на карту из кэша страниц: убрать белый экран, который остался перед уходом
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    document.querySelectorAll('.page-transition').forEach(overlay => overlay.remove());
    document.documentElement.classList.remove('pt-enter');
    tint();
    busy = false;
  });

  window.PageTransition = {go, resume, revealed, timing};
})();
