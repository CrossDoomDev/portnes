import { byte, ACTOR_FIELDS } from "./actors.js";

/** Inventory selection, activation and shot costs: FC49–FD11 and BF50–BFE8. */
export function createPlayerEquipment(data, actors, state, operations = {}) {
  if (data?.schema !== 1) throw Error("Unsupported equipment schema");
  if (!Array.isArray(state.resources) || state.resources.length !== 5)
    throw Error("Five player resource counters are required");
  const cue = (id) => operations.onSound?.(id);
  const get = (i) => i < 5 ? state.resources[i] : i === 5 ? state.reserveEnergy : state.equipment;
  const set = (i, value) => {
    value = byte(value);
    if (i < 5) state.resources[i] = value;
    else if (i === 5) state.reserveEnergy = value;
    else state.equipment = value;
  };
  function active(index) {
    const item = data.items[index];
    return (state.equipment & item.equipmentMask) | (state.modifiers & item.modifierMask);
  }
  function clear(index) {
    const item = data.items[index];
    state.equipment &= byte(~item.equipmentMask);
    state.modifiers &= byte(~item.modifierMask);
  }
  function toggle(index) {
    if (!Number.isInteger(index) || index < 0 || index >= 9)
      throw Error(`Unknown equipment item ${index}`);
    if (active(index)) { cue(60); clear(index); return; }
    const item = data.items[index];
    if ((get(item.resource) & item.availableMask) < item.cost) { clear(index); return; }
    if (index >= 7) clear(index ^ 15);
    state.equipment |= item.equipmentMask;
    state.modifiers |= item.modifierMask;
    cue(60);
  }
  function consume(index) {
    if (!active(index)) return;
    if (index === 4) clear(index);
    const item = data.items[index], value = byte(get(item.resource) - item.cost);
    set(item.resource, value);
    if ((byte(value - 1) & 240) === 240) { set(item.resource, 0); clear(index); }
  }
  function consumeShot() { for (let i = 0; i < 5; i++) consume(i); }
  function heal(amount, overflow = false) {
    const value = byte(actors[0].counter2 + amount);
    actors[0].counter2 = value < 32 ? value : 32;
    if (overflow && value >= 32) {
      const cursor = state.reserveEnergy;
      if (cursor) state.reserveEnergy = Math.min(32, byte(value - 32 + cursor));
      return cursor;
    }
  }
  function message(id) {
    const saved = state.messageId;
    state.messageId = id;
    state.messageState = 255;
    operations.onMessage?.(id);
    state.messageId = saved;
  }
  function pickup(sourceSlot, targetSlot) {
    const target = actors[targetSlot], id = target.projectileKind;
    let cursor = targetSlot * 8;
    if (id === 0) heal(2);
    else if (id >= 1 && id <= 4) { set(id - 1, Math.min(40, byte(get(id - 1) + 8))); heal(2); }
    else if (id === 5) { set(4, Math.min(24, byte(get(4) + 8))); heal(2); }
    else if (id === 6) actors[0].counter2 = state.reserveEnergy = 32;
    else if (id === 10) {
      const next = heal(8, true);
      if (next !== undefined) cursor = next;
    }
    else if (id < 7 || id > 9) throw Error(`Unknown pickup ${id}`);
    // BF90 leaves its reserve-energy value in the record cursor. EAF4 reads
    // the following kind/message fields through that cursor, even unaligned.
    const index = cursor + 3, slot = index >> 3, field = index & 7;
    if (!actors[slot]) throw Error("Pickup cursor exceeds scene records");
    if (actors[slot][ACTOR_FIELDS[1][field]] === 5)
      message(byte(actors[slot][ACTOR_FIELDS[2][field]] + 47));
  }
  function equipment(sourceSlot, targetSlot) {
    const target = actors[targetSlot];
    target.projectileKind = target.dropId;
    target.dropId = 127;
    message(byte(target.projectileKind + 47));
  }
  return { active, toggle, clear, consume, consumeShot, pickup, equipment, get, set };
}
