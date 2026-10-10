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
  const stars = Array.from({ length: 400 }, () => {
    const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, z, brightness: Math.random() * .8 + .2 };
  });
  const NORMAL_SPEED = 8, HYPER_SPEED = 400;
  const keys = new Set();
  let ship = { x: 0, y: -50, z: 0, yaw: Math.PI / 2, pitch: 0, speed: 0, hyper: false, fuel: 100 };
  let mode = "flight";
  let currentPlanet = null;
  let rover = { x: 0, y: 0, heading: 0 };
  let shots = [];
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
    if (event.key.toLowerCase() === "f" && mode !== "flight") fire();
  });
  addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));
  resize();

  const say = text => { message.textContent = text; noteTimer = 3; };
  const nearestPlanet = () => planets.reduce((closest, planet) => {
    const px = Math.cos(planet.angle) * planet.orbit;
    const py = Math.sin(planet.angle) * planet.orbit;
    const distance = Math.hypot(ship.x - px, ship.y - py, ship.z);
    return !closest || distance < closest.distance ? { planet, distance } : closest;
  }, null);

  function toggleLanding() {
    if (mode === "flight") {
      const nearby = nearestPlanet();
      if (nearby.distance > 6) return say("Move within 6 AU of a planet to land.");
      currentPlanet = nearby.planet;
      mode = "foot";
      rover = { x: 0, y: 0, heading: 0 };
      say(`Touchdown on TRAPPIST-1${currentPlanet.name}. Press R to deploy rover.`);
    } else {
      mode = "flight";
      const angle = currentPlanet.angle;
      ship.x = Math.cos(angle) * currentPlanet.orbit;
      ship.y = Math.sin(angle) * currentPlanet.orbit - 5;
      ship.z = 0; ship.yaw = Math.PI / 2; ship.pitch = 0; ship.speed = 0; ship.hyper = false;
      say("Launch complete. Ship in orbit.");
      currentPlanet = null;
    }
  }

  function scan() {
    if (mode === "flight") {
      const nearby = nearestPlanet();
      say(`Scanner: TRAPPIST-1${nearby.planet.name}, ${nearby.distance.toFixed(1)} AU away.`);
    } else {
      say(`${mode === "rover" ? "Rover" : "Suit"} scanner: basaltic plain, trace minerals detected.`);
    }
  }

  function fire() {
    shots.push({ life: .18 });
    say("Pulse round fired.");
  }

  function update(dt) {
    if (mode === "flight") {
      const down = (...k) => k.some(key => keys.has(key));
      if (down("a", "arrowleft")) ship.yaw -= dt * 1.2;
      if (down("d", "arrowright")) ship.yaw += dt * 1.2;
      if (down("arrowup")) ship.pitch = Math.min(1.4, ship.pitch + dt * 1);
      if (down("arrowdown")) ship.pitch = Math.max(-1.4, ship.pitch - dt * 1);
      ship.hyper = down("shift") && ship.fuel > 0;
      const near = nearestPlanet().distance;
      // slow down automatically when approaching a world so hyperdrive can't overshoot it
      const cap = ship.hyper ? Math.min(HYPER_SPEED, Math.max(NORMAL_SPEED, near * 2)) : NORMAL_SPEED;
      const target = down("w") ? cap : down("s") ? -NORMAL_SPEED / 2 : 0;
      ship.speed += (target - ship.speed) * Math.min(1, dt * (ship.hyper ? 3 : 1.5));
      if (Math.abs(ship.speed) < .01) ship.speed = 0;
      if (ship.speed > cap) ship.speed = cap;
      const cp = Math.cos(ship.pitch);
      ship.x += Math.cos(ship.yaw) * cp * ship.speed * dt;
      ship.y += Math.sin(ship.yaw) * cp * ship.speed * dt;
      ship.z += Math.sin(ship.pitch) * ship.speed * dt;
      ship.fuel = Math.max(0, ship.fuel - (ship.hyper ? dt * 1.5 : ship.speed ? dt * .1 : 0));
    } else {
      if (keys.has("r")) {
        mode = mode === "rover" ? "foot" : "rover";
        keys.delete("r");
        say(mode === "rover" ? "Rover deployed." : "Exited rover.");
      }
      const speed = mode === "rover" ? 10 : 4;
      if (keys.has("a") || keys.has("arrowleft")) rover.heading -= dt * 2.5;
      if (keys.has("d") || keys.has("arrowright")) rover.heading += dt * 2.5;
      const direction = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      rover.x += Math.sin(rover.heading) * direction * speed * dt;
      rover.y -= Math.cos(rover.heading) * direction * speed * dt;
    }
    planets.forEach(planet => { planet.angle += dt * (.07 / Math.sqrt(planet.orbit)); });
    shots = shots.filter(shot => (shot.life -= dt) > 0);
    if (noteTimer > 0) { noteTimer -= dt; if (noteTimer <= 0) message.textContent = ""; }
  }

  function space() {
    const w = innerWidth, h = innerHeight, cx = w / 2, cy = h / 2 - h * .06, focal = h * .9;
    const cy2 = Math.cos(ship.yaw), sy2 = Math.sin(ship.yaw), cp = Math.cos(ship.pitch), sp = Math.sin(ship.pitch);
    const f = [cy2 * cp, sy2 * cp, sp], r = [sy2, -cy2, 0], u = [-sp * cy2, -sp * sy2, cp];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const project = (px, py, pz, relative) => {
      const d = relative ? [px, py, pz] : [px - ship.x, py - ship.y, pz - ship.z];
      const depth = dot(d, f);
      if (depth < .05) return null;
      return { x: cx + dot(d, r) / depth * focal, y: cy - dot(d, u) / depth * focal, depth };
    };
    ctx.fillStyle = "#030611"; ctx.fillRect(0, 0, w, h);
    const streak = ship.hyper ? Math.min(1, Math.abs(ship.speed) / 150) : 0;
    stars.forEach(star => {
      const p = project(star.x, star.y, star.z, true);
      if (!p) return;
      ctx.strokeStyle = ctx.fillStyle = `rgba(210,235,255,${star.brightness})`;
      if (streak > .05) {
        const dx = (p.x - cx) * streak * .5, dy = (p.y - cy) * streak * .5;
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
      } else ctx.fillRect(p.x, p.y, 1.5, 1.5);
    });
    const bodies = [{ sun: true, x: 0, y: 0, z: 0, radius: 3, color: "#fff2ae", name: "1" }];
    planets.forEach(planet => bodies.push({
      x: Math.cos(planet.angle) * planet.orbit, y: Math.sin(planet.angle) * planet.orbit, z: 0,
      radius: .8 + planet.index * .06, color: planet.color, name: `1${planet.name}`,
    }));
    planets.forEach(planet => {
      ctx.strokeStyle = "rgba(130,180,220,.18)"; ctx.lineWidth = 1; ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 96; i++) {
        const t = i / 96 * Math.PI * 2, p = project(Math.cos(t) * planet.orbit, Math.sin(t) * planet.orbit, 0);
        if (p) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
      }
      ctx.stroke();
    });
    bodies.map(body => ({ body, p: project(body.x, body.y, body.z) })).filter(e => e.p)
      .sort((a, b) => b.p.depth - a.p.depth).forEach(({ body, p }) => {
        const size = Math.max(body.radius / p.depth * focal, body.sun ? 3 : 2);
        if (body.sun) {
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
          glow.addColorStop(0, "rgba(255,242,174,.9)"); glow.addColorStop(1, "rgba(255,160,60,0)");
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = body.color; ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill();
        if (!body.sun) {
          ctx.fillStyle = "#d8f7ff"; ctx.font = "11px monospace"; ctx.fillText(body.name, p.x + size + 4, p.y - size - 2);
        }
      });
    cockpit(w, h);
  }

  function cockpit(w, h) {
    ctx.fillStyle = "#0b1118"; ctx.strokeStyle = "#2b3a48"; ctx.lineWidth = 2;
    // canopy frame
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * .1); ctx.lineTo(w * .9, h * .07); ctx.lineTo(w * .1, h * .07); ctx.lineTo(0, h * .1); ctx.closePath(); ctx.fill(); ctx.stroke();
    [[0, .1, .12, .74], [w, .1, w * .88, .74]].forEach(([x0, , x1, y1]) => {
      const sx = x0 === 0 ? 0 : w;
      ctx.beginPath(); ctx.moveTo(sx, h * .1); ctx.lineTo(x1 === .12 ? w * .12 : x1, h * y1);
      ctx.lineTo(sx === 0 ? 0 : w, h); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(w * .42, h * .07); ctx.lineTo(w * .46, h * .07); ctx.lineTo(w * .3, h * .76); ctx.lineTo(w * .26, h * .76); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * .54, h * .07); ctx.lineTo(w * .58, h * .07); ctx.lineTo(w * .74, h * .76); ctx.lineTo(w * .7, h * .76); ctx.closePath(); ctx.fill(); ctx.stroke();
    // dashboard
    ctx.fillStyle = "#101922";
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * .82); ctx.lineTo(w * .2, h * .76); ctx.lineTo(w * .8, h * .76); ctx.lineTo(w, h * .82); ctx.lineTo(w, h); ctx.closePath(); ctx.fill(); ctx.stroke();
    // crosshair
    ctx.strokeStyle = "rgba(186,255,255,.7)"; ctx.lineWidth = 1.5; ctx.beginPath();
    const cx = w / 2, cy = h / 2 - h * .06;
    ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.moveTo(cx - 28, cy); ctx.lineTo(cx - 10, cy); ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + 28, cy); ctx.stroke();
    // gauges
    const gauge = (gx, gy, value, label, color) => {
      const rad = Math.min(w, h) * .06;
      ctx.fillStyle = "#05090d"; ctx.strokeStyle = "#3a4d5e"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const a = Math.PI * .75 + Math.max(0, Math.min(1, value)) * Math.PI * 1.5;
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * rad * .85, gy + Math.sin(a) * rad * .85); ctx.stroke();
      ctx.fillStyle = "#8fb4c4"; ctx.font = "10px monospace"; ctx.textAlign = "center"; ctx.fillText(label, gx, gy + rad + 13); ctx.textAlign = "start";
    };
    const gy = h * .9;
    gauge(w * .36, gy, Math.abs(ship.speed) / HYPER_SPEED, "SPEED", "#75eaff");
    gauge(w * .5, gy, ship.fuel / 100, "FUEL", "#8cff8c");
    gauge(w * .64, gy, ship.hyper ? 1 : 0, "HYPER", ship.hyper ? "#ff6bd6" : "#556");
    if (ship.hyper) { ctx.fillStyle = "#ff6bd6"; ctx.font = "bold 14px monospace"; ctx.textAlign = "center"; ctx.fillText("HYPERDRIVE ENGAGED", w / 2, h * .79); ctx.textAlign = "start"; }
  }

  function surface() {
    const w = innerWidth, h = innerHeight;
    const color = currentPlanet.color;
    ctx.fillStyle = "#07101a"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color; ctx.globalAlpha = .28;
    for (let y = h * .48; y < h; y += 15) {
      ctx.fillRect(0, y, w, 16);
      ctx.fillStyle = "#07101a"; ctx.globalAlpha = .14; ctx.fillRect(0, y, w, 2);
      ctx.fillStyle = color; ctx.globalAlpha = .28;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e9d8a6"; ctx.beginPath(); ctx.arc(w * .78, h * .2, 35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#baffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2 - 14, h / 2); ctx.lineTo(w / 2 + 14, h / 2); ctx.moveTo(w / 2, h / 2 - 14); ctx.lineTo(w / 2, h / 2 + 14); ctx.stroke();
    if (shots.length) {
      ctx.strokeStyle = "#fff3a1"; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2, h * .48); ctx.stroke();
    }
    if (mode === "rover") {
      ctx.fillStyle = "#b8c5cc"; ctx.fillRect(w / 2 - 28, h - 105, 56, 22);
      ctx.fillStyle = "#1a2530"; [-22, 12].forEach(x => { ctx.beginPath(); ctx.arc(w / 2 + x, h - 78, 10, 0, Math.PI * 2); ctx.fill(); });
    }
  }

  function draw() {
    if (mode === "flight") space(); else surface();
    const target = mode === "flight" ? nearestPlanet() : { planet: currentPlanet, distance: 0 };
    status.textContent = mode === "flight" ? "SHIP IN ORBIT" : mode === "rover" ? "ROVER EXPLORATION" : "ON FOOT / EXOSUIT";
    locationText.textContent = mode === "flight" ? `Nearest: TRAPPIST-1${target.planet.name}` : `Surface: TRAPPIST-1${currentPlanet.name}`;
    telemetry.textContent = mode === "flight"
      ? `Velocity: ${ship.speed.toFixed(1)} AU/s  ·  Fuel: ${ship.fuel.toFixed(0)}%  ·  Distance: ${target.distance.toFixed(1)} AU`
      : `Coordinates: ${rover.x.toFixed(0)}, ${rover.y.toFixed(0)} m  ·  ${mode === "rover" ? "WASD drive · R exit · L launch" : "WASD explore · F fire · R rover · L launch"}`;
  }

  function frame(time) {
    const dt = Math.min((time - last) / 1000, .05); last = time;
    update(dt); draw(); requestAnimationFrame(frame);
  }
  say("Welcome, pilot. Fly to any of the seven worlds.");
  requestAnimationFrame(frame);
})();
