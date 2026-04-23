const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { xpToNextLevel } = require("../../services/levels");
const User = require("../../models/User");

const XP_FULL  = "<:xp_full:1494696138396270592>";
const XP_EMPTY = "<:xp_empty:1494696186525909002>";

function buildXpBar(current, needed) {
  const pct    = Math.min(current / needed, 1);
  const filled = Math.round(pct * 12);
  return XP_FULL.repeat(filled) + XP_EMPTY.repeat(12 - filled) + ` ${Math.round(pct * 100)}%`;
}

function formatDate(d) {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const day = d.getDate();
  const s = [11,12,13].includes(day) ? "th" : ["st","nd","rd"][((day%10)-1)] ?? "th";
  return `${day}${s} ${months[d.getMonth()]}, ${d.getFullYear()}`;
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

    const expNeeded = xpToNextLevel(user.accountLevel);
    const xpBar     = buildXpBar(user.accountExp, expNeeded);

    const desc = [
      `<:exp:1495018483233067078> **Level ${user.accountLevel}**`,
      xpBar,
      `XP: **${user.accountExp.toLocaleString()} / ${expNeeded.toLocaleString()}**`,
      ``,
      `**Status:** ${user.isPremium ? "💎 Premium" : "Free"}`,
      ``,
      `**__Start Date__**`,
      formatDate(user.firstJoinDate),
      ...(user.bio ? [``, `**__About__**`, user.bio] : []),
      ``,
      `**__Stats__**`,
      `📦 Cards Collected: **${user.stats.totalCardsEverObtained}**`,
      `⚔️ Power Score: **${user.combatPower.toLocaleString()}**`,
      `💀 Raids Attacked: **${user.stats.raidDamageTotal > 0 ? user.stats.raidDamageTotal.toLocaleString() : "0"}**`,
      `🔥 Login Streak: **${user.loginStreak}** day${user.loginStreak !== 1 ? "s" : ""}`,
    ].join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`✨ ${user.username}'s Profile ✨`)
      .setDescription(desc)
      .setColor(0x5B21B6)
      .setThumbnail(target.displayAvatarURL({ size: 128 }))
      .setFooter({ text: `Member since ${formatDate(user.firstJoinDate)}` });

    return interaction.editReply({ embeds: [embed] });
  },
};
