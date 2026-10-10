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
    const distance = Math.hypot(ship.x - px, ship.y - py);
    return !closest || distance < closest.distance ? { planet, distance } : closest;
  }, null);

  function toggleLanding() {
    if (mode === "flight") {
      const nearby = nearestPlanet();
      if (nearby.distance > 6) return say("I need to get within 6 AU of a planet before I can land.");
      currentPlanet = nearby.planet;
      mode = "foot";
      rover = { x: 0, y: 0, heading: 0 };
      say(`Touchdown on TRAPPIST-1${currentPlanet.name}. I’m on the surface. Press R to deploy the rover.`);
    } else {
      mode = "flight";
      const angle = currentPlanet.angle;
      ship.x = Math.cos(angle) * currentPlanet.orbit;
      ship.y = Math.sin(angle) * currentPlanet.orbit - 5;
      say("Launch complete. I’m back in orbit.");
      currentPlanet = null;
    }
  }

  function scan() {
    if (mode === "flight") {
      const nearby = nearestPlanet();
      say(`Scanner lock: TRAPPIST-1${nearby.planet.name}, ${nearby.distance.toFixed(1)} AU away.`);
    } else {
      say(`${mode === "rover" ? "Rover" : "Suit"} scanner: basaltic plains, trace minerals detected.`);
    }

    function fire() {
      shots.push({ life: .18 });
      say("I fired a pulse round.");
    }
  }

  function update(dt) {
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
    const w = innerWidth, h = innerHeight, scale = Math.min(w, h) / 95;
    ctx.fillStyle = "#030611"; ctx.fillRect(0, 0, w, h);
    stars.forEach(star => {
      ctx.fillStyle = `rgba(210,235,255,${star.brightness})`;
      ctx.fillRect(star.x * w, star.y * h, 1, 1);
    });
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = "#fff2ae"; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
    planets.forEach(planet => {
      const x = cx + Math.cos(planet.angle) * planet.orbit * scale;
      const y = cy + Math.sin(planet.angle) * planet.orbit * scale;
      ctx.strokeStyle = "rgba(130,180,220,.12)"; ctx.beginPath(); ctx.arc(cx, cy, planet.orbit * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = planet.color; ctx.beginPath(); ctx.arc(x, y, 4 + planet.index * .45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d8f7ff"; ctx.font = "11px monospace"; ctx.fillText(`1${planet.name}`, x + 7, y - 7);
    });
    ctx.save(); ctx.translate(cx + ship.x * scale, cy + ship.y * scale);
    ctx.rotate(Math.atan2(ship.vy, ship.vx) + Math.PI / 2);
    ctx.fillStyle = "#75eaff"; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 7); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill(); ctx.restore();
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
      ? `Velocity: ${Math.hypot(ship.vx, ship.vy).toFixed(1)} AU/s  ·  Fuel: ${ship.fuel.toFixed(0)}%  ·  Distance: ${target.distance.toFixed(1)} AU`
      : `Coordinates: ${rover.x.toFixed(0)}, ${rover.y.toFixed(0)} m  ·  ${mode === "rover" ? "WASD drive · R exit · L launch" : "WASD explore · F fire · R rover · L launch"}`;
  }

  function frame(time) {
    const dt = Math.min((time - last) / 1000, .05); last = time;
    update(dt); draw(); requestAnimationFrame(frame);
  }
  say("I’m in the cockpit. I need to reach one of the seven worlds.");
  requestAnimationFrame(frame);
})();
