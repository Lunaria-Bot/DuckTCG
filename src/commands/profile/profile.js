const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const User = require("../../models/User");
const PlayerCard = require("../../models/PlayerCard");
const Card = require("../../models/Card");
const { renderProfile } = require("../../services/profileRenderer");

function formatDate(d) {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  return `${day}${suffix} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile or another player's profile")
    .addUserOption(opt => opt.setName("user").setDescription("Target player (optional)")),

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

    // Favorite card
    let favoriteCard = null;
    if (user.favoriteCardId) {
      const pc   = await PlayerCard.findById(user.favoriteCardId);
      const card = pc ? await Card.findOne({ cardId: pc.cardId }) : null;
      if (card) {
        favoriteCard = {
          name:     card.name,
          anime:    card.anime,
          rarity:   card.rarity,
          level:    pc.level,
          cp:       pc.cachedStats?.combatPower ?? 0,
          imageUrl: card.imageUrl ?? null,
        };
      }
    }

    const expNeeded = Math.round(100 * Math.pow(user.accountLevel, 1.4));
    const expPct    = Math.min(user.accountExp / expNeeded, 1);

    try {
      const buffer = await renderProfile({
        username:   user.username,
        level:      user.accountLevel,
        expPct,
        expCurrent: user.accountExp,
        expNeeded,
        startDate:  formatDate(user.firstJoinDate),
        bio:        user.bio ?? null,
        avatar:     target.displayAvatarURL({ extension: "png", size: 128 }),
        stats: {
          cards:      user.stats.totalCardsEverObtained,
          cp:         user.combatPower.toLocaleString(),
          raids:      user.stats.raidDamageTotal > 0 ? "?" : "0",
          adventures: "0",
          pulls:      user.stats.totalPullsDone,
          streak:     user.loginStreak,
        },
        favoriteCard,
      });

      const attachment = new AttachmentBuilder(buffer, { name: "profile.png" });
      return interaction.editReply({ files: [attachment] });

    } catch (err) {
      console.error("Profile renderer error:", err.message);
      // Fallback to basic embed
      const embed = new EmbedBuilder()
        .setTitle(`✨ ${user.username}'s Profile ✨`)
        .setColor(0x5B21B6)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: `✦ Level ${user.accountLevel}`, value: `${user.accountExp} / ${expNeeded} XP`, inline: false },
          { name: "Stats", value: `📦 Cards: **${user.stats.totalCardsEverObtained}**\n⚔️ CP: **${user.combatPower}**\n🎰 Pulls: **${user.stats.totalPullsDone}**\n🔥 Streak: **${user.loginStreak}d**`, inline: true },
        )
        .setFooter({ text: `Member since ${user.firstJoinDate.toLocaleDateString("en-US")}` });
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
