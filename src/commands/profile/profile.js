const {
  SlashCommandBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { requireProfile }    = require("../../utils/requireProfile");
const { renderProfileCard } = require("../../services/profileRenderer");
const { xpToNextLevel }     = require("../../services/levels");
const User                  = require("../../models/User");
const Card                  = require("../../models/Card");
const PlayerCard            = require("../../models/PlayerCard");

const FACTION_LABEL = {
  heavenly_demon: "Heavenly Demon Cult",
  orthodox:       "Orthodox Sect",
};
const FACTION_EMOJI = {
  heavenly_demon: "<:DemonicSect:1497265894550671372>",
  orthodox:       "<:OrthodoxSect:1497266218749530132>",
};
const FACTION_BG_URL = {
  heavenly_demon: process.env.BG_DEMONIC || null,
  orthodox:       process.env.BG_ORTHODOX || null,
};
const RARITY_ORDER = { radiant: -1, exceptional: 0, special: 1, rare: 2, common: 3 };
const BADGE_META = {
  pioneer: "🏅", anniversary_1: "🎂", anniversary_2: "🎂",
  christmas: "🎄", halloween: "🎃",
  collector_1: "📦", collector_2: "📦", collector_3: "📦",
  gold_small_lord: "<:Nyan:1495048966528831508>",
  gold_lord: "<:Nyan:1495048966528831508>",
  gold_king: "👑", gold_emperor: "👑", gold_god: "🌕",
  duck_glock: "🦆", duck_kalash: "🦆", duck_nuclear: "🦆",
};

async function buildProfileData(user, target) {
  const xpNeeded = xpToNextLevel(user.accountLevel);

  let favoriteCard = null;
  if (user.favoriteCardId) {
    const favPc = await PlayerCard.findById(user.favoriteCardId).catch(() => null);
    if (favPc) {
      const card = await Card.findOne({ cardId: favPc.cardId }).catch(() => null);
      if (card) favoriteCard = { name: card.name, anime: card.anime, rarity: card.rarity, imageUrl: card.imageUrl, level: favPc.level };
    }
  }

  let teamCards = [];
  if (user.team && user.team.length > 0) {
    for (const slot of user.team.slice(0, 3)) {
      if (!slot?.playerCardId) { teamCards.push(null); continue; }
      try {
        const pc   = await PlayerCard.findById(slot.playerCardId);
        const card = pc ? await Card.findOne({ cardId: pc.cardId }) : null;
        teamCards.push(card ? { name: card.name, anime: card.anime, rarity: card.rarity, imageUrl: card.imageUrl, level: pc.level } : null);
      } catch { teamCards.push(null); }
    }
  }
  while (teamCards.length < 3) teamCards.push(null);

  const badges = (user.badges || []).map(b => BADGE_META[b.badgeId]).filter(Boolean);

  return {
    username:       user.username,
    avatarUrl:      target.displayAvatarURL({ size: 128, extension: "png" }),
    accountLevel:   user.accountLevel,
    accountExp:     user.accountExp,
    xpNeeded,
    faction:        user.faction,
    factionLabel:   FACTION_LABEL[user.faction],
    factionEmoji:   FACTION_EMOJI[user.faction],
    bio:            user.bio,
    loginStreak:    user.loginStreak ?? 0,
    totalCards:     user.stats?.totalCardsEverObtained ?? 0,
    combatPower:    user.combatPower ?? 0,
    badges,
    favoriteCard,
    teamCards,
    backgroundImageUrl: FACTION_BG_URL[user.faction] ?? null,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile card")
    .addUserOption(opt => opt.setName("user").setDescription("Target player (optional)")),

  async execute(interaction) {
    await interaction.deferReply();

    const profileCheck = await requireProfile(interaction);
    if (!profileCheck) return;

    const target = interaction.options.getUser("user") ?? interaction.user;
    const isSelf = target.id === interaction.user.id;

    let user;
    if (!isSelf) {
      user = await User.findOne({ userId: target.id });
      if (!user) return interaction.editReply({ content: `**${target.username}** doesn't have a profile yet.` });
    } else {
      user = profileCheck;
    }

    const data   = await buildProfileData(user, target);
    const buf    = await renderProfileCard(data);
    const attach = new AttachmentBuilder(buf, { name: "profile.png" });

    const components = isSelf ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prof_bio").setLabel("✏️ Bio").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("prof_username").setLabel("📝 Username").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("prof_favorite").setLabel("🌟 Favorite Card").setStyle(ButtonStyle.Secondary),
    )] : [];

    const msg = await interaction.editReply({ files: [attach], components });
    if (!isSelf) return;

    async function refresh() {
      user = await User.findOne({ userId: interaction.user.id });
      const d2   = await buildProfileData(user, target);
      const buf2 = await renderProfileCard(d2);
      const att2 = new AttachmentBuilder(buf2, { name: "profile.png" });
      await interaction.editReply({ files: [att2], components });
    }

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
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

        if (i.customId === "prof_favorite") {
          await i.deferUpdate();
          const playerCards = await PlayerCard.find({ userId: interaction.user.id, isBurned: false, quantity: { $gt: 0 } }).limit(100);
          if (!playerCards.length) {
            await interaction.followUp({ content: "You don't own any cards yet.", ephemeral: true });
            return;
          }
          const cardIds = [...new Set(playerCards.map(pc => pc.cardId))];
          const cards   = await Card.find({ cardId: { $in: cardIds } });
          const cardMap = Object.fromEntries(cards.map(c => [c.cardId, c]));

          const sorted = playerCards
            .filter(pc => cardMap[pc.cardId])
            .sort((a, b) => (RARITY_ORDER[cardMap[a.cardId]?.rarity] ?? 9) - (RARITY_ORDER[cardMap[b.cardId]?.rarity] ?? 9) || b.level - a.level)
            .slice(0, 24);

          const options = [
            new StringSelectMenuOptionBuilder().setLabel("Clear favorite").setDescription("Remove favorite card").setValue("clear"),
            ...sorted.map(pc => {
              const card = cardMap[pc.cardId];
              return new StringSelectMenuOptionBuilder()
                .setLabel(`${card.name} — Lv.${pc.level}`.slice(0, 100))
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
