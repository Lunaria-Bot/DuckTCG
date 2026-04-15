const { getRedis } = require("./redis");
const User = require("../models/User");
const Card = require("../models/Card");
const PlayerCard = require("../models/PlayerCard");
const { calculateStats } = require("./cardStats");

const PITY_HARD = 90;
const PITY_SOFT_START = 75;

function rollRarity(currentPulls, rates) {
  if (currentPulls >= PITY_HARD - 1) return "exceptional";

  let exceptionalRate = rates.exceptional;
  if (currentPulls >= PITY_SOFT_START) {
    const extra = (currentPulls - PITY_SOFT_START + 1) * 6;
    exceptionalRate = Math.min(rates.exceptional + extra, 100);
  }

  const roll = Math.random() * 100;
  if (roll < exceptionalRate) return "exceptional";
  if (roll < exceptionalRate + rates.special) return "special";
  if (roll < exceptionalRate + rates.special + rates.rare) return "rare";
  return "common";
}

function pickCardFromPool(pool, rarity, featuredCards, isGuaranteed) {
  const candidates = pool[rarity] ?? [];
  if (candidates.length === 0) return null;

  if (rarity === "exceptional" && featuredCards?.length > 0) {
    if (isGuaranteed || Math.random() < 0.5) {
      return featuredCards[Math.floor(Math.random() * featuredCards.length)];
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function doPulls(userId, banner, count = 1) {
  const redis = getRedis();
  const pityKey = `pity:${userId}:${banner.type}`;
  const guaranteeKey = `pity:${userId}:${banner.type}:guarantee`;

  let currentPity = parseInt(await redis.get(pityKey)) || 0;
  let isGuaranteed = (await redis.get(guaranteeKey)) === "1";

  const results = [];

  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(currentPity, banner.rates);
    const cardId = pickCardFromPool(banner.pool, rarity, banner.featuredCards, isGuaranteed);

    if (!cardId) continue;

    const card = await Card.findOne({ cardId });
    if (!card) continue;

    const updatedCard = await Card.findOneAndUpdate(
      { cardId },
      { $inc: { totalPrints: 1 } },
      { new: true }
    );

    const playerCard = await PlayerCard.create({
      userId,
      cardId,
      printNumber: updatedCard.totalPrints,
      level: 1,
      cachedStats: calculateStats(card, 1),
    });

    results.push({ playerCard, card, rarity });

    if (rarity === "exceptional") {
      currentPity = 0;
      const wasFeatured = banner.featuredCards.includes(cardId);
      isGuaranteed = !wasFeatured;
    } else {
      currentPity++;
    }
  }

  await redis.set(pityKey, currentPity, "EX", 60 * 60 * 24 * 30);
  await redis.set(guaranteeKey, isGuaranteed ? "1" : "0", "EX", 60 * 60 * 24 * 30);

  await User.findOneAndUpdate(
    { userId },
    {
      $inc: {
        "stats.totalCardsEverObtained": results.length,
        "stats.totalPullsDone": count,
        [`pity.${banner.type}Pulls`]: count,
      },
    }
  );

  return results;
}

module.exports = { doPulls, rollRarity };
