"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { setFiredRules } from "@/lib/demo-pubsub";
import { TileGrid, deriveTileStates, type Severity } from "./tile-grid";
import { scoreTone as canonicalScoreTone } from "@/lib/grade";

type Finding = {
  code: string;
  sev: Severity;
  label: string;
  count: number;
  tiles: number[];
  ruleIndex: number;
};

const TOTAL_TILES = 200;

const FINDINGS: Record<string, Finding> = {
  E02: {
    code: "E02",
    sev: "E",
    label: "Doorway pages at /hotel-[city]",
    count: 134,
    tiles: range(0, 134),
    ruleIndex: 1,
  },
  E03: {
    code: "E03",
    sev: "E",
    label: "Duplicate template (3 variants)",
    count: 12,
    tiles: range(134, 12),
    ruleIndex: 2,
  },
  W07: {
    code: "W07",
    sev: "W",
    label: "Title stuffing across templates",
    count: 41,
    tiles: range(146, 41),
    ruleIndex: 6,
  },
  W17: {
    code: "W17",
    sev: "W",
    label: "Stuffed H2 across templates",
    count: 18,
    tiles: range(170, 18),
    ruleIndex: 16,
  },
  I13: {
    code: "I13",
    sev: "I",
    label: "Mixed-language intro block",
    count: 8,
    tiles: range(188, 8),
    ruleIndex: 12,
  },
};

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

type ScriptEvent =
  | { at: number; kind: "crawl"; pages: number }
  | { at: number; kind: "find"; code: keyof typeof FINDINGS; scoreDelta: number }
  | { at: number; kind: "done" };

const SCRIPT: ScriptEvent[] = [
  { at: 450, kind: "crawl", pages: 14 },
  { at: 900, kind: "find", code: "W07", scoreDelta: -4 },
  { at: 1300, kind: "crawl", pages: 36 },
  { at: 1800, kind: "find", code: "E02", scoreDelta: -14 },
  { at: 2300, kind: "crawl", pages: 68 },
  { at: 2700, kind: "find", code: "E03", scoreDelta: -8 },
  { at: 3100, kind: "crawl", pages: 104 },
  { at: 3500, kind: "find", code: "W17", scoreDelta: -4 },
  { at: 3900, kind: "crawl", pages: 148 },
  { at: 4300, kind: "find", code: "I13", scoreDelta: -3 },
  { at: 4700, kind: "crawl", pages: 182 },
  { at: 5200, kind: "crawl", pages: 200 },
  { at: 5500, kind: "done" },
];

const INITIAL_SCORE = 100;
const FINAL_MS = 8800;
const LOOP_PAUSE_MS = 7800;

type State = {
  pages: number;
  targetScore: number;
  firedCodes: string[];
  elapsedMs: number;
  done: boolean;
  version: number;
};

type Action =
  | { type: "reset" }
  | { type: "pages"; pages: number }
  | { type: "find"; code: string; scoreDelta: number }
  | { type: "tick"; elapsedMs: number }
  | { type: "done" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return { pages: 0, targetScore: INITIAL_SCORE, firedCodes: [], elapsedMs: 0, done: false, version: s.version + 1 };
    case "pages":
      return { ...s, pages: a.pages };
    case "find":
      return { ...s, targetScore: s.targetScore + a.scoreDelta, firedCodes: [...s.firedCodes, a.code] };
    case "tick":
      return { ...s, elapsedMs: a.elapsedMs };
    case "done":
      return { ...s, done: true, elapsedMs: FINAL_MS, pages: TOTAL_TILES };
  }
}

export function LiveDemo({ className }: { className?: string }) {
  const [state, dispatch] = useReducer(reducer, {
    pages: 0,
    targetScore: INITIAL_SCORE,
    firedCodes: [],
    elapsedMs: 0,
    done: false,
    version: 0,
  });
  const [displayScore, setDisplayScore] = useState(INITIAL_SCORE);
  const [autoLoop, setAutoLoop] = useState(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotionRef.current) {
      const final = SCRIPT.reduce((acc, ev) => (ev.kind === "find" ? acc + ev.scoreDelta : acc), INITIAL_SCORE);
      dispatch({ type: "reset" });
      for (const ev of SCRIPT) {
        if (ev.kind === "find") dispatch({ type: "find", code: ev.code, scoreDelta: ev.scoreDelta });
      }
      dispatch({ type: "done" });
      setDisplayScore(final);
      setAutoLoop(false);
      startedRef.current = true;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    startRun();
    return () => stopRun(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startRun() {
    stopRun(false);
    dispatch({ type: "reset" });
    setDisplayScore(INITIAL_SCORE);
    const start = performance.now();

    for (const ev of SCRIPT) {
      const t = setTimeout(() => {
        if (ev.kind === "crawl") dispatch({ type: "pages", pages: ev.pages });
        else if (ev.kind === "find") dispatch({ type: "find", code: ev.code, scoreDelta: ev.scoreDelta });
        else if (ev.kind === "done") {
          dispatch({ type: "done" });
          if (autoLoop && !reducedMotionRef.current) {
            loopTimerRef.current = setTimeout(() => {
              startRun();
            }, LOOP_PAUSE_MS);
          }
        }
      }, ev.at);
      timersRef.current.push(t);
    }

    clockRef.current = setInterval(() => {
      const elapsed = Math.min(FINAL_MS, performance.now() - start);
      dispatch({ type: "tick", elapsedMs: elapsed });
      if (elapsed >= FINAL_MS && clockRef.current) {
        clearInterval(clockRef.current);
        clockRef.current = null;
      }
    }, 80);
  }

  function stopRun(resetState: boolean) {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (clockRef.current) {
      clearInterval(clockRef.current);
      clockRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (resetState) setFiredRules([]);
  }

  useEffect(() => {
    let raf: number;
    const tick = () => {
      setDisplayScore((prev) => {
        const diff = state.targetScore - prev;
        if (Math.abs(diff) < 0.4) return state.targetScore;
        return prev + diff * 0.18;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.targetScore]);

  useEffect(() => {
    const fired = state.firedCodes
      .map((c) => FINDINGS[c])
      .filter(Boolean)
      .map((f) => ({ index: f.ruleIndex, sev: f.sev }));
    setFiredRules(fired);
  }, [state.firedCodes]);

  const firedFindings = state.firedCodes.map((c) => FINDINGS[c]).filter(Boolean);
  const tileStates = deriveTileStates({
    total: TOTAL_TILES,
    pages: state.pages,
    findings: firedFindings.map((f) => ({ sev: f.sev, tiles: f.tiles })),
  });

  const counts = tileStates.reduce(
    (acc, s) => {
      acc[s]++;
      return acc;
    },
    { unscanned: 0, clean: 0, info: 0, warning: 0, error: 0 },
  );

  const scoreRounded = Math.round(displayScore);
  const scoreTone = canonicalScoreTone(scoreRounded);
  const elapsed = (state.elapsedMs / 1000).toFixed(1);

  function handleReplay() {
    setAutoLoop(true);
    startRun();
  }

  return (
    <div
      className={ cn(
        "relative flex flex-col overflow-hidden rounded-[28px] border border-border bg-card/80",
        "shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]",
        className,
      ) }
      aria-label="Live demo of an audit running on airport-hotels.example"
    >
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-3.5">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={ cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              state.done ? "bg-muted-foreground" : "animate-pulse bg-primary",
            ) }
          />
          <span className="font-mono text-muted-foreground">airport-hotels.example</span>
          <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            demo
          </span>
        </div>
        <button
          type="button"
          onClick={ handleReplay }
          className="rounded-[12px] px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Replay demo"
        >
          ↻ replay
        </button>
      </div>

      <div className="px-6 pb-4 pt-6">
        <TileGrid
          states={ tileStates }
          title="200 pages of the site, shaded by the worst rule that fires on each page"
        />
      </div>

      <div className="grid grid-cols-[auto_1fr] items-end gap-6 px-6 pb-6">
        <div className="flex flex-col gap-1">
          <span
            className={ cn(
              "font-display leading-none tabular-nums tracking-tight transition-colors",
              scoreTone,
            ) }
            style={ { fontSize: "88px", fontFamily: "var(--font-display)" } }
          >
            { scoreRounded }
          </span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Risk score
          </span>
        </div>
        <div className="flex flex-col gap-2 pb-1 text-xs text-muted-foreground">
          <div className="grid grid-cols-2 gap-x-5 gap-y-1">
            <CountRow label="Errors" value={ counts.error } tone="text-destructive" />
            <CountRow label="Warnings" value={ counts.warning } tone="text-warning" />
            <CountRow label="Info" value={ counts.info } tone="text-warning/60" />
            <CountRow label="Clean" value={ counts.clean } tone="text-muted-foreground" />
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-border/50 pt-1.5">
            <span className="uppercase tracking-wider">Pages</span>
            <span className="font-mono tabular-nums text-foreground">
              { state.pages } / { TOTAL_TILES } · { elapsed }s
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 bg-background/30 px-6 py-3.5 font-mono text-[11px] text-muted-foreground">
        { state.firedCodes.length === 0 ? (
          <span>scanning…</span>
        ) : (
          state.firedCodes.map((c) => {
            const f = FINDINGS[c];
            return (
              <span key={ c } className="inline-flex items-center gap-1.5">
                <span className={ cn("inline-block h-1 w-1 rounded-full", sevDot(f.sev)) } />
                <span>
                  { c } <span className="tabular-nums text-foreground/70">×{ f.count }</span>
                </span>
              </span>
            );
          })
        ) }
      </div>
    </div>
  );
}

function CountRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="uppercase tracking-wider">{ label }</span>
      <span className={ cn("font-mono tabular-nums", tone) }>{ value }</span>
    </div>
  );
}

function sevDot(sev: Severity): string {
  if (sev === "E") return "bg-destructive";
  if (sev === "W") return "bg-warning";
  return "bg-warning/60";
}
