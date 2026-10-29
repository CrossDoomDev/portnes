export const GAME_DATA = Object.freeze({
  data: "actors", spawns: "spawns", aiming: "aiming", turrets: "turrets",
  emplacements: "emplacements", bosses: "bosses", mapChanges: "map-changes",
  scores: "scores", world: "world", equipment: "player-equipment",
  campaign: "campaign", layout: "layout-state", randomContexts: "random-contexts",
  presentation: "presentation",
  combatGeometry: "combat-geometry",
});
export async function loadGameData() {
  const values = await Promise.all(Object.entries(GAME_DATA).map(async ([key, file]) => {
    const response = await fetch(new URL(`../data/${file}.json`, import.meta.url));
    if (!response.ok) throw Error(`Cannot load game data ${file}`);
    return [key, await response.json()];
  }));
  const response = await fetch(new URL("../data/handler-coverage.json", import.meta.url));
  if (!response.ok) throw Error("Cannot load actor dispatch data");
  return { ...Object.fromEntries(values), dispatch: (await response.json()).dispatch };
}
