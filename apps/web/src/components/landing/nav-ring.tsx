"use client";
import { RuleRing, type RuleRingProps } from "./rule-ring";
import { useFiredRules } from "@/lib/demo-pubsub";

export function NavRing(props: Omit<RuleRingProps, "fired">) {
  const fired = useFiredRules();
  return <RuleRing {...props} fired={fired} />;
}
