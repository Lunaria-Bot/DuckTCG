const logger = require("../utils/logger");

module.exports = {
  name: "clientReady",
  once: true,
  execute(client) {
    logger.info(`TCG Bot ready — logged in as ${client.user.tag}`);
    // Rotating statuses
    const { ActivityType } = require("discord.js");
    const statuses = [
      { text: "Seorin TCG",   type: ActivityType.Playing  },
      { text: "/roll",        type: ActivityType.Playing  },
      { text: "/banners",     type: ActivityType.Playing  },
      { text: "/daily",       type: ActivityType.Playing  },
      { text: "/collection",  type: ActivityType.Playing  },
    ];

    let i = 0;
    const setStatus = () => {
      const s = statuses[i % statuses.length];
      client.user.setActivity(s.text, { type: s.type });
      i++;
    };
    setStatus();
    setInterval(setStatus, 30 * 1000); // rotate every 30s
  },
};
