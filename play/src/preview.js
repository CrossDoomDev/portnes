import { NativePlayer, INPUT } from "./player.js";
import { WorldMap } from "./world.js";
import { GardenMusic } from "./music.js";
import { NativeGame } from "./game.js";
import { loadGameData } from "./game-data.js";
import { drawGardenGame } from "./garden-renderer.js";
const $ = (id) => document.getElementById(id),
  canvas = $("canvas"),
  context = canvas.getContext("2d");
const music = new GardenMusic(),
  keys = new Map(),
  touches = new Map();
const mapping = {
  ArrowUp: 8,
  KeyW: 8,
  ArrowDown: 4,
  KeyS: 4,
  ArrowLeft: 2,
  KeyA: 2,
  ArrowRight: 1,
  KeyD: 1,
  KeyX: 128,
  KeyK: 128,
  KeyZ: 64,
  KeyJ: 64,
  Enter: 16,
  Tab: 32,
};
let view = "game",
  paused = false,
  world,
  data,
  sprites,
  terrain,
  machines,
  player,
  game,
  gameData,
  cannonCount = 0,
  machineCount = 0,
  flash = 0,
  last = 0,
  accumulator = 0,
  step = 0;
let pendingMask = 0;
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
function reset() {
  paused = false;
  $("pause").textContent = "Пауза";
  keys.clear(); touches.clear(); pendingMask = 0;
  if (gameData) game = new NativeGame(gameData, {
    startAtTitle: true,
    onEvent(event) {
      if (event.type === "shot") {
        const cannon = event.value.kind !== "machineGun";
        if (cannon) cannonCount++; else machineCount++;
        music.pop(cannon);
      } else if (event.type === "sound" && event.value < 32) music.setTheme(event.value);
      else if (event.type === "sound") music.effect(event.value);
      else if (event.type === "damage") music.effect(47);
      else if (event.type === "message" || event.type === "radio") {
        $("game-message").textContent = event.type === "radio"
          ? `Получен сигнал ${event.value}. Откройте мастерскую: Tab → «Связь».`
          : `Сообщение ${event.value} принято.`;
      }
    },
  });
  player = new NativePlayer(
    {},
    {
      onCannon: () => {
        cannonCount++;
        flash = 10;
        music.pop(true);
        return false;
      },
      onMachineGun: () => {
        machineCount++;
        music.pop(false);
      },
    },
  );
  cannonCount = 0;
  machineCount = 0;
  step = 0;
  $("game-message").textContent = "Стрелки — движение · X — пушка · Z — пулемёт и поворот башни · Tab — мастерская";
}
function inputMask() {
  let mask = 0;
  for (const value of keys.values()) mask |= value;
  for (const value of touches.values()) mask |= value;
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad?.connected || pad.mapping !== "standard") continue;
    const down = (i) => pad.buttons[i]?.pressed;
    if (down(0)) mask |= 128;
    if (down(1)) mask |= 64;
    if (down(8)) mask |= 32;
    if (down(9)) mask |= 16;
    if (down(12) || pad.axes[1] < -0.5) mask |= 8;
    if (down(13) || pad.axes[1] > 0.5) mask |= 4;
    if (down(14) || pad.axes[0] < -0.5) mask |= 2;
    if (down(15) || pad.axes[0] > 0.5) mask |= 1;
  }
  return mask;
}
function pause() {
  paused = !paused;
  $("pause").textContent = paused ? "Продолжить" : "Пауза";
  keys.clear();
  touches.clear();
  pendingMask = 0;
  accumulator = 0;
  last = performance.now();
}
function texture(tile, x, y, width, height) {
  const sw = terrain.width / 3,
    sh = terrain.height / 2;
  context.drawImage(
    terrain,
    (tile % 3) * sw,
    Math.floor(tile / 3) * sh,
    sw,
    sh,
    x,
    y,
    width,
    height,
  );
}
function sprite(index, x, y, size, angle = 0) {
  const sw = sprites.width / 4,
    sh = sprites.height / 2;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.drawImage(
    sprites,
    (index % 4) * sw,
    Math.floor(index / 4) * sh,
    sw,
    sh,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  context.restore();
}
function drawControls() {
  canvas.width = 1024;
  canvas.height = 960;
  canvas.className = "";
  texture(5, 0, 0, 1024, 960);
  context.fillStyle = "#fff9e8";
  context.beginPath();
  context.roundRect(100, 85, 824, 790, 90);
  context.fill();
  context.strokeStyle = "#e9d6ac";
  context.lineWidth = 2;
  context.setLineDash([12, 18]);
  context.stroke();
  context.setLineDash([]);
  const { x, y, hullDirection, turretDirection } = player.state,
    scale = 4;
  const px = ((x + 12) % 256) * scale,
    py = ((y + 12) % 240) * scale;
  context.fillStyle = "#37695025";
  context.beginPath();
  context.ellipse(px + 7, py + 10, 47, 43, 0, 0, Math.PI * 2);
  context.fill();
  sprite(0, px, py, 116, (hullDirection * Math.PI) / 4);
  sprite(1, px, py, 116, (turretDirection * Math.PI) / 4);
  if (flash) {
    context.fillStyle = "#fff6b6";
    context.beginPath();
    context.arc(
      px + Math.sin((turretDirection * Math.PI) / 4) * 55,
      py - Math.cos((turretDirection * Math.PI) / 4) * 55,
      10 + flash,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.fillStyle = "#5b7553";
  context.font = "20px Arial";
  context.textAlign = "center";
  context.fillText("Свободная поверхность для проверки контроллера", 512, 925);
}
function drawWorld() {
  canvas.width = 1024;
  canvas.height = 480;
  canvas.className = "map";
  const page = Number($("page").value) || 0,
    origin = page * 240;
  for (let y = 0; y < 240; y += 8)
    for (let x = 0; x < 512; x += 8) {
      const cell = world.at(x, origin + y);
      let material = cell.collision === 0 ? 0 : cell.collision === 1 ? 2 : 3;
      // Colors only visualize the collision value; no game material semantics inferred.
      const sw = terrain.width / 3,
        sh = terrain.height / 2;
      context.drawImage(
        terrain,
        (material % 3) * sw + ((x % 128) / 128) * sw,
        Math.floor(material / 3) * sh + ((y % 128) / 128) * sh,
        sw / 16,
        sh / 16,
        x * 2,
        y * 2,
        16,
        16,
      );
    }
  context.fillStyle = "#203e4dc9";
  context.fillRect(10, 10, 268, 36);
  context.fillStyle = "white";
  context.font = "14px Arial";
  context.textAlign = "left";
  context.fillText(`Страница ${page} · флаги геометрии`, 22, 33);
}
function drawArt() {
  canvas.width = 1024;
  canvas.height = 512;
  canvas.className = "art";
  context.fillStyle = "#eff8e3";
  context.fillRect(0, 0, 1024, 512);
  context.drawImage(sprites, 0, 0, 1024, 512);
}
function draw() {
  if (!player || !terrain || !sprites) return;
  if (view === "game" && game) drawGardenGame(context, canvas, game, sprites, terrain, machines);
  else if (view === "controls") drawControls();
  else if (view === "world") drawWorld();
  else drawArt();
  $("directions").textContent =
    view === "game" && game ? `${game.actors[1].heading & 7} / ${game.actors[0].heading & 7}`
    : `${player.state.hullDirection} / ${player.state.turretDirection}`;
  $("events").textContent = `${cannonCount} / ${machineCount}`;
  if (game) $("game-state").textContent = `Энергия ${game.state.deadFlag ? 0 : game.actors[0].counter2}/32 · Очки ${game.state.score} · Попытки ${game.state.lives + 1}`;
  $("password-form").hidden = !(view === "game" && game?.presentation.kind === "password");
  if (view === "game" && game) $("view-caption").textContent =
    game.radio ? "НА СВЯЗИ · СООБЩЕНИЯ МАРШРУТА"
    : (game.state.mode & 63) === 4 ? "БОЛЬШОЕ ПУТЕШЕСТВИЕ · ГЛАВНОЕ МЕНЮ"
    : (game.state.mode & 63) === 16 ? "ПУТЕШЕСТВИЕ НАЧИНАЕТСЯ"
    : (game.state.mode & 63) === 20 ? "ПРОДОЛЖИТЬ ПО ПАРОЛЮ"
    : (game.state.mode & 63) === 7 ? "ВОЗВРАЩЕНИЕ НА МАРШРУТ"
    : (game.state.mode & 63) === 12 ? "ФИНАЛ ПУТЕШЕСТВИЯ"
    : (game.state.mode & 63) === 8 ? "ИСТОРИЯ ПУТЕШЕСТВИЯ"
    : (game.state.mode & 63) === 2 ? "МАСТЕРСКАЯ · СНАРЯЖЕНИЕ И ЗАПАСЫ"
    : (game.state.mode & 63) === 1 ? "ПРИВАЛ · ENTER ДЛЯ ПРОДОЛЖЕНИЯ"
    : "НОВОЕ ПУТЕШЕСТВИЕ · ИГРОВОЙ РЕЖИМ";
}
function setView(value) {
  view = value;
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("selected", button.dataset.view === value),
    );
  $("map-options").hidden = value !== "world";
  $("view-caption").textContent =
    value === "game" ? "НОВОЕ ПУТЕШЕСТВИЕ · ИГРОВОЙ РЕЖИМ"
    : value === "controls"
      ? "КОНТРОЛЛЕР НА СВОБОДНОЙ ПОВЕРХНОСТИ"
      : value === "world"
        ? "ГЕОМЕТРИЯ И КОЛЛИЗИИ · ПРОСМОТР ДАННЫХ"
        : "НОВЫЕ ПЕРСОНАЖИ · АТЛАС";
  draw();
}
document
  .querySelectorAll("[data-view]")
  .forEach((button) => (button.onclick = () => setView(button.dataset.view)));
$("page").onchange = () => {
  $("page").value = Math.max(0, Math.min(511, Number($("page").value) || 0));
  draw();
};
$("previous-page").onclick = () => {
  $("page").value = (Number($("page").value) + 511) % 512;
  draw();
};
$("next-page").onclick = () => {
  $("page").value = (Number($("page").value) + 1) % 512;
  draw();
};
$("pause").onclick = pause;
$("password-form").onsubmit = event => {
  event.preventDefault();
  if ((game.state.mode & 63) !== 20) return;
  const text = $("password-input").value.trim();
  if (game.presentation.submitPassword(text)) {
    keys.clear(); pendingMask = 0; $("password-input").value = ""; canvas.focus();
  }
  draw();
};
$("reset").onclick = () => {
  reset();
  draw();
  canvas.focus();
};
$("music").onclick = async () => {
  try {
    if (music.enabled) music.stop();
    else await music.start();
    $("music").setAttribute("aria-pressed", String(music.enabled));
    $("music").textContent = music.enabled
      ? "♫ Выключить музыку"
      : "♫ Новая музыка";
  } catch {
    $("music").textContent = "Звук недоступен";
  }
};
window.addEventListener("keydown", (event) => {
  if (event.target.closest("input,button,a")) return;
  if (mapping[event.code]) {
    event.preventDefault();
    keys.set(event.code, mapping[event.code]);
    pendingMask |= mapping[event.code];
  }
  if (event.code === "Space" && !event.repeat) {
    event.preventDefault();
    pause();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  touches.clear();
  pendingMask = 0;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    touches.clear();
    pendingMask = 0;
    if (!paused) pause();
    music.stop();
    $("music").setAttribute("aria-pressed", "false");
  }
});
document.querySelectorAll("[data-mask]").forEach((button) => {
  button.onpointerdown = (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, Number(button.dataset.mask));
    pendingMask |= Number(button.dataset.mask);
    button.classList.add("pressed");
  };
  const release = (event) => {
    touches.delete(event.pointerId);
    button.classList.remove("pressed");
  };
  button.onpointerup = release;
  button.onpointercancel = release;
  button.onlostpointercapture = release;
});
function update() {
  const now = performance.now();
  if (!last) last = now;
  accumulator += Math.min(100, Math.max(0, now - last));
  last = now;
  while (accumulator >= 1000 / 60.0988138974405) {
    if (!paused && player && (view === "controls" || view === "game")) {
      try {
        const mask = inputMask() | pendingMask;
        pendingMask = 0;
        if (view === "game") game.step(mask);
        else player.step(mask);
      } catch (error) {
        paused = true;
        $("view-caption").textContent = "ОШИБКА ИГРОВОГО СОСТОЯНИЯ";
        $("game-message").textContent = error.message;
        console.error(error);
      }
      if (flash) flash--;
      step++;
    }
    accumulator -= 1000 / 60.0988138974405;
  }
  setTimeout(update, 8);
}
function render() {
  if ((view === "controls" || view === "game") && !paused) draw();
  requestAnimationFrame(render);
}
try {
  [data, sprites, terrain, gameData, machines] = await Promise.all([
    fetch("./data/world.json").then((response) => response.json()),
    loadImage("./assets/toy-actors.webp"),
    loadImage("./assets/garden-terrain.webp"),
    loadGameData(),
    loadImage("./assets/garden-machines.webp"),
  ]);
  world = new WorldMap(data);
  reset();
  draw();
  update();
  requestAnimationFrame(render);
  canvas.focus();
} catch (error) {
  $("view-caption").textContent = "ОШИБКА ЗАГРУЗКИ: " + error.message;
}
