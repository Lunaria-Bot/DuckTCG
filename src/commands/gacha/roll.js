const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
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

const RARITY_EMOJI  = { exceptional: "<:EX:1495730346241822861>", special: "<:SP:1495730276737745077>", rare: "<:Rare:1496150241462849536>", common: "<:Common:1495730171301462186>" };
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
    `${RARITY_EMOJI[rarity] ?? "<:Common:1495730171301462186>"} **${card.name}** — *${card.anime}*`
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
        .setDescription("Number of rolls (costs that much Qi)")
        .setMinValue(1)
        .setMaxValue(10) // actual cap enforced at runtime via rollLimit
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const maxRolls = user.rollLimit ?? 5;
    const amount = Math.min(interaction.options.getInteger("amount") ?? 1, maxRolls);

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
        content: `<:Qi:1495523502961459200> Your Qi is empty! Use \`/refill\` to restore it from your Dantian.\nDantian: **${Math.floor(currentDantian)}** / ${maxDantian}`,
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
      "notifiedFull.qi":      false, // spent Qi → allow notif again when full
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
        `<:Qi:1495523502961459200> **Not enough Qi** — only rolled **${actualAmount}** / ${amount} (missing ${qiShortfall} Qi).
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

    // Build roll-again buttons — disabled if not enough Qi
    const freshQi = regenQi(await User.findOne({ userId: interaction.user.id }));
    const rollRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("roll_again_1")
        .setLabel("Roll ×1")
        .setEmoji("<:Qi:1495523502961459200>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(freshQi < 1),
      new ButtonBuilder()
        .setCustomId("roll_again_5")
        .setLabel("Roll ×5")
        .setEmoji("<:Qi:1495523502961459200>")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(freshQi < 5),
    );

    const msg = await interaction.editReply({ embeds: [embed], components: [rollRow] });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id && (i.customId === "roll_again_1" || i.customId === "roll_again_5"),
      time: 2 * 60 * 1000,
      max: 10,
    });

    collector.on("collect", async btnInt => {
      await btnInt.deferUpdate();
      const rollAmt = btnInt.customId === "roll_again_1" ? 1 : 5;

      const freshUser2 = await User.findOne({ userId: interaction.user.id });
      const freshQi2   = regenQi(freshUser2);
      const freshDantian2 = regenDantian(freshUser2);
      const maxQi2     = qiMax(freshUser2.accountLevel);
      const maxDantian2 = dantianMax(freshUser2.accountLevel);

      if (freshQi2 <= 0) {
        const secs = qiCooldownRemaining(freshUser2);
        await interaction.editReply({ components: [] });
        return btnInt.followUp({ content: `⏳ Your Qi is empty. Ready in **${formatCooldown(secs)}**.`, ephemeral: true });
      }

      const actualAmt2  = Math.min(rollAmt, freshQi2);
      const shortfall2  = rollAmt > freshQi2 ? rollAmt - freshQi2 : 0;

      const results2 = [];
      for (let i = 0; i < actualAmt2; i++) {
        const r = await drawCard(interaction.user.id);
        if (r) results2.push(r);
      }
      if (!results2.length) return;

      const newQi2     = freshQi2 - actualAmt2;
      const cooldownAt2 = newQi2 <= 0 ? new Date(Date.now() + QI_COOLDOWN_MS) : null;

      await User.findOneAndUpdate({ userId: interaction.user.id }, {
        "mana.qi":              newQi2,
        "mana.lastQiUpdate":    newQi2 > 0 ? new Date() : freshUser2.mana?.lastQiUpdate,
        "mana.dantian":         freshDantian2,
        "mana.lastDantianUpdate": new Date(),
        "mana.qiCooldownUntil": null,
        $inc: { "stats.totalPullsDone": actualAmt2 },
      });

      // Quest tracking
      const redis3 = getRedis();
      await incrementProgress(redis3, interaction.user.id, "daily", "roll", actualAmt2);
      await incrementProgress(redis3, interaction.user.id, "weekly", "roll", actualAmt2);
      if (actualAmt2 >= 10) {
        await incrementProgress(redis3, interaction.user.id, "daily", "multi_roll", 1);
        await incrementProgress(redis3, interaction.user.id, "weekly", "multi_roll", 1);
      }
      for (const { rarity } of results2) {
        if (rarity === "rare" || rarity === "special" || rarity === "exceptional") {
          await incrementProgress(redis3, interaction.user.id, "daily", "roll_rare", 1);
          await incrementProgress(redis3, interaction.user.id, "weekly", "roll_rare", 1);
        }
        if (rarity === "special" || rarity === "exceptional") {
          await incrementProgress(redis3, interaction.user.id, "daily", "roll_special", 1);
          await incrementProgress(redis3, interaction.user.id, "weekly", "roll_special", 1);
        }
      }

      const xpGain2   = actualAmt2 * 5;
      const freshUser3 = await User.findOne({ userId: interaction.user.id });
      const lvResult2  = applyExp(freshUser3.accountLevel, freshUser3.accountExp, xpGain2);
      await User.findOneAndUpdate({ userId: interaction.user.id }, {
        accountLevel: lvResult2.newLevel,
        accountExp:   lvResult2.newExp,
      });

      const embed2 = buildRollEmbed(results2, interaction.user.username);
      if (shortfall2 > 0) {
        embed2.setDescription((embed2.data.description ? embed2.data.description + "\n\n" : "") +
          `<:Qi:1495523502961459200> **Not enough Qi** — only rolled **${actualAmt2}** / ${rollAmt} (missing ${shortfall2} Qi).\nUse \`/refill\` to restore your Qi.`);
      }
      if (lvResult2.leveledUp) {
        embed2.addFields({ name: "🎉 Level Up!", value: `You reached **Level ${lvResult2.newLevel}**!`, inline: false });
      }
      if (cooldownAt2) {
        embed2.addFields({ name: "⏳ Qi Depleted", value: `Your Qi is exhausted.\nUse \`/refill\` once ready.` });
      }

      const newQiAfter = regenQi(await User.findOne({ userId: interaction.user.id }));
      const rollRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("roll_again_1").setLabel("Roll ×1").setEmoji("<:Qi:1495523502961459200>").setStyle(ButtonStyle.Secondary).setDisabled(newQiAfter < 1),
        new ButtonBuilder().setCustomId("roll_again_5").setLabel("Roll ×5").setEmoji("<:Qi:1495523502961459200>").setStyle(ButtonStyle.Primary).setDisabled(newQiAfter < 5),
      );

      await interaction.editReply({ embeds: [embed2], components: [rollRow2] });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
