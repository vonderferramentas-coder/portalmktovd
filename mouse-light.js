// Luz de fundo (mesmo brilho sutil de .auth-page::before/.home-body::before) que acompanha o
// mouse pela tela inteira: um ponto "suavizado" persegue o cursor com leve atraso via
// Animatable do anime.js, e a cada tanto de percurso desse ponto nasce um blob translúcido que
// desbota sozinho — o rastro fica sendo só a soma desses blobs, sem WebGL/Three.js (inspirado
// no efeito do tuxkarma.co, mas em Canvas 2D puro: bem mais leve, e o loop de desenho só roda
// enquanto há algo se movendo/desbotando na tela — parado, o custo é zero).
import { createAnimatable } from 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/modules/index.js';

const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasMouse = window.matchMedia('(pointer: fine)').matches;

if (!reduceMotion && hasMouse) {
  const canvas = document.createElement('canvas');
  canvas.className = 'mouse-light-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  body.insertBefore(canvas, body.firstChild);
  const ctx = canvas.getContext('2d');

  // cor dos blobs = --accent-weak (mesma do brilho estático que este canvas substitui, já
  // é theme-aware — só precisa ser lida uma vez porque hoje vale o mesmo em claro/escuro)
  const accentWeak = getComputedStyle(document.documentElement).getPropertyValue('--accent-weak').trim();
  const rgbaMatch = accentWeak.match(/rgba?\(([^)]+)\)/);
  const [baseR, baseG, baseB, baseA] = rgbaMatch
    ? rgbaMatch[1].split(',').map(n => parseFloat(n))
    : [246, 190, 0, .16];

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const LIFE = 700; // ms até um blob desbotar por completo
  const MAX_PARTICLES = 40; // teto — mouse "chacoalhado" recicla os mais antigos em vez de acumular
  const SPAWN_MIN_DIST = 14; // px percorridos pelo ponto suavizado até nascer o próximo blob
  const particles = [];
  let lastSpawn = { x: null, y: null };

  function spawnParticle(x, y) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ x, y, radius: 130 + Math.random() * 70, born: performance.now() });
  }

  // ponto que persegue o mouse com leve atraso (Animatable) — os blobs nascem neste ponto
  // suavizado, não direto na posição crua do cursor, pra combinar com o resto do rastro
  const pointer = { x: window.innerWidth * 0.72, y: 0 };
  const animatable = createAnimatable(pointer, { x: 900, y: 900, ease: 'out(3)' });

  let rafId = null;
  let lastMoveAt = 0;
  function loop() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const now = performance.now();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const t = (now - p.born) / LIFE;
      if (t >= 1) { particles.splice(i, 1); continue; }
      const alpha = baseA * (1 - t);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      gradient.addColorStop(0, `rgba(${baseR},${baseG},${baseB},${alpha})`);
      gradient.addColorStop(1, `rgba(${baseR},${baseG},${baseB},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lastSpawn.x === null || Math.hypot(pointer.x - lastSpawn.x, pointer.y - lastSpawn.y) >= SPAWN_MIN_DIST) {
      spawnParticle(pointer.x, pointer.y);
      lastSpawn = { x: pointer.x, y: pointer.y };
    }
    // segue rodando enquanto houver blob vivo, ou enquanto o ponto suavizado ainda estiver
    // alcançando o mouse (até ~1s depois do último movimento, tempo de sobra pro ease de 900ms)
    if (particles.length > 0 || now - lastMoveAt < 1000) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  }
  function ensureLoop() {
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }

  // posição inicial = mesmo canto do brilho estático que este canvas substitui, sem animação
  // (duração 0) pra não "deslizar" do canto (0,0) assim que a página carrega
  animatable.x(pointer.x, 0);
  animatable.y(pointer.y, 0);

  window.addEventListener('mousemove', event => {
    animatable.x(event.clientX);
    animatable.y(event.clientY);
    lastMoveAt = performance.now();
    ensureLoop();
  });

  body.classList.add('mouse-light-active');
}
