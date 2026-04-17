const PlayerCard  = require("../models/PlayerCard");
const Card        = require("../models/Card");
const User        = require("../models/User");
const { getRedis } = require("./redis");
const { calculateStats } = require("./cardStats");

const RARITY_ORDER = { exceptional: 0, special: 1, rare: 2, common: 3 };

// ─── Pity helpers ─────────────────────────────────────────────────────────────
async function getPity(redis, userId, bannerType) {
  const key = `pity:${userId}:${bannerType}`;
  const val = await redis.get(key).catch(() => null);
  return parseInt(val) || 0;
}

async function setPity(redis, userId, bannerType, value) {
  await redis.set(`pity:${userId}:${bannerType}`, value, "EX", 30 * 24 * 3600);
}

async function getGuarantee(redis, userId, bannerType) {
  const key = `pity:${userId}:${bannerType}:guarantee`;
  const val = await redis.get(key).catch(() => null);
  return val === "1";
}

async function setGuarantee(redis, userId, bannerType, val) {
  await redis.set(`pity:${userId}:${bannerType}:guarantee`, val ? "1" : "0", "EX", 30 * 24 * 3600);
}

// ─── Rarity roll ──────────────────────────────────────────────────────────────
function rollRarity(banner, pityCount) {
  const rates = { ...banner.rates };

  // Soft pity boost after pull 75
  if (pityCount >= (banner.pity?.softPityStart ?? 75)) {
    const bonus = (pityCount - 74) * 0.06;
    rates.exceptional = Math.min(rates.exceptional + bonus, 100);
  }

  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const [rarity, rate] of Object.entries(rates).sort(
    (a, b) => RARITY_ORDER[a[0]] - RARITY_ORDER[b[0]]
  )) {
    cumulative += rate;
    if (roll < cumulative) return rarity;
  }
  return "common";
}

// ─── Pick card from pool ──────────────────────────────────────────────────────
function pickCard(pool, rarity) {
  const rarityPool = pool[rarity];
  if (!rarityPool?.length) {
    // fallback down rarity
    for (const r of ["exceptional","special","rare","common"]) {
      if (pool[r]?.length) return { cardId: pool[r][Math.floor(Math.random() * pool[r].length)], rarity: r };
    }
    return null;
  }
  return { cardId: rarityPool[Math.floor(Math.random() * rarityPool.length)], rarity };
}

// ─── Main pull function ───────────────────────────────────────────────────────
async function doPulls(userId, banner, count) {
  const redis    = getRedis();
  const bannerType = banner.type ?? "regular";
  let pityCount  = await getPity(redis, userId, bannerType);
  let guarantee  = await getGuarantee(redis, userId, bannerType);
  const results  = [];

  for (let i = 0; i < count; i++) {
    pityCount++;

    // Hard pity
    let rarity = pityCount >= (banner.pity?.hardPity ?? 90) ? "exceptional" : rollRarity(banner, pityCount);

    // 50/50 logic for exceptional
    let cardId;
    if (rarity === "exceptional") {
      pityCount = 0;
      const featured = banner.featuredCards ?? [];
      if (guarantee || !featured.length) {
        // Guaranteed featured
        const pick = featured.length
          ? featured[Math.floor(Math.random() * featured.length)]
          : pickCard(banner.pool, "exceptional")?.cardId;
        cardId = pick;
        guarantee = false;
      } else {
        // 50/50
        if (Math.random() < 0.5) {
          cardId = featured[Math.floor(Math.random() * featured.length)];
          guarantee = false;
        } else {
          cardId = pickCard(banner.pool, "exceptional")?.cardId;
          guarantee = true; // next exceptional is guaranteed featured
        }
      }
    } else {
      const pick = pickCard(banner.pool, rarity);
      cardId = pick?.cardId;
      rarity = pick?.rarity ?? rarity;
    }

    if (!cardId) continue;

    const card = await Card.findOne({ cardId });
    if (!card) continue;

    // Upsert PlayerCard — increment quantity if exists
    const playerCard = await PlayerCard.findOneAndUpdate(
      { userId, cardId },
      {
        $inc: { quantity: 1 },
        $setOnInsert: {
          level: 1,
          exp: 0,
          cachedStats: calculateStats(card, 1),
        },
      },
      { upsert: true, new: true }
    );

    results.push({ playerCard, card, rarity, isNew: playerCard.quantity === 1 });
  }

  // Save pity
  await setPity(redis, userId, bannerType, pityCount);
  await setGuarantee(redis, userId, bannerType, guarantee);

  // Update user stats
  await User.findOneAndUpdate({ userId }, {
    $inc: {
      "stats.totalCardsEverObtained": results.length,
      "stats.totalPullsDone": count,
    },
  });

  return results;
}

module.exports = { doPulls };
