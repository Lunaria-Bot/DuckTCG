/**
 * Mana system — Qi (inner) + Dantian (stored)
 *
 * Qi:      Lv1=10, +1.25/level, cap at Lv25=40
 *          Passive regen: fills completely in 1h30 (QI_REGEN_MS)
 *          Regen starts immediately when not full — no waiting needed
 * Dantian: Lv1=40, Lv25=100 (linear scale), always 8h to full
 * /refill: instant transfer Dantian → Qi (bypass passive regen)
 */

const QI_BASE         = 10;
const QI_PER_LEVEL    = 1.25;
const QI_MAX_LEVEL    = 25;

const DANTIAN_LV1     = 40;
const DANTIAN_LV25    = 100;
const DANTIAN_FILL_MS = 8 * 60 * 60 * 1000;   // 8h
const QI_REGEN_MS     = 90 * 60 * 1000;        // 1h30 to fill from 0 to max
const QI_COOLDOWN_MS  = QI_REGEN_MS;           // kept for compatibility

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
 */
function regenDantian(user) {
  const now        = Date.now();
  const lastUpdate = user.mana?.lastDantianUpdate
    ? new Date(user.mana.lastDantianUpdate).getTime()
    : now;
  const elapsed    = now - lastUpdate;
  const maxDantian = dantianMax(user.accountLevel);
  const regenRate  = maxDantian / DANTIAN_FILL_MS;
  const gained     = elapsed * regenRate;
  const current    = Math.min((user.mana?.dantian ?? maxDantian) + gained, maxDantian);
  return Math.floor(current);
}

/**
 * Apply passive Qi regen since last update.
 * Qi regenerates from lastQiUpdate at a rate of qiMax / QI_REGEN_MS.
 */
function regenQi(user) {
  const now        = Date.now();
  const maxQi      = qiMax(user.accountLevel);
  const storedQi   = user.mana?.qi ?? maxQi;

  // If already full, skip
  if (storedQi >= maxQi) return maxQi;

  const lastUpdate = user.mana?.lastQiUpdate
    ? new Date(user.mana.lastQiUpdate).getTime()
    : now;

  const elapsed  = now - lastUpdate;
  const regenRate = maxQi / QI_REGEN_MS; // units per ms
  const gained   = elapsed * regenRate;
  return Math.min(Math.floor(storedQi + gained), maxQi);
}

/**
 * Returns seconds until Qi is full based on passive regen.
 */
function qiRegenRemaining(user) {
  const maxQi    = qiMax(user.accountLevel);
  const current  = regenQi(user);
  if (current >= maxQi) return 0;
  const missing  = maxQi - current;
  const regenRate = maxQi / QI_REGEN_MS;
  return Math.ceil(missing / regenRate / 1000);
}

// Legacy helpers kept for compatibility
function isQiReady(user) {
  return regenQi(user) >= qiMax(user.accountLevel);
}

function qiCooldownRemaining(user) {
  return qiRegenRemaining(user);
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
  regenQi,
  qiRegenRemaining,
  isQiReady,
  qiCooldownRemaining,
  formatCooldown,
  QI_COOLDOWN_MS,
  QI_REGEN_MS,
  DANTIAN_FILL_MS,
};
