/**
 * Quest system — random daily & weekly quests
 * Quests are generated per-user at reset time and stored in Redis.
 * Progress is tracked in Redis, saved to DB on claim.
 */

// ─── Quest pool ───────────────────────────────────────────────────────────────

const DAILY_POOL = [
  { id: "daily_pull_1",     label: "Pull once",              type: "pull",      target: 1,  reward: { gold: 300,  regularTickets: 0, pickupTickets: 0, accountExp: 50  } },
  { id: "daily_pull_5",     label: "Pull 5 times",           type: "pull",      target: 5,  reward: { gold: 800,  regularTickets: 1, pickupTickets: 0, accountExp: 100 } },
  { id: "daily_raid",       label: "Attack the raid boss",   type: "raid",      target: 1,  reward: { gold: 500,  regularTickets: 0, pickupTickets: 0, accountExp: 75  } },
  { id: "daily_adventure",  label: "Complete an adventure",  type: "adventure", target: 1,  reward: { gold: 600,  regularTickets: 0, pickupTickets: 0, accountExp: 100 } },
  { id: "daily_burn_3",     label: "Burn 3 cards",           type: "burn",      target: 3,  reward: { gold: 400,  regularTickets: 0, pickupTickets: 0, accountExp: 60  } },
  { id: "daily_login",      label: "Claim your daily reward",type: "daily",     target: 1,  reward: { gold: 200,  regularTickets: 0, pickupTickets: 0, accountExp: 30  } },
  { id: "daily_pull_10",    label: "Do a multi pull (x10)",  type: "pull",      target: 10, reward: { gold: 1200, regularTickets: 1, pickupTickets: 0, accountExp: 150 } },
  { id: "daily_burn_1",     label: "Burn a card",            type: "burn",      target: 1,  reward: { gold: 150,  regularTickets: 0, pickupTickets: 0, accountExp: 25  } },
];

const WEEKLY_POOL = [
  { id: "weekly_pull_30",   label: "Pull 30 times",          type: "pull",      target: 30, reward: { gold: 5000, regularTickets: 2, pickupTickets: 0, accountExp: 500 } },
  { id: "weekly_pull_50",   label: "Pull 50 times",          type: "pull",      target: 50, reward: { gold: 8000, regularTickets: 3, pickupTickets: 1, accountExp: 800 } },
  { id: "weekly_raid_5",    label: "Attack the raid 5 times",type: "raid",      target: 5,  reward: { gold: 4000, regularTickets: 1, pickupTickets: 0, accountExp: 400 } },
  { id: "weekly_adventure_3",label:"Complete 3 adventures",  type: "adventure", target: 3,  reward: { gold: 4500, regularTickets: 1, pickupTickets: 0, accountExp: 450 } },
  { id: "weekly_burn_10",   label: "Burn 10 cards",          type: "burn",      target: 10, reward: { gold: 3000, regularTickets: 1, pickupTickets: 0, accountExp: 300 } },
  { id: "weekly_pull_20",   label: "Pull 20 times",          type: "pull",      target: 20, reward: { gold: 3500, regularTickets: 2, pickupTickets: 0, accountExp: 350 } },
  { id: "weekly_raid_3",    label: "Attack the raid 3 times",type: "raid",      target: 3,  reward: { gold: 2500, regularTickets: 1, pickupTickets: 0, accountExp: 250 } },
  { id: "weekly_adventure_5",label:"Complete 5 adventures",  type: "adventure", target: 5,  reward: { gold: 7000, regularTickets: 2, pickupTickets: 1, accountExp: 700 } },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getDailyResetTs() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function getWeeklyResetTs() {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + daysUntilMon);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// ─── Redis keys ───────────────────────────────────────────────────────────────
// quests:daily:{userId}     → JSON { quests: [...], progress: {...}, claimed: {...} }
// quests:weekly:{userId}    → JSON { quests: [...], progress: {...}, claimed: {...} }

async function getOrCreateQuests(redis, userId, type) {
  const key = `quests:${type}:${userId}`;
  const raw = await redis.get(key).catch(() => null);

  if (raw) {
    try { return JSON.parse(raw); } catch {}
  }

  // Generate new quests for this period
  const pool = type === "daily" ? DAILY_POOL : WEEKLY_POOL;
  const count = type === "daily" ? 3 : 3;
  const selected = pickRandom(pool, count);

  const data = {
    quests: selected,
    progress: Object.fromEntries(selected.map(q => [q.id, 0])),
    claimed:  Object.fromEntries(selected.map(q => [q.id, false])),
  };

  const resetTs = type === "daily" ? getDailyResetTs() : getWeeklyResetTs();
  const ttl = resetTs - Math.floor(Date.now() / 1000);
  await redis.set(key, JSON.stringify(data), "EX", Math.max(ttl, 3600));

  return data;
}

async function incrementProgress(redis, userId, type, questType, amount = 1) {
  const key = `quests:${type}:${userId}`;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return;

  const data = JSON.parse(raw);
  for (const q of data.quests) {
    if (q.type === questType && !data.claimed[q.id]) {
      data.progress[q.id] = Math.min(
        (data.progress[q.id] || 0) + amount,
        q.target
      );
    }
  }

  const resetTs = type === "daily" ? getDailyResetTs() : getWeeklyResetTs();
  const ttl = resetTs - Math.floor(Date.now() / 1000);
  await redis.set(key, JSON.stringify(data), "EX", Math.max(ttl, 3600));
}

async function claimQuest(redis, userId, type, questId) {
  const key = `quests:${type}:${userId}`;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return null;

  const data = JSON.parse(raw);
  const quest = data.quests.find(q => q.id === questId);
  if (!quest) return null;
  if (data.claimed[questId]) return "already_claimed";
  if ((data.progress[questId] || 0) < quest.target) return "not_complete";

  data.claimed[questId] = true;

  const resetTs = type === "daily" ? getDailyResetTs() : getWeeklyResetTs();
  const ttl = resetTs - Math.floor(Date.now() / 1000);
  await redis.set(key, JSON.stringify(data), "EX", Math.max(ttl, 3600));

  return quest.reward;
}

module.exports = {
  getOrCreateQuests,
  incrementProgress,
  claimQuest,
  getDailyResetTs,
  getWeeklyResetTs,
};
