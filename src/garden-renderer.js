const INVENTORY = ["Тройной залп", "Мощность", "Осколки", "Дальность", "Импульс", "Резерв", "Связь"];

/** New HTML5 presentation. Gameplay never samples pixels or this canvas. */
export function drawGardenGame(context, canvas, game, sprites, terrain) {
  if (canvas.width !== 1024 || canvas.height !== 960) { canvas.width = 1024; canvas.height = 960; }
  canvas.className = "";
  const s = game.state, scale = 4, cameraX = ((s.cameraHigh & 1) << 8) | s.cameraLow;
  const definitions = game.world.collisions.get(`${s.tileset}:${s.materialPolicy}`);
  const sw = terrain.width / 3, sh = terrain.height / 2;
  context.fillStyle = "#eaf3d5"; context.fillRect(0, 0, 1024, 960);
  for (let y = -(s.cameraFineY & 15); y < 240; y += 16) {
    for (let x = -(cameraX & 15); x < 256; x += 16) {
      const col = ((cameraX + x) & 511) >> 4;
      const row = Math.floor((s.cameraFineY + y) / 16) % 15;
      const id = game.cache.metatile(col, row), flags = definitions[id].reduce((a, b) => a | b, 0);
      const tile = flags & 1 ? 2 : flags & 2 ? 3 : flags & 128 ? 4 : (id & 3) === 0 ? 5 : 0;
      context.drawImage(terrain, tile % 3 * sw + (col & 7) * sw / 8,
        Math.floor(tile / 3) * sh + (row & 7) * sh / 8, sw / 8, sh / 8,
        x * scale, y * scale, 16 * scale + 1, 16 * scale + 1);
    }
  }
  const actorSprite = (index, x, y, angle = 0, size = 30) => {
    const w = sprites.width / 4, h = sprites.height / 2;
    context.save();context.translate(x * scale, y * scale);context.rotate(angle);
    context.drawImage(sprites, index % 4 * w, Math.floor(index / 4) * h, w, h,
      -size * scale / 2, -size * scale / 2, size * scale, size * scale);
    context.restore();
  };
  for (let slot = 2; slot < 30; slot++) {
    const a = game.actors[slot], x = s.mode & 128 ? a.xLow : (((a.xHigh << 8) | a.xLow) - cameraX) & 511;
    if (a.y >= 232 || x >= 256) continue;
    if ([3, 8, 9].includes(a.kind)) {
      context.fillStyle = slot >= 26 ? "#fff4a1" : "#fa78aa";
      context.strokeStyle = "#fffdf5";context.lineWidth = 3;
      context.beginPath();context.arc((x + 12) * scale, (a.y + 12) * scale, slot >= 26 ? 11 : 8, 0, Math.PI * 2);
      context.fill();context.stroke();
    } else if (a.kind === 1 || a.kind === 2) actorSprite(7, x + 12, a.y + 12, a.timer / 10, 32);
    else if (a.kind === 4 || a.kind === 5 || a.kind === 27) actorSprite(6, x + 12, a.y + 12, 0, 25);
    else actorSprite(a.flags & 8 ? 3 : a.kind >= 48 ? 4 : 2, x + 12, a.y + 12, (a.heading & 7) * Math.PI / 4, a.kind < 20 ? 46 : 30);
  }
  const player = game.actors[0], hull = game.actors[1];
  if (player.y < 232) {
    const x = s.mode & 128 ? player.xLow : (player.xLow - s.cameraLow) & 255;
    actorSprite(0, x + 12, player.y + 12, (hull.heading & 7) * Math.PI / 4);
    actorSprite(1, x + 12, player.y + 12, (player.heading & 7) * Math.PI / 4);
  }
  context.fillStyle = "#fff9ebed";context.beginPath();context.roundRect(40, 30, 944, 72, 24);context.fill();
  context.fillStyle = "#315647";context.font = "bold 23px Arial";context.textAlign = "left";
  context.fillText("ЭНЕРГИЯ", 62, 76);
  context.fillStyle = "#e3dfcc";context.fillRect(196, 54, 220, 22);
  context.fillStyle = player.counter2 > 8 && !s.deadFlag ? "#63bb85" : "#ef91a4";
  context.fillRect(196, 54, s.deadFlag ? 0 : Math.min(32, player.counter2) / 32 * 220, 22);
  context.fillStyle = "#315647";context.textAlign = "right";
  context.fillText(`ОЧКИ ${s.score.toString().padStart(6, "0")}`, 956, 77);
  const phase = s.mode & 63;
  if (phase) {
    context.fillStyle = "#21483bc9";context.fillRect(0, 0, 1024, 960);
    context.fillStyle = "#fff9e9";context.textAlign = "center";context.font = "bold 42px Arial";
    context.fillText(phase === 2 ? "Мастерская" : phase === 12 ? "Маршрут завершён!" : phase === 7 ? "Возвращаемся на маршрут…" : "Привал", 512, phase === 2 ? 220 : 440);
    if (phase === 2) {
      context.font = "27px Arial";
      INVENTORY.forEach((name, i) => {
        context.fillStyle = s.inventoryIndex === i ? "#ffe48b" : "#fff9e9";
        const stock = i === 6 ? (s.statusTimer === 51 ? "ожидание" : "есть сигнал")
          : game.equipment.get(game.config.equipment.items[i].resource);
        context.fillText(`${s.inventoryIndex === i ? "› " : ""}${name}  ${stock} ${game.equipment.active(i) ? "✓" : ""}`, 512, 290 + i * 52);
      });
      context.font = "22px Arial";context.fillText("← → выбор · X включить · Tab вернуться", 512, 740);
    } else { context.font = "25px Arial";context.fillText(phase === 12 ? "Новое путешествие — кнопка «Начать заново»" : "Enter — продолжить", 512, 500); }
  }
}
