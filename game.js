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

  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
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
      if (keys.has("w") || keys.has("arrowup")) ship.vy -= thrust;
      if (keys.has("s") || keys.has("arrowdown")) ship.vy += thrust;
      if (keys.has("a") || keys.has("arrowleft")) ship.vx -= thrust;
      if (keys.has("d") || keys.has("arrowright")) ship.vx += thrust;
      ship.vx *= .985; ship.vy *= .985;
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      ship.fuel = Math.max(0, ship.fuel - (keys.size ? dt * .18 : 0));
    } else {
      if (keys.has("r")) {
        mode = mode === "rover" ? "foot" : "rover";
        keys.delete("r");
        say(mode === "rover" ? "Rover deployed." : "Exited rover.");
      }
      const speed = mode === "rover" ? 10 : keys.has("shift") ? 10 : 7;
      if (keys.has("a") || keys.has("arrowleft")) rover.heading -= dt * (mode === "rover" ? 2.5 : 1.8);
      if (keys.has("d") || keys.has("arrowright")) rover.heading += dt * (mode === "rover" ? 2.5 : 1.8);
      const direction = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      rover.x += Math.sin(rover.heading) * direction * speed * dt;
      rover.y -= Math.cos(rover.heading) * direction * speed * dt;
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
            say(rover.health ? `Incoming fire! Suit integrity ${rover.health}%.` : "Suit critical. Press Enter to restart.");
          }
        });
      }
    }
    planets.forEach(planet => { planet.angle += dt * (.07 / Math.sqrt(planet.orbit)); });
    shots = shots.filter(shot => (shot.life -= dt) > 0);
    if (noteTimer > 0) { noteTimer -= dt; if (noteTimer <= 0) message.textContent = ""; }
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
      ctx.strokeStyle = "rgba(130,180,220,.14)"; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(cx, cy, planet.orbit * scale, 0, Math.PI * 2); ctx.stroke();
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 18 + planet.index * 2.2);
      glow.addColorStop(0, "rgba(255,255,255,0.9)");
      glow.addColorStop(0.22, planet.color);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 20 + planet.index * 2.4, 0, Math.PI * 2); ctx.fill();
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
    const color = currentPlanet.color;
    const atmosphere = ctx.createRadialGradient(w * .8, h * .2, 20, w * .8, h * .2, w * .7);
    atmosphere.addColorStop(0, "rgba(255,255,255,0.22)");
    atmosphere.addColorStop(0.2, "rgba(255, 215, 160, 0.12)");
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
    ctx.fillStyle = "#f1d7a8"; ctx.beginPath(); ctx.arc(w * .78, h * .2, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,222,170,0.18)"; ctx.beginPath(); ctx.arc(w * .78, h * .2, 52, 0, Math.PI * 2); ctx.fill();
    if (mode === "rover") {
      ctx.fillStyle = "#b8c5cc"; ctx.fillRect(w / 2 - 30, h - 106, 60, 22);
      ctx.fillStyle = "#1a2530"; [-22, 12].forEach(x => { ctx.beginPath(); ctx.arc(w / 2 + x, h - 78, 10, 0, Math.PI * 2); ctx.fill(); });
    }
  }

  function firstPerson() {
    const w = innerWidth, h = innerHeight, horizon = h * .43;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#041421");
    sky.addColorStop(0.45, "#182b3f");
    sky.addColorStop(1, "#9b6f52");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
    const sunGlow = ctx.createRadialGradient(w * .75, horizon * .7, 10, w * .75, horizon * .7, w * .22);
    sunGlow.addColorStop(0, "rgba(255,225,160,0.9)");
    sunGlow.addColorStop(0.15, "rgba(255,171,94,0.62)");
    sunGlow.addColorStop(1, "rgba(255,171,94,0)");
    ctx.fillStyle = sunGlow; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = currentPlanet.color; ctx.globalAlpha = .52;
    ctx.beginPath(); ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += w / 10) {
      ctx.lineTo(x, horizon - 28 - Math.sin(x * .013 + currentPlanet.index) * 28);
    }
    ctx.lineTo(w, horizon); ctx.fill(); ctx.globalAlpha = 1;
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, "#5a4636");
    ground.addColorStop(0.22, "#53452f");
    ground.addColorStop(0.6, "#2b2d2f");
    ground.addColorStop(1, "#0d141a");
    ctx.fillStyle = ground; ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = "rgba(220,190,145,.16)"; ctx.lineWidth = 1;
    for (let i = 1; i <= 12; i++) {
      const y = horizon + (h - horizon) * i * i / 144;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath(); ctx.moveTo(w / 2, horizon); ctx.lineTo(w / 2 + i * w / 9, h); ctx.stroke();
    }
    const haze = ctx.createLinearGradient(0, horizon, 0, h);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(0.5, "rgba(255,255,255,0.04)");
    haze.addColorStop(1, "rgba(0,0,0,0.22)");
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
      const bodyGlow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.2);
      bodyGlow.addColorStop(0, "rgba(255,116,89,0.4)");
      bodyGlow.addColorStop(1, "rgba(255,116,89,0)");
      ctx.fillStyle = bodyGlow; ctx.beginPath(); ctx.arc(x, y, size * .9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#342b2d"; ctx.fillRect(x - size * .24, y + size * .25, size * .48, size * .55);
      ctx.fillStyle = "#a34a3d"; ctx.fillRect(x - size * .29, y + size * .2, size * .58, size * .42);
      ctx.fillStyle = "#d5bd9a"; ctx.beginPath(); ctx.arc(x, y + size * .08, size * .2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff463d"; ctx.fillRect(x - size * .12, y + size * .06, size * .07, size * .035);
      ctx.fillRect(x + size * .05, y + size * .06, size * .07, size * .035);
      ctx.fillStyle = "#101315"; ctx.fillRect(x - size * .3, y - size * .12, size * .6, 4);
      ctx.fillStyle = "#ff554b"; ctx.fillRect(x - size * .3, y - size * .12, size * .6 * enemy.health / 2, 4);
    });

    if (rover.health > 0) {
      ctx.fillStyle = "rgba(25,35,45,0.88)"; ctx.beginPath();
      ctx.moveTo(w * .43, h); ctx.lineTo(w * .46, h * .83); ctx.lineTo(w * .54, h * .83);
      ctx.lineTo(w * .59, h); ctx.fill();
      ctx.fillStyle = "#6d7e85"; ctx.fillRect(w * .47, h * .78, w * .07, h * .17);
      ctx.fillStyle = "#25363b"; ctx.fillRect(w * .485, h * .75, w * .04, h * .12);
      ctx.fillStyle = "rgba(152, 219, 255, 0.8)"; ctx.fillRect(w * .487, h * .74, w * .026, h * .1);
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
    if (mode === "flight") space(); else if (mode === "foot") firstPerson(); else surface();
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
