const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { requireProfile } = require("../../utils/requireProfile");
const { xpToNextLevel }  = require("../../services/levels");
const User               = require("../../models/User");
const Card               = require("../../models/Card");
const PlayerCard         = require("../../models/PlayerCard");

const NYAN   = "<:Nyan:1495048966528831508>";
const JADE   = "<:Jade:1496624534139179009>";
const QI     = "<:Qi:1496984846566818022>";
const XP_F   = "<:xp_full:1494696138396270592>";
const XP_E   = "<:xp_empty:1496991575887315004>";

const FACTION_LABEL = {
  heavenly_demon: "Heavenly Demon Cult",
  orthodox:       "Orthodox Sect",
};
const FACTION_EMOJI = {
  heavenly_demon: "<:DemonicSect:1497265894550671372>",
  orthodox:       "<:OrthodoxSect:1497266218749530132>",
};
const RARITY_ORDER = { radiant: -1, exceptional: 0, special: 1, rare: 2, common: 3 };

function buildXpBar(current, needed, length = 10) {
  const filled = Math.round((current / needed) * length);
  return XP_F.repeat(Math.min(filled, length)) + XP_E.repeat(Math.max(length - filled, 0));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile")
    .addUserOption(opt => opt.setName("user").setDescription("Target player (optional)")),

  async execute(interaction) {
    await interaction.deferReply();

    const self = await requireProfile(interaction);
    if (!self) return;

    const target = interaction.options.getUser("user") ?? interaction.user;
    const isSelf = target.id === interaction.user.id;

    let user;
    if (!isSelf) {
      user = await User.findOne({ userId: target.id });
      if (!user) return interaction.editReply({ content: `**${target.username}** doesn't have a profile yet.` });
    } else {
      user = self;
    }

    async function buildEmbed() {
      const xpNeeded = xpToNextLevel(user.accountLevel);
      const xpBar    = buildXpBar(user.accountExp, xpNeeded);

      // Favorite card
      let favLine = "*Not set*";
      if (user.favoriteCardId) {
        const favPc = await PlayerCard.findById(user.favoriteCardId).catch(() => null);
        if (favPc) {
          const card = await Card.findOne({ cardId: favPc.cardId }).catch(() => null);
          if (card) favLine = `**${card.name}** — *${card.anime}*`;
        }
      }

      // Team cards
      let teamLine = "*No team set*";
      if (user.team && user.team.length > 0) {
        const teamNames = [];
        for (const slot of user.team.slice(0, 3)) {
          if (!slot?.playerCardId) continue;
          try {
            const pc   = await PlayerCard.findById(slot.playerCardId);
            const card = pc ? await Card.findOne({ cardId: pc.cardId }) : null;
            if (card) teamNames.push(`${card.name}`);
          } catch {}
        }
        if (teamNames.length) teamLine = teamNames.join("  ·  ");
      }

      const factionStr = user.faction
        ? `${FACTION_EMOJI[user.faction] ?? ""} ${FACTION_LABEL[user.faction] ?? user.faction}`
        : "⚔️ No Faction";

      const embed = new EmbedBuilder()
        .setAuthor({ name: `${user.username}'s Profile`, iconURL: target.displayAvatarURL() })
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setColor(user.faction === "heavenly_demon" ? 0xef4444 : user.faction === "orthodox" ? 0x3b82f6 : 0x8b5cf6)
        .addFields(
          {
            name: "📊 Status",
            value: [
              `**Status:** ${user.isPremium ? "💎 Premium" : "Free"}`,
              `**Faction:** ${factionStr}`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "⚡ Level",
            value: [
              `**Level ${user.accountLevel}**`,
              `${xpBar}`,
              `${user.accountExp.toLocaleString()} / ${xpToNextLevel(user.accountLevel).toLocaleString()} XP`,
            ].join("\n"),
            inline: true,
          },
          { name: "\u200b", value: "\u200b", inline: false },
          {
            name: "📈 Stats",
            value: [
              `🃏 **Cards:** ${user.stats?.totalCardsEverObtained ?? 0}`,
              `⚔️ **Power:** ${(user.combatPower ?? 0).toLocaleString()}`,
              `🔥 **Streak:** ${user.loginStreak ?? 0} days`,
            ].join("\n"),
            inline: true,
          },
          {
            name: "💰 Wallet",
            value: [
              `${NYAN} **${(user.currency?.gold ?? 0).toLocaleString()}** Nyang`,
              `${JADE} **${(user.currency?.premiumCurrency ?? 0).toLocaleString()}** Jade`,
              `${QI} **${user.factionPoints ?? 0}** Faction pts`,
            ].join("\n"),
            inline: true,
          },
          { name: "\u200b", value: "\u200b", inline: false },
          { name: "🌟 Favorite Card", value: favLine, inline: true },
          { name: "⚔️ Team", value: teamLine, inline: true },
        )
        .setFooter({ text: `SeorinTCG · Use the buttons below to edit your profile` });

      if (user.bio) embed.setDescription(`*"${user.bio}"*`);

      return embed;
    }

    const embed      = await buildEmbed();
    const components = isSelf ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prof_bio").setLabel("✏️ Bio").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("prof_username").setLabel("📝 Username").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("prof_favorite").setLabel("🌟 Favorite Card").setStyle(ButtonStyle.Secondary),
    )] : [];

    const msg = await interaction.editReply({ embeds: [embed], components });
    if (!isSelf) return;

    async function refresh() {
      user = await User.findOne({ userId: interaction.user.id });
      const e2 = await buildEmbed();
      await interaction.editReply({ embeds: [e2], components });
    }

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        // ── Bio ─────────────────────────────────────────────────────────────
        if (i.customId === "prof_bio") {
          const modal = new ModalBuilder().setCustomId("prof_modal_bio").setTitle("Edit Bio");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("bio").setLabel("Your bio (max 150 chars)")
              .setStyle(TextInputStyle.Paragraph).setMaxLength(150).setRequired(false)
              .setPlaceholder("Write something about yourself...").setValue(user.bio || "")
          ));
          await i.showModal(modal);
          try {
            const mi = await i.awaitModalSubmit({ filter: m => m.customId === "prof_modal_bio" && m.user.id === interaction.user.id, time: 300_000 });
            await mi.deferUpdate();
            await User.findOneAndUpdate({ userId: interaction.user.id }, { bio: mi.fields.getTextInputValue("bio").trim() || null });
            await refresh();
          } catch {}
          return;
        }

        // ── Username ─────────────────────────────────────────────────────────
        if (i.customId === "prof_username") {
          const modal = new ModalBuilder().setCustomId("prof_modal_name").setTitle("Change Username");
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("username").setLabel("New username (2–24 chars)")
              .setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(24).setRequired(true)
              .setValue(user.username)
          ));
          await i.showModal(modal);
          try {
            const mi = await i.awaitModalSubmit({ filter: m => m.customId === "prof_modal_name" && m.user.id === interaction.user.id, time: 300_000 });
            await mi.deferUpdate();
            await User.findOneAndUpdate({ userId: interaction.user.id }, { username: mi.fields.getTextInputValue("username").trim() });
            await refresh();
          } catch {}
          return;
        }

        // ── Favorite Card ────────────────────────────────────────────────────
        if (i.customId === "prof_favorite") {
          await i.deferUpdate();
          const playerCards = await PlayerCard.find({ userId: interaction.user.id, quantity: { $gt: 0 } }).limit(100);
          if (!playerCards.length) {
            await interaction.followUp({ content: "You don't own any cards yet.", ephemeral: true });
            return;
          }
          const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
          const cards   = await Card.find({ cardId: { $in: cardIds } });
          const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

          const sorted = playerCards
            .filter(pc => cardMap[pc.cardId])
            .sort((a, b) => (RARITY_ORDER[cardMap[a.cardId]?.rarity] ?? 9) - (RARITY_ORDER[cardMap[b.cardId]?.rarity] ?? 9))
            .slice(0, 24);

          const options = [
            new StringSelectMenuOptionBuilder().setLabel("Clear favorite").setDescription("Remove favorite card").setValue("clear"),
            ...sorted.map(pc => {
              const card = cardMap[pc.cardId];
              return new StringSelectMenuOptionBuilder()
                .setLabel(`${card.name} — Lv.${pc.level ?? 1}`.slice(0, 100))
                .setDescription(`${card.anime} · ${card.rarity}`.slice(0, 100))
                .setValue(pc._id.toString());
            }),
          ];

          const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId("prof_fav_select").setPlaceholder("Choose your favorite card...").addOptions(options)
          );
          await interaction.editReply({ components: [selectRow] });

          try {
            const sel = await msg.awaitMessageComponent({
              filter: s => s.user.id === interaction.user.id && s.customId === "prof_fav_select",
              componentType: ComponentType.StringSelect, time: 60_000,
            });
            await sel.deferUpdate();
            if (sel.values[0] === "clear") {
              await User.findOneAndUpdate({ userId: interaction.user.id }, { favoriteCardId: null });
            } else {
              const favPc = await PlayerCard.findById(sel.values[0]);
              if (favPc) await User.findOneAndUpdate({ userId: interaction.user.id }, { favoriteCardId: favPc._id });
            }
          } catch {}
          await refresh();
        }
      } catch (err) { console.error("[profile]", err); }
    });

    collector.on("end", () => { interaction.editReply({ components: [] }).catch(() => {}); });
  },
};
