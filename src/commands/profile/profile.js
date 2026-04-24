const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const { xpToNextLevel } = require("../../services/levels");
const PlayerCard = require("../../models/PlayerCard");
const Card       = require("../../models/Card");
const User       = require("../../models/User");

const XP_FULL  = "<:xp_full:1494696138396270592>";
const XP_EMPTY = "<:xp_empty:1496991575887315004>";

const RARITY_EMOJI = {
  radiant: "✨", exceptional: "<:Exceptional:1496532355719102656>",
  special: "<:Special:1496599588902273187>", rare: "<:Rare:1496204151447748811>",
  common:  "<:Common:1496973383143788716>",
};

function buildXpBar(current, needed) {
  const pct    = Math.min(current / needed, 1);
  const filled = Math.round(pct * 12);
  return XP_FULL.repeat(filled) + XP_EMPTY.repeat(12 - filled) + ` ${Math.round(pct * 100)}%`;
}

function formatDate(d) {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const day = d.getDate();
  const s = [11,12,13].includes(day) ? "th" : (["st","nd","rd"][((day%10)-1)] ?? "th");
  return `${day}${s} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

function buildBadgeSection(badges) {
  if (!badges || !badges.length) return null;

  const BADGE_META = {
    pioneer:         { label: "Pioneer",        emoji: "🏅" },
    anniversary_1:   { label: "1st Anniversary",emoji: "🎂" },
    anniversary_2:   { label: "2nd Anniversary",emoji: "🎂" },
    christmas:       { label: "Christmas",       emoji: "🎄" },
    halloween:       { label: "Halloween",       emoji: "🎃" },
    collector_1:     { label: "Collector I",     emoji: "📦" },
    collector_2:     { label: "Collector II",    emoji: "📦" },
    collector_3:     { label: "Collector III",   emoji: "📦" },
    gold_small_lord: { label: "Small Lord",      emoji: "<:Nyan:1495048966528831508>" },
    gold_lord:       { label: "Lord",            emoji: "<:Nyan:1495048966528831508>" },
    gold_king:       { label: "King",            emoji: "👑" },
    gold_emperor:    { label: "Emperor",         emoji: "👑" },
    gold_god:        { label: "God of Wealth",   emoji: "🌕" },
    duck_glock:      { label: "Glock Duck",      emoji: "🦆" },
    duck_kalash:     { label: "Kalash Duck",     emoji: "🦆" },
    duck_nuclear:    { label: "Nuclear Duck",    emoji: "🦆" },
  };

  const badgeStr = badges
    .map(b => {
      const meta = BADGE_META[b.badgeId];
      if (!meta) return null;
      return meta.emoji;
    })
    .filter(Boolean)
    .join("  ");

  return badgeStr || null;
}

function buildEmbed(user, target, favoriteCard, favPc) {
  const expNeeded = xpToNextLevel(user.accountLevel);
  const xpBar     = buildXpBar(user.accountExp, expNeeded);
  const badges    = buildBadgeSection(user.badges);

  const lines = [
    `<:exp:1495018483233067078> **Level ${user.accountLevel}**`,
    xpBar,
    `XP: **${user.accountExp.toLocaleString()} / ${expNeeded.toLocaleString()}**`,
    ``,
    `**Status:** ${user.isPremium ? "💎 Premium" : "Free"}  ·  ${
      user.faction === "heavenly_demon" ? "🔴 Heavenly Demon Cult" :
      user.faction === "orthodox"       ? "🔵 Orthodox Sect" :
      "⚔️ No Faction"
    }`,
    ``,
    `**__About__**`,
    user.bio || `*Nothing set yet.*`,
    ``,
    `**__Stats__**`,
    `📦 Cards Collected: **${user.stats.totalCardsEverObtained}**`,
    `⚔️ Power Score: **${user.combatPower.toLocaleString()}**`,
    `💀 Raids Attacked: **${user.stats.raidDamageTotal > 0 ? user.stats.raidDamageTotal.toLocaleString() : "0"}**`,
    `🔥 Login Streak: **${user.loginStreak}** day${user.loginStreak !== 1 ? "s" : ""}`,
    ``,
    `**__Badges__**`,
    badges || `*No badges yet.*`,
    ``,
    `**__Favorite Card__**`,
    favoriteCard ? `${RARITY_EMOJI[favoriteCard.rarity] ?? ""} **${favoriteCard.name}** *(${favoriteCard.anime})*  ·  Lv.**${favPc?.level ?? "?"}**` : `*No favorite card set yet.*`,
  ];

  const embed = new EmbedBuilder()
    .setTitle(`✨ ${user.username}'s Profile ✨`)
    .setDescription(lines.join("\n"))
    .setColor(0x5B21B6)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .setFooter({ text: `Member since ${formatDate(user.firstJoinDate)}` });

  if (favoriteCard?.imageUrl) embed.setImage(favoriteCard.imageUrl);

  return embed;
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

    const target  = interaction.options.getUser("user") ?? interaction.user;
    const isSelf  = target.id === interaction.user.id;

    let user;
    if (!isSelf) {
      user = await User.findOne({ userId: target.id });
      if (!user) return interaction.editReply({ content: `**${target.username}** doesn't have a profile yet.` });
    } else {
      user = profileCheck;
    }

    // Fetch favorite card
    let favoriteCard = null, favPc = null;
    if (user.favoriteCardId) {
      favPc        = await PlayerCard.findById(user.favoriteCardId).catch(() => null);
      favoriteCard = favPc ? await Card.findOne({ cardId: favPc.cardId }).catch(() => null) : null;
    }

    const embed = buildEmbed(user, target, favoriteCard, favPc);

    // Edit button only for own profile
    const components = isSelf ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("profile_edit_bio").setLabel("✏️ Bio").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("profile_edit_username").setLabel("📝 Username").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("profile_edit_favorite").setLabel("🌟 Favorite Card").setStyle(ButtonStyle.Secondary),
    )] : [];

    const msg = await interaction.editReply({ embeds: [embed], components });
    if (!isSelf) return;

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      // ── Bio ────────────────────────────────────────────────────────────────
      if (i.customId === "profile_edit_bio") {
        const modal = new ModalBuilder().setCustomId("profile_modal_bio").setTitle("Edit Bio");
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("bio")
            .setLabel("Your bio (max 150 characters)")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(150)
            .setRequired(false)
            .setPlaceholder("Write something about yourself...")
            .setValue(user.bio || "")
        ));
        await i.showModal(modal);
        try {
          const mi = await i.awaitModalSubmit({ filter: m => m.customId === "profile_modal_bio" && m.user.id === interaction.user.id, time: 5 * 60 * 1000 });
          await mi.deferUpdate();
          user.bio = mi.fields.getTextInputValue("bio").trim() || null;
          await User.findOneAndUpdate({ userId: interaction.user.id }, { bio: user.bio });
          // Refresh favorite in case it changed
          const refreshed = buildEmbed(user, target, favoriteCard, favPc);
          await interaction.editReply({ embeds: [refreshed] });
        } catch {}
        return;
      }

      // ── Username ───────────────────────────────────────────────────────────
      if (i.customId === "profile_edit_username") {
        const modal = new ModalBuilder().setCustomId("profile_modal_username").setTitle("Change Username");
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("username")
            .setLabel("New in-game username (2–24 characters)")
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(24)
            .setRequired(true)
            .setValue(user.username)
        ));
        await i.showModal(modal);
        try {
          const mi = await i.awaitModalSubmit({ filter: m => m.customId === "profile_modal_username" && m.user.id === interaction.user.id, time: 5 * 60 * 1000 });
          await mi.deferUpdate();
          user.username = mi.fields.getTextInputValue("username").trim();
          await User.findOneAndUpdate({ userId: interaction.user.id }, { username: user.username });
          const refreshed = buildEmbed(user, target, favoriteCard, favPc);
          await interaction.editReply({ embeds: [refreshed] });
        } catch {}
        return;
      }

      // ── Favorite card ──────────────────────────────────────────────────────
      if (i.customId === "profile_edit_favorite") {
        await i.deferUpdate();

        const playerCards = await PlayerCard.find({ userId: interaction.user.id, isBurned: false, quantity: { $gt: 0 } }).limit(100);
        if (!playerCards.length) return;

        const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
        const cards   = await Card.find({ cardId: { $in: cardIds } });
        const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

        const RARITY_ORDER = { radiant: -1, exceptional: 0, special: 1, rare: 2, common: 3 };
        const sorted = playerCards
          .filter(pc => cardMap[pc.cardId])
          .sort((a, b) => (RARITY_ORDER[cardMap[a.cardId]?.rarity] ?? 9) - (RARITY_ORDER[cardMap[b.cardId]?.rarity] ?? 9) || b.level - a.level)
          .slice(0, 24);

        const options = [
          new StringSelectMenuOptionBuilder().setLabel("Clear favorite").setDescription("Remove your favorite card").setValue("clear"),
          ...sorted.map(pc => {
            const card = cardMap[pc.cardId];
            return new StringSelectMenuOptionBuilder()
              .setLabel(`${card.name} — Lv.${pc.level}`.slice(0, 100))
              .setDescription(`${card.anime} · ${card.rarity}`.slice(0, 100))
              .setValue(pc._id.toString());
          }),
        ];

        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("profile_fav_select").setPlaceholder("Choose your favorite card...").addOptions(options)
        );

        await interaction.editReply({ components: [selectRow] });

        try {
          const sel = await msg.awaitMessageComponent({
            filter: s => s.user.id === interaction.user.id && s.customId === "profile_fav_select",
            componentType: ComponentType.StringSelect,
            time: 60_000,
          });
          await sel.deferUpdate();
          if (sel.values[0] === "clear") {
            user.favoriteCardId = null; favoriteCard = null; favPc = null;
            await User.findOneAndUpdate({ userId: interaction.user.id }, { favoriteCardId: null });
          } else {
            favPc        = await PlayerCard.findById(sel.values[0]);
            favoriteCard = favPc ? cardMap[favPc.cardId] : null;
            if (favPc) {
              user.favoriteCardId = favPc._id;
              await User.findOneAndUpdate({ userId: interaction.user.id }, { favoriteCardId: favPc._id });
            }
          }
        } catch {}

        const btnRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("profile_edit_bio").setLabel("✏️ Bio").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("profile_edit_username").setLabel("📝 Username").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("profile_edit_favorite").setLabel("🌟 Favorite Card").setStyle(ButtonStyle.Secondary),
        );
        const refreshed = buildEmbed(user, target, favoriteCard, favPc);
        await interaction.editReply({ embeds: [refreshed], components: [btnRow] });
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
