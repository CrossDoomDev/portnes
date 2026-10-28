import NES from "../vendor/jsnes/nes.js";
import { CARTRIDGE, validateCartridge } from "./cartridge.js";
import { FrameClock, NTSC_FPS } from "./clock.js";
import { InputBus, KEY_MAP, BUTTON } from "./input.js";
import { GameRenderer } from "./renderer.js";
import { AudioOutput } from "./audio.js";
import {
  SAVE_VERSION,
  getSave,
  putSave,
  validateSave,
  readPreferences,
  writePreferences,
} from "./storage.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game-canvas");
const preferences = readPreferences();
const audio = new AudioOutput();
audio.setMuted(preferences.muted);
const clock = new FrameClock();
let lastFrame,
  renderer,
  romBytes,
  ready = false,
  running = false,
  started = false;
let frameNumber = 0,
  quickSave = null,
  storageBusy = false,
  starting = false,
  startVersion = 0;
let toastTimer,
  statsFrames = 0,
  statsTime = 0;
let previousTick = 0,
  previousSimulationTick = 0,
  drawnFrame = -1;
const pulses = new Map();
const nes = new NES({
  sampleRate: 48000,
  emulateSound: true,
  onFrame: (frame) => {
    lastFrame = frame;
  },
  onAudioSample: audio.write,
});
const input = new InputBus(nes);

function toast(message, error = false, duration = 4000) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  if (duration)
    toastTimer = setTimeout(() => {
      $("toast").hidden = true;
    }, duration);
}

function status(text, live = false) {
  $("runtime-status").textContent = text;
  $("signal-light").classList.toggle("live", live);
}
function updateButtons() {
  $("pause-button").disabled = !ready || !started || starting;
  $("save-button").disabled = !ready || !started || storageBusy;
  $("load-button").disabled = !ready || !quickSave || storageBusy;
  $("reset-button").disabled = !ready || starting || storageBusy;
  $("begin-button").disabled = !ready || starting || storageBusy;
  $("original-menu-button").disabled = !ready || starting || storageBusy;
  $("resume-button").disabled = !ready || starting || storageBusy;
  $("pause-button").setAttribute(
    "aria-label",
    running ? "Пауза" : "Продолжить",
  );
  $("pause-button").title = running ? "Пауза (Esc)" : "Продолжить (Esc)";
  $("pause-button")
    .querySelector("use")
    .setAttribute("href", running ? "#i-pause" : "#i-play");
}
function draw() {
  const before = performance.now();
  renderer?.draw(lastFrame, nes.ppu, frameNumber / NTSC_FPS);
  canvas.dataset.renderMs = (performance.now() - before).toFixed(2);
}
function focusGame() {
  if (running) canvas.focus({ preventScroll: true });
}

function pause(reason = "Продолжи, когда будешь готов.") {
  startVersion++;
  starting = false;
  running = false;
  clock.reset();
  input.releaseAll();
  pulses.clear();
  audio.pause();
  document
    .querySelectorAll(".pressed,.dpad.active")
    .forEach((element) => element.classList.remove("pressed", "active"));
  if (started && $("cover").hidden) {
    $("pause-description").textContent = reason;
    $("pause-overlay").hidden = false;
    status("ПАУЗА");
  }
  updateButtons();
}

async function play(sendStart = false) {
  if (!ready || starting || running || storageBusy) return;
  starting = true;
  const version = ++startVersion;
  updateButtons();
  try {
    await audio.start();
  } catch {
    toast("Звук недоступен. Игра продолжится без звука.", true);
  }
  if (version !== startVersion) return;
  starting = false;
  started = true;
  running = true;
  clock.reset();
  statsTime = performance.now();
  statsFrames = 0;
  $("cover").hidden = true;
  $("pause-overlay").hidden = true;
  if (sendStart) {
    input.set("pulse", BUTTON.START, true);
    pulses.set(BUTTON.START, 3);
  }
  status("ОПЕРАЦИЯ ИДЁТ", true);
  updateButtons();
  focusGame();
}

function simulateFrame() {
  const before = performance.now();
  nes.frame();
  frameNumber++;
  statsFrames++;
  canvas.dataset.cpuMs = (performance.now() - before).toFixed(2);
  canvas.dataset.frame = String(frameNumber);
  for (const [button, remaining] of pulses) {
    if (remaining <= 1) {
      input.set("pulse", button, false);
      pulses.delete(button);
    } else pulses.set(button, remaining - 1);
  }
  audio.flush();
}

// Simulation and presentation use separate clocks. A browser may throttle
// requestAnimationFrame while audio and the visible page remain active.
function simulationTick() {
  const now = performance.now();
  canvas.dataset.simulationTickMs = (now - previousSimulationTick).toFixed(2);
  previousSimulationTick = now;
  if (running) {
    try {
      input.pollGamepads(navigator.getGamepads?.() ?? []);
      clock.advance(now, simulateFrame);
    } catch (error) {
      pause(
        "Ошибка выполнения. Можно загрузить сохранение или перезапустить игру.",
      );
      status("ОШИБКА");
      toast(error.message, true, 0);
    }
  }
  if (now - statsTime >= 1000) {
    const measured = Math.round(
      statsFrames / Math.max(1, (now - statsTime) / 1000),
    );
    $("frame-label").textContent = running ? `${measured} Гц` : "NTSC";
    statsFrames = 0;
    statsTime = now;
    updateGamepadStatus();
  }
  setTimeout(simulationTick, running ? 8 : 100);
}

function presentationTick(now) {
  canvas.dataset.tickMs = (now - previousTick).toFixed(2);
  previousTick = now;
  if (running && frameNumber !== drawnFrame) {
    draw();
    drawnFrame = frameNumber;
  }
  requestAnimationFrame(presentationTick);
}

function updateGamepadStatus() {
  const connected = Array.from(navigator.getGamepads?.() ?? []).some(
    (pad) => pad?.connected && pad.mapping === "standard",
  );
  $("gamepad-light").classList.toggle("connected", connected);
  $("gamepad-status").textContent = connected
    ? "Геймпад подключён · A / B / D-pad"
    : "Можно подключить геймпад";
}

function savedDescription(save) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Yakutsk",
  }).format(new Date(save.createdAt));
}
function showSaveStatus() {
  $("save-light").classList.toggle("saved", Boolean(quickSave));
  $("save-status").textContent = quickSave
    ? `Сохранено: ${savedDescription(quickSave)}`
    : "Один слот сохранения в этом браузере.";
  updateButtons();
}

async function saveGame() {
  if (!ready || !started || storageBusy) return;
  storageBusy = true;
  updateButtons();
  try {
    const snapshot = {
      version: SAVE_VERSION,
      romHash: CARTRIDGE.sha256,
      createdAt: new Date().toISOString(),
      frame: frameNumber,
      state: nes.toJSON(),
    };
    await putSave(snapshot);
    quickSave = snapshot;
    showSaveStatus();
    toast("Операция сохранена. Можно вернуться позже.");
  } catch {
    toast(
      "Не удалось сохранить игру. Проверьте доступ к хранилищу браузера.",
      true,
    );
  } finally {
    storageBusy = false;
    updateButtons();
    focusGame();
  }
}

async function loadGame() {
  if (!ready || !quickSave || storageBusy) return;
  pause();
  storageBusy = true;
  updateButtons();
  const previous = nes.toJSON(),
    previousFrame = frameNumber;
  try {
    const snapshot = validateSave(await getSave(), CARTRIDGE.sha256);
    nes.fromJSON(snapshot.state);
    frameNumber = snapshot.frame;
    input.releaseAll();
    pulses.clear();
    lastFrame = nes.ppu.buffer;
    audio.clear();
    draw();
    started = true;
    $("cover").hidden = true;
    $("pause-description").textContent =
      "Сохранение загружено. Можно продолжать операцию.";
    $("pause-overlay").hidden = false;
    status("СОХРАНЕНИЕ ЗАГРУЖЕНО");
    toast("Сохранение загружено. Нажми «Продолжить».");
    $("resume-button").focus({ preventScroll: true });
  } catch {
    nes.fromJSON(previous);
    frameNumber = previousFrame;
    input.releaseAll();
    lastFrame = nes.ppu.buffer;
    draw();
    toast(
      "Сохранение не удалось загрузить. Текущая игра сохранена в памяти.",
      true,
    );
  } finally {
    storageBusy = false;
    updateButtons();
  }
}

function resetGame() {
  if (!ready || storageBusy) return;
  pause();
  nes.loadROM(romBytes);
  frameNumber = 0;
  input.releaseAll();
  for (let i = 0; i < 180; i++) {
    nes.frame();
    frameNumber++;
  }
  started = false;
  $("cover").hidden = false;
  $("pause-overlay").hidden = true;
  draw();
  status("ГОТОВО К ОПЕРАЦИИ");
  updateButtons();
  $("begin-button").focus({ preventScroll: true });
}

function toggleSound() {
  preferences.muted = !preferences.muted;
  audio.setMuted(preferences.muted);
  writePreferences(preferences);
  $("sound-icon").setAttribute(
    "href",
    preferences.muted ? "#i-muted" : "#i-sound",
  );
  $("sound-button").setAttribute("aria-pressed", String(preferences.muted));
  $("sound-button").setAttribute(
    "aria-label",
    preferences.muted ? "Включить звук" : "Выключить звук",
  );
  $("sound-button").title = preferences.muted
    ? "Включить звук (M)"
    : "Выключить звук (M)";
  focusGame();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      const target = matchMedia("(pointer: coarse)").matches
        ? document.querySelector(".game-panel")
        : $("screen");
      if (!target.requestFullscreen) {
        toast("Полноэкранный режим недоступен в этом браузере.");
        return;
      }
      await target.requestFullscreen();
    }
    focusGame();
  } catch {
    toast("Не удалось открыть полноэкранный режим.", true);
  }
}

$("begin-button").addEventListener("click", () => play(true));
$("original-menu-button").addEventListener("click", () => play(false));
$("resume-button").addEventListener("click", () => play());
$("pause-button").addEventListener("click", () => (running ? pause() : play()));
$("sound-button").addEventListener("click", toggleSound);
$("save-button").addEventListener("click", saveGame);
$("load-button").addEventListener("click", loadGame);
$("reset-button").addEventListener("click", resetGame);
$("fullscreen-button").addEventListener("click", toggleFullscreen);
$("graphics-select").value = preferences.graphics;
$("graphics-select").addEventListener("change", (event) => {
  preferences.graphics = event.target.value;
  renderer.mode = preferences.graphics;
  writePreferences(preferences);
  draw();
  focusGame();
});
// Apply initial sound state without toggling the saved preference.
$("sound-icon").setAttribute(
  "href",
  preferences.muted ? "#i-muted" : "#i-sound",
);
$("sound-button").setAttribute("aria-pressed", String(preferences.muted));
$("sound-button").setAttribute(
  "aria-label",
  preferences.muted ? "Включить звук" : "Выключить звук",
);

window.addEventListener("keydown", (event) => {
  if ($("about-dialog").open || event.ctrlKey || event.metaKey || event.altKey)
    return;
  if (event.code === "Escape" && started) {
    event.preventDefault();
    if (!event.repeat) running ? pause() : play();
    return;
  }
  const editable =
    event.target instanceof Element &&
    event.target.closest("input,select,textarea,button,a");
  if (editable) return;
  if (event.code === "KeyM") {
    event.preventDefault();
    if (!event.repeat) toggleSound();
    return;
  }
  if (event.code === "KeyF") {
    event.preventDefault();
    if (!event.repeat) toggleFullscreen();
    return;
  }
  if (event.code === "F5" && started) {
    event.preventDefault();
    if (!event.repeat) saveGame();
    return;
  }
  if (event.code === "F8" && quickSave) {
    event.preventDefault();
    if (!event.repeat) loadGame();
    return;
  }
  if (running && KEY_MAP[event.code] !== undefined) {
    event.preventDefault();
    input.set(`key:${event.code}`, KEY_MAP[event.code], true);
  }
});
window.addEventListener("keyup", (event) => {
  if (KEY_MAP[event.code] !== undefined)
    input.set(`key:${event.code}`, KEY_MAP[event.code], false);
});
window.addEventListener("blur", () => {
  input.releaseAll();
  if (running || starting)
    pause("Игра приостановлена, потому что окно потеряло фокус.");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (running || starting))
    pause("Ты переключился на другую вкладку. Операция ждёт тебя.");
});
window.addEventListener("gamepadconnected", updateGamepadStatus);
window.addEventListener("gamepaddisconnected", updateGamepadStatus);

document.querySelectorAll("[data-button]").forEach((button) => {
  const active = new Set();
  button.addEventListener("pointerdown", (event) => {
    if (!running) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    active.add(event.pointerId);
    input.set(`touch:${event.pointerId}`, Number(button.dataset.button), true);
    button.classList.add("pressed");
  });
  const release = (event) => {
    input.set(`touch:${event.pointerId}`, Number(button.dataset.button), false);
    active.delete(event.pointerId);
    button.classList.toggle("pressed", active.size > 0);
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(type, release);
});

const dpad = $("dpad"),
  dpadPointers = new Set();
function moveDpad(event) {
  const rect = dpad.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  const distance = Math.hypot(x, y),
    dead = distance < 0.19;
  input.set(
    `dpad:${event.pointerId}`,
    BUTTON.UP,
    !dead && y / distance < -0.38,
  );
  input.set(
    `dpad:${event.pointerId}`,
    BUTTON.DOWN,
    !dead && y / distance > 0.38,
  );
  input.set(
    `dpad:${event.pointerId}`,
    BUTTON.LEFT,
    !dead && x / distance < -0.38,
  );
  input.set(
    `dpad:${event.pointerId}`,
    BUTTON.RIGHT,
    !dead && x / distance > 0.38,
  );
}
dpad.addEventListener("pointerdown", (event) => {
  if (!running) return;
  event.preventDefault();
  dpad.setPointerCapture(event.pointerId);
  dpadPointers.add(event.pointerId);
  dpad.classList.add("active");
  moveDpad(event);
});
dpad.addEventListener("pointermove", (event) => {
  if (dpadPointers.has(event.pointerId) && running) moveDpad(event);
});
function releaseDpad(event) {
  for (const button of [4, 5, 6, 7])
    input.set(`dpad:${event.pointerId}`, button, false);
  dpadPointers.delete(event.pointerId);
  dpad.classList.toggle("active", dpadPointers.size > 0);
}
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  dpad.addEventListener(type, releaseDpad);

let resumeAfterAbout = false;
$("about-button").addEventListener("click", () => {
  resumeAfterAbout = running;
  if (running) pause();
  $("about-dialog").showModal();
});
$("about-close").addEventListener("click", () => $("about-dialog").close());
$("about-dialog").addEventListener("close", () => {
  if (resumeAfterAbout) play();
  resumeAfterAbout = false;
});

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Не удалось загрузить новые материалы."));
    image.src = url;
  });
}

async function init() {
  try {
    const [image, response] = await Promise.all([
      loadImage("./assets/materials.webp"),
      fetch(CARTRIDGE.url),
    ]);
    if (!response.ok)
      throw new Error(
        "Не удалось загрузить картридж. Запустите игру через npm start.",
      );
    romBytes = await validateCartridge(await response.arrayBuffer());
    renderer = new GameRenderer(canvas, image, {
      onContextLost: () =>
        pause(
          "Восстанавливаем изображение. Дождись готовности и продолжи игру.",
        ),
      onContextRestored: () => {
        draw();
        toast("Изображение восстановлено. Можно продолжить.");
      },
    });
    renderer.mode = preferences.graphics;
    canvas.dataset.backend = renderer.backend;
    nes.loadROM(romBytes);
    // Show the original title, bypassing only the console's power-on wait.
    for (let i = 0; i < 180; i++) {
      nes.frame();
      frameNumber++;
    }
    draw();
    ready = true;
    $("begin-label").textContent = "Начать операцию";
    status("ГОТОВО К ОПЕРАЦИИ");
    updateButtons();
    try {
      const save = await getSave();
      if (save) quickSave = validateSave(save, CARTRIDGE.sha256);
      showSaveStatus();
    } catch {
      $("save-status").textContent =
        "Сохранения недоступны. Проверьте настройки браузера.";
    }
    if (
      "serviceWorker" in navigator &&
      (location.protocol === "https:" ||
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1")
    ) {
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => {
          const showOffline = () => {
            $("offline-status").textContent =
              "Доступно офлайн после первой загрузки";
          };
          if (registration.active) showOffline();
          registration.installing?.addEventListener("statechange", (event) => {
            if (event.target.state === "activated") showOffline();
          });
        })
        .catch(() => {
          $("offline-status").textContent =
            "Все ресурсы поставляются вместе с игрой";
        });
    }
  } catch (error) {
    $("begin-label").textContent = "Не удалось запустить";
    status("ОШИБКА ЗАГРУЗКИ");
    toast(error.message, true, 0);
  }
}
simulationTick();
requestAnimationFrame(presentationTick);
init();
