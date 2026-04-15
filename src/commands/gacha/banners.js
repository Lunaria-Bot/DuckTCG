const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Banner = require("../../models/Banner");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banners")
    .setDescription("Display all active gacha banners"),

  async execute(interaction) {
    await interaction.deferReply();

    const now = new Date();
    const banners = await Banner.find({
      isActive: true,
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
    }).sort({ type: 1 });

    if (!banners.length) {
      return interaction.editReply({ content: "No active banners at the moment." });
    }

    const embed = new EmbedBuilder()
      .setTitle("Active Banners")
      .setColor(0xAB47BC);

    for (const banner of banners) {
      const typeLabel = banner.type === "pickup" ? "Pick Up!" : "Regular";
      const ends = banner.endsAt
        ? `Ends <t:${Math.floor(banner.endsAt.getTime() / 1000)}:R>`
        : "Permanent";

      embed.addFields({
        name: `${typeLabel} — ${banner.name}`,
        value: `ID: \`${banner.bannerId}\`\n${ends}\nPity: ${banner.pity.hardPity} pulls (soft at ${banner.pity.softPityStart})`,
        inline: false,
      });
    }

    embed.setFooter({ text: "Use /pull <banner_id> to pull on a banner" });

    return interaction.editReply({ embeds: [embed] });
  },
};
