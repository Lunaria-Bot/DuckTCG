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
const RARITY_ORDER = { radiant: -1, exceptional: 0, special: 1, rare: 2, common: 3 };
const RARITY_RATES = { common: 62.5, rare: 30, special: 7.5 }; // exceptional/radiant excluded

const QI_EMOJI    = "<:Qi:1496984846566818022>";
const DANTIAN_EMO = "<:Dantian:1495528597610303608>";

// ─── Talisman capture rates ───────────────────────────────────────────────────
// [talismanTier][cardRarity] = capture %
const CAPTURE_RATES = {
  common:      { common: 70, rare: 50, special: 40, exceptional: 0,   radiant: 0   },
  uncommon:    { common: 80, rare: 60, special: 60, exceptional: 0,   radiant: 0   },
  divine:      { common: 95, rare: 90, special: 80, exceptional: 0,   radiant: 0   },
  exceptional: { common: 100,rare: 100,special: 100,exceptional: 100, radiant: 100 },
};

const TALISMAN_LABEL = {
  common:      "Common Talisman",
  uncommon:    "Uncommon Talisman",
  divine:      "Divine Talisman",
  exceptional: "Exceptional Talisman",
};

const TALISMAN_EMOJI = {
  common:      "📜",
  uncommon:    "📋",
  divine:      "✴️",
  exceptional: "🌟",
};

const TALISMAN_ITEM_KEY = {
  common:      "items.talismanCommon",
  uncommon:    "items.talismanUncommon",
  divine:      "items.talismanDivine",
  exceptional: "items.talismanExceptional",
};

const TALISMAN_USER_KEY = {
  common:      "talismanCommon",
  uncommon:    "talismanUncommon",
  divine:      "talismanDivine",
  exceptional: "talismanExceptional",
};

// ─── Faction points ───────────────────────────────────────────────────────────
const FACTION_PTS = { common: 1, rare: 2, special: 5, exceptional: 8, radiant: 10 };

// ─── Roll rarity ─────────────────────────────────────────────────────────────
function rollRarity() {
  const roll = Math.random() * 100;
  let cum = 0;
  for (const [r, rate] of Object.entries(RARITY_RATES)) {
    cum += rate;
    if (roll < cum) return r;
  }
  return "common";
}

// ─── Draw a single card (DO NOT save yet — capture handles that) ───────────────
async function peekCard() {
  const rarity = rollRarity();
  const pool   = await Card.find({ rarity, isAvailable: true });
  if (pool.length) return { card: pool[Math.floor(Math.random() * pool.length)], rarity };

  // Fallback
  for (const r of ["common", "rare", "special"]) {
    const fb = await Card.find({ rarity: r, isAvailable: true });
    if (fb.length) return { card: fb[Math.floor(Math.random() * fb.length)], rarity: r };
  }
  return null;
}

// ─── Actually save the card after capture ────────────────────────────────────
async function captureCard(userId, cardId, rarity) {
  const pc = await PlayerCard.findOneAndUpdate(
    { userId, cardId },
    { $inc: { quantity: 1 }, $setOnInsert: { level: 1 } },
    { upsert: true, new: true }
  );
  const card = await Card.findOne({ cardId });
  if (pc.isNew || !pc.cachedStats) {
    pc.cachedStats = calculateStats(card, 1);
    await pc.save();
  }
  await User.findOneAndUpdate({ userId }, { $inc: { "stats.totalCardsEverObtained": 1 } });
  return pc;
}

// ─── Build card reveal embed ──────────────────────────────────────────────────
function buildRevealEmbed(card, rarity, username, currentQi, maxQi) {
  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[rarity] ?? ""} A wild **${RARITY_LABEL[rarity]}** card appeared!`)
    .setDescription(
      `**${card.name}** — *${card.anime}*\n\n` +
      `Choose a talisman to attempt capture!\n` +
      `${QI_EMOJI} ${currentQi} / ${maxQi} Qi remaining`
    )
    .setColor(RARITY_COLOR[rarity] ?? 0x78909C);
  if (card.imageUrl) embed.setImage(card.imageUrl);
  return embed;
}

// ─── Build talisman select row ────────────────────────────────────────────────
function buildTalismanRow(user, rarity) {
  const rates = CAPTURE_RATES;
  const options = [];

  for (const tier of ["common", "uncommon", "divine", "exceptional"]) {
    const count = user.items?.[TALISMAN_USER_KEY[tier]] ?? 0;
    if (count <= 0) continue;
    const rate  = rates[tier]?.[rarity] ?? 0;
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${TALISMAN_LABEL[tier]} (×${count})`)
        .setDescription(`${rate}% capture chance for ${rarity} cards`)
        .setValue(tier)
    );
  }

  if (!options.length) {
    // Show all options but disabled label if none owned
    for (const tier of ["common", "uncommon", "divine", "exceptional"]) {
      const rate = rates[tier]?.[rarity] ?? 0;
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${TALISMAN_LABEL[tier]} (×0) — Not owned`)
          .setDescription(`${rate}% capture chance`)
          .setValue(tier)
      );
    }
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("roll_talisman")
      .setPlaceholder("🎯 Select a talisman to capture...")
      .addOptions(options)
  );
}

function buildSkipRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("roll_skip")
      .setLabel("Flee — Skip this card")
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Build result embed ───────────────────────────────────────────────────────
function buildResultEmbed(card, rarity, captured, talTier, captureRate, username) {
  if (captured) {
    const embed = new EmbedBuilder()
      .setTitle(`${TALISMAN_EMOJI[talTier]} Captured! ${RARITY_EMOJI[rarity] ?? ""} **${card.name}**`)
      .setDescription(
        `*${card.anime}* — **${RARITY_LABEL[rarity]}**\n` +
        `Capture rate: **${captureRate}%** · Added to your collection!`
      )
      .setColor(0x22c55e);
    if (card.imageUrl) embed.setThumbnail(card.imageUrl);
    return embed;
  } else {
    return new EmbedBuilder()
      .setTitle(`💨 **${card.name}** escaped!`)
      .setDescription(
        `*${card.anime}* — **${RARITY_LABEL[rarity]}**\n` +
        `Capture rate was **${captureRate}%** — the card vanished into the void.`
      )
      .setColor(0xef4444);
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Spend 25 Qi to reveal a card — then capture it with a talisman"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    // ── Check Qi ────────────────────────────────────────────────────────────
    const currentQi  = regenQi(user);
    const maxQi      = qiMax(user.accountLevel);
    const currentDantian = regenDantian(user);

    if (currentQi < QI_PER_ROLL) {
      const secs = qiRegenRemaining(user);
      const needed = QI_PER_ROLL - currentQi;
      return interaction.editReply({
        content: [
          `${QI_EMOJI} **Not enough Qi!** You need **${QI_PER_ROLL}** Qi to roll (you have **${currentQi}**).`,
          secs > 0 ? `⏳ Full in **${formatCooldown(secs)}**` : "",
          `Use \`/refill\` to restore Qi from your Dantian (${DANTIAN_EMO} **${currentDantian}** / ${dantianMax()})`,
        ].filter(Boolean).join("\n"),
      });
    }

    // ── Peek a card (reveal without saving) ────────────────────────────────
    const peeked = await peekCard();
    if (!peeked) return interaction.editReply({ content: "No cards available to roll. Please try again later." });
    const { card, rarity } = peeked;

    // ── Deduct Qi immediately ───────────────────────────────────────────────
    const newQi = currentQi - QI_PER_ROLL;
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.qi":            newQi,
      "mana.lastQiUpdate":  new Date(),
      "mana.dantian":       currentDantian,
      "mana.lastDantianUpdate": new Date(),
      $inc: { "stats.totalPullsDone": 1 },
    });

    // ── Quest tracking ──────────────────────────────────────────────────────
    const redis = getRedis();
    await incrementProgress(redis, interaction.user.id, "daily", "roll", 1);
    await incrementProgress(redis, interaction.user.id, "weekly", "roll", 1);
    if (rarity === "rare" || rarity === "special" || rarity === "exceptional") {
      await incrementProgress(redis, interaction.user.id, "daily", "roll_rare", 1);
      await incrementProgress(redis, interaction.user.id, "weekly", "roll_rare", 1);
    }
    if (rarity === "special" || rarity === "exceptional") {
      await incrementProgress(redis, interaction.user.id, "daily", "roll_special", 1);
      await incrementProgress(redis, interaction.user.id, "weekly", "roll_special", 1);
    }

    // ── XP ──────────────────────────────────────────────────────────────────
    const freshUser = await User.findOne({ userId: interaction.user.id });
    const lvResult  = applyExp(freshUser.accountLevel, freshUser.accountExp, 5);
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      accountLevel: lvResult.newLevel,
      accountExp:   lvResult.newExp,
    });

    // ── Show card reveal + talisman selector ────────────────────────────────
    const revealEmbed = buildRevealEmbed(card, rarity, user.username, newQi, maxQi);
    if (lvResult.leveledUp) {
      revealEmbed.addFields({ name: "🎉 Level Up!", value: `You reached **Level ${lvResult.newLevel}**!` });
    }

    const freshUser2     = await User.findOne({ userId: interaction.user.id });
    const talismanRow    = buildTalismanRow(freshUser2, rarity);
    const skipRow        = buildSkipRow();
    const canCapture     = ["common", "uncommon", "divine", "exceptional"].some(
      t => (freshUser2.items?.[TALISMAN_USER_KEY[t]] ?? 0) > 0
    );

    const msg = await interaction.editReply({
      embeds: [revealEmbed],
      components: canCapture ? [talismanRow, skipRow] : [skipRow],
    });

    // ── Collect talisman choice ─────────────────────────────────────────────
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 60_000,
      max: 1,
    });

    collector.on("collect", async i => {
      try {
        await i.deferUpdate();

        // Skip / flee
        if (i.customId === "roll_skip") {
          const fleeEmbed = new EmbedBuilder()
            .setTitle(`💨 You fled from **${card.name}**`)
            .setDescription(`*${card.anime}* — **${RARITY_LABEL[rarity]}** · The card vanished.`)
            .setColor(0x6b7280);

          // Roll again button
          const newQiNow = regenQi(await User.findOne({ userId: interaction.user.id }));
          const rollRow  = buildRollAgainRow(newQiNow);
          const fleeMsg = await interaction.editReply({ embeds: [fleeEmbed], components: [rollRow] });
          try {
            const again2 = await fleeMsg.awaitMessageComponent({
              filter: ii => ii.user.id === interaction.user.id && ii.customId === "roll_again_btn",
              time: 30_000,
            });
            await again2.deferUpdate();
            await interaction.editReply({ components: [] });
            await interaction.followUp({ content: `${QI_EMOJI} Use \`/roll\` again to continue!`, ephemeral: true });
          } catch {}
          return;
        }

        // Talisman selected
        const talTier    = i.values[0];
        const userNow    = await User.findOne({ userId: interaction.user.id });
        const ownedCount = userNow.items?.[TALISMAN_USER_KEY[talTier]] ?? 0;

        if (ownedCount <= 0) {
          await i.followUp({ content: `❌ You don't have any **${TALISMAN_LABEL[talTier]}** left!`, ephemeral: true });
          return;
        }

        // Consume talisman
        await User.findOneAndUpdate({ userId: interaction.user.id }, {
          $inc: { [TALISMAN_ITEM_KEY[talTier]]: -1 },
        });

        // Roll capture
        const captureRate = CAPTURE_RATES[talTier]?.[rarity] ?? 0;
        const captured    = Math.random() * 100 < captureRate;

        let resultEmbed;
        if (captured) {
          await captureCard(interaction.user.id, card.cardId, rarity);
          // Faction points
          const pts = FACTION_PTS[rarity] ?? 0;
          if (pts > 0) {
            await User.findOneAndUpdate({ userId: interaction.user.id }, { $inc: { factionPoints: pts } });
          }
          resultEmbed = buildResultEmbed(card, rarity, true, talTier, captureRate, user.username);
        } else {
          resultEmbed = buildResultEmbed(card, rarity, false, talTier, captureRate, user.username);
        }

        const newQiNow = regenQi(await User.findOne({ userId: interaction.user.id }));
        const rollRow  = buildRollAgainRow(newQiNow);
        const resultMsg = await interaction.editReply({ embeds: [resultEmbed], components: [rollRow] });

        // Listen for roll again
        try {
          const again = await resultMsg.awaitMessageComponent({
            filter: ii => ii.user.id === interaction.user.id && ii.customId === "roll_again_btn",
            time: 30_000,
          });
          await again.deferUpdate();
          // Re-execute roll
          const rerollUser = await User.findOne({ userId: interaction.user.id });
          const rerollQi   = regenQi(rerollUser);
          if (rerollQi < QI_PER_ROLL) {
            const secs2 = qiRegenRemaining(rerollUser);
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`${QI_EMOJI} Not enough Qi (${rerollQi}/${QI_PER_ROLL}). Ready in **${formatCooldown(secs2)}**.`).setColor(0xef4444)], components: [] });
          } else {
            // Fake a new interaction by re-invoking logic — simplest: just remove components and tell them to /roll
            await interaction.editReply({ components: [] });
            await interaction.followUp({ content: `${QI_EMOJI} Use \`/roll\` again to continue!`, ephemeral: true });
          }
        } catch {}

      } catch (err) {
        console.error("[roll] collector error:", err);
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        // Timed out — card escapes
        const timeoutEmbed = new EmbedBuilder()
          .setTitle(`⏰ **${card.name}** escaped!`)
          .setDescription(`*${card.anime}* — **${RARITY_LABEL[rarity]}** · You took too long and the card vanished.`)
          .setColor(0xef4444);
        const newQiNow = regenQi(await User.findOne({ userId: interaction.user.id }));
        await interaction.editReply({ embeds: [timeoutEmbed], components: [buildRollAgainRow(newQiNow)] }).catch(() => {});
      }
    });
  },
};

// ─── Roll Again row ───────────────────────────────────────────────────────────
function buildRollAgainRow(currentQi) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("roll_again_btn")
      .setLabel(`Roll Again (${QI_PER_ROLL} Qi)`)
      .setEmoji("<:Qi:1496984846566818022>")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentQi < QI_PER_ROLL),
  );
}


