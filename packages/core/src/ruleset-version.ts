/**
 * Bump when adding a rule, materially changing rule logic, or changing a default
 * threshold in a way that would change findings on previously-audited pages.
 * Pure refactor → don't bump. Used by change-driven monitoring to invalidate
 * skips when a new rule wouldn't otherwise run on prior-state-only URLs.
 */
export const CORE_RULESET_VERSION = "15";
