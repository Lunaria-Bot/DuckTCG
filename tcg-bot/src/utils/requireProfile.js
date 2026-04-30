const User = require("../models/User");

/**
 * Checks if the user has a profile.
 * If not, replies with an ephemeral message and returns null.
 * Usage: const user = await requireProfile(interaction);
 *        if (!user) return;
 */
async function requireProfile(interaction) {
  const user = await User.findOne({ userId: interaction.user.id });
  if (!user) {
    const msg = {
      content: "You don't have a profile yet! Use `/register` to create one and claim your welcome rewards.",
      ephemeral: true,
    };
    if (interaction.deferred) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
    return null;
  }
  return user;
}

module.exports = { requireProfile };
