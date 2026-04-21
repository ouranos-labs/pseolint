"use client";
import { useSyncExternalStore } from "react";

export type FiredRule = { index: number; sev: "E" | "W" | "I" };

const EMPTY: FiredRule[] = [];
let firedRules: FiredRule[] = EMPTY;
const listeners = new Set<() => void>();

export function setFiredRules(rules: FiredRule[]) {
  firedRules = rules.length === 0 ? EMPTY : rules;
  for (const l of listeners) l();
}

function getSnapshot(): FiredRule[] {
  return firedRules;
}

function getServerSnapshot(): FiredRule[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFiredRules(): FiredRule[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
