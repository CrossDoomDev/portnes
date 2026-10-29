export function terrainInputs(seed, environments) {
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  return (index) => {
    const cells = Array.from({ length: 480 }, rand);
    const actor = {
      xLow: rand(),
      xHigh: rand(),
      y: rand(),
      kind: index % 4 === 0 ? 8 + (rand() & 7) : rand(),
      contactFlags: rand(),
      link: rand(),
    };
    const delta = { dx: (rand() % 33) - 16, dy: (rand() % 33) - 16 };
    const camera = {
      page: environments[rand() % environments.length],
      fineY: rand() % 240,
    };
    if (index % 17 === 0) camera.fineY = 239;
    if (index % 19 === 0) camera.fineY = 0;
    return { cells, actor, delta, camera };
  };
}
