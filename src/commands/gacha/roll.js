const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");
const { requireProfile }  = require("../../utils/requireProfile");
const { applyExp }         = require("../../services/levels");
const User                = require("../../models/User");
const Card                = require("../../models/Card");
const PlayerCard          = require("../../models/PlayerCard");
const Banner              = require("../../models/Banner");
const { calculateStats }  = require("../../services/cardStats");
const {
  qiMax, dantianMax, regenDantian,
  isQiReady, qiCooldownRemaining, formatCooldown, QI_COOLDOWN_MS,
} = require("../../services/mana");

const RARITY_EMOJI  = { exceptional: "🌟", special: "🟪", rare: "🟦", common: "⬜" };
const RARITY_ORDER  = { exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_RATES  = { common: 60, rare: 30, special: 9, exceptional: 1 };

function rollRarity() {
  const roll = Math.random() * 100;
  let cum = 0;
  for (const [r, rate] of Object.entries(RARITY_RATES)) {
    cum += rate;
    if (roll < cum) return r;
  }
  return "common";
}

async function drawCard(userId) {
  const rarity = rollRarity();

  // Try rolled rarity first, then fallback down to any available rarity
  const rarityFallback = ["common", "rare", "special", "exceptional"];
  let card = null;
  let actualRarity = rarity;

  // Try the rolled rarity
  const pool = await Card.find({ rarity, isAvailable: true });
  if (pool.length) {
    card = pool[Math.floor(Math.random() * pool.length)];
  } else {
    // Fallback: try any rarity that has cards
    for (const r of rarityFallback) {
      const fallbackPool = await Card.find({ rarity: r, isAvailable: true });
      if (fallbackPool.length) {
        card = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        actualRarity = r;
        break;
      }
    }
  }

  if (!card) return null;

  const pc = await PlayerCard.findOneAndUpdate(
    { userId, cardId: card.cardId },
    { $inc: { quantity: 1 }, $setOnInsert: { level: 1, cachedStats: calculateStats(card, 1) } },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate({ userId }, { $inc: { "stats.totalCardsEverObtained": 1 } });

  return { card, pc, rarity: actualRarity };
}

function buildRollEmbed(results, username, qiLeft, dantianLeft, maxQi, maxDantian) {
  const lines = results.map(({ card, rarity }) =>
    `${RARITY_EMOJI[rarity] ?? "⬜"} **${card.name}** — *${card.anime}*`
  );

  // Highlight if any special+
  const best = results.reduce((b, r) =>
    (RARITY_ORDER[r.rarity] ?? 9) < (RARITY_ORDER[b.rarity] ?? 9) ? r : b
  , results[0]);

  const color = best.rarity === "exceptional" ? 0xFFD700
    : best.rarity === "special" ? 0xAB47BC
    : best.rarity === "rare" ? 0x42A5F5
    : 0x78909C;

  return new EmbedBuilder()
    .setTitle(`${username}'s Roll`)
    .setDescription(lines.join("\n"))
    .setColor(color)
    .addFields({
      name: "Mana",
      value: `⚡ Qi: **${qiLeft}** / ${maxQi}  ·  🌀 Dantian: **${Math.floor(dantianLeft)}** / ${maxDantian}`,
    });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll for cards using your Qi")
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Number of rolls (1-10, costs that much Qi)")
        .setMinValue(1)
        .setMaxValue(10)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const amount = interaction.options.getInteger("amount") ?? 1;

    // Apply Dantian regen
    const currentDantian = regenDantian(user);
    const maxQi      = qiMax(user.accountLevel);
    const maxDantian = dantianMax(user.accountLevel);
    const currentQi  = user.mana?.qi ?? maxQi;

    // Check Qi cooldown
    if (!isQiReady(user)) {
      const secs = qiCooldownRemaining(user);
      return interaction.editReply({
        content: `⏳ Your Qi is recharging. Ready in **${formatCooldown(secs)}**.\nUse \`/refill\` once it's ready to restore your Qi from your Dantian.`,
      });
    }

    // Check Qi available
    if (currentQi <= 0) {
      return interaction.editReply({
        content: `⚡ Your Qi is empty! Use \`/refill\` to restore it from your Dantian.\nDantian: **${Math.floor(currentDantian)}** / ${maxDantian}`,
      });
    }

    if (amount > currentQi) {
      return interaction.editReply({
        content: `⚡ Not enough Qi! You have **${currentQi}** Qi but tried to roll **${amount}** times.\nUse \`/refill\` to restore Qi, or roll fewer cards.`,
      });
    }

    // Perform rolls
    const results = [];
    for (let i = 0; i < amount; i++) {
      const r = await drawCard(interaction.user.id);
      if (r) results.push(r);
    }

    if (!results.length) {
      return interaction.editReply({ content: "No cards available to roll. Please try again later." });
    }

    const newQi      = currentQi - amount;
    const cooldownAt = newQi <= 0 ? new Date(Date.now() + QI_COOLDOWN_MS) : null;

    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.qi":              newQi,
      "mana.dantian":         currentDantian,
      "mana.lastDantianUpdate": new Date(),
      ...(cooldownAt ? { "mana.qiCooldownUntil": cooldownAt } : {}),
      $inc: { "stats.totalPullsDone": amount },
    });

    // Grant XP for rolls + handle level up
    // Quest tracking
    const redis2 = require("../../services/redis").getRedis();
    await incrementProgress(redis2, interaction.user.id, "daily", "roll", amount);
    await incrementProgress(redis2, interaction.user.id, "weekly", "roll", amount);
    if (amount >= 10) {
      await incrementProgress(redis2, interaction.user.id, "daily", "multi_roll", 1);
      await incrementProgress(redis2, interaction.user.id, "weekly", "multi_roll", 1);
    }
    for (const { rarity } of results) {
      if (rarity === "rare" || rarity === "special" || rarity === "exceptional") {
        await incrementProgress(redis2, interaction.user.id, "daily", "roll_rare", 1);
        await incrementProgress(redis2, interaction.user.id, "weekly", "roll_rare", 1);
      }
      if (rarity === "special" || rarity === "exceptional") {
        await incrementProgress(redis2, interaction.user.id, "daily", "roll_special", 1);
        await incrementProgress(redis2, interaction.user.id, "weekly", "roll_special", 1);
      }
    }

    const xpGain   = amount * 5;
    const freshUser = await User.findOne({ userId: interaction.user.id });
    const lvResult  = applyExp(freshUser.accountLevel, freshUser.accountExp, xpGain);
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      accountLevel: lvResult.newLevel,
      accountExp:   lvResult.newExp,
    });
    if (lvResult.leveledUp) {
      embed.addFields({ name: "🎉 Level Up!", value: `You reached **Level ${lvResult.newLevel}**!`, inline: false });
    }

    const embed = buildRollEmbed(results, user.username, newQi, currentDantian, maxQi, maxDantian);

    if (cooldownAt) {
      embed.addFields({
        name: "⏳ Qi Depleted",
        value: `Your Qi is exhausted. Cooldown: **${formatCooldown(Math.ceil(QI_COOLDOWN_MS / 1000))}**.\nUse \`/refill\` once ready.`,
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
