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
};

const keys = { left: false, right: false };

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
};

const paddle = {
  width: 160,
  height: 18,
  x: canvas.width / 2 - 80,
  y: canvas.height - 56,
  vx: 0,
  maxSpeed: 820,
  accel: 2300,
  friction: 0.83,
};

const ball = {
  x: paddle.x + paddle.width / 2,
  y: paddle.y - 14,
  r: 11,
  vx: 0,
  vy: 0,
  speed: 430,
  trail: [],
  stuck: true,
};

const brickConfig = {
  rows: 7,
  cols: 12,
  gap: 6,
  top: 72,
  sidePadding: 28,
  height: 26,
};

let bricks = [];

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
      bricks.push({
        x: brickConfig.sidePadding + c * (width + brickConfig.gap),
        y: brickConfig.top + r * (brickConfig.height + brickConfig.gap),
        w: width,
        h: brickConfig.height,
        strength,
        maxStrength: strength,
        alive: true,
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

function resetBall() {
  ball.stuck = true;
  ball.vx = 0;
  ball.vy = 0;
  ball.x = paddle.x + paddle.width / 2;
  ball.y = paddle.y - ball.r - 1;
  ball.trail = [];
}

function launchBall() {
  if (!ball.stuck) return;
  const spread = (Math.random() * 0.6 - 0.3) * Math.PI;
  ball.vx = Math.sin(spread) * ball.speed;
  ball.vy = -Math.cos(spread) * ball.speed;
  ball.stuck = false;
}

function startGame() {
  if (game.over) {
    game.score = 0;
    game.lives = 3;
    game.level = 1;
    game.combo = 1;
    game.over = false;
    buildLevel(game.level);
  }

  game.paused = false;
  game.running = true;
  hideOverlay();
  if (ball.stuck) launchBall();
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

function reflectFromPaddle() {
  const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
  const angle = hitPos * 1.06;
  const speedBoost = 1 + Math.min(game.level * 0.02, 0.25);
  const speed = ball.speed * speedBoost;
  ball.vx = Math.sin(angle) * speed + paddle.vx * 0.18;
  ball.vy = -Math.abs(Math.cos(angle) * speed);
}

function update(dt) {
  if (!game.running || game.paused) return;

  if (keys.left) paddle.vx -= paddle.accel * dt;
  if (keys.right) paddle.vx += paddle.accel * dt;
  if (!keys.left && !keys.right) paddle.vx *= paddle.friction;
  paddle.vx = Math.max(-paddle.maxSpeed, Math.min(paddle.maxSpeed, paddle.vx));
  paddle.x += paddle.vx * dt;
  paddle.x = Math.max(8, Math.min(canvas.width - paddle.width - 8, paddle.x));

  if (ball.stuck) {
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddle.y - ball.r - 1;
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  ball.trail.push({ x: ball.x, y: ball.y, a: 1 });
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

  if (
    ball.y + ball.r >= paddle.y &&
    ball.y - ball.r <= paddle.y + paddle.height &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.width &&
    ball.vy > 0
  ) {
    ball.y = paddle.y - ball.r;
    reflectFromPaddle();
    emitParticles(ball.x, ball.y, "#9af9ff", 14, 170);
    game.shake = 8;
  }

  let bricksAlive = 0;
  for (const brick of bricks) {
    if (!brick.alive) continue;
    bricksAlive++;

    const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
    const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;

    if (dx * dx + dy * dy <= ball.r * ball.r) {
      const overlapX = ball.r - Math.abs(dx);
      const overlapY = ball.r - Math.abs(dy);

      if (overlapX < overlapY) {
        ball.vx *= -1;
      } else {
        ball.vy *= -1;
      }

      brick.strength--;
      game.comboTimer = 1.8;
      game.combo = Math.min(game.combo + 1, 9);

      const hue = 50 + brick.maxStrength * 60;
      emitParticles(ball.x, ball.y, `hsl(${hue} 95% 68%)`, 16, 250);
      game.shake = 12;

      if (brick.strength <= 0) {
        brick.alive = false;
        game.score += 100 * game.combo;
      } else {
        game.score += 35 * game.combo;
      }
      break;
    }
  }

  if (ball.y - ball.r > canvas.height) {
    game.lives--;
    game.combo = 1;
    game.comboTimer = 0;
    if (game.lives <= 0) {
      game.over = true;
      game.paused = true;
      showOverlay("GAME OVER", "Spaceでリトライ");
    }
    resetBall();
    if (!game.over) {
      game.paused = true;
      showOverlay("ミス！", "Spaceで再開");
    }
  }

  if (bricksAlive === 0) {
    game.level++;
    game.combo = 1;
    game.comboTimer = 0;
    ball.speed += 22;
    buildLevel(game.level);
    resetBall();
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
  g.addColorStop(0, "#dbf2ff");
  g.addColorStop(1, "#6499ff");
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(122, 188, 255, 0.8)";
  ctx.shadowBlur = 20;
  roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 9);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBall() {
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
  g.addColorStop(0.45, "#9ff7ff");
  g.addColorStop(1, "#43b7ff");
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(90, 210, 255, 0.85)";
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

    if (brick.strength > 1) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 14px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(String(brick.strength), brick.x + brick.w / 2, brick.y + brick.h / 2 + 5);
    }
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
  drawPaddle();
  drawBall();
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

  if (e.code === "Space") {
    e.preventDefault();
    if (game.over) {
      startGame();
      return;
    }
    if (!game.running || game.paused) {
      startGame();
    } else {
      game.paused = true;
      showOverlay("PAUSE", "Spaceで再開");
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const ratio = canvas.width / rect.width;
  const mouseX = (e.clientX - rect.left) * ratio;
  paddle.x = mouseX - paddle.width / 2;
  paddle.x = Math.max(8, Math.min(canvas.width - paddle.width - 8, paddle.x));
  if (ball.stuck) {
    ball.x = paddle.x + paddle.width / 2;
  }
});

buildLevel(game.level);
resetBall();
showOverlay("SPACEでスタート", "全ブロックを破壊しよう");
requestAnimationFrame(loop);
