import { byte, applyPrototype, reserveSlot } from "./actors.js";

/** Native translation of row-spawn allocation and assembly. Scroll/frontier
 * activation is a separate caller: this module never invents spawn timing. */
export function createSpawnSystem(data, actorData, actors, operations) {
  const descriptors = new Map(
    data.descriptors.map((value) => [value.spawnId, value]),
  );
  function initialize(slot, prototypeId) {
    applyPrototype(actorData, actors[slot], prototypeId);
    operations.onInitialize?.(slot, prototypeId);
  }
  function setScript(actor, commandId) {
    if (!commandId) return;
    actor.commandId = commandId;
    const address = Number.parseInt(commandId.slice(4), 16);
    actor.scriptLow = address & 255;
    actor.scriptHigh = address >> 8;
  }
  function spawnRecord(record) {
    const descriptor = descriptors.get(record.spawnId);
    if (!descriptor) throw Error(`Unknown native spawn ${record.spawnId}`);
    let primary = reserveSlot(
      actors,
      descriptor.poolStart,
      descriptor.poolCount,
    );
    if (primary < 0 && descriptor.prototypeId === 54)
      primary = actors.findIndex(
        (actor, slot) => slot >= 22 && slot < 25 && actor.kind !== 125,
      );
    if (primary < 0) return { primary: -1, secondary: -1 };
    const actor = actors[primary];
    actor.xLow = record.x & 255;
    actor.xHigh = record.x >> 8;
    actor.y = record.screenY;
    initialize(primary, descriptor.primary);
    let scriptId = record.spawnId;
    switch (descriptor.variantMode) {
      case 0:
        actor.parameter2 = byte((record.variant << 4) + 1);
        break;
      case 1:
        actor.heading = record.variant;
        break;
      case 2:
        scriptId = byte(descriptor.variantBase + record.variant);
        break;
      case 3:
        initialize(primary, byte(descriptor.primary + record.variant));
        break;
      default:
        actor.spawnMarker = byte(actor.spawnMarker + record.variant);
        break;
    }
    if (typeof operations.resolveContact !== "function")
      throw Error("Unported spawn dependency: resolveContact");
    operations.resolveContact(actor, primary, { dx: 0, dy: 0, forced: true });
    setScript(actor, data.scriptRoots[scriptId]);
    if (descriptor.secondary === 0) return { primary, secondary: -1 };
    const expanded =
      descriptor.secondary === 98 || descriptor.secondary === 157;
    const secondary = reserveSlot(
      actors,
      expanded ? 16 : 112,
      expanded ? 12 : 3,
    );
    if (secondary < 0) {
      actor.y = 255;
      return { primary, secondary: -1 };
    }
    const attachment = actors[secondary];
    initialize(secondary, descriptor.secondary);
    for (const field of ["xLow", "xHigh", "y", "heading", "parameter2"])
      attachment[field] = actor[field];
    attachment.link |= primary;
    if (descriptor.variantMode === 0) attachment.kind = 28;
    else {
      attachment.parameter2 = 0;
      if (descriptor.variantMode === 1) attachment.kind = 31;
      else attachment.pendingKind = 0;
    }
    return { primary, secondary };
  }
  function spawnRow(page, fineY, scrollDelta) {
    // $E429 only runs for a negative scroll delta at a crossed 16px frontier.
    if (!(byte(scrollDelta) & 128) || byte(fineY + scrollDelta) & 15) return [];
    return data.pages[page & 511].rows[fineY >> 4].map(spawnRecord);
  }
  return { spawnRecord, spawnRow };
}
