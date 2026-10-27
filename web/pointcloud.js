// Облако точек из картинки для фона кабинета (WebGL, без библиотек).
// Картинка разбирается на белые точки: где светлее и где проходят контуры — гуще.
// При смене картинки точки перетекают из одной фигуры в другую, без картинки — рассеиваются;
// при первом показе точки слетаются из рассеянного облака. Точки дрейфуют и мерцают,
// облако покачивается по глубине, от курсора точки разбегаются.
//
// <canvas class="cloud" data-cloud-src="картинка" data-cloud-motion="wave" data-cloud-fit="cover">
//   data-cloud-motion: wave — бегущая волна и светлая полоса раз в ~20 с; breathe — облако мягко дышит
//   data-cloud-fit: cover — по ширине и к низу; contain — картинка целиком по центру
//   data-cloud-point-scale: множитель размера точек (по умолчанию 1)
//   data-cloud-aspect="image": холст принимает пропорции картинки (высота от ширины)
//   data-cloud-contrast / data-cloud-exposure / data-cloud-left-boost / data-cloud-invert:
//   настройки яркости для data-cloud-src
//   data-cloud-field: без картинки точки ровным полем на весь холст (фон кабинета), а не рассеиваются
//   data-cloud-density: множитель числа точек (по умолчанию 1)
// На телефоне (до 720px) облако облегчено: меньше точек, ниже плотность пикселей холста, 30 кадров в секунду
// Сменить картинку: canvas.cloud.show('путь', {leftBoost, exposure}) или canvas.cloud.show(null)
(function () {
  const pointColor = [251 / 255, 251 / 255, 255 / 255];
  const sampleArea = 450000;
  const morphDuration = 2200;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = window.matchMedia('(max-width: 720px)').matches;
  const maxDpr = small ? 1.5 : 2;
  // ~30 кадров: порог чуть меньше 33 мс, чтобы при 60 Гц рисовался ровно каждый второй кадр
  const frameInterval = small ? 28 : 0;

  // Шейдеры только на ASCII: часть драйверов WebGL не принимает другие символы даже в комментариях
  const vertexSource = `
    attribute vec2 a_startPos;
    attribute vec3 a_startData;
    attribute vec2 a_endPos;
    attribute vec3 a_endData;
    attribute float a_seed;
    uniform vec2 u_canvas;
    uniform vec4 u_fitStart;
    uniform vec4 u_fitEnd;
    uniform vec2 u_mouse;
    uniform float u_hover;
    uniform float u_time;
    uniform float u_mix;
    uniform float u_dpr;
    uniform float u_wave;
    uniform float u_breathe;
    uniform float u_pointScale;
    varying float v_alpha;

    void main() {
      float seed = a_seed;
      float m = clamp(u_mix * 1.4 - seed * 0.4, 0.0, 1.0);
      m = m * m * (3.0 - 2.0 * m);
      vec2 startPos = a_startPos * u_fitStart.xy + u_fitStart.zw;
      vec2 endPos = a_endPos * u_fitEnd.xy + u_fitEnd.zw;
      vec2 path = endPos - startPos;
      vec2 p = mix(startPos, endPos, m) + vec2(-path.y, path.x) * sin(m * 3.14159) * (seed - 0.5) * 0.3;
      vec3 data = mix(a_startData, a_endData, m);
      float depth = data.x;
      float across = p.x / u_canvas.x;

      p += vec2(sin(u_time * 0.6 + seed * 40.0), cos(u_time * 0.5 + seed * 57.0)) * 1.6 * u_dpr;
      p += vec2(sin(u_time * 0.25) * 6.0, cos(u_time * 0.2) * 3.0) * depth * u_dpr;
      p.y += sin(across * 9.0 - u_time * 0.9 + depth * 0.6) * 4.0 * u_dpr * u_wave;

      float breath = sin(u_time * 1.3) * u_breathe;
      p = u_canvas * 0.5 + (p - u_canvas * 0.5) * (1.0 + 0.012 * breath);

      float glowAt = (across - (fract(u_time * 0.05) * 1.6 - 0.3)) * 5.0;
      float glow = exp(-glowAt * glowAt) * u_wave;

      vec2 away = p - u_mouse;
      float push = (1.0 - smoothstep(0.0, 140.0 * u_dpr, length(away))) * u_hover;
      p += normalize(away + vec2(0.001)) * push * 34.0 * u_dpr;

      vec2 clip = p / u_canvas * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      gl_PointSize = data.z * u_dpr * u_pointScale * (1.0 + 0.3 * glow);
      float twinkle = 0.75 + 0.25 * sin(u_time * (0.8 + seed * 1.6) + seed * 80.0);
      v_alpha = min(1.0, data.y * twinkle * (1.0 + 0.6 * glow + 0.15 * breath));
    }`;

  const fragmentSource = `
    precision mediump float;
    uniform vec3 u_color;
    varying float v_alpha;

    void main() {
      float a = (1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5))) * v_alpha;
      gl_FragColor = vec4(u_color * a, a);
    }`;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      image.src = src;
    });
  }

  // Ровно count точек, выбранных по весу: яркость плюс контуры, чёрный фон пропускается.
  // leftBoost — градиентная маска: яркость у левого края умножается на leftBoost и плавно
  // сходит к 1 к середине картинки, правая половина не трогается (для объектов, тёмных слева).
  // exposure — общий множитель яркости: меньше 1 приглушает слишком светлые картинки.
  // contrast — растягивает яркость от середины: светлые грани ярче, тёмные темнее, контуры чётче.
  // invert — инверсия яркости внутри картинки: тёмное становится плотным и ярким, чёрный фон
  // остаётся пустым (для картинок, где главное нарисовано тёмным).
  // На точку: позиция в картинке (0..1) и данные — глубина, непрозрачность, размер
  function samplePoints(image, count, {leftBoost = 1, exposure = 1, contrast = 1, invert = false} = {}) {
    const scale = Math.sqrt(sampleArea / (image.naturalWidth * image.naturalHeight));
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;

    const light = new Float32Array(width * height);
    for (let i = 0; i < light.length; i++) {
      const j = i * 4;
      const raw = (0.2126 * pixels[j] + 0.7152 * pixels[j + 1] + 0.0722 * pixels[j + 2]) / 255 * (pixels[j + 3] / 255);
      const fade = Math.max(0, 1 - (i % width) / (width * 0.55));
      const gain = 1 + (leftBoost - 1) * fade * fade * (3 - 2 * fade);
      const value = invert ? 1 - raw : raw;
      light[i] = raw < 0.05 ? 0 : Math.max(0.05, Math.min(1, 0.5 + (value * gain * exposure - 0.5) * contrast));
    }

    const cumulative = new Float64Array(light.length);
    let total = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (light[i] >= 0.05) {
          const right = light[x < width - 1 ? i + 1 : i];
          const down = light[y < height - 1 ? i + width : i];
          const edge = Math.max(Math.abs(light[i] - right), Math.abs(light[i] - down));
          total += 0.12 + light[i] * 0.9 + edge * 7;
        }
        cumulative[i] = total;
      }
    }
    if (!total) return scatterState(count);

    const pos = new Float32Array(count * 2);
    const data = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const target = Math.random() * total;
      let low = 0;
      let high = cumulative.length - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (cumulative[middle] < target) low = middle + 1;
        else high = middle;
      }
      const x = low % width;
      const l = light[low];
      pos[k * 2] = (x + Math.random()) / width;
      pos[k * 2 + 1] = ((low - x) / width + Math.random()) / height;
      data[k * 3] = l * 2 - 1 + (Math.random() - 0.5) * 0.6;
      data[k * 3 + 1] = 0.22 + 0.78 * Math.min(1, l * 1.4);
      data[k * 3 + 2] = 1.2 + l * 1.6 + (l > 0.85 ? 1.2 : 0);
    }
    return {pos, data, aspect:image.naturalWidth / image.naturalHeight};
  }

  // Рассеянное невидимое облако: с него точки слетаются и в него рассеиваются
  function scatterState(count) {
    const pos = new Float32Array(count * 2);
    const data = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      pos[k * 2] = Math.random() * 1.6 - 0.3;
      pos[k * 2 + 1] = Math.random() * 1.6 - 0.3;
      data[k * 3] = Math.random() * 2 - 1;
      data[k * 3 + 2] = 1.5;
    }
    return {pos, data, aspect:null};
  }

  // Поле на весь холст: почти все точки тусклые и мелкие, редкие — ярче и крупнее, как звёздная пыль
  function fieldState(count) {
    const pos = new Float32Array(count * 2);
    const data = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const l = Math.random() ** 3;
      pos[k * 2] = Math.random();
      pos[k * 2 + 1] = Math.random();
      data[k * 3] = Math.random() * 2 - 1;
      data[k * 3 + 1] = 0.18 + 0.72 * l;
      data[k * 3 + 2] = 1.1 + l * 1.8 + (l > 0.7 ? 1 : 0);
    }
    return {pos, data, aspect:null};
  }

  // cover: картинка по ширине (или высоте) и прижата к низу; contain: целиком по центру
  function fitImage(width, height, aspect, mode) {
    if (!aspect) return [width, height, 0, 0];
    let w = width;
    let h = width / aspect;
    if (mode === 'contain' ? h > height : h < height) {
      h = height;
      w = height * aspect;
    }
    return [w, h, (width - w) / 2, mode === 'contain' ? (height - h) / 2 : height - h];
  }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function createProgram(gl) {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  function createAttribute(gl, program, name, size) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return values => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.DYNAMIC_DRAW);
    };
  }

  function mount(canvas) {
    if (!canvas.clientWidth) return;
    const gl = canvas.getContext('webgl', {alpha:true, antialias:false, premultipliedAlpha:true});
    if (!gl) return;
    const program = createProgram(gl);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const density = (parseFloat(canvas.dataset.cloudDensity) || 1) * (small ? 0.6 : 1);
    const count = Math.round(Math.min(42000, Math.max(6000, canvas.clientWidth * canvas.clientHeight / 55)) * density);
    const field = canvas.dataset.cloudField !== undefined;
    const fitMode = canvas.dataset.cloudFit || 'cover';
    const motion = canvas.dataset.cloudMotion || 'wave';
    const upload = {
      startPos:createAttribute(gl, program, 'a_startPos', 2),
      startData:createAttribute(gl, program, 'a_startData', 3),
      endPos:createAttribute(gl, program, 'a_endPos', 2),
      endData:createAttribute(gl, program, 'a_endData', 3),
      seed:createAttribute(gl, program, 'a_seed', 1)
    };
    upload.seed(Float32Array.from({length:count}, Math.random));

    const uniform = name => gl.getUniformLocation(program, name);
    const u = {
      canvas:uniform('u_canvas'), fitStart:uniform('u_fitStart'), fitEnd:uniform('u_fitEnd'),
      mouse:uniform('u_mouse'), hover:uniform('u_hover'), time:uniform('u_time'), mix:uniform('u_mix'),
      dpr:uniform('u_dpr'), wave:uniform('u_wave'), breathe:uniform('u_breathe'), color:uniform('u_color'),
      pointScale:uniform('u_pointScale')
    };
    gl.uniform3fv(u.color, pointColor);
    gl.uniform1f(u.pointScale, parseFloat(canvas.dataset.cloudPointScale) || 1);
    gl.uniform1f(u.wave, motion === 'wave' ? 1 : 0);
    gl.uniform1f(u.breathe, motion === 'breathe' ? 1 : 0);

    const cache = new Map();
    const pointer = {x:-1e4, y:-1e4, inside:false};
    const started = performance.now();
    let start = scatterState(count);
    let end = start;
    let morphStarted = started;
    let request = 0;
    let hover = 0;
    let dpr = 1;

    function applyFit() {
      gl.uniform4fv(u.fitStart, fitImage(canvas.width, canvas.height, start.aspect, fitMode));
      gl.uniform4fv(u.fitEnd, fitImage(canvas.width, canvas.height, end.aspect, fitMode));
    }

    function morphTo(next) {
      start = end;
      end = next;
      upload.startPos(start.pos);
      upload.startData(start.data);
      upload.endPos(end.pos);
      upload.endData(end.data);
      applyFit();
      morphStarted = performance.now();
    }

    async function show(src, options = {}) {
      const ticket = ++request;
      const key = src && `${src}|${JSON.stringify(options)}`;
      let next = src ? cache.get(key) : null;
      if (src && !next) {
        const image = await loadImage(src);
        if (canvas.dataset.cloudAspect === 'image') canvas.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
        next = samplePoints(image, count, options);
        cache.set(key, next);
      }
      if (ticket === request) morphTo(next || (field ? fieldState(count) : scatterState(count)));
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.canvas, canvas.width, canvas.height);
      gl.uniform1f(u.dpr, dpr);
      applyFit();
    }

    window.addEventListener('pointermove', e => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) * dpr;
      pointer.y = (e.clientY - rect.top) * dpr;
      pointer.inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    });
    document.addEventListener('pointerleave', () => { pointer.inside = false; });

    let lastFrame = 0;

    function frame(now) {
      if (frameInterval && now - lastFrame < frameInterval) {
        requestAnimationFrame(frame);
        return;
      }
      lastFrame = now;
      if (canvas.clientWidth && canvas.clientHeight) {
        hover += ((pointer.inside && !reduceMotion ? 1 : 0) - hover) * 0.08;
        gl.uniform1f(u.time, reduceMotion ? 0 : (now - started) / 1000);
        gl.uniform1f(u.mix, reduceMotion ? 1 : Math.min(1, (now - morphStarted) / morphDuration));
        gl.uniform2f(u.mouse, pointer.x, pointer.y);
        gl.uniform1f(u.hover, hover);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.POINTS, 0, count);
      }
      requestAnimationFrame(frame);
    }

    morphTo(start);
    new ResizeObserver(resize).observe(canvas);
    resize();
    requestAnimationFrame(frame);

    canvas.cloud = {show:(src, options) => show(src, options).catch(error => console.warn('Облако точек не обновилось:', error))};
    const initial = {invert:canvas.dataset.cloudInvert !== undefined};
    for (const name of ['leftBoost', 'exposure', 'contrast']) {
      const value = parseFloat(canvas.dataset[`cloud${name[0].toUpperCase()}${name.slice(1)}`]);
      if (value) initial[name] = value;
    }
    if (canvas.dataset.cloudSrc) canvas.cloud.show(canvas.dataset.cloudSrc, initial);
    else if (field) canvas.cloud.show(null);
  }

  document.querySelectorAll('canvas.cloud').forEach(canvas => {
    try {
      mount(canvas);
    } catch (error) {
      console.warn('Облако точек не запустилось:', error);
    }
  });
})();
