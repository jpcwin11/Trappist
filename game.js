(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const status = document.querySelector("#status");
  const locationText = document.querySelector("#location");
  const telemetry = document.querySelector("#telemetry");
  const message = document.querySelector("#message");

  const planets = [
    ["b", "#bd6956", 9], ["c", "#df9c65", 12], ["d", "#6b8295", 16],
    ["e", "#3d8a95", 20], ["f", "#7a9f64", 25], ["g", "#bd956c", 30],
    ["h", "#8b7192", 35],
  ].map(([name, color, orbit], index) => ({ name, color, orbit, index, angle: index * .85 }));
  const stars = Array.from({ length: 230 }, () => ({
    x: Math.random(), y: Math.random(), brightness: Math.random() * .8 + .2,
  }));
  const keys = new Set();
  const MOVE_KEYS = ["w", "s", "a", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
  const FORWARD_KEYS = ["w", "arrowup"];
  const REVERSE_KEYS = ["s", "arrowdown"];
  const LEFT_KEYS = ["a", "arrowleft"];
  const RIGHT_KEYS = ["d", "arrowright"];
  let ship = { x: 0, y: -50, vx: 0, vy: 0, fuel: 100 };
  let mode = "flight";
  let currentPlanet = null;
  let rover = { x: 0, y: 0, heading: 0, health: 100 };
  let enemies = [];
  let shots = [];
  let fireCooldown = 0;
  let enemyCooldown = 0;
  let mouseDown = false;
  let kills = 0;
  let last = performance.now();
  let noteTimer = 0;
  let cameraShake = 0;
  let motionEnergy = 0;
  let vignetteGradient = null;

  // Camera and motion tuning constants: larger shock values amplify the motion; larger decay values make the effect persist longer.
  const SHAKE_SCALE = 4.2;
  const SHAKE_DECAY = 0.86;
  const HIT_SHAKE = 10;
  const VELOCITY_SHAKE_FACTOR = 0.08;
  const MAX_SHAKE = 18;
  const SHAKE_OVERSCAN = 80;
  const MOTION_GAIN = 1.5;
  const MOTION_DECAY = 0.8;
  const MOTION_TINT_ALPHA = 0.18;
  const MOTION_TINT_SPEED = 5;
  const MOTION_TINT_GAIN = 0.35;
  const MOTION_TINT_BASE = 0.14;
  const GROUND_DETAIL_COUNT = 38;
  const GROUND_DETAIL_OFFSET = 18;
  const GROUND_DETAIL_SPACING = 37;

  const planetPalettes = {
    b: { skyTop: "#081827", skyMid: "#40322f", groundTop: "#b86f5c", groundMid: "#7a4d44", groundDeep: "#301d1a", accent: "#f7b47b", dust: "#d7b187" },
    c: { skyTop: "#17243c", skyMid: "#6d4a32", groundTop: "#d29a67", groundMid: "#7c5533", groundDeep: "#2d1f18", accent: "#ffd68e", dust: "#f5d09e" },
    d: { skyTop: "#0d1f2c", skyMid: "#4f5f6d", groundTop: "#7694a6", groundMid: "#516d7f", groundDeep: "#1d2d32", accent: "#cfeaf7", dust: "#a9bed0" },
    e: { skyTop: "#09252a", skyMid: "#2d5a5a", groundTop: "#4ca7a6", groundMid: "#2f6667", groundDeep: "#132f2a", accent: "#b4f4e7", dust: "#99d8b7" },
    f: { skyTop: "#101f14", skyMid: "#536b4d", groundTop: "#9bbd79", groundMid: "#607a49", groundDeep: "#1f2b18", accent: "#d9f7ae", dust: "#c6de81" },
    g: { skyTop: "#201b17", skyMid: "#7a5f45", groundTop: "#d0aa79", groundMid: "#725437", groundDeep: "#2f2018", accent: "#f7d5a7", dust: "#d5b688" },
    h: { skyTop: "#1b1322", skyMid: "#584462", groundTop: "#a58ca9", groundMid: "#624a61", groundDeep: "#291d2c", accent: "#f3d2ff", dust: "#d0b0db" },
  };

  const hexToRgba = (hex, alpha) => {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
    const int = Number.parseInt(full, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const isDown = (...keysToCheck) => keysToCheck.some(key => keys.has(key));
  const addMotion = amount => { motionEnergy = Math.min(1, motionEnergy + amount); };
  const getPalette = planet => planetPalettes[planet.name] || planetPalettes.b;

  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    vignetteGradient = ctx.createRadialGradient(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * .2, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * .8);
    vignetteGradient.addColorStop(0, "rgba(0,0,0,0)");
    vignetteGradient.addColorStop(0.72, "rgba(0,0,0,0.12)");
    vignetteGradient.addColorStop(1, "rgba(0,0,0,0.52)");
  }
  addEventListener("resize", resize);
  addEventListener("keydown", event => {
    keys.add(event.key.toLowerCase());
    if (event.key.toLowerCase() === "l") toggleLanding();
    if (event.code === "Space") scan();
    if (event.key.toLowerCase() === "f" && mode === "foot") fire();
    if (event.key === "Enter" && mode === "foot" && rover.health <= 0) restartCombat();
  });
  addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
  canvas.addEventListener("click", () => {
    if (mode !== "foot" || rover.health <= 0) return;
    if (canvas.requestPointerLock) canvas.requestPointerLock();
    fire();
  });
  canvas.addEventListener("pointerdown", () => { mouseDown = true; });
  addEventListener("pointerup", () => { mouseDown = false; });
  addEventListener("mousemove", event => {
    if (mode === "foot" && document.pointerLockElement === canvas) {
      rover.heading += event.movementX * .0025;
    }
  });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  resize();

  const say = text => { message.textContent = text; noteTimer = 3; };
  const nearestPlanet = () => planets.reduce((closest, planet) => {
    const px = Math.cos(planet.angle) * planet.orbit;
    const py = Math.sin(planet.angle) * planet.orbit;
    const distance = Math.hypot(ship.x - px, ship.y - py);
    return !closest || distance < closest.distance ? { planet, distance } : closest;
  }, null);

  function toggleLanding() {
    if (mode === "flight") {
      const nearby = nearestPlanet();
      if (nearby.distance > 6) return say("Move within 6 AU of a planet to land.");
      currentPlanet = nearby.planet;
      mode = "foot";
      rover = { x: 0, y: 0, heading: 0, health: 100 };
      kills = 0;
      enemies = Array.from({ length: 6 }, (_, index) => {
        const angle = index * Math.PI * 2 / 6 + Math.random() * .5;
        const distance = 14 + Math.random() * 22;
        return {
          x: Math.sin(angle) * distance,
          y: -Math.cos(angle) * distance,
          health: 2,
          cooldown: 1 + Math.random() * 2,
        };
      });
      say(`Touchdown on TRAPPIST-1${currentPlanet.name}. Hostiles detected!`);
    } else {
      mode = "flight";
      const angle = currentPlanet.angle;
      ship.x = Math.cos(angle) * currentPlanet.orbit;
      ship.y = Math.sin(angle) * currentPlanet.orbit - 5;
      say("Launch complete. Ship in orbit.");
      currentPlanet = null;
    }
  }

  function scan() {
    if (mode === "flight") {
      const nearby = nearestPlanet();
      say(`Scanner: TRAPPIST-1${nearby.planet.name}, ${nearby.distance.toFixed(1)} AU away.`);
    } else {
      if (mode === "foot") {
        const alive = enemies.filter(enemy => enemy.health > 0).length;
        say(`Combat scan: ${alive} hostile${alive === 1 ? "" : "s"} remaining.`);
      } else {
        say("Rover scanner: basaltic plain, trace minerals detected.");
      }
    }
  }

  function fire() {
    if (mode !== "foot" || rover.health <= 0 || fireCooldown > 0) return;
    fireCooldown = .28;
    shots.push({ life: .12 });
    const facingX = Math.sin(rover.heading);
    const facingY = -Math.cos(rover.heading);
    const target = enemies
      .filter(enemy => enemy.health > 0)
      .map(enemy => {
        const dx = enemy.x - rover.x, dy = enemy.y - rover.y;
        return { enemy, depth: dx * facingX + dy * facingY, side: dx * Math.cos(rover.heading) + dy * Math.sin(rover.heading) };
      })
      .filter(item => item.depth > 0 && item.depth < 45 && Math.abs(item.side) < item.depth * .055 + .25)
      .sort((a, b) => a.depth - b.depth)[0];
    if (target) {
      target.enemy.health -= 1;
      if (target.enemy.health <= 0) {
        kills++;
        say(`Hostile eliminated. ${enemies.filter(enemy => enemy.health > 0).length} remaining.`);
      } else {
        say("Target hit.");
      }
    } else {
      say("Pulse round fired.");
    }
  }

  function restartCombat() {
    rover = { x: 0, y: 0, heading: 0, health: 100 };
    kills = 0;
    enemies.forEach((enemy, index) => {
      const angle = index * Math.PI * 2 / enemies.length + Math.random() * .5;
      const distance = 14 + Math.random() * 22;
      enemy.x = Math.sin(angle) * distance;
      enemy.y = -Math.cos(angle) * distance;
      enemy.health = 2;
      enemy.cooldown = 1 + Math.random() * 2;
    });
    say("Suit systems restored. Clear the hostiles.");
  }

  function update(dt) {
    fireCooldown = Math.max(0, fireCooldown - dt);
    if (mouseDown && mode === "foot") fire();
    if (mode === "flight") {
      const thrust = 18 * dt;
      const moving = isDown(...FORWARD_KEYS, ...REVERSE_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS);
      if (isDown(...FORWARD_KEYS)) ship.vy -= thrust;
      if (isDown(...REVERSE_KEYS)) ship.vy += thrust;
      if (isDown(...LEFT_KEYS)) ship.vx -= thrust;
      if (isDown(...RIGHT_KEYS)) ship.vx += thrust;
      ship.vx *= .985; ship.vy *= .985;
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      ship.fuel = Math.max(0, ship.fuel - (moving ? dt * .18 : 0));
      addMotion(moving ? dt * MOTION_GAIN : 0);
      const velocityShake = Math.min(MAX_SHAKE, Math.hypot(ship.vx, ship.vy) * VELOCITY_SHAKE_FACTOR);
      cameraShake = Math.max(cameraShake, moving ? velocityShake : 0);
    } else {
      if (keys.has("r")) {
        mode = mode === "rover" ? "foot" : "rover";
        keys.delete("r");
        say(mode === "rover" ? "Rover deployed." : "Exited rover.");
      }
      const speed = mode === "rover" ? 10 : keys.has("shift") ? 10 : 7;
      const turnInput = (isDown(...RIGHT_KEYS) ? 1 : 0) - (isDown(...LEFT_KEYS) ? 1 : 0);
      const moveInput = (isDown(...FORWARD_KEYS) ? 1 : 0) - (isDown(...REVERSE_KEYS) ? 1 : 0);
      if (turnInput !== 0) rover.heading += turnInput * dt * (mode === "rover" ? 2.5 : 1.8);
      rover.x += Math.sin(rover.heading) * moveInput * speed * dt;
      rover.y -= Math.cos(rover.heading) * moveInput * speed * dt;
      if (mode === "foot" && rover.health > 0) {
        enemies.forEach(enemy => {
          if (enemy.health <= 0) return;
          const dx = rover.x - enemy.x, dy = rover.y - enemy.y;
          const distance = Math.hypot(dx, dy);
          enemy.cooldown -= dt;
          if (distance > 2.5) {
            enemy.x += dx / distance * dt * 1.25;
            enemy.y += dy / distance * dt * 1.25;
          } else if (enemy.cooldown <= 0) {
            rover.health = Math.max(0, rover.health - 12);
            enemy.cooldown = 1.2;
            cameraShake = Math.max(cameraShake, HIT_SHAKE);
            addMotion(0.4);
            say(rover.health ? `Incoming fire! Suit integrity ${rover.health}%.` : "Suit critical. Press Enter to restart.");
          }
        });
      }
      if (moveInput !== 0 || turnInput !== 0) {
        addMotion(dt * MOTION_GAIN);
      }
    }
    planets.forEach(planet => { planet.angle += dt * (.07 / Math.sqrt(planet.orbit)); });
    shots = shots.filter(shot => (shot.life -= dt) > 0);
    if (noteTimer > 0) { noteTimer -= dt; if (noteTimer <= 0) message.textContent = ""; }
    cameraShake *= Math.pow(SHAKE_DECAY, dt * 60);
    motionEnergy = Math.max(0, motionEnergy - dt * MOTION_DECAY);
  }

  function space() {
    const w = innerWidth, h = innerHeight, scale = Math.min(w, h) / 95;
    const bg = ctx.createRadialGradient(w * .5, h * .42, 0, w * .5, h * .5, Math.max(w, h) * .82);
    bg.addColorStop(0, "#14263d");
    bg.addColorStop(0.36, "#0a1322");
    bg.addColorStop(1, "#02060d");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    stars.forEach(star => {
      ctx.fillStyle = `rgba(210,235,255,${star.brightness})`;
      ctx.fillRect(star.x * w, star.y * h, 1.5, 1.5);
    });
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = "#fff2ae"; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
    planets.forEach(planet => {
      const x = cx + Math.cos(planet.angle) * planet.orbit * scale;
      const y = cy + Math.sin(planet.angle) * planet.orbit * scale;
      const glowRadius = 18 + planet.index * 2.2;
      ctx.strokeStyle = "rgba(130,180,220,.14)"; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(cx, cy, planet.orbit * scale, 0, Math.PI * 2); ctx.stroke();
      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      glow.addColorStop(0, "rgba(255,255,255,0.9)");
      glow.addColorStop(0.22, planet.color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, glowRadius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = planet.color; ctx.beginPath(); ctx.arc(x, y, 4 + planet.index * .45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d8f7ff"; ctx.font = "11px monospace"; ctx.fillText(`1${planet.name}`, x + 7, y - 7);
    });
    ctx.save(); ctx.translate(cx + ship.x * scale, cy + ship.y * scale);
    ctx.rotate(Math.atan2(ship.vy, ship.vx) + Math.PI / 2);
    ctx.fillStyle = "#75eaff"; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 7); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(117,234,255,0.45)"; ctx.beginPath(); ctx.moveTo(-1.5, 7); ctx.lineTo(0, 20); ctx.lineTo(1.5, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function surface() {
    const w = innerWidth, h = innerHeight;
    const palette = getPalette(currentPlanet);
    const color = currentPlanet.color;
    const atmosphere = ctx.createRadialGradient(w * .8, h * .2, 20, w * .8, h * .2, w * .7);
    atmosphere.addColorStop(0, "rgba(255,255,255,0.22)");
    atmosphere.addColorStop(0.2, hexToRgba(palette.accent, 0.12));
    atmosphere.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = "#040b13"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color; ctx.globalAlpha = .24;
    for (let y = h * .45; y < h; y += 15) {
      ctx.fillRect(0, y, w, 16);
      ctx.fillStyle = "#07101a"; ctx.globalAlpha = .12; ctx.fillRect(0, y, w, 2);
      ctx.fillStyle = color; ctx.globalAlpha = .24;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.dust; ctx.beginPath(); ctx.arc(w * .78, h * .2, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexToRgba(palette.accent, 0.18); ctx.beginPath(); ctx.arc(w * .78, h * .2, 52, 0, Math.PI * 2); ctx.fill();
    if (mode === "rover") {
      ctx.fillStyle = "#b8c5cc"; ctx.fillRect(w / 2 - 30, h - 106, 60, 22);
      ctx.fillStyle = "#1a2530"; [-22, 12].forEach(x => { ctx.beginPath(); ctx.arc(w / 2 + x, h - 78, 10, 0, Math.PI * 2); ctx.fill(); });
    }
  }

  function firstPerson() {
    const w = innerWidth, h = innerHeight, horizon = h * .43;
    const palette = getPalette(currentPlanet);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.58, palette.skyMid);
    sky.addColorStop(1, palette.groundTop);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
    const sunGlow = ctx.createRadialGradient(w * .75, horizon * .7, 10, w * .75, horizon * .7, w * .24);
    sunGlow.addColorStop(0, hexToRgba(palette.accent, 0.95));
    sunGlow.addColorStop(0.17, hexToRgba(palette.accent, 0.68));
    sunGlow.addColorStop(1, hexToRgba(palette.accent, 0));
    ctx.fillStyle = sunGlow; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hexToRgba(palette.accent, 0.5);
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += w / 10) {
      ctx.lineTo(x, horizon - 30 - Math.sin(x * .013 + currentPlanet.index) * 30);
    }
    ctx.lineTo(w, horizon); ctx.fill();
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, palette.groundTop);
    ground.addColorStop(0.32, palette.groundMid);
    ground.addColorStop(0.68, hexToRgba(palette.dust, 0.42));
    ground.addColorStop(1, palette.groundDeep);
    ctx.fillStyle = ground; ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = "rgba(240,215,170,.17)"; ctx.lineWidth = 1;
    for (let i = 1; i <= 12; i++) {
      const y = horizon + (h - horizon) * i * i / 144;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath(); ctx.moveTo(w / 2, horizon); ctx.lineTo(w / 2 + i * w / 9, h); ctx.stroke();
    }
    for (let i = 0; i < GROUND_DETAIL_COUNT; i++) {
      const x = (i / GROUND_DETAIL_COUNT) * w + ((i % 2) * GROUND_DETAIL_OFFSET);
      const y = horizon + ((i * GROUND_DETAIL_SPACING) % (h - horizon));
      ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,0.05)` : `rgba(230, 188, 126, 0.08)`;
      ctx.fillRect(x, y, 12 + (i % 5) * 5, 2 + (i % 3));
    }
    const haze = ctx.createLinearGradient(0, horizon, 0, h);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(0.55, "rgba(255,255,255,0.04)");
    haze.addColorStop(1, "rgba(0,0,0,0.24)");
    ctx.fillStyle = haze; ctx.fillRect(0, horizon, w, h - horizon);

    const facingX = Math.sin(rover.heading), facingY = -Math.cos(rover.heading);
    const visible = enemies.filter(enemy => enemy.health > 0).map(enemy => {
      const dx = enemy.x - rover.x, dy = enemy.y - rover.y;
      return {
        enemy,
        depth: dx * facingX + dy * facingY,
        side: dx * Math.cos(rover.heading) + dy * Math.sin(rover.heading),
      };
    }).filter(item => item.depth > .5 && Math.abs(item.side / item.depth) < 1.5)
      .sort((a, b) => b.depth - a.depth);
    visible.forEach(({ enemy, depth, side }) => {
      const size = Math.min(h * .45, h * 1.2 / depth);
      const x = w / 2 + side / depth * w * .52;
      const y = horizon + (h - horizon) * .42 - size * .48;
      const glowRadius = size * 1.4;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      glow.addColorStop(0, "rgba(255, 130, 94, 0.44)");
      glow.addColorStop(0.35, "rgba(255, 80, 64, 0.2)");
      glow.addColorStop(1, "rgba(255, 80, 64, 0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, glowRadius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#342b2d"; ctx.fillRect(x - size * .24, y + size * .25, size * .48, size * .55);
      ctx.fillStyle = "#a34a3d"; ctx.fillRect(x - size * .29, y + size * .2, size * .58, size * .42);
      ctx.fillStyle = "#d5bd9a"; ctx.beginPath(); ctx.arc(x, y + size * .08, size * .2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff463d"; ctx.fillRect(x - size * .12, y + size * .06, size * .07, size * .035);
      ctx.fillRect(x + size * .05, y + size * .06, size * .07, size * .035);
      ctx.fillStyle = "#101315"; ctx.fillRect(x - size * .3, y - size * .12, size * .6, 4);
      ctx.fillStyle = "#ff554b"; ctx.fillRect(x - size * .3, y - size * .12, size * .6 * enemy.health / 2, 4);
      ctx.strokeStyle = "rgba(255,166,100,0.16)"; ctx.lineWidth = 1.2; ctx.strokeRect(x - size * .34, y - size * .17, size * .68, size * .9);
    });

    if (rover.health > 0) {
      ctx.fillStyle = "rgba(25,35,45,0.88)"; ctx.beginPath();
      ctx.moveTo(w * .43, h); ctx.lineTo(w * .46, h * .83); ctx.lineTo(w * .54, h * .83);
      ctx.lineTo(w * .59, h); ctx.fill();
      ctx.fillStyle = "#6d7e85"; ctx.fillRect(w * .47, h * .78, w * .07, h * .17);
      ctx.fillStyle = "#25363b"; ctx.fillRect(w * .485, h * .75, w * .04, h * .12);
      ctx.fillStyle = "rgba(152, 219, 255, 0.8)"; ctx.fillRect(w * .487, h * .74, w * .026, h * .1);
      ctx.fillStyle = "rgba(180, 221, 255, 0.22)"; ctx.fillRect(w * .466, h * .72, w * .093, h * .12);
      if (shots.length) {
        ctx.fillStyle = "#fff3a1"; ctx.beginPath();
        ctx.moveTo(w * .49, h * .77); ctx.lineTo(w * .5, h * .68); ctx.lineTo(w * .51, h * .77); ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(90,0,0,.45)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.font = "bold 24px monospace"; ctx.textAlign = "center";
      ctx.fillText("SUIT FAILURE — PRESS ENTER TO RETRY", w / 2, h * .68); ctx.textAlign = "start";
    }
    ctx.strokeStyle = "#baffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2 - 12, h / 2); ctx.lineTo(w / 2 - 4, h / 2);
    ctx.moveTo(w / 2 + 4, h / 2); ctx.lineTo(w / 2 + 12, h / 2);
    ctx.moveTo(w / 2, h / 2 - 12); ctx.lineTo(w / 2, h / 2 - 4);
    ctx.moveTo(w / 2, h / 2 + 4); ctx.lineTo(w / 2, h / 2 + 12); ctx.stroke();
    ctx.strokeStyle = "rgba(186,255,255,0.16)"; ctx.beginPath(); ctx.arc(w / 2, h / 2, 22, 0, Math.PI * 2); ctx.stroke();
  }

  function draw() {
    const w = innerWidth, h = innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#02060b"; ctx.fillRect(0, 0, w, h);
    const shakeMagnitude = Math.min(MAX_SHAKE, cameraShake);
    const shakeX = (Math.random() - 0.5) * shakeMagnitude * SHAKE_SCALE;
    const shakeY = (Math.random() - 0.5) * shakeMagnitude * SHAKE_SCALE;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#02060b"; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.fillStyle = "#02060b"; ctx.fillRect(-SHAKE_OVERSCAN, -SHAKE_OVERSCAN, w + SHAKE_OVERSCAN * 2, h + SHAKE_OVERSCAN * 2);
    if (mode === "flight") space(); else if (mode === "foot") firstPerson(); else surface();
    ctx.restore();
    if (vignetteGradient) {
      ctx.fillStyle = vignetteGradient; ctx.fillRect(0, 0, w, h);
    }
    const motionTint = Math.min(1, motionEnergy * MOTION_TINT_GAIN + (mode === "flight" && Math.hypot(ship.vx, ship.vy) > MOTION_TINT_SPEED ? MOTION_TINT_BASE : 0));
    if (motionTint > 0) {
      ctx.fillStyle = `rgba(10, 15, 22, ${motionTint * MOTION_TINT_ALPHA})`;
      ctx.fillRect(0, 0, w, h);
    }
    const target = mode === "flight" ? nearestPlanet() : { planet: currentPlanet, distance: 0 };
    status.textContent = mode === "flight" ? "SHIP IN ORBIT" : mode === "rover" ? "ROVER EXPLORATION" : "HOSTILE CONTACT";
    locationText.textContent = mode === "flight" ? `Nearest: TRAPPIST-1${target.planet.name}` : `Surface: TRAPPIST-1${currentPlanet.name}`;
    telemetry.textContent = mode === "flight"
      ? `Velocity: ${Math.hypot(ship.vx, ship.vy).toFixed(1)} AU/s  ·  Fuel: ${ship.fuel.toFixed(0)}%  ·  Distance: ${target.distance.toFixed(1)} AU`
      : mode === "rover"
        ? `Coordinates: ${rover.x.toFixed(0)}, ${rover.y.toFixed(0)} m  ·  WASD drive · R exit · L launch`
        : `Suit: ${rover.health}%  ·  Hostiles: ${enemies.filter(enemy => enemy.health > 0).length}  ·  Eliminated: ${kills}`;
  }

  function frame(time) {
    const dt = Math.min((time - last) / 1000, .05); last = time;
    update(dt); draw(); requestAnimationFrame(frame);
  }
  say("Welcome, pilot. Fly to any of the seven worlds.");
  requestAnimationFrame(frame);
})();
