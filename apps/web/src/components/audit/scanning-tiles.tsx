"use client";
import { useEffect, useState } from "react";
import { TileGrid, type TileState } from "@/components/landing/tile-grid";

const TOTAL = 200;
const STEP_MS = 140;

export function ScanningTiles({ title }: { title?: string }) {
  const [states, setStates] = useState<TileState[]>(() => new Array(TOTAL).fill("unscanned"));

  useEffect(() => {
    let cursor = 0;
    const next = (): TileState[] => {
      cursor = (cursor + 3) % (TOTAL + 40);
      return Array.from({ length: TOTAL }, (_, i) => {
        if (i >= cursor) return "unscanned";
        const roll = (i * 9301 + 49297) % 233280;
        const r = roll / 233280;
        if (r < 0.04) return "error";
        if (r < 0.15) return "warning";
        if (r < 0.22) return "info";
        return "clean";
      });
    };
    const id = setInterval(() => setStates(next()), STEP_MS);
    return () => clearInterval(id);
  }, []);

  return <TileGrid states={states} title={title} />;
}
