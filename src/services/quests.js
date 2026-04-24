/**
 * Quest system — random daily & weekly quests
 * 3 daily picked from pool, 3 weekly picked from pool
 */

const NYAN = "<:Nyan:1495048966528831508>";
const JADE = "<:Jade:1496624534139179009>";

const DAILY_POOL = [
  { id: "daily_roll_1",      label: "Roll once",               type: "roll",       target: 1,  reward: { gold: 300,  regularTickets: 0, pickupTickets: 0, jade: 0, accountExp: 50  } },
  { id: "daily_login",       label: "Claim your daily reward", type: "daily",      target: 1,  reward: { gold: 200,  regularTickets: 0, pickupTickets: 0, jade: 0, accountExp: 30  } },
  { id: "daily_adventure",   label: "Complete an adventure",   type: "adventure",  target: 1,  reward: { gold: 600,  regularTickets: 0, pickupTickets: 0, jade: 0, accountExp: 100 } },
  { id: "daily_raid",        label: "Attack a raid boss",      type: "raid",       target: 1,  reward: { gold: 500,  regularTickets: 0, pickupTickets: 0, jade: 0, accountExp: 75  } },
  { id: "daily_card_levelup",label: "Level up a card",         type: "card_levelup",target: 1, reward: { gold: 400,  regularTickets: 0, pickupTickets: 0, jade: 0, accountExp: 60  } },
  { id: "daily_roll_10",     label: "Roll 10 times",           type: "roll",       target: 10, reward: { gold: 900,  regularTickets: 1, pickupTickets: 0, jade: 0, accountExp: 120 } },
  { id: "daily_roll_rare",   label: "Roll a Rare card",        type: "roll_rare",  target: 1,  reward: { gold: 700,  regularTickets: 0, pickupTickets: 0, jade: 1, accountExp: 100 } },
];

const WEEKLY_POOL = [
  { id: "weekly_adventure_5",  label: "Complete 5 adventures",   type: "adventure",  target: 5,  reward: { gold: 7000, regularTickets: 2, pickupTickets: 0, jade: 0, accountExp: 700 } },
  { id: "weekly_raid_5",       label: "Attack 5 raid bosses",     type: "raid",       target: 5,  reward: { gold: 4000, regularTickets: 1, pickupTickets: 0, jade: 0, accountExp: 400 } },
  { id: "weekly_roll_50",      label: "Roll 50 times",            type: "roll",       target: 50, reward: { gold: 8000, regularTickets: 2, pickupTickets: 1, jade: 0, accountExp: 800 } },
  { id: "weekly_roll_special", label: "Roll a Special card",      type: "roll_special",target: 1, reward: { gold: 5000, regularTickets: 1, pickupTickets: 0, jade: 3, accountExp: 500 } },
  { id: "weekly_card_levelup", label: "Level up a card 5 times",  type: "card_levelup",target: 5, reward: { gold: 4500, regularTickets: 1, pickupTickets: 0, jade: 0, accountExp: 450 } },
  { id: "weekly_adventure_4",  label: "Complete 4 adventures",    type: "adventure",  target: 4,  reward: { gold: 6000, regularTickets: 2, pickupTickets: 0, jade: 0, accountExp: 600 } },
  { id: "weekly_login_3",      label: "Claim daily 3 times",      type: "daily",      target: 3,  reward: { gold: 3000, regularTickets: 1, pickupTickets: 0, jade: 0, accountExp: 300 } },
  { id: "weekly_multi_roll",   label: "Do a multi roll (x10)",    type: "multi_roll", target: 1,  reward: { gold: 5500, regularTickets: 1, pickupTickets: 1, jade: 0, accountExp: 550 } },
];

function pickRandom(pool, count) {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

function getDailyResetTs() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function getWeeklyResetTs() {
  const d = new Date();
  const day = d.getUTCDay();
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + daysUntilMon);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

async function getOrCreateQuests(redis, userId, type) {
  const key = `quests:${type}:${userId}`;
  const raw = await redis.get(key).catch(() => null);

  if (raw) {
    try { return JSON.parse(raw); } catch {}
  }

  const pool     = type === "daily" ? DAILY_POOL : WEEKLY_POOL;
  const selected = pickRandom(pool, 3);

  const data = {
    quests:   selected,
    progress: Object.fromEntries(selected.map(q => [q.id, 0])),
    claimed:  Object.fromEntries(selected.map(q => [q.id, false])),
  };

  const resetTs = type === "daily" ? getDailyResetTs() : getWeeklyResetTs();
  const ttl = resetTs - Math.floor(Date.now() / 1000);
  await redis.set(key, JSON.stringify(data), "EX", Math.max(ttl, 3600));

  return data;
}

async function incrementProgress(redis, userId, type, questType, amount = 1, discordClient = null) {
  const key = `quests:${type}:${userId}`;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return;

  const data = JSON.parse(raw);
  const justCompleted = [];
  for (const q of data.quests) {
    if (q.type === questType && !data.claimed[q.id]) {
      const before = data.progress[q.id] || 0;
      data.progress[q.id] = Math.min(before + amount, q.target);
      if (before < q.target && data.progress[q.id] >= q.target) {
        justCompleted.push(q);
      }
    }
  }

  // Send DM if quest just became claimable and user has notifications enabled
  if (justCompleted.length && discordClient) {
    try {
      const User = require("../models/User");
      const user = await User.findOne({ userId });
      if (user?.notifications?.questDone) {
        const discordUser = await discordClient.users.fetch(userId).catch(() => null);
        if (discordUser) {
          const names = justCompleted.map(q => `**${q.label}**`).join(", ");
          await discordUser.send(`📋 **Quest${justCompleted.length > 1 ? "s" : ""} ready to claim!**\n${names}\nUse \`/quests\` to claim your reward.`).catch(() => {});
        }
      }
    } catch {}
  }

  const resetTs = type === "daily" ? getDailyResetTs() : getWeeklyResetTs();
  const ttl = resetTs - Math.floor(Date.now() / 1000);
  await redis.set(key, JSON.stringify(data), "EX", Math.max(ttl, 3600));
}

async function claimQuest(redis, userId, type, questId) {
  const key = `quests:${type}:${userId}`;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return null;

  const data  = JSON.parse(raw);
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
