const { renderHTML } = require("./renderer");

function buildProfileHTML({ username, level, expPct, expCurrent, expNeeded, startDate, bio, stats, favoriteCard, avatar }) {
  const barFilled = Math.round(expPct * 100);

  const favoriteHTML = favoriteCard ? `
    <div class="section">
      <div class="section-label">Selected Card</div>
      <div class="fav-name">${favoriteCard.name}</div>
      <div class="fav-sub">${favoriteCard.anime} · ${favoriteCard.rarity.toUpperCase()} · Lv.${favoriteCard.level} · CP ${favoriteCard.cp.toLocaleString()}</div>
      ${favoriteCard.imageUrl ? `<div class="fav-img-wrap"><img class="fav-img" src="${favoriteCard.imageUrl}" /></div>` : ""}
    </div>
  ` : `
    <div class="section">
      <div class="section-label">Selected Card</div>
      <div class="muted">No card selected — use /editprofile favorite</div>
    </div>
  `;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #1e1f22;
    color: #dbdee1;
    width: 420px;
    padding: 0;
  }
  .card {
    background: #2b2d31;
    border-left: 4px solid #b47aff;
    padding: 18px 18px 14px;
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .header-left { flex: 1; }
  .title {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 10px;
  }
  .title-star { color: #f0c040; }
  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 8px;
    object-fit: cover;
    border: 2px solid #3f4147;
    flex-shrink: 0;
    margin-left: 14px;
  }
  .xp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .xp-icon {
    background: #f0c040;
    color: #1e1f22;
    font-size: 10px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: .02em;
  }
  .level-text { font-size: 15px; font-weight: 700; color: #fff; }
  .xp-bar-wrap {
    background: #3f4147;
    border-radius: 999px;
    height: 10px;
    margin-bottom: 5px;
    overflow: hidden;
  }
  .xp-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #7b5ea7, #b47aff);
    width: ${barFilled}%;
  }
  .xp-text { font-size: 12px; color: #b5bac1; margin-bottom: 14px; }
  .xp-pct { color: #dbdee1; font-weight: 600; }
  .divider { height: 1px; background: #3f4147; margin: 10px 0; }
  .section { margin-bottom: 10px; }
  .section-label {
    font-size: 12px;
    font-weight: 700;
    color: #b5bac1;
    text-transform: uppercase;
    letter-spacing: .06em;
    margin-bottom: 4px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .section-value { font-size: 13px; color: #dbdee1; }
  .stat-line {
    font-size: 13px;
    color: #dbdee1;
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .muted { font-size: 12px; color: #6b6f76; font-style: italic; }
  .fav-name { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 2px; }
  .fav-sub  { font-size: 12px; color: #b5bac1; margin-bottom: 10px; }
  .fav-img-wrap {
    border: 2px solid #b47aff;
    border-radius: 8px;
    overflow: hidden;
    display: inline-block;
    width: 160px;
  }
  .fav-img { width: 160px; display: block; }
</style>
</head>
<body>
<div class="card">

  <div class="header">
    <div class="header-left">
      <div class="title"><span class="title-star">✨</span> ${username}'s Profile <span class="title-star">✨</span></div>
      <div class="xp-row">
        <span class="xp-icon">XP</span>
        <span class="level-text">Level ${level}</span>
      </div>
      <div class="xp-bar-wrap"><div class="xp-bar-fill"></div></div>
      <div class="xp-text">XP: <strong>${expCurrent.toLocaleString()} / ${expNeeded.toLocaleString()}</strong> <span class="xp-pct">${Math.round(expPct * 100)}%</span></div>
    </div>
    ${avatar ? `<img class="avatar" src="${avatar}" />` : ""}
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-label">Start Date</div>
    <div class="section-value">${startDate}</div>
  </div>

  ${bio ? `
  <div class="section">
    <div class="section-label">About</div>
    <div class="section-value">${bio}</div>
  </div>
  ` : ""}

  <div class="divider"></div>

  <div class="section">
    <div class="section-label">Stats</div>
    <div class="stat-line">📦 Cards Obtained: <strong>${stats.cards}</strong></div>
    <div class="stat-line">⚔️ Combat Power: <strong>${stats.cp}</strong></div>
    <div class="stat-line">💀 Raids Attacked: <strong>${stats.raids}</strong></div>
    <div class="stat-line">🗺️ Adventures Completed: <strong>${stats.adventures}</strong></div>
    <div class="stat-line">🎰 Total Pulls: <strong>${stats.pulls}</strong></div>
    <div class="stat-line">🔥 Login Streak: <strong>${stats.streak} day${stats.streak !== 1 ? "s" : ""}</strong></div>
  </div>

  <div class="divider"></div>

  ${favoriteHTML}

</div>
</body>
</html>`;
}

async function renderProfile(params) {
  const html = buildProfileHTML(params);
  return renderHTML(html, { width: 420, height: 800 });
}

module.exports = { renderProfile };
