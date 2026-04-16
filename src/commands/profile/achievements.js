const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const { BADGE_META } = require("../../services/badges");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("achievements")
    .setDescription("View your badges and achievements")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("Target player (optional)")
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const profileCheck = await requireProfile(interaction);
    if (!profileCheck) return;

    const target = interaction.options.getUser("user") ?? interaction.user;

    let user;
    if (target.id !== interaction.user.id) {
      user = await User.findOne({ userId: target.id });
      if (!user) return interaction.editReply({ content: `**${target.username}** doesn't have a profile yet.` });
    } else {
      user = profileCheck;
    }

    // Group badges by category
    const CATEGORIES = {
      "Event": ["pioneer", "anniversary_1", "anniversary_2", "christmas", "halloween"],
      "Collector": ["collector_1", "collector_2", "collector_3"],
      "Wealth": ["gold_small_lord", "gold_lord", "gold_king", "gold_emperor", "gold_god"],
      "Combat Power": ["duck_glock", "duck_kalash", "duck_nuclear"],
    };

    const ownedIds = new Set(user.badges.map(b => b.badgeId));

    const fields = Object.entries(CATEGORIES).map(([category, ids]) => {
      const line = ids.map(id => {
        const meta = BADGE_META[id];
        if (!meta) return null;
        const owned = ownedIds.has(id);
        return owned
          ? `${meta.emoji} **${meta.label}**`
          : `<:_:0> ~~${meta.label}~~`;
      }).filter(Boolean).join("  ");

      return { name: category, value: line || "*None*", inline: false };
    });

    const totalOwned = user.badges.length;
    const totalPossible = Object.values(CATEGORIES).flat().length;

    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Achievements`)
      .setThumbnail(target.displayAvatarURL())
      .setColor(0xFFD700)
      .setDescription(`**${totalOwned} / ${totalPossible}** badges unlocked`)
      .addFields(...fields)
      .setFooter({ text: "Badges are awarded automatically as you play" });

    return interaction.editReply({ embeds: [embed] });
  },
};
