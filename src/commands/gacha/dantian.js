const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const {
  qiMax, dantianMax, regenDantian, regenQi,
  isQiReady, qiCooldownRemaining, formatCooldown, DANTIAN_FILL_MS,
} = require("../../services/mana");

const QI_FULL  = "<:xp_full:1494696138396270592>";
const QI_EMPTY = "<:xp_empty:1494696186525909002>";

function buildBar(current, max, length = 10) {
  const pct    = Math.min(current / max, 1);
  const filled = Math.round(pct * length);
  return QI_FULL.repeat(filled) + QI_EMPTY.repeat(length - filled);
}

function buildEmbed(user, qi, dantian) {
  const maxQi      = qiMax(user.accountLevel);
  const maxDantian = dantianMax(user.accountLevel);
  const qiReady    = isQiReady(user);
  const cooldownSecs = qiCooldownRemaining(user);

  const dantianMissing = maxDantian - dantian;
  const regenPerMs     = maxDantian / DANTIAN_FILL_MS;
  const dantianEtaSecs = dantianMissing > 0.5
    ? Math.ceil(dantianMissing / regenPerMs / 1000)
    : 0;

  const qiPct = Math.round((qi / maxQi) * 100);
  let qiStatus;
  if (!qiReady) {
    qiStatus = `⏳ Cooldown — **${formatCooldown(cooldownSecs)}**`;
  } else if (qi >= maxQi) {
    qiStatus = `✅ Full — ready to roll!`;
  } else {
    qiStatus = `<:Qi:1495523502961459200> ${qi} / ${maxQi}`;
  }

  const dantianPct    = Math.round((dantian / maxDantian) * 100);
  const dantianStatus = dantianEtaSecs > 0
    ? `🕐 Full in **${formatCooldown(dantianEtaSecs)}**`
    : `✅ Full`;

  return new EmbedBuilder()
    .setTitle(`${user.username}'s Mana`)
    .setColor(
      !qiReady   ? 0xE53935 :
      qi <= 0    ? 0xFF7043 :
      qi < maxQi * 0.5 ? 0xFFB300 :
      0x5B21B6
    )
    .addFields(
      {
        name: "<:Qi:1495523502961459200> Qi",
        value: [
          buildBar(qi, maxQi),
          `**${qi} / ${maxQi}** *(${qiPct}%)*`,
          qiStatus,
        ].join("\n"),
      },
      {
        name: "<:Dantian:1495528597610303608> Dantian",
        value: [
          buildBar(dantian, maxDantian),
          `**${Math.floor(dantian)} / ${maxDantian}** *(${dantianPct}%)*`,
          dantianStatus,
        ].join("\n"),
      },
    )
    .setFooter({ text: `Mana scales up to Lv25` });
}

function buildRow(canRefill) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("dantian_refill")
      .setLabel("Refill Qi")
      .setEmoji("<:Qi:1495523502961459200>")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canRefill),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dantian")
    .setDescription("Check your Qi and Dantian energy levels"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    let currentDantian = regenDantian(user);
    const maxQi   = qiMax(user.accountLevel);
    let currentQi = user.mana?.qi ?? maxQi;

    // Save updated dantian
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.dantian":           Math.floor(currentDantian),
      "mana.lastDantianUpdate": new Date(),
    });

    const canRefill = currentQi < maxQi && currentDantian >= 1;

    const msg = await interaction.editReply({
      embeds: [buildEmbed(user, currentQi, currentDantian)],
      components: [buildRow(canRefill)],
    });

    // Button collector
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id && i.customId === "dantian_refill",
      time: 5 * 60 * 1000,
      max: 10,
    });

    collector.on("collect", async i => {
      await i.deferUpdate();

      // Re-fetch fresh state
      const freshUser  = await User.findOne({ userId: interaction.user.id });
      const freshDantian = regenDantian(freshUser);
      const freshQi    = regenQi(freshUser);
      const maxDantian = dantianMax(freshUser.accountLevel);

      if (freshQi >= maxQi) {
        return interaction.editReply({
          embeds: [buildEmbed(freshUser, freshQi, freshDantian)],
          components: [buildRow(false)],
        });
      }

      if (freshDantian < 1) {
        return interaction.editReply({
          embeds: [buildEmbed(freshUser, freshQi, freshDantian)],
          components: [buildRow(false)],
        });
      }

      // Do the refill
      const needed   = maxQi - freshQi;
      const transfer = Math.min(needed, Math.floor(freshDantian));
      const newQi     = freshQi + transfer;
      const newDantian = freshDantian - transfer;

      await User.findOneAndUpdate({ userId: interaction.user.id }, {
        "mana.qi":               newQi,
        "mana.lastQiUpdate":     new Date(),
        "mana.dantian":          Math.floor(newDantian),
        "mana.lastDantianUpdate": new Date(),
        "mana.qiCooldownUntil":  null,
      });

      const updatedUser = { ...freshUser.toObject(), mana: { ...freshUser.mana, qi: newQi, dantian: Math.floor(newDantian), qiCooldownUntil: null } };
      const stillCanRefill = newQi < maxQi && newDantian >= 1;

      await interaction.editReply({
        embeds: [buildEmbed(updatedUser, newQi, newDantian)],
        components: [buildRow(stillCanRefill)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
