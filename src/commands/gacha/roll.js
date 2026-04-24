const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require("discord.js");
const { requireProfile }   = require("../../utils/requireProfile");
const { applyExp }          = require("../../services/levels");
const { incrementProgress } = require("../../services/quests");
const { getRedis }          = require("../../services/redis");
const User                  = require("../../models/User");
const Card                  = require("../../models/Card");
const PlayerCard             = require("../../models/PlayerCard");
const { calculateStats }    = require("../../services/cardStats");
const {
  qiMax, dantianMax, regenDantian, regenQi,
  qiRegenRemaining, formatCooldown, QI_PER_ROLL,
} = require("../../services/mana");

const RARITY_EMOJI = {
  radiant: "✨", exceptional: "<:Exceptional:1496532355719102656>",
  special: "<:Special:1496599588902273187>", rare: "<:Rare:1496204151447748811>",
  common:  "<:Common:1496973383143788716>",
};
const RARITY_COLOR = { radiant: 0xE0F0FF, exceptional: 0xFFD700, special: 0xAB47BC, rare: 0x42A5F5, common: 0x78909C };
const RARITY_LABEL = { radiant: "Radiant ✨", exceptional: "Exceptional", special: "Special", rare: "Rare", common: "Common" };
const RARITY_RATES = { common: 62.5, rare: 30, special: 7.5 };

const QI_EMO   = "<:Qi:1496984846566818022>";
const DAN_EMO  = "<:Dantian:1495528597610303608>";
const NYAN_EMO = "<:Nyan:1495048966528831508>";

const CAPTURE_RATES = {
  common:      { common: 70, rare: 50, special: 40, exceptional: 0,   radiant: 0   },
  uncommon:    { common: 80, rare: 60, special: 60, exceptional: 0,   radiant: 0   },
  divine:      { common: 95, rare: 90, special: 80, exceptional: 0,   radiant: 0   },
  exceptional: { common: 100,rare: 100,special: 100,exceptional: 100, radiant: 100 },
};
const TALISMAN_LABEL    = { common: "Common Talisman", uncommon: "Uncommon Talisman", divine: "Divine Talisman", exceptional: "Exceptional Talisman" };
const TALISMAN_EMOJI    = { common: "📜", uncommon: "📋", divine: "✴️", exceptional: "🌟" };
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
  for (const r of ["common","rare","special"]) {
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

function buildTalismanRow(user, rarity) {
  const options = [];
  for (const tier of ["common","uncommon","divine","exceptional"]) {
    const count = user.items?.[TALISMAN_USER_KEY[tier]] ?? 0;
    if (count <= 0) continue;
    const rate = CAPTURE_RATES[tier]?.[rarity] ?? 0;
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${TALISMAN_LABEL[tier]} (×${count})`)
        .setDescription(`${rate}% capture · ${RARITY_LABEL[rarity]}`)
        .setValue(tier)
    );
  }
  if (!options.length) {
    for (const tier of ["common","uncommon","divine","exceptional"]) {
      const rate = CAPTURE_RATES[tier]?.[rarity] ?? 0;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${TALISMAN_LABEL[tier]} — Not owned`)
          .setDescription(RARITY_LABEL[rarity])
          .setValue(tier)
      );
    }
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("roll_talisman").setPlaceholder("🎯 Select talisman...").addOptions(options)
  );
}

function buildRollAgainRow(currentQi) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("roll_chain")
      .setLabel(`Roll Again  (${QI_PER_ROLL} Qi)`)
      .setEmoji(QI_EMO)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentQi < QI_PER_ROLL)
  );
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Spend 25 Qi to reveal a card — then capture it with a talisman"),

  async execute(interaction) {
    await interaction.deferReply();
    await rollLoop(interaction, interaction.user.id);
  },
};

async function rollLoop(interaction, userId, useFollowUp = false) {
  const user           = await User.findOne({ userId });
  const currentQi      = regenQi(user);
  const maxQi          = qiMax(user.accountLevel);
  const currentDantian = regenDantian(user);

  const reply = useFollowUp
    ? (data) => interaction.followUp(data)
    : (data) => interaction.editReply(data);

  if (currentQi < QI_PER_ROLL) {
    const secs = qiRegenRemaining(user);
    return reply({
      embeds: [new EmbedBuilder()
        .setTitle(`${QI_EMO} Not enough Qi`)
        .setDescription([
          `Need **${QI_PER_ROLL}** Qi to roll (you have **${currentQi}**).`,
          secs > 0 ? `⏳ Full in **${formatCooldown(secs)}**` : "",
          `Use \`/refill\` to restore from Dantian (${DAN_EMO} **${currentDantian}** / ${dantianMax()})`,
        ].filter(Boolean).join("\n"))
        .setColor(0xef4444)
      ],
      components: [],
    });
  }

  const peeked = await peekCard();
  if (!peeked) return reply({ content: "No cards available right now.", components: [] });
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
  const freshUser = await User.findOne({ userId });
  const lvResult  = applyExp(freshUser.accountLevel, freshUser.accountExp, 5);
  await User.findOneAndUpdate({ userId }, { accountLevel: lvResult.newLevel, accountExp: lvResult.newExp });

  // Build reveal embed
  const freshUser2 = await User.findOne({ userId });
  const revealEmbed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[rarity] ?? ""} **${RARITY_LABEL[rarity]}** appeared!`)
    .setDescription(`**${card.name}** — *${card.anime}*\n\n🎯 Pick a talisman to capture!`)
    .setColor(RARITY_COLOR[rarity] ?? 0x78909C)
    .setFooter({ text: `Qi: ${newQi} / ${maxQi}` });
  if (card.imageUrl) revealEmbed.setImage(card.imageUrl);
  if (lvResult.leveledUp) revealEmbed.addFields({ name: "🎉 Level Up!", value: `**Level ${lvResult.newLevel}**!` });

  const hasAnyTalisman = ["common","uncommon","divine","exceptional"].some(
    t => (freshUser2.items?.[TALISMAN_USER_KEY[t]] ?? 0) > 0
  );
  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("roll_skip").setLabel("Flee").setStyle(ButtonStyle.Secondary)
  );

  const components = hasAnyTalisman
    ? [buildTalismanRow(freshUser2, rarity), skipRow]
    : [skipRow];

  const msg = await reply({ embeds: [revealEmbed], components });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 60_000,
    max: 1,
  });

  collector.on("collect", async i => {
    try {
      await i.deferUpdate();

      // ── Flee ─────────────────────────────────────────────────────────────
      if (i.customId === "roll_skip") {
        const qiNow = regenQi(await User.findOne({ userId }));
        // Edit embed to show fled — keep image
        const fled = EmbedBuilder.from(revealEmbed)
          .setTitle(`💨 ${RARITY_EMOJI[rarity] ?? ""} **${card.name}** — Fled`)
          .setDescription(`**${card.name}** — *${card.anime}* — **${RARITY_LABEL[rarity]}**\n\nYou fled — the card vanished.`)
          .setColor(0x6b7280)
          .setFooter({ text: `Qi: ${qiNow} / ${maxQi}` })
          .spliceFields(0, 25); // remove level up field if present
        await msg.edit({ embeds: [fled], components: [buildRollAgainRow(qiNow)] });

        // Await chain roll
        try {
          const again = await msg.awaitMessageComponent({ filter: ii => ii.user.id === userId && ii.customId === "roll_chain", time: 30_000 });
          await again.deferUpdate();
          await msg.edit({ components: [] }).catch(() => {});
          await rollLoop(interaction, userId, true);
        } catch { await msg.edit({ components: [] }).catch(() => {}); }
        return;
      }

      // ── Talisman ──────────────────────────────────────────────────────────
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
      const qiNow       = regenQi(await User.findOne({ userId }));

      if (captured) {
        // ── Success — keep image, add capture info ───────────────────────
        const nyang = NYANG_REWARD[rarity] ?? 50;
        const pts   = FACTION_PTS[rarity] ?? 0;
        await captureCard(userId, card.cardId);
        const inc = { "currency.gold": nyang };
        if (pts > 0) inc.factionPoints = pts;
        await User.findOneAndUpdate({ userId }, { $inc: inc });

        const capturedEmbed = EmbedBuilder.from(revealEmbed)
          .setTitle(`${TALISMAN_EMOJI[talTier]} Captured! ${RARITY_EMOJI[rarity] ?? ""} **${card.name}**`)
          .setDescription(
            `**${card.name}** — *${card.anime}* — **${RARITY_LABEL[rarity]}**\n\n` +
            `✅ Added to your collection!\n` +
            `${NYAN_EMO} **+${nyang.toLocaleString()} Nyang**  ·  ⚔️ **+${pts} faction pt${pts !== 1 ? "s" : ""}**`
          )
          .setColor(0x22c55e)
          .setFooter({ text: `Qi: ${qiNow} / ${maxQi}` })
          .spliceFields(0, 25);

        await msg.edit({ embeds: [capturedEmbed], components: [buildRollAgainRow(qiNow)] });

        try {
          const again = await msg.awaitMessageComponent({ filter: ii => ii.user.id === userId && ii.customId === "roll_chain", time: 30_000 });
          await again.deferUpdate();
          await msg.edit({ components: [] }).catch(() => {});
          await rollLoop(interaction, userId, true);
        } catch { await msg.edit({ components: [] }).catch(() => {}); }

      } else {
        // ── Failed — keep image, show escape. No chain roll. ─────────────
        const escapedEmbed = EmbedBuilder.from(revealEmbed)
          .setTitle(`💨 ${RARITY_EMOJI[rarity] ?? ""} **${card.name}** — Escaped!`)
          .setDescription(
            `**${card.name}** — *${card.anime}* — **${RARITY_LABEL[rarity]}**\n\n` +
            `❌ Capture failed — the card vanished.`
          )
          .setColor(0xef4444)
          .setFooter({ text: `Qi: ${qiNow} / ${maxQi}` })
          .spliceFields(0, 25);

        await msg.edit({ embeds: [escapedEmbed], components: [buildRollAgainRow(qiNow)] });

        try {
          const again = await msg.awaitMessageComponent({ filter: ii => ii.user.id === userId && ii.customId === "roll_chain", time: 30_000 });
          await again.deferUpdate();
          await msg.edit({ components: [] }).catch(() => {});
          await rollLoop(interaction, userId, true);
        } catch { await msg.edit({ components: [] }).catch(() => {}); }
      }

    } catch (err) { console.error("[roll]", err); }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      const qiNow = regenQi(await User.findOne({ userId })) ?? newQi;
      const timedOut = EmbedBuilder.from(revealEmbed)
        .setTitle(`⏰ ${RARITY_EMOJI[rarity] ?? ""} **${card.name}** — Timed out`)
        .setDescription(`**${card.name}** — *${card.anime}* — **${RARITY_LABEL[rarity]}**\n\nTook too long — the card vanished.`)
        .setColor(0x6b7280)
        .setFooter({ text: `Qi: ${qiNow} / ${maxQi}` })
        .spliceFields(0, 25);
      await msg.edit({ embeds: [timedOut], components: [] }).catch(() => {});
    }
  });
}
