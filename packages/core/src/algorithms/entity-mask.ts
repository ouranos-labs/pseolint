import type { EntityMaskPattern } from "../types.js";

export function maskEntities(input: string, patterns: EntityMaskPattern[]): string {
  return patterns.reduce((text, entry) => {
    const flags = entry.pattern.flags.includes("g") ? entry.pattern.flags : `${entry.pattern.flags}g`;
    const safePattern = new RegExp(entry.pattern.source, flags);
    return text.replace(safePattern, entry.placeholder);
  }, input);
}
