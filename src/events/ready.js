const logger = require("../utils/logger");

module.exports = {
  name: "clientReady",
  once: true,
  execute(client) {
    logger.info(`TCG Bot ready — logged in as ${client.user.tag}`);
    client.user.setActivity("Anime Gacha RPG", { type: 0 });
  },
};
