/**
 * Mana system — Qi (inner) + Dantian (stored)
 *
 * Qi:      Lv1=10, +1.25/level, cap at Lv25=40
 * Dantian: Lv1=40, Lv25=100 (linear scale), always 8h to full
 * Qi cooldown: 1h30 after depletion
 */

const QI_BASE         = 10;
const QI_PER_LEVEL    = 1.25;
const QI_MAX_LEVEL    = 25;

const DANTIAN_LV1     = 40;
const DANTIAN_LV25    = 100;
const DANTIAN_FILL_MS = 8 * 60 * 60 * 1000; // 8h always
const QI_COOLDOWN_MS  = 90 * 60 * 1000;      // 1h30

function qiMax(level) {
  const lv = Math.min(level, QI_MAX_LEVEL);
  return Math.round(QI_BASE + (lv - 1) * QI_PER_LEVEL);
}

function dantianMax(level) {
  const t = (Math.min(level, QI_MAX_LEVEL) - 1) / (QI_MAX_LEVEL - 1);
  return Math.round(DANTIAN_LV1 + t * (DANTIAN_LV25 - DANTIAN_LV1));
}

/**
 * Apply passive Dantian regen since last update.
 * Returns updated dantian value (capped at max).
 */
function regenDantian(user) {
  const now        = Date.now();
  const lastUpdate = user.mana?.lastDantianUpdate
    ? new Date(user.mana.lastDantianUpdate).getTime()
    : now;

  const elapsed    = now - lastUpdate;
  const maxDantian = dantianMax(user.accountLevel);
  const regenRate  = maxDantian / DANTIAN_FILL_MS; // units per ms

  const gained  = elapsed * regenRate;
  const current = Math.min((user.mana?.dantian ?? maxDantian) + gained, maxDantian);
  return Math.floor(current);
}

function isQiReady(user) {
  if (!user.mana?.qiCooldownUntil) return true;
  return Date.now() >= new Date(user.mana.qiCooldownUntil).getTime();
}

function qiCooldownRemaining(user) {
  if (!user.mana?.qiCooldownUntil) return 0;
  return Math.max(0, Math.ceil((new Date(user.mana.qiCooldownUntil).getTime() - Date.now()) / 1000));
}

function formatCooldown(seconds) {
  if (seconds <= 0) return "Ready";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  qiMax,
  dantianMax,
  regenDantian,
  isQiReady,
  qiCooldownRemaining,
  formatCooldown,
  QI_COOLDOWN_MS,
  DANTIAN_FILL_MS,
};
