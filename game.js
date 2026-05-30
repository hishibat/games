const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  level: document.getElementById("level"),
  combo: document.getElementById("combo"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlaySub: document.getElementById("overlaySub"),
  power: document.getElementById("power"),
};

const keys = { left: false, right: false, fire: false };

const game = {
  running: false,
  paused: true,
  over: false,
  width: canvas.width,
  height: canvas.height,
  score: 0,
  lives: 3,
  level: 1,
  combo: 1,
  comboTimer: 0,
  shake: 0,
  lastTime: 0,
  particles: [],
  capsules: [],
  lasers: [],
  laserCooldown: 0,
};

const paddle = {
  baseWidth: 160,
  width: 160,
  height: 18,
  x: canvas.width / 2 - 80,
  y: canvas.height - 56,
  vx: 0,
  maxSpeed: 820,
  accel: 2300,
  friction: 0.83,
  // power states
  laser: false,
  catch: false,
  expandTimer: 0,
  laserTimer: 0,
  catchTimer: 0,
};

// Multiple balls (Arkanoid "Disruption" power-up spawns extra balls)
let balls = [];

function makeBall(stuck = true) {
  return {
    x: paddle.x + paddle.width / 2,
    y: paddle.y - 12,
    r: 11,
    vx: 0,
    vy: 0,
    trail: [],
    stuck,
    slow: 1, // speed multiplier (Slow power-up)
  };
}

const BASE_SPEED = 430;
function ballSpeed() {
  return BASE_SPEED + (game.level - 1) * 22;
}

const brickConfig = {
  rows: 7,
  cols: 12,
  gap: 6,
  top: 72,
  sidePadding: 28,
  height: 26,
};

let bricks = [];

// ---- Power-up definitions (classic Arkanoid capsules) ----
const POWERS = {
  expand: { label: "拡張", color: "#3ea7ff", glyph: "E" },
  laser: { label: "レーザー", color: "#ff4d6d", glyph: "L" },
  multi: { label: "マルチ", color: "#36d6a0", glyph: "D" },
  catch: { label: "キャッチ", color: "#b07cff", glyph: "C" },
  slow: { label: "スロー", color: "#ffb347", glyph: "S" },
  life: { label: "1UP", color: "#9aff8a", glyph: "P" },
};
const POWER_KEYS = Object.keys(POWERS);

function buildLevel(level) {
  bricks = [];
  const maxHits = Math.min(1 + Math.floor(level / 2), 4);
  const width =
    (canvas.width - brickConfig.sidePadding * 2 - brickConfig.gap * (brickConfig.cols - 1)) /
    brickConfig.cols;

  for (let r = 0; r < brickConfig.rows; r++) {
    for (let c = 0; c < brickConfig.cols; c++) {
      const strength =
        1 +
        Math.floor(Math.random() * Math.min(maxHits, 1 + Math.floor((r + level) / 2)));
      // ~22% of bricks carry a power-up capsule
      let power = null;
      if (Math.random() < 0.22) {
        power = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
      }
      bricks.push({
        x: brickConfig.sidePadding + c * (width + brickConfig.gap),
        y: brickConfig.top + r * (brickConfig.height + brickConfig.gap),
        w: width,
        h: brickConfig.height,
        strength,
        maxStrength: strength,
        alive: true,
        power,
      });
    }
  }
}

function showOverlay(title, sub) {
  ui.overlayTitle.textContent = title;
  ui.overlaySub.textContent = sub;
  ui.overlay.classList.add("show");
}

function hideOverlay() {
  ui.overlay.classList.remove("show");
}

function resetBalls() {
  balls = [makeBall(true)];
  balls[0].x = paddle.x + paddle.width / 2;
  balls[0].y = paddle.y - balls[0].r - 1;
}

function clearPowerStates() {
  paddle.width = paddle.baseWidth;
  paddle.laser = false;
  paddle.catch = false;
  paddle.expandTimer = 0;
  paddle.laserTimer = 0;
  paddle.catchTimer = 0;
  game.capsules = [];
  game.lasers = [];
}

function launchAll() {
  for (const ball of balls) {
    if (!ball.stuck) continue;
    const spread = (Math.random() * 0.6 - 0.3) * Math.PI;
    const sp = ballSpeed();
    ball.vx = Math.sin(spread) * sp;
    ball.vy = -Math.cos(spread) * sp;
    ball.stuck = false;
  }
}

function startGame() {
  if (game.over) {
    game.score = 0;
    game.lives = 3;
    game.level = 1;
    game.combo = 1;
    game.over = false;
    clearPowerStates();
    buildLevel(game.level);
    resetBalls();
  }

  game.paused = false;
  game.running = true;
  hideOverlay();
  launchAll();
}

function emitParticles(x, y, color, amount = 12, power = 240) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * power;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.35,
      maxLife: 0.7,
      size: 1 + Math.random() * 3,
      color,
    });
  }
}

function reflectFromPaddle(ball) {
  const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
  const angle = Math.max(-1.06, Math.min(1.06, hitPos * 1.06));
  const speedBoost = 1 + Math.min(game.level * 0.02, 0.25);
  const speed = ballSpeed() * speedBoost;
  ball.vx = Math.sin(angle) * speed + paddle.vx * 0.18;
  ball.vy = -Math.abs(Math.cos(angle) * speed);
}

// ---- Power-up application ----
function spawnCapsule(brick) {
  if (!brick.power) return;
  game.capsules.push({
    x: brick.x + brick.w / 2,
    y: brick.y + brick.h / 2,
    w: 44,
    h: 22,
    vy: 150,
    type: brick.power,
    spin: 0,
  });
}

function activatePower(type) {
  const def = POWERS[type];
  switch (type) {
    case "expand":
      paddle.width = Math.min(paddle.baseWidth * 1.6, 300);
      paddle.expandTimer = 14;
      break;
    case "laser":
      paddle.laser = true;
      paddle.laserTimer = 14;
      break;
    case "catch":
      paddle.catch = true;
      paddle.catchTimer = 16;
      break;
    case "slow":
      for (const b of balls) b.slow = 0.6;
      break;
    case "multi": {
      const source = balls.filter((b) => !b.stuck);
      const seeds = source.length ? source : balls;
      const extra = [];
      for (const s of seeds) {
        for (let k = 0; k < 2; k++) {
          const nb = makeBall(false);
          nb.x = s.x;
          nb.y = s.y;
          const a = (k === 0 ? -0.45 : 0.45) + (Math.random() - 0.5) * 0.2;
          const sp = Math.hypot(s.vx, s.vy) || ballSpeed();
          const baseAng = Math.atan2(s.vy, s.vx) + a;
          nb.vx = Math.cos(baseAng) * sp;
          nb.vy = Math.sin(baseAng) * sp;
          nb.slow = s.slow;
          extra.push(nb);
        }
      }
      balls.push(...extra.slice(0, 8));
      break;
    }
    case "life":
      game.lives++;
      break;
  }
  game.score += 80;
  ui.power.textContent = def.label;
  ui.power.style.color = def.color;
  emitParticles(paddle.x + paddle.width / 2, paddle.y, def.color, 22, 280);
}

function fireLaser() {
  if (!paddle.laser || game.laserCooldown > 0) return;
  game.laserCooldown = 0.22;
  const y = paddle.y - 6;
  game.lasers.push({ x: paddle.x + 16, y, vy: -680 });
  game.lasers.push({ x: paddle.x + paddle.width - 16, y, vy: -680 });
}

function damageBrick(brick, hx, hy) {
  brick.strength--;
  game.comboTimer = 1.8;
  game.combo = Math.min(game.combo + 1, 9);
  const hue = 50 + brick.maxStrength * 60;
  emitParticles(hx, hy, `hsl(${hue} 95% 68%)`, 16, 250);
  game.shake = 12;
  if (brick.strength <= 0) {
    brick.alive = false;
    game.score += 100 * game.combo;
    spawnCapsule(brick);
  } else {
    game.score += 35 * game.combo;
  }
}

function update(dt) {
  if (!game.running || game.paused) return;

  // paddle movement
  if (keys.left) paddle.vx -= paddle.accel * dt;
  if (keys.right) paddle.vx += paddle.accel * dt;
  if (!keys.left && !keys.right) paddle.vx *= paddle.friction;
  paddle.vx = Math.max(-paddle.maxSpeed, Math.min(paddle.maxSpeed, paddle.vx));
  paddle.x += paddle.vx * dt;
  paddle.x = Math.max(8, Math.min(canvas.width - paddle.width - 8, paddle.x));

  // power timers
  if (paddle.expandTimer > 0) {
    paddle.expandTimer -= dt;
    if (paddle.expandTimer <= 0) {
      const center = paddle.x + paddle.width / 2;
      paddle.width = paddle.baseWidth;
      paddle.x = center - paddle.width / 2;
    }
  }
  if (paddle.laserTimer > 0) {
    paddle.laserTimer -= dt;
    if (paddle.laserTimer <= 0) paddle.laser = false;
  }
  if (paddle.catchTimer > 0) {
    paddle.catchTimer -= dt;
    if (paddle.catchTimer <= 0) paddle.catch = false;
  }
  if (game.laserCooldown > 0) game.laserCooldown -= dt;
  if (keys.fire) fireLaser();

  // lasers
  for (let i = game.lasers.length - 1; i >= 0; i--) {
    const L = game.lasers[i];
    L.y += L.vy * dt;
    if (L.y < -20) {
      game.lasers.splice(i, 1);
      continue;
    }
    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (L.x >= brick.x && L.x <= brick.x + brick.w && L.y <= brick.y + brick.h && L.y >= brick.y) {
        damageBrick(brick, L.x, L.y);
        game.lasers.splice(i, 1);
        break;
      }
    }
  }

  // capsules falling
  for (let i = game.capsules.length - 1; i >= 0; i--) {
    const cap = game.capsules[i];
    cap.y += cap.vy * dt;
    cap.spin += dt * 4;
    if (
      cap.y + cap.h / 2 >= paddle.y &&
      cap.y - cap.h / 2 <= paddle.y + paddle.height &&
      cap.x >= paddle.x - cap.w / 2 &&
      cap.x <= paddle.x + paddle.width + cap.w / 2
    ) {
      activatePower(cap.type);
      game.capsules.splice(i, 1);
      continue;
    }
    if (cap.y - cap.h / 2 > canvas.height) game.capsules.splice(i, 1);
  }

  // balls
  for (let bi = balls.length - 1; bi >= 0; bi--) {
    const ball = balls[bi];

    if (ball.stuck) {
      ball.x = Math.max(ball.r, Math.min(canvas.width - ball.r, paddle.x + paddle.width / 2));
      ball.y = paddle.y - ball.r - 1;
      continue;
    }

    ball.x += ball.vx * ball.slow * dt;
    ball.y += ball.vy * ball.slow * dt;

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 16) ball.trail.shift();

    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx);
      game.shake = 5;
    }
    if (ball.x + ball.r > canvas.width) {
      ball.x = canvas.width - ball.r;
      ball.vx = -Math.abs(ball.vx);
      game.shake = 5;
    }
    if (ball.y - ball.r < 0) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
      game.shake = 5;
    }

    // paddle collision
    if (
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.height &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.width &&
      ball.vy > 0
    ) {
      ball.y = paddle.y - ball.r;
      if (paddle.catch) {
        ball.stuck = true;
        ball.vx = 0;
        ball.vy = 0;
      } else {
        reflectFromPaddle(ball);
      }
      emitParticles(ball.x, ball.y, "#9af9ff", 14, 170);
      game.shake = 8;
    }

    // brick collision
    for (const brick of bricks) {
      if (!brick.alive) continue;
      const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
      const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      if (dx * dx + dy * dy <= ball.r * ball.r) {
        const overlapX = ball.r - Math.abs(dx);
        const overlapY = ball.r - Math.abs(dy);
        if (overlapX < overlapY) ball.vx *= -1;
        else ball.vy *= -1;
        damageBrick(brick, ball.x, ball.y);
        break;
      }
    }

    // lost ball
    if (ball.y - ball.r > canvas.height) {
      balls.splice(bi, 1);
    }
  }

  // all balls lost -> lose a life
  if (balls.length === 0) {
    game.lives--;
    game.combo = 1;
    game.comboTimer = 0;
    clearPowerStates();
    ui.power.textContent = "—";
    ui.power.style.color = "";
    if (game.lives <= 0) {
      game.over = true;
      game.paused = true;
      showOverlay("GAME OVER", "Spaceでリトライ");
      resetBalls();
    } else {
      game.paused = true;
      resetBalls();
      showOverlay("ミス！", "Spaceで再開");
    }
  }

  // level clear
  const bricksAlive = bricks.some((b) => b.alive);
  if (!bricksAlive && game.running && !game.over) {
    game.level++;
    game.combo = 1;
    game.comboTimer = 0;
    clearPowerStates();
    ui.power.textContent = "—";
    ui.power.style.color = "";
    buildLevel(game.level);
    resetBalls();
    game.paused = true;
    showOverlay(`LEVEL ${game.level}`, "Spaceで次のステージ");
  }

  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) game.combo = 1;
  }

  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      game.particles.splice(i, 1);
      continue;
    }
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.vy += 240 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#0d1230");
  grad.addColorStop(1, "#060913");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 36) {
    ctx.strokeStyle = `rgba(130, 170, 255, ${0.03 + (y / canvas.height) * 0.06})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPaddle() {
  const g = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
  if (paddle.laser) {
    g.addColorStop(0, "#ffd9e0");
    g.addColorStop(1, "#ff4d6d");
    ctx.shadowColor = "rgba(255, 90, 120, 0.85)";
  } else if (paddle.catch) {
    g.addColorStop(0, "#e7d6ff");
    g.addColorStop(1, "#9a6bff");
    ctx.shadowColor = "rgba(160, 120, 255, 0.85)";
  } else {
    g.addColorStop(0, "#dbf2ff");
    g.addColorStop(1, "#6499ff");
    ctx.shadowColor = "rgba(122, 188, 255, 0.8)";
  }
  ctx.fillStyle = g;
  ctx.shadowBlur = 20;
  roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 9);
  ctx.fill();
  ctx.shadowBlur = 0;

  // laser turrets
  if (paddle.laser) {
    ctx.fillStyle = "#ffe0e6";
    roundRect(paddle.x + 10, paddle.y - 8, 12, 10, 3);
    ctx.fill();
    roundRect(paddle.x + paddle.width - 22, paddle.y - 8, 12, 10, 3);
    ctx.fill();
  }
}

function drawBall(ball) {
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i];
    const alpha = i / ball.trail.length;
    ctx.fillStyle = `rgba(130, 224, 255, ${alpha * 0.45})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, ball.r * (0.3 + alpha * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  const g = ctx.createRadialGradient(ball.x - 2, ball.y - 5, 1, ball.x, ball.y, ball.r + 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, ball.slow < 1 ? "#ffe39a" : "#9ff7ff");
  g.addColorStop(1, ball.slow < 1 ? "#ff9f43" : "#43b7ff");
  ctx.fillStyle = g;
  ctx.shadowColor = ball.slow < 1 ? "rgba(255, 180, 70, 0.85)" : "rgba(90, 210, 255, 0.85)";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBricks() {
  for (const brick of bricks) {
    if (!brick.alive) continue;

    const ratio = brick.strength / brick.maxStrength;
    const hue = 45 + brick.maxStrength * 60;
    const topColor = `hsl(${hue} 95% ${58 + ratio * 10}%)`;
    const bottomColor = `hsl(${hue + 20} 80% ${30 + ratio * 8}%)`;

    const g = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.h);
    g.addColorStop(0, topColor);
    g.addColorStop(1, bottomColor);
    ctx.fillStyle = g;
    ctx.strokeStyle = `hsla(${hue} 95% 80% / 0.75)`;
    ctx.lineWidth = 1.3;
    ctx.shadowColor = `hsla(${hue} 95% 60% / 0.45)`;
    ctx.shadowBlur = 10;
    roundRect(brick.x, brick.y, brick.w, brick.h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // power-up marker
    if (brick.power) {
      const def = POWERS[brick.power];
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.arc(brick.x + 12, brick.y + brick.h / 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.color;
      ctx.font = "bold 11px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(def.glyph, brick.x + 12, brick.y + brick.h / 2 + 4);
    }

    if (brick.strength > 1) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 14px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(String(brick.strength), brick.x + brick.w / 2, brick.y + brick.h / 2 + 5);
    }
  }
}

function drawCapsules() {
  for (const cap of game.capsules) {
    const def = POWERS[cap.type];
    const wob = Math.sin(cap.spin) * 4;
    ctx.save();
    ctx.translate(cap.x, cap.y);
    const g = ctx.createLinearGradient(-cap.w / 2, 0, cap.w / 2, 0);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.5, def.color);
    g.addColorStop(1, "#ffffff");
    ctx.fillStyle = g;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 16;
    roundRect(-cap.w / 2 + Math.abs(wob) * 0.2, -cap.h / 2, cap.w - Math.abs(wob) * 0.4, cap.h, cap.h / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0a0e1c";
    ctx.font = "bold 14px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(def.glyph, 0, 5);
    ctx.restore();
  }
}

function drawLasers() {
  for (const L of game.lasers) {
    const g = ctx.createLinearGradient(L.x, L.y, L.x, L.y + 18);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#ff4d6d");
    ctx.fillStyle = g;
    ctx.shadowColor = "rgba(255,80,110,0.9)";
    ctx.shadowBlur = 12;
    ctx.fillRect(L.x - 2, L.y, 4, 16);
    ctx.shadowBlur = 0;
  }
}

function drawParticles() {
  for (const p of game.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    if (p.color.startsWith("hsl(")) {
      ctx.fillStyle = p.color.replace("hsl(", "hsla(").replace(")", ` / ${alpha})`);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ui.score.textContent = String(game.score);
  ui.lives.textContent = String(game.lives);
  ui.level.textContent = String(game.level);
  ui.combo.textContent = `x${game.combo}`;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render() {
  ctx.save();
  if (game.shake > 0) {
    const s = game.shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    game.shake *= 0.84;
  }

  drawBackground();
  drawBricks();
  drawParticles();
  drawCapsules();
  drawLasers();
  drawPaddle();
  for (const ball of balls) drawBall(ball);
  ctx.restore();

  drawHUD();
}

function loop(ts) {
  const dt = Math.min((ts - game.lastTime) / 1000 || 0, 0.024);
  game.lastTime = ts;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
  if (e.code === "KeyJ" || e.code === "KeyF" || e.code === "ShiftLeft") keys.fire = true;

  if (e.code === "Space") {
    e.preventDefault();
    if (game.over) {
      startGame();
      return;
    }
    // release a stuck ball (Catch power) without unpausing toggles
    if (game.running && !game.paused) {
      if (balls.some((b) => b.stuck)) {
        launchAll();
        return;
      }
      game.paused = true;
      showOverlay("PAUSE", "Spaceで再開");
    } else {
      startGame();
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  if (e.code === "KeyJ" || e.code === "KeyF" || e.code === "ShiftLeft") keys.fire = false;
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const ratio = canvas.width / rect.width;
  const mouseX = (e.clientX - rect.left) * ratio;
  paddle.x = mouseX - paddle.width / 2;
  paddle.x = Math.max(8, Math.min(canvas.width - paddle.width - 8, paddle.x));
});

canvas.addEventListener("mousedown", () => {
  if (paddle.laser) keys.fire = true;
  if (game.running && !game.paused && balls.some((b) => b.stuck)) launchAll();
});
canvas.addEventListener("mouseup", () => {
  keys.fire = false;
});

buildLevel(game.level);
resetBalls();
showOverlay("SPACEでスタート", "全ブロックを破壊しよう");
requestAnimationFrame(loop);
