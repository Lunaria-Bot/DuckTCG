const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { requireProfile }    = require("../../utils/requireProfile");
const User                  = require("../../models/User");
const { processBadges }     = require("../../services/badges");
const { incrementProgress } = require("../../services/quests");
const { getRedis }          = require("../../services/redis");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1496624534139179009>";
const PERMA  = "<:perma_ticket:1494344593863344258>";
const PICKUP = "<:pickup_ticket:1494344547046523091>";
const DAN    = "<:Dantian:1495528597610303608>";
const QI     = "<:Qi:1496984846566818022>";

// ─── 28-day reward cycle ───────────────────────────────────────────────────────
const CYCLE = {
  1:  { gold: 9000,  talismanCommon: 3 },
  2:  { gold: 11000,  talismanCommon: 3 },
  3:  { gold: 13500,  talismanUncommon: 2 },
  4:  { gold: 13500,  talismanCommon: 5 },
  5:  { gold: 15500,  talismanUncommon: 2 },
  6:  { gold: 13500,  talismanCommon: 3 },
  7:  { gold: 22000,  regularTickets: 1, talismanUncommon: 3 },
  8:  { gold: 13500,  talismanCommon: 5, qiPill: 1 },
  9:  { gold: 13500,  talismanUncommon: 2 },
  10: { gold: 15500,  talismanCommon: 3 },
  11: { gold: 13500,  talismanUncommon: 3 },
  12: { gold: 18000,  talismanCommon: 5 },
  13: { gold: 13500,  regularTickets: 1 },
  14: { gold: 31000,  pickupTickets: 2, talismanDivine: 1, divineQiPill: 1 },
  15: { gold: 15500,  talismanCommon: 5 },
  16: { gold: 18000,  talismanUncommon: 3, qiPill: 1 },
  17: { gold: 13500,  talismanCommon: 3 },
  18: { gold: 15500,  talismanUncommon: 2, regularTickets: 1 },
  19: { gold: 18000,  talismanCommon: 5 },
  20: { gold: 13500,  talismanUncommon: 3 },
  21: { gold: 35500,  pickupTickets: 2, talismanExceptional: 1, greaterQiPill: 1 },
  22: { gold: 18000,  talismanCommon: 5 },
  23: { gold: 15500,  talismanUncommon: 3, qiPill: 1 },
  24: { gold: 18000,  talismanCommon: 5 },
  25: { gold: 15500,  regularTickets: 2, demonicQiPill: 1 },
  26: { gold: 18000,  talismanUncommon: 5 },
  27: { gold: 18000,  talismanCommon: 5, fenghuangBlessing: 1 },
  28: { gold: 53500, pickupTickets: 6, regularTickets: 5, talismanExceptional: 1, premiumCurrency: 50 },
};

const MILESTONES = [7, 14, 21, 28];

// ─── Format reward as readable lines ─────────────────────────────────────────
function rewardLines(r) {
  const parts = [];
  if (r.gold)               parts.push(`${NYAN} **${r.gold.toLocaleString()} Nyang**`);
  if (r.premiumCurrency)    parts.push(`${JADE} **${r.premiumCurrency} Jade**`);
  if (r.regularTickets)     parts.push(`${PERMA} **${r.regularTickets}× Regular Ticket**`);
  if (r.pickupTickets)      parts.push(`${PICKUP} **${r.pickupTickets}× Pickup Ticket**`);
  if (r.talismanCommon)     parts.push(`📜 **${r.talismanCommon}× Common Talisman**`);
  if (r.talismanUncommon)   parts.push(`📋 **${r.talismanUncommon}× Uncommon Talisman**`);
  if (r.talismanDivine)     parts.push(`✴️ **${r.talismanDivine}× Divine Talisman**`);
  if (r.talismanExceptional)parts.push(`🌟 **${r.talismanExceptional}× Exceptional Talisman**`);
  if (r.qiPill)             parts.push(`${QI} **${r.qiPill}× Qi Pill**`);
  if (r.greaterQiPill)      parts.push(`${QI} **${r.greaterQiPill}× Greater Qi Pill**`);
  if (r.divineQiPill)       parts.push(`🔵 **${r.divineQiPill}× Divine Qi Pill**`);
  if (r.demonicQiPill)      parts.push(`🔴 **${r.demonicQiPill}× Demonic Qi Pill**`);
  if (r.fenghuangBlessing)  parts.push(`🦅 **${r.fenghuangBlessing}× Fenghuang's Blessing**`);
  return parts.join("\n") || "—";
}

function shortReward(r) {
  if (r.talismanExceptional) return `🌟 Exceptional Talisman`;
  if (r.talismanDivine)      return `✴️ Divine Talisman`;
  if (r.divineQiPill)        return `🔵 Divine Qi Pill`;
  if (r.demonicQiPill)       return `🔴 Demonic Qi Pill`;
  if (r.greaterQiPill)       return `${QI} Greater Qi Pill`;
  if (r.fenghuangBlessing)   return `🦅 Fenghuang's Blessing`;
  if (r.pickupTickets)       return `${PICKUP} ×${r.pickupTickets} Pickup`;
  if (r.regularTickets)      return `${PERMA} ×${r.regularTickets} Ticket`;
  if (r.talismanUncommon)    return `📋 ×${r.talismanUncommon} Uncommon`;
  if (r.talismanCommon)      return `📜 ×${r.talismanCommon} Common`;
  if (r.qiPill)              return `${QI} Qi Pill`;
  return `${NYAN} ${(r.gold||0).toLocaleString()}`;
}

function buildUpcoming(currentStreak) {
  const lines = [];
  for (let i = 1; i <= 6; i++) {
    const future    = currentStreak + i;
    const cycleDay  = ((future - 1) % 28) + 1;
    const r         = CYCLE[cycleDay] ?? { gold: 2000 };
    const isMile    = MILESTONES.includes(cycleDay);
    const prefix    = isMile ? "⭐" : "·";
    lines.push(`${prefix} Day **${future}** — ${shortReward(r)}`);
  }
  return lines.join("\n");
}

// ─── Build $inc update from reward ────────────────────────────────────────────
function buildInc(r) {
  const inc = {};
  if (r.gold)                inc["currency.gold"]                = r.gold;
  if (r.premiumCurrency)     inc["currency.premiumCurrency"]     = r.premiumCurrency;
  if (r.regularTickets)      inc["currency.regularTickets"]      = r.regularTickets;
  if (r.pickupTickets)       inc["currency.pickupTickets"]       = r.pickupTickets;
  if (r.talismanCommon)      inc["items.talismanCommon"]         = r.talismanCommon;
  if (r.talismanUncommon)    inc["items.talismanUncommon"]       = r.talismanUncommon;
  if (r.talismanDivine)      inc["items.talismanDivine"]         = r.talismanDivine;
  if (r.talismanExceptional) inc["items.talismanExceptional"]    = r.talismanExceptional;
  if (r.qiPill)              inc["items.qiPill"]                 = r.qiPill;
  if (r.greaterQiPill)       inc["items.greaterQiPill"]          = r.greaterQiPill;
  if (r.divineQiPill)        inc["items.divineQiPill"]           = r.divineQiPill;
  if (r.demonicQiPill)       inc["items.demonicQiPill"]          = r.demonicQiPill;
  if (r.fenghuangBlessing)   inc["items.fenghuangBlessing"]      = r.fenghuangBlessing;
  if (r.gold)                inc["stats.totalGoldEverEarned"]    = r.gold;
  return inc;
}

// ─── Command ──────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily login reward"),

  async execute(interaction) {
    await interaction.deferReply();

    const user = await requireProfile(interaction);
    if (!user) return;

    const now       = new Date();
    const todayUTC  = now.toISOString().slice(0, 10);
    const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate) : null;
    const lastUTC   = lastLogin ? lastLogin.toISOString().slice(0, 10) : null;

    // ── Already claimed ───────────────────────────────────────────────────────
    if (lastUTC === todayUTC) {
      const nextReset = new Date(now);
      nextReset.setUTCHours(24, 0, 0, 0);
      const cycleDay = ((user.loginStreak - 1) % 28) + 1;
      const nextDay  = (cycleDay % 28) + 1;
      const nextR    = CYCLE[nextDay] ?? { gold: 2000 };

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle("Already claimed today")
          .setDescription(`Come back <t:${Math.floor(nextReset.getTime() / 1000)}:R>`)
          .setColor(0x4a4a6a)
          .addFields(
            { name: "Streak",      value: `🔥 **${user.loginStreak}** day${user.loginStreak !== 1 ? "s" : ""}`, inline: true },
            { name: "Cycle",       value: `Day **${cycleDay}** / 28`, inline: true },
            { name: "Tomorrow",    value: shortReward(nextR), inline: false },
          )
          .setThumbnail(interaction.user.displayAvatarURL())
        ],
      });
    }

    // ── Streak logic ──────────────────────────────────────────────────────────
    const yesterdayUTC = new Date(now);
    yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
    const yesterdayStr = yesterdayUTC.toISOString().slice(0, 10);

    const streakReset = !!(lastUTC && lastUTC !== yesterdayStr);
    const newStreak   = lastUTC === yesterdayStr ? (user.loginStreak ?? 0) + 1 : 1;
    const cycleDay    = ((newStreak - 1) % 28) + 1;
    const rewards     = CYCLE[cycleDay] ?? { gold: 2000 };
    const isMile      = MILESTONES.includes(cycleDay);

    // Apply rewards
    await User.findOneAndUpdate({ userId: interaction.user.id }, {
      $inc: buildInc(rewards),
      $set: { loginStreak: newStreak, lastLoginDate: now },
    });

    const updatedUser = await User.findOne({ userId: interaction.user.id });
    await processBadges(updatedUser, interaction, "all");
    const redis = getRedis();
    await incrementProgress(redis, interaction.user.id, "daily",  "daily", 1);
    await incrementProgress(redis, interaction.user.id, "weekly", "daily", 1);

    // ── Embed ─────────────────────────────────────────────────────────────────
    const color = isMile       ? 0xFFD700
                : streakReset  ? 0xEF4444
                : newStreak >= 14 ? 0x8b5cf6
                : 0x6d28d9;

    const titleEmoji = isMile ? "<:Exceptional:1496532355719102656>" : "📅";

    const embed = new EmbedBuilder()
      .setTitle(`${titleEmoji} ${isMile ? `Milestone — Day ${cycleDay}!` : "Daily Reward"}`)
      .setColor(color)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(streakReset
        ? `⚠️ Your streak was reset. Starting from **Day 1**.`
        : `🔥 **${newStreak}-day streak!**  *(Cycle day ${cycleDay} / 28)*`
      )
      .addFields(
        { name: `Today's Reward`, value: rewardLines(rewards), inline: false },
        { name: "Coming Up",      value: buildUpcoming(newStreak), inline: false },
      );

    return interaction.editReply({ embeds: [embed] });
  },
};
