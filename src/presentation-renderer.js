/** New menus/story art. Only presentation reads this module. */
export function drawPresentation(ctx, game, sprites, machines) {
  const p = game.presentation, phase = game.state.mode & 63;
  if (!p || phase === 16 || ![4, 7, 8, 12, 20].includes(phase) && p.kind !== "decision") return false;
  const tint = ctx.createLinearGradient(0, 0, 1024, 960);
  tint.addColorStop(0, "#dcf3e9"); tint.addColorStop(1, "#fff1d4");
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 1024, 960);
  for (let i = 0; i < 19; i++) {
    ctx.fillStyle = ["#a2d6bd", "#f3b1a5", "#e4c168"][i % 3];
    ctx.beginPath(); ctx.arc((i * 173 + 43) % 1024, (i * 127 + 67) % 960, 4 + i % 4, 0, Math.PI * 2); ctx.fill();
  }
  const text = (value, y, size = 27, color = "#315647") => {
    ctx.fillStyle = color; ctx.font = `${size >= 40 ? "bold " : ""}${size}px Arial`;
    ctx.textAlign = "center"; ctx.fillText(value, 512, y);
  };
  const art = (image, index, x, y, size) => {
    const w = image.width / 4, h = image.height / 2;
    ctx.drawImage(image, index % 4 * w, Math.floor(index / 4) * h, w, h, x - size / 2, y - size / 2, size, size);
  };
  const choice = (label, y, i) => {
    ctx.fillStyle = p.cursor === i ? "#ffe59d" : "#fffdf2";
    ctx.beginPath(); ctx.roundRect(222, y - 39, 580, 70, 24); ctx.fill();
    text(`${p.cursor === i ? "›  " : ""}${label}`, y + 8, 28);
  };
  if (p.kind === "decision") {
    art(sprites, 0, 512, 330, 290); text("Возвращаемся в путь…", 565, 44);
    text("Любая игровая кнопка — продолжить", 685, 25);
  } else if (phase === 4) {
    text("БОЛЬШОЕ", 132, 62); text("ПУТЕШЕСТВИЕ", 202, 62);
    art(sprites, 0, 512, 400, 290); art(sprites, 1, 512, 400, 290);
    choice("Новая игра", 626, 0); choice("Продолжить по паролю", 714, 1);
    text("↑ ↓ или Tab — выбор · Enter — начать", 837, 24);
    text("X — пушка · Z — башня и пулемёт", 880, 22);
  } else if (phase === 20) {
    text("Вернуться на маршрут", 150, 46);
    text("Семь цифр из экрана окончания игры", 210, 26);
    text(p.input.padEnd(7, "·"), 340, 62);
    for (let digit = 0; digit < 11; digit++) {
      const x = 137 + digit % 6 * 150, y = 465 + Math.floor(digit / 6) * 105;
      ctx.fillStyle = p.cursor === digit ? "#ffe59d" : "#fffdf2";
      ctx.beginPath(); ctx.roundRect(x - 59, y - 39, 118, 78, 22); ctx.fill();
      ctx.fillStyle = "#315647"; ctx.font = "34px Arial"; ctx.textAlign = "center";
      ctx.fillText(digit === 10 ? "⌫" : String(digit), x, y + 12);
    }
    text(p.error || "← → — выбор цифры · X / Z — ввести", 720, 24, p.error ? "#aa4354" : "#315647");
    text("Можно также ввести пароль в поле под игрой", 790, 22);
  } else if (phase === 7) {
    art(sprites, 0, 512, 275, 250);
    if (p.kind === "gameover") {
      text("Передышка перед дорогой", 470, 43);
      text(`Пароль маршрута: ${p.password}`, 540, 32);
      choice("Продолжить", 660, 0); choice("Главное меню", 748, 1);
      text("↑ ↓ — выбор · Enter — подтвердить", 865, 24);
    } else {
      text("Попробуем ещё раз!", 515, 47);
      text(`Осталось попыток: ${game.state.lives + 1}`, 585, 29);
      text("Любая игровая кнопка — продолжить", 730, 25);
    }
  } else {
    const finished = p.kind === "finished";
    text(finished ? "Спасибо за путешествие!" : phase === 12 ? "Маршрут пройден" : "История путешествия", 113, 42);
    art(machines || sprites, p.panel === null ? 1 : p.panel % 8, 512, 347, 330);
    const lines = finished ? ["Новый путь ждёт впереди."] : p.caption || [];
    const size = lines.some(line => line.length > 32) ? 23 : 27;
    lines.forEach((line, i) => text(line.trim(), 587 + i * 39, size));
    if (phase === 8) text("Любая игровая кнопка — в главное меню", 889, 22);
    if (finished) text("Кнопка «Начать заново» — новое путешествие", 855, 23);
  }
  return true;
}

export function drawRadio(ctx, game) {
  const radio = game.radio;
  if (!radio) return;
  ctx.fillStyle = "#21483bda"; ctx.fillRect(0, 0, 1024, 960);
  ctx.fillStyle = "#fff9eb"; ctx.beginPath(); ctx.roundRect(92, 170, 840, 625, 36); ctx.fill();
  ctx.fillStyle = "#315647"; ctx.textAlign = "center"; ctx.font = "bold 38px Arial";
  ctx.fillText("На связи", 512, 249);
  ctx.font = "28px Arial";
  game.config.presentation.messages[radio.messages[radio.index]].lines.forEach((line, i) =>
    ctx.fillText(line, 512, 338 + i * 49));
  ctx.font = "22px Arial"; ctx.fillText(`Сообщение ${radio.index + 1} / ${radio.messages.length}`, 512, 703);
  ctx.fillText("X / Z — следующее · Enter / Tab — закрыть", 512, 751);
}
