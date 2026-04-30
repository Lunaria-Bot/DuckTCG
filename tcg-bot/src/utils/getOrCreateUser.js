const User = require("../models/User");

async function getOrCreateUser(discordUser) {
  let user = await User.findOne({ userId: discordUser.id });
  if (!user) {
    user = await User.create({
      userId: discordUser.id,
      username: discordUser.username,
    });
  }
  return user;
}

module.exports = { getOrCreateUser };
