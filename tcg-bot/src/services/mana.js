/**
 * Mana system — Qi (inner) + Dantian (stored)
 *
 * Qi:      Lv1=250, scales to Lv25=3500 max (never scales beyond Lv25)
 *          Each roll costs 25 Qi
 *          Passive regen: fills completely in 2h from 0
 *          Regen starts immediately when not full
 * Dantian: Fixed 3500 — stores Qi overflow, never scales
 *          Always 8h to fill from 0 to full
 * /refill: instant transfer Dantian → Qi (bypass passive regen)
 */

const QI_LV1          = 250;
const QI_LV25         = 3500;
const QI_MAX_LEVEL    = 25;
const QI_PER_ROLL     = 25;

const DANTIAN_MAX     = 3500;          // fixed, never scales
const DANTIAN_FILL_MS = 8 * 60 * 60 * 1000;   // 8h to full

const QI_REGEN_MS     = 2 * 60 * 60 * 1000;   // 2h to fill from 0 to max
const QI_COOLDOWN_MS  = QI_REGEN_MS;           // kept for compatibility

function qiMax(level) {
  const lv = Math.min(Math.max(level, 1), QI_MAX_LEVEL);
  if (lv >= QI_MAX_LEVEL) return QI_LV25;
  // Linear scale: Lv1=250, Lv25=3500
  const t = (lv - 1) / (QI_MAX_LEVEL - 1);
  return Math.round(QI_LV1 + t * (QI_LV25 - QI_LV1));
}

function dantianMax(level) {
  return DANTIAN_MAX; // always fixed
}

/**
 * How many rolls can the player afford right now.
 */
function rollsAvailable(currentQi) {
  return Math.floor(currentQi / QI_PER_ROLL);
}

/**
 * Apply passive Dantian regen since last update.
 */
function regenDantian(user) {
  const now        = Date.now();
  const lastUpdate = user.mana?.lastDantianUpdate
    ? new Date(user.mana.lastDantianUpdate).getTime()
    : now;
  const elapsed    = now - lastUpdate;
  const regenRate  = DANTIAN_MAX / DANTIAN_FILL_MS;
  const gained     = elapsed * regenRate;
  const current    = Math.min((user.mana?.dantian ?? DANTIAN_MAX) + gained, DANTIAN_MAX);
  return Math.floor(current);
}

/**
 * Apply passive Qi regen since last update.
 * Qi regenerates at qiMax / QI_REGEN_MS per ms.
 */
function regenQi(user) {
  const now     = Date.now();
  const maxQi   = qiMax(user.accountLevel);
  const stored  = user.mana?.qi ?? maxQi;

  if (stored >= maxQi) return maxQi;

  const lastUpdate = user.mana?.lastQiUpdate
    ? new Date(user.mana.lastQiUpdate).getTime()
    : now;

  const elapsed   = now - lastUpdate;
  const regenRate = maxQi / QI_REGEN_MS;
  return Math.min(Math.floor(stored + elapsed * regenRate), maxQi);
}

/**
 * Returns seconds until Qi is full.
 */
function qiRegenRemaining(user) {
  const maxQi   = qiMax(user.accountLevel);
  const current = regenQi(user);
  if (current >= maxQi) return 0;
  const missing   = maxQi - current;
  const regenRate = maxQi / QI_REGEN_MS;
  return Math.ceil(missing / regenRate / 1000);
}

// Legacy helpers
function isQiReady(user) { return regenQi(user) >= qiMax(user.accountLevel); }
function qiCooldownRemaining(user) { return qiRegenRemaining(user); }

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
  qiMax, dantianMax, rollsAvailable,
  regenDantian, regenQi, qiRegenRemaining,
  isQiReady, qiCooldownRemaining, formatCooldown,
  QI_PER_ROLL, QI_COOLDOWN_MS, QI_REGEN_MS, DANTIAN_FILL_MS,
};
