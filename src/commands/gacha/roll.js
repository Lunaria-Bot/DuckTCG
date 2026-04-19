const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");
const { requireProfile }  = require("../../utils/requireProfile");
const { applyExp }         = require("../../services/levels");
const { incrementProgress } = require("../../services/quests");
const { getRedis }         = require("../../services/redis");
const User                = require("../../models/User");
const Card                = require("../../models/Card");
const PlayerCard          = require("../../models/PlayerCard");
const Banner              = require("../../models/Banner");
const { calculateStats }  = require("../../services/cardStats");
const {
  qiMax, dantianMax, regenDantian, regenQi,
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

const RARITY_LABEL = { exceptional: "Exceptional", special: "Special", rare: "Rare", common: "Common" };
const RARITY_COLOR = { exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };

function buildRollEmbed(results, username) {
  // ── Single roll — big card display ────────────────────────────────────────
  if (results.length === 1) {
    const { card, rarity, pc } = results[0];
    const color = RARITY_COLOR[rarity] ?? 0x78909C;
    const owned = pc?.quantity ?? 1;

    const embed = new EmbedBuilder()
      .setTitle(`${username} rolled a ${RARITY_LABEL[rarity] ?? rarity} card`)
      .setDescription(`**Name:** ${card.name}\n**Anime:** ${card.anime}\nOwned: **${owned}**`)
      .setColor(color);

    if (card.imageUrl) embed.setImage(card.imageUrl);
    return embed;
  }

  // ── Multi roll — compact list ──────────────────────────────────────────────
  const best = results.reduce((b, r) =>
    (RARITY_ORDER[r.rarity] ?? 9) < (RARITY_ORDER[b.rarity] ?? 9) ? r : b
  , results[0]);

  const color = RARITY_COLOR[best.rarity] ?? 0x78909C;

  const lines = results.map(({ card, rarity }) =>
    `${RARITY_EMOJI[rarity] ?? "⬜"} **${card.name}** — *${card.anime}*`
  );

  const embed = new EmbedBuilder()
    .setTitle(`${username}'s Rolls (×${results.length})`)
    .setDescription(lines.join("\n"))
    .setColor(color);

  if (best.card?.imageUrl) embed.setThumbnail(best.card.imageUrl);

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll for cards using your Qi")
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Number of rolls (1-5, costs that much Qi)")
        .setMinValue(1)
        .setMaxValue(5)
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
    const currentQi  = regenQi(user);

    // Check Qi cooldown — only block if Qi is actually empty
    if (!isQiReady(user) && currentQi <= 0) {
      const secs = qiCooldownRemaining(user);
      return interaction.editReply({
        content: `⏳ Your Qi is recharging. Ready in **${formatCooldown(secs)}**.\nUse \`/refill\` to restore your Qi from your Dantian.`,
      });
    }

    // Check Qi available
    if (currentQi <= 0) {
      return interaction.editReply({
        content: `⚡ Your Qi is empty! Use \`/refill\` to restore it from your Dantian.\nDantian: **${Math.floor(currentDantian)}** / ${maxDantian}`,
      });
    }

    // If requested more than available Qi, roll what we can
    const actualAmount = Math.min(amount, currentQi);
    const qiShortfall  = amount > currentQi ? amount - currentQi : 0;

    // Perform rolls
    const results = [];
    for (let i = 0; i < actualAmount; i++) {
      const r = await drawCard(interaction.user.id);
      if (r) results.push(r);
    }

    if (!results.length) {
      return interaction.editReply({ content: "No cards available to roll. Please try again later." });
    }

    const newQi      = currentQi - actualAmount;
    const cooldownAt = newQi <= 0 ? new Date(Date.now() + QI_COOLDOWN_MS) : null;

    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.qi":              newQi,
      "mana.lastQiUpdate":    newQi > 0 ? new Date() : user.mana?.lastQiUpdate,
      "mana.dantian":         currentDantian,
      "mana.lastDantianUpdate": new Date(),
      "mana.qiCooldownUntil": null,
      $inc: { "stats.totalPullsDone": actualAmount },
    });

    // Grant XP for rolls + handle level up
    // Quest tracking
    const redis2 = getRedis();
    await incrementProgress(redis2, interaction.user.id, "daily", "roll", actualAmount);
    await incrementProgress(redis2, interaction.user.id, "weekly", "roll", actualAmount);
    if (actualAmount >= 10) {
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

    const xpGain   = actualAmount * 5;
    const freshUser = await User.findOne({ userId: interaction.user.id });
    const lvResult  = applyExp(freshUser.accountLevel, freshUser.accountExp, xpGain);
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      accountLevel: lvResult.newLevel,
      accountExp:   lvResult.newExp,
    });

    const embed = buildRollEmbed(results, user.username);

    // Warn if fewer rolls than requested
    if (qiShortfall > 0) {
      embed.setDescription((embed.data.description ? embed.data.description + "\n\n" : "") +
        `⚡ **Not enough Qi** — only rolled **${actualAmount}** / ${amount} (missing ${qiShortfall} Qi).
Use \`/refill\` to restore your Qi.`);
    }

    if (lvResult.leveledUp) {
      embed.addFields({ name: "🎉 Level Up!", value: `You reached **Level ${lvResult.newLevel}**!`, inline: false });
    }


    if (cooldownAt) {
      embed.addFields({
        name: "⏳ Qi Depleted",
        value: `Your Qi is exhausted. Cooldown: **${formatCooldown(Math.ceil(QI_COOLDOWN_MS / 1000))}**.\nUse \`/refill\` once ready.`,
      });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
