const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require("discord.js");
const { requireProfile }    = require("../../utils/requireProfile");
const { applyExp }           = require("../../services/levels");
const { incrementProgress }  = require("../../services/quests");
const { getRedis }           = require("../../services/redis");
const User                   = require("../../models/User");
const Card                   = require("../../models/Card");
const PlayerCard              = require("../../models/PlayerCard");
const { calculateStats }     = require("../../services/cardStats");
const {
  qiMax, dantianMax, regenDantian, regenQi,
  qiRegenRemaining, formatCooldown, QI_PER_ROLL,
} = require("../../services/mana");

// ─── Constants ────────────────────────────────────────────────────────────────
const RARITY_EMOJI = {
  radiant: "✨", exceptional: "<:Exceptional:1496532355719102656>",
  special: "<:Special:1496599588902273187>", rare: "<:Rare:1496204151447748811>",
  common:  "<:Common:1496973383143788716>",
};
const RARITY_COLOR = { radiant: 0xE0F0FF, exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };
const RARITY_LABEL = { radiant: "Radiant ✨", exceptional: "Exceptional", special: "Special", rare: "Rare", common: "Common" };
const RARITY_RATES = { common: 62.5, rare: 30, special: 7.5 };

const QI_EMOJI    = "<:Qi:1496984846566818022>";
const DANTIAN_EMO = "<:Dantian:1495528597610303608>";
const NYAN_EMO    = "<:Nyan:1495048966528831508>";

const CAPTURE_RATES = {
  common:      { common: 70, rare: 50, special: 40, exceptional: 0,   radiant: 0   },
  uncommon:    { common: 80, rare: 60, special: 60, exceptional: 0,   radiant: 0   },
  divine:      { common: 95, rare: 90, special: 80, exceptional: 0,   radiant: 0   },
  exceptional: { common: 100,rare: 100,special: 100,exceptional: 100, radiant: 100 },
};

const TALISMAN_LABEL = { common: "Common Talisman", uncommon: "Uncommon Talisman", divine: "Divine Talisman", exceptional: "Exceptional Talisman" };
const TALISMAN_EMOJI = { common: "📜", uncommon: "📋", divine: "✴️", exceptional: "🌟" };
const TALISMAN_ITEM_KEY = { common: "items.talismanCommon", uncommon: "items.talismanUncommon", divine: "items.talismanDivine", exceptional: "items.talismanExceptional" };
const TALISMAN_USER_KEY = { common: "talismanCommon", uncommon: "talismanUncommon", divine: "talismanDivine", exceptional: "talismanExceptional" };

const FACTION_PTS  = { common: 1, rare: 2, special: 5, exceptional: 8, radiant: 10 };
const NYANG_REWARD = { common: 50, rare: 150, special: 500, exceptional: 1500, radiant: 5000 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rollRarity() {
  const roll = Math.random() * 100;
  let cum = 0;
  for (const [r, rate] of Object.entries(RARITY_RATES)) {
    cum += rate;
    if (roll < cum) return r;
  }
  return "common";
}

async function peekCard() {
  const rarity = rollRarity();
  const pool   = await Card.find({ rarity, isAvailable: true });
  if (pool.length) return { card: pool[Math.floor(Math.random() * pool.length)], rarity };
  for (const r of ["common", "rare", "special"]) {
    const fb = await Card.find({ rarity: r, isAvailable: true });
    if (fb.length) return { card: fb[Math.floor(Math.random() * fb.length)], rarity: r };
  }
  return null;
}

async function captureCard(userId, cardId) {
  const card = await Card.findOne({ cardId });
  const pc   = await PlayerCard.findOneAndUpdate(
    { userId, cardId },
    { $inc: { quantity: 1 }, $setOnInsert: { level: 1 } },
    { upsert: true, new: true }
  );
  if (!pc.cachedStats && card) { pc.cachedStats = calculateStats(card, 1); await pc.save(); }
  await User.findOneAndUpdate({ userId }, { $inc: { "stats.totalCardsEverObtained": 1 } });
  return pc;
}

function buildRevealEmbed(card, rarity, currentQi, maxQi) {
  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[rarity] ?? ""} A wild **${RARITY_LABEL[rarity]}** appeared!`)
    .setDescription(
      `**${card.name}** — *${card.anime}*\n\n` +
      `Choose a talisman to capture!\n` +
      `${QI_EMOJI} **${currentQi}** / ${maxQi} Qi remaining`
    )
    .setColor(RARITY_COLOR[rarity] ?? 0x78909C);
  if (card.imageUrl) embed.setImage(card.imageUrl);
  return embed;
}

function buildResultEmbed(card, rarity, captured, talTier, captureRate, nyangEarned, factionPts) {
  if (captured) {
    return new EmbedBuilder()
      .setTitle(`${TALISMAN_EMOJI[talTier]} Captured! ${RARITY_EMOJI[rarity] ?? ""} **${card.name}**`)
      .setDescription(
        `*${card.anime}* — **${RARITY_LABEL[rarity]}**\n` +
        `Capture: **${captureRate}%** · Added to collection!\n\n` +
        `${NYAN_EMO} **+${nyangEarned.toLocaleString()} Nyang**  ·  ⚔️ **+${factionPts} faction pt${factionPts !== 1 ? "s" : ""}**`
      )
      .setColor(0x22c55e)
      .setThumbnail(card.imageUrl || null);
  }
  return new EmbedBuilder()
    .setTitle(`💨 **${card.name}** escaped!`)
    .setDescription(
      `*${card.anime}* — **${RARITY_LABEL[rarity]}**\n` +
      `Capture was **${captureRate}%** — the card vanished.`
    )
    .setColor(0xef4444);
}

function buildTalismanRow(user, rarity) {
  const options = [];
  for (const tier of ["common", "uncommon", "divine", "exceptional"]) {
    const count = user.items?.[TALISMAN_USER_KEY[tier]] ?? 0;
    if (count <= 0) continue;
    const rate = CAPTURE_RATES[tier]?.[rarity] ?? 0;
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${TALISMAN_LABEL[tier]} (×${count})`)
        .setDescription(`${rate}% capture · ${RARITY_LABEL[rarity]} card`)
        .setValue(tier)
    );
  }
  if (!options.length) {
    for (const tier of ["common", "uncommon", "divine", "exceptional"]) {
      const rate = CAPTURE_RATES[tier]?.[rarity] ?? 0;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${TALISMAN_LABEL[tier]} — Not owned`)
          .setDescription(`${rate}% capture chance`)
          .setValue(tier)
      );
    }
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("roll_talisman").setPlaceholder("🎯 Select talisman to capture...").addOptions(options)
  );
}

function buildRollAgainRow(currentQi) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("roll_again_btn")
      .setLabel(`Roll Again  (${QI_PER_ROLL} Qi)`)
      .setEmoji(QI_EMOJI)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentQi < QI_PER_ROLL),
  );
}

// ─── Core roll logic (reusable for initial roll + roll again) ──────────────────
async function doRoll(interaction, userId, username) {
  const user = await User.findOne({ userId });
  if (!user) return;

  const currentQi      = regenQi(user);
  const maxQi          = qiMax(user.accountLevel);
  const currentDantian = regenDantian(user);

  if (currentQi < QI_PER_ROLL) {
    const secs = qiRegenRemaining(user);
    return {
      type: "no_qi",
      content: [
        `${QI_EMOJI} **Not enough Qi!** Need **${QI_PER_ROLL}** Qi (you have **${currentQi}**).`,
        secs > 0 ? `⏳ Full in **${formatCooldown(secs)}**` : "",
        `Use \`/refill\` to restore from Dantian (${DANTIAN_EMO} **${currentDantian}** / ${dantianMax()})`,
      ].filter(Boolean).join("\n"),
    };
  }

  const peeked = await peekCard();
  if (!peeked) return { type: "no_cards" };
  const { card, rarity } = peeked;

  // Deduct Qi
  const newQi = currentQi - QI_PER_ROLL;
  await User.findOneAndUpdate({ userId }, {
    "mana.qi": newQi, "mana.lastQiUpdate": new Date(),
    "mana.dantian": currentDantian, "mana.lastDantianUpdate": new Date(),
    $inc: { "stats.totalPullsDone": 1 },
  });

  // XP + quests
  const redis = getRedis();
  await incrementProgress(redis, userId, "daily", "roll", 1);
  await incrementProgress(redis, userId, "weekly", "roll", 1);
  if (["rare","special","exceptional"].includes(rarity)) {
    await incrementProgress(redis, userId, "daily", "roll_rare", 1);
    await incrementProgress(redis, userId, "weekly", "roll_rare", 1);
  }
  if (["special","exceptional"].includes(rarity)) {
    await incrementProgress(redis, userId, "daily", "roll_special", 1);
    await incrementProgress(redis, userId, "weekly", "roll_special", 1);
  }

  const freshUser = await User.findOne({ userId });
  const lvResult  = applyExp(freshUser.accountLevel, freshUser.accountExp, 5);
  await User.findOneAndUpdate({ userId }, { accountLevel: lvResult.newLevel, accountExp: lvResult.newExp });

  const freshUser2  = await User.findOne({ userId });
  const revealEmbed = buildRevealEmbed(card, rarity, newQi, maxQi);
  if (lvResult.leveledUp) revealEmbed.addFields({ name: "🎉 Level Up!", value: `You reached **Level ${lvResult.newLevel}**!` });

  const hasAnyTalisman = ["common","uncommon","divine","exceptional"].some(
    t => (freshUser2.items?.[TALISMAN_USER_KEY[t]] ?? 0) > 0
  );

  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("roll_skip").setLabel("Flee — Skip this card").setStyle(ButtonStyle.Secondary)
  );

  return {
    type: "reveal",
    card, rarity, newQi, maxQi,
    components: hasAnyTalisman
      ? [buildTalismanRow(freshUser2, rarity), skipRow]
      : [skipRow],
    embeds: [revealEmbed],
    user: freshUser2,
  };
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Spend 25 Qi to reveal a card — then capture it with a talisman"),

  async execute(interaction) {
    await interaction.deferReply();
    await runRollSession(interaction, interaction.user.id, interaction.user.username);
  },
};

async function runRollSession(interaction, userId, username) {
  const result = await doRoll(interaction, userId, username);
  if (!result) return;

  if (result.type === "no_qi") {
    return interaction.editReply({ content: result.content, components: [] });
  }
  if (result.type === "no_cards") {
    return interaction.editReply({ content: "No cards available right now.", components: [] });
  }

  const { card, rarity, newQi, maxQi, components, embeds } = result;

  const msg = await interaction.editReply({ embeds, components });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 60_000,
    max: 1,
  });

  collector.on("collect", async i => {
    try {
      await i.deferUpdate();

      // ── Flee ────────────────────────────────────────────────────────────
      if (i.customId === "roll_skip") {
        const fleeEmbed = new EmbedBuilder()
          .setTitle(`💨 You fled from **${card.name}**`)
          .setDescription(`*${card.anime}* — **${RARITY_LABEL[rarity]}** · The card vanished.`)
          .setColor(0x6b7280);

        const qiNow = regenQi(await User.findOne({ userId }));
        // Keep reveal embed, show result below + roll again button
        await interaction.editReply({ components: [] });
        const resultMsg = await interaction.followUp({ embeds: [fleeEmbed], components: [buildRollAgainRow(qiNow)] });

        // Handle roll again
        await awaitRollAgain(interaction, resultMsg, userId, username);
        return;
      }

      // ── Talisman chosen ──────────────────────────────────────────────────
      const talTier  = i.values[0];
      const userNow  = await User.findOne({ userId });
      const owned    = userNow.items?.[TALISMAN_USER_KEY[talTier]] ?? 0;

      if (owned <= 0) {
        await i.followUp({ content: `❌ You don't have any **${TALISMAN_LABEL[talTier]}**!`, ephemeral: true });
        return;
      }

      await User.findOneAndUpdate({ userId }, { $inc: { [TALISMAN_ITEM_KEY[talTier]]: -1 } });

      const captureRate = CAPTURE_RATES[talTier]?.[rarity] ?? 0;
      const captured    = Math.random() * 100 < captureRate;
      const nyangEarned = captured ? (NYANG_REWARD[rarity] ?? 50) : 0;
      const factionPts  = captured ? (FACTION_PTS[rarity] ?? 0) : 0;

      if (captured) {
        await captureCard(userId, card.cardId);
        const inc = { "currency.gold": nyangEarned };
        if (factionPts > 0) inc.factionPoints = factionPts;
        await User.findOneAndUpdate({ userId }, { $inc: inc });
      }

      const resultEmbed = buildResultEmbed(card, rarity, captured, talTier, captureRate, nyangEarned, factionPts);
      const qiNow = regenQi(await User.findOne({ userId }));
      // Keep reveal embed, show result below + roll again button
      await interaction.editReply({ components: [] });
      const resultMsg = await interaction.followUp({ embeds: [resultEmbed], components: [buildRollAgainRow(qiNow)] });

      // Handle roll again
      await awaitRollAgain(interaction, resultMsg, userId, username);

    } catch (err) {
      console.error("[roll] collector:", err);
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      const embed = new EmbedBuilder()
        .setTitle(`⏰ **${card.name}** escaped!`)
        .setDescription(`*${card.anime}* — **${RARITY_LABEL[rarity]}** · Took too long, the card vanished.`)
        .setColor(0xef4444);
      const qiNow = regenQi(await User.findOne({ userId })).catch?.() ?? newQi;
      await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
    }
  });
}

async function awaitRollAgain(interaction, msg, userId, username) {
  try {
    const again = await msg.awaitMessageComponent({
      filter: ii => ii.user.id === userId && ii.customId === "roll_again_btn",
      time: 30_000,
    });
    await again.deferUpdate();
    // Remove roll again button from result, then start new roll as followUp
    await msg.edit({ components: [] }).catch(() => {});
    await runRollSession(interaction, userId, username);
  } catch {
    // Timed out — remove button
    await msg.edit({ components: [] }).catch(() => {});
  }
}
