const { requireProfile } = require("../../utils/requireProfile");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getOrCreateUser } = require("../../utils/getOrCreateUser");
const PlayerCard = require("../../models/PlayerCard");
const Raid = require("../../models/Raid");
const { calculateRaidDamage } = require("../../services/cardStats");
const { processBadges } = require("../../services/badges");
const { incrementProgress } = require("../../services/quests");

const RAID_COOLDOWN_SECONDS = 3600;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Attack the active raid boss")
    .addSubcommand(sub =>
      sub.setName("attack")
        .setDescription("Launch an attack on the raid boss")
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("View boss status and damage leaderboard")
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;
    const sub = interaction.options.getSubcommand();

    const raid = await Raid.findOne({ status: "active" });
    if (!raid) return interaction.editReply({ content: "No active raid at the moment." });

    if (sub === "info") return showRaidInfo(interaction, raid);
    if (sub === "attack") return doAttack(interaction, raid);
  },
};

async function showRaidInfo(interaction, raid) {
  const hpPercent = Math.round((raid.currentHp / raid.maxHp) * 100);
  const barFilled = Math.round(hpPercent / 10);
  const hpBar = `[${"█".repeat(barFilled)}${"░".repeat(10 - barFilled)}] ${hpPercent}%`;

  const top5 = [...raid.participants]
    .sort((a, b) => b.damageDealt - a.damageDealt)
    .slice(0, 5);

  const leaderboard = top5.length
    ? top5.map((p, i) => `**${i + 1}.** ${p.username} — ${p.damageDealt.toLocaleString()} damage`).join("\n")
    : "*No attacks yet*";

  const embed = new EmbedBuilder()
    .setTitle(`Raid — ${raid.name}`)
    .setDescription(`*${raid.anime}*`)
    .setColor(0xE53935)
    .addFields(
      { name: "Boss HP", value: `${hpBar}\n${raid.currentHp.toLocaleString()} / ${raid.maxHp.toLocaleString()}`, inline: false },
      { name: "Leaderboard", value: leaderboard, inline: false },
    )
    .setFooter({ text: `Ends <t:${Math.floor(raid.endsAt.getTime() / 1000)}:R>` });

  if (raid.imageUrl) embed.setThumbnail(raid.imageUrl);

  return interaction.editReply({ embeds: [embed] });
}

async function doAttack(interaction, raid) {
  const { getRedis } = require("../../services/redis");
  const redis = getRedis();

  const cooldownKey = `raid_cooldown:${interaction.user.id}`;
  const onCooldown = await redis.get(cooldownKey);
  if (onCooldown) {
    const ttl = await redis.ttl(cooldownKey);
    const mins = Math.ceil(ttl / 60);
    return interaction.editReply({ content: `You can attack again in **${mins} min**.` });
  }

  const user = await getOrCreateUser(interaction.user);

  const teamIds = user.team.map(t => t.playerCardId).filter(Boolean);
  if (!teamIds.length) {
    return interaction.editReply({ content: "Set up your team first with `/team set`." });
  }

  const teamCards = await PlayerCard.find({ _id: { $in: teamIds } });
  const teamStats = teamCards.reduce(
    (acc, c) => ({
      damage: acc.damage + (c.cachedStats.damage ?? 0),
      mana:   acc.mana   + (c.cachedStats.mana   ?? 0),
      hp:     acc.hp     + (c.cachedStats.hp      ?? 0),
    }),
    { damage: 0, mana: 0, hp: 0 }
  );

  const damage = calculateRaidDamage(teamStats);
  const newHp = Math.max(0, raid.currentHp - damage);
  const goldEarned = Math.round(damage * 0.1);
  const droppedPull = Math.random() < 0.0005;

  const existingIdx = raid.participants.findIndex(p => p.userId === interaction.user.id);
  if (existingIdx >= 0) {
    raid.participants[existingIdx].damageDealt += damage;
    raid.participants[existingIdx].goldEarned += goldEarned;
    if (droppedPull) raid.participants[existingIdx].droppedPull = true;
  } else {
    raid.participants.push({
      userId: interaction.user.id,
      username: interaction.user.username,
      damageDealt: damage,
      goldEarned,
      droppedPull,
    });
  }

  raid.currentHp = newHp;
  if (newHp <= 0) {
    raid.status = "defeated";
    raid.defeatedAt = new Date();
  }
  await raid.save();

  const updateData = {
    $inc: {
      "currency.gold": goldEarned,
      "stats.totalGoldEverEarned": goldEarned,
      "stats.raidDamageTotal": damage,
    },
  };
  if (droppedPull) updateData.$inc["currency.regularTickets"] = 1;
  await user.updateOne(updateData);

  // Reload user for badge check
  const User = require("../../models/User");
  const freshUser = await User.findOne({ userId: interaction.user.id });
  if (freshUser) await processBadges(freshUser, interaction, "daily");
  await incrementProgress(redis, interaction.user.id, "daily", "raid", 1);
  await incrementProgress(redis, interaction.user.id, "weekly", "raid", 1);

  await redis.set(cooldownKey, "1", "EX", RAID_COOLDOWN_SECONDS);

  const embed = new EmbedBuilder()
    .setTitle(`Attack on ${raid.name}`)
    .setColor(0xE53935)
    .addFields(
      { name: "Damage Dealt", value: `**${damage.toLocaleString()}**`, inline: true },
      { name: "Nyang Earned", value: `**${goldEarned.toLocaleString()}** <:Nyan:1495048966528831508>`, inline: true },
      { name: "Boss HP Left", value: `${Math.max(0, newHp).toLocaleString()} / ${raid.maxHp.toLocaleString()}`, inline: true },
    );

  if (droppedPull) {
    embed.addFields({ name: "Drop!", value: "You obtained a **Regular Ticket**!", inline: false });
  }

  if (newHp <= 0) {
    embed.setDescription("**The boss has been defeated!** All rewards have been distributed.");
  }

  return interaction.editReply({ embeds: [embed] });
}
