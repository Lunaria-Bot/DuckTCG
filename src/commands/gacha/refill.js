const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const User = require("../../models/User");
const {
  qiMax, dantianMax, regenDantian,
  isQiReady, qiCooldownRemaining, formatCooldown,
} = require("../../services/mana");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("refill")
    .setDescription("Transfer Dantian energy into your Qi (requires Qi cooldown to be over)"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    // Check cooldown
    if (!isQiReady(user)) {
      const secs = qiCooldownRemaining(user);
      return interaction.editReply({
        content: `⏳ Your Qi is still recharging. Ready in **${formatCooldown(secs)}**.`,
      });
    }

    const currentDantian = regenDantian(user);
    const maxQi      = qiMax(user.accountLevel);
    const maxDantian = dantianMax(user.accountLevel);
    const currentQi  = user.mana?.qi ?? maxQi;

    if (currentQi >= maxQi) {
      return interaction.editReply({
        content: `⚡ Your Qi is already full! (**${currentQi}** / ${maxQi})\nDantian: **${Math.floor(currentDantian)}** / ${maxDantian}`,
      });
    }

    if (currentDantian <= 0) {
      return interaction.editReply({
        content: `🌀 Your Dantian is empty! It regenerates passively — check back later.\n*(Full recharge takes **8 hours**)*`,
      });
    }

    // Transfer: fill Qi to max OR use all available Dantian
    const needed    = maxQi - currentQi;
    const transfer  = Math.min(needed, Math.floor(currentDantian));
    const newQi     = currentQi + transfer;
    const newDantian = currentDantian - transfer;

    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      "mana.qi":               newQi,
      "mana.dantian":          Math.floor(newDantian),
      "mana.lastDantianUpdate": new Date(),
      "mana.qiCooldownUntil":  null,
    });

    const embed = new EmbedBuilder()
      .setTitle("⚡ Qi Refilled")
      .setDescription(`Transferred **${transfer}** energy from your Dantian into your Qi.`)
      .setColor(0x5B21B6)
      .addFields(
        { name: "⚡ Qi",      value: `**${newQi}** / ${maxQi}`,                          inline: true },
        { name: "🌀 Dantian", value: `**${Math.floor(newDantian)}** / ${maxDantian}`,     inline: true },
      )
      .setFooter({ text: "Use /roll to spend your Qi!" });

    return interaction.editReply({ embeds: [embed] });
  },
};
