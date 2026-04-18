const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const {
  qiMax, dantianMax, regenDantian,
  isQiReady, qiCooldownRemaining, formatCooldown, DANTIAN_FILL_MS,
} = require("../../services/mana");

const QI_FULL      = "<:xp_full:1494696138396270592>";
const QI_EMPTY     = "<:xp_empty:1494696186525909002>";

function buildBar(current, max, length = 10) {
  const pct    = Math.min(current / max, 1);
  const filled = Math.round(pct * length);
  return QI_FULL.repeat(filled) + QI_EMPTY.repeat(length - filled);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dantian")
    .setDescription("Check your Qi and Dantian energy levels"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const currentDantian = regenDantian(user);
    const maxQi      = qiMax(user.accountLevel);
    const maxDantian = dantianMax(user.accountLevel);
    const currentQi  = user.mana?.qi ?? maxQi;
    const qiReady    = isQiReady(user);
    const cooldownSecs = qiCooldownRemaining(user);

    // Time until Dantian full
    const dantianMissing = maxDantian - currentDantian;
    const regenPerMs     = maxDantian / DANTIAN_FILL_MS;
    const dantianEtaSecs = dantianMissing > 0.5
      ? Math.ceil(dantianMissing / regenPerMs / 1000)
      : 0;

    // Qi status line
    const qiPct    = Math.round((currentQi / maxQi) * 100);
    let qiStatus;
    if (!qiReady) {
      qiStatus = `⏳ Cooldown — **${formatCooldown(cooldownSecs)}**`;
    } else if (currentQi >= maxQi) {
      qiStatus = `✅ Full — ready to roll!`;
    } else {
      qiStatus = `⚡ ${currentQi} / ${maxQi} — use \`/refill\` to restore`;
    }

    // Dantian status line
    const dantianPct = Math.round((currentDantian / maxDantian) * 100);
    const dantianStatus = dantianEtaSecs > 0
      ? `🕐 Full in **${formatCooldown(dantianEtaSecs)}**`
      : `✅ Full`;

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s Mana`)
      .setColor(
        !qiReady ? 0xE53935 :
        currentQi <= 0 ? 0xFF7043 :
        currentQi < maxQi * 0.5 ? 0xFFB300 :
        0x5B21B6
      )
      .addFields(
        {
          name: "⚡ Qi",
          value: [
            buildBar(currentQi, maxQi),
            `**${currentQi} / ${maxQi}** *(${qiPct}%)*`,
            qiStatus,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🌀 Dantian",
          value: [
            buildBar(currentDantian, maxDantian),
            `**${Math.floor(currentDantian)} / ${maxDantian}** *(${dantianPct}%)*`,
            dantianStatus,
          ].join("\n"),
          inline: false,
        },
      )
      .setFooter({ text: `Level ${user.accountLevel} · Mana scales up to Lv25 · Use /refill to transfer Dantian → Qi` });

    // Save updated dantian
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.dantian":           Math.floor(currentDantian),
      "mana.lastDantianUpdate": new Date(),
    });

    return interaction.editReply({ embeds: [embed] });
  },
};
