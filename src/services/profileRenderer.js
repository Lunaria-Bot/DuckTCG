const { renderHTML, inlineImages } = require("./renderer");

// Faction background images — set via env vars BG_DEMONIC / BG_ORTHODOX
const FACTION_BG_URL = {
  heavenly_demon: process.env.BG_DEMONIC || null,
  orthodox:       process.env.BG_ORTHODOX || null,
};

async function renderProfileCard(data) {
  const {
    username, avatarUrl, accountLevel, accountExp, xpNeeded,
    faction, factionLabel, factionEmoji,
    bio, loginStreak, totalCards, combatPower,
    badges,
    favoriteCard,
    teamCards,
    backgroundImageUrl,
  } = data;

  const RARITY_COLOR = {
    exceptional: "#f59e0b", special: "#8b5cf6",
    rare: "#3b82f6", common: "#6b7280", radiant: "#06b6d4",
  };
  const RARITY_GRADIENT = {
    exceptional: "linear-gradient(135deg,#78350f,#f59e0b)",
    special:     "linear-gradient(135deg,#4c1d95,#8b5cf6)",
    rare:        "linear-gradient(135deg,#1e3a5f,#3b82f6)",
    common:      "linear-gradient(135deg,#1f2937,#6b7280)",
    radiant:     "linear-gradient(135deg,#0c4a6e,#06b6d4)",
  };

  const xpPct = Math.min((accountExp / xpNeeded) * 100, 100).toFixed(1);
  const factionColor = faction === "heavenly_demon" ? "#ef4444" : faction === "orthodox" ? "#3b82f6" : "#8b5cf6";
  const bgUrl = backgroundImageUrl || FACTION_BG_URL[faction] || null;

  const overlayGrad = faction === "heavenly_demon"
    ? "linear-gradient(90deg,rgba(15,3,25,0.88) 0%,rgba(20,5,30,0.65) 50%,rgba(10,3,18,0.75) 100%)"
    : faction === "orthodox"
    ? "linear-gradient(90deg,rgba(3,8,25,0.88) 0%,rgba(5,10,30,0.65) 50%,rgba(3,8,20,0.75) 100%)"
    : "linear-gradient(90deg,rgba(10,5,20,0.88) 0%,rgba(12,8,25,0.65) 50%,rgba(8,5,18,0.75) 100%)";

  function cardSlot(card, isMain) {
    if (!card) {
      if (isMain) return `<div class="main-empty"><div class="empty-icon">+</div><div class="empty-lbl">Set Favorite Card</div></div>`;
      return `<div class="team-empty"><div class="empty-icon">+</div><div class="empty-lbl">Empty</div></div>`;
    }
    const rc = RARITY_COLOR[card.rarity] ?? "#6b7280";
    const rg = RARITY_GRADIENT[card.rarity] ?? RARITY_GRADIENT.common;
    if (isMain) {
      return `<div class="main-card" style="border-color:${rc}55;box-shadow:0 0 30px ${rc}33,0 8px 40px rgba(0,0,0,.8)">
        <div class="main-stripe" style="background:${rg}"></div>
        ${card.imageUrl ? `<img src="${card.imageUrl}" class="main-img"/>` : `<div class="main-img-ph">🌸</div>`}
        <div class="main-info">
          <div class="main-lvl" style="background:${rg}">Lv. ${card.level ?? 1}</div>
          <div class="main-name">${card.name}</div>
          <div class="main-anime">${card.anime}</div>
          <div class="main-rarity" style="color:${rc}">${(card.rarity ?? "").toUpperCase()}</div>
        </div>
      </div>`;
    }
    return `<div class="tcard" style="border-color:${rc}44;box-shadow:0 0 14px ${rc}22">
      <div class="tstripe" style="background:${rg}"></div>
      ${card.imageUrl ? `<img src="${card.imageUrl}" class="timg"/>` : `<div class="timg-ph">🌸</div>`}
      <div class="tfoot">
        <span class="tname">${card.name}</span>
        <span class="tlvl" style="color:${rc}">Lv.${card.level ?? 1}</span>
      </div>
    </div>`;
  }

  const team = Array(3).fill(null).map((_, i) => teamCards?.[i] ?? null);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Outfit:wght@300;400;500;600;700&family=Space+Mono&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:900px;background:transparent;font-family:'Outfit',sans-serif;color:#f0f0ff}
.root{width:900px;min-height:500px;background:linear-gradient(135deg,#0c0c18,#12102a 40%,#0a0a16);border-radius:20px;overflow:hidden;display:flex;position:relative}
.bg{position:absolute;inset:0;background-size:cover;background-position:center 30%;z-index:0}
.overlay{position:absolute;inset:0;z-index:0}
.left{width:260px;flex-shrink:0;background:rgba(0,0,0,.35);border-right:1px solid rgba(139,92,246,.15);display:flex;flex-direction:column;position:relative;z-index:1}
.right{flex:1;padding:20px 20px 20px 22px;display:flex;flex-direction:column;gap:16px;position:relative;z-index:1}
.ltop{padding:22px 18px 14px;display:flex;flex-direction:column;align-items:center;gap:8px;background:linear-gradient(180deg,rgba(88,28,135,.2),transparent)}
.av{width:68px;height:68px;border-radius:50%;border:2px solid rgba(139,92,246,.6);background:linear-gradient(135deg,#7c3aed,#ec4899);display:flex;align-items:center;justify-content:center;font-size:28px;overflow:hidden;box-shadow:0 0 18px rgba(139,92,246,.35)}
.av img{width:100%;height:100%;object-fit:cover}
.uname{font-family:'Cinzel',serif;font-size:17px;font-weight:700;color:#f0f0ff;text-align:center}
.fpill{display:flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;background:${factionColor}15;border:1px solid ${factionColor}44;color:${factionColor}}
.bdg{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}
.bdg span{font-size:15px}
.xpsec{padding:10px 16px 4px}
.xprow{display:flex;justify-content:space-between;margin-bottom:5px;font-size:10px}
.xplbl{color:#7070a0}.xpval{color:#c4b5fd;font-weight:600}
.xpbar{height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden}
.xpfill{height:100%;background:linear-gradient(90deg,#7c3aed,#ec4899);border-radius:2px}
.bio{margin:10px 14px;padding:9px 11px;background:rgba(255,255,255,.03);border:1px solid rgba(139,92,246,.1);border-radius:7px;font-size:10px;color:#6060a0;font-style:italic;line-height:1.5;flex:1}
.stats{padding:6px 16px 10px}
.srow{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px}
.srow:last-child{border-bottom:none}
.slbl{color:#6060a0}.sval{color:#f0f0ff;font-weight:600}
.lfoot{padding:9px 16px;border-top:1px solid rgba(139,92,246,.1);display:flex;justify-content:space-between;align-items:center}
.uid{font-size:9px;color:#3a3a5a;font-family:monospace}
.streak{font-size:11px;color:#f59e0b;font-weight:700}
.shead{display:flex;align-items:center;gap:7px;margin-bottom:10px}
.sicon{font-size:13px}.stitle{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#8b5cf6}
.main-card{width:100%;height:165px;border-radius:10px;border:2px solid;display:flex;overflow:hidden;background:#0a0a16}
.main-stripe{width:4px;flex-shrink:0}
.main-img{width:130px;height:100%;object-fit:cover;flex-shrink:0;display:block}
.main-img-ph{width:130px;height:100%;background:#0d0d20;display:flex;align-items:center;justify-content:center;font-size:36px;opacity:.2;flex-shrink:0}
.main-info{flex:1;padding:14px;display:flex;flex-direction:column;justify-content:flex-end}
.main-lvl{display:inline-flex;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:800;color:#fff;align-self:flex-start;margin-bottom:7px}
.main-name{font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:#f0f0ff;margin-bottom:3px;line-height:1.2}
.main-anime{font-size:11px;color:#7070a0}
.main-rarity{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-top:5px}
.main-empty{width:100%;height:165px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;background:rgba(255,255,255,.02);border:1px dashed rgba(139,92,246,.2);border-radius:10px;color:#3a3a5a;font-size:12px}
.empty-icon{font-size:22px}
.trow{display:flex;gap:10px}
.tcard{flex:1;border-radius:9px;border:2px solid;background:#0a0a16;overflow:hidden}
.tstripe{height:3px}
.timg{width:100%;height:88px;object-fit:cover;display:block}
.timg-ph{height:88px;background:#0d0d20;display:flex;align-items:center;justify-content:center;font-size:26px;opacity:.2}
.tfoot{padding:6px 8px;display:flex;justify-content:space-between;align-items:center}
.tname{font-size:10px;font-weight:600;color:#e0e0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72px}
.tlvl{font-size:9px;font-weight:700;flex-shrink:0}
.team-empty{flex:1;height:114px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;background:rgba(255,255,255,.015);border:1px dashed rgba(139,92,246,.15);border-radius:9px;color:#3a3a5a}
.team-empty .empty-icon{font-size:18px}
.empty-lbl{font-size:10px}
</style></head><body>
<div class="root">
  <div class="bg" style="background-image:${bgUrl ? `url(${bgUrl})` : "none"}"></div>
  <div class="overlay" style="background:${overlayGrad}"></div>
  <div class="left">
    <div class="ltop">
      <div class="av">${avatarUrl ? `<img src="${avatarUrl}"/>` : "🌸"}</div>
      <div class="uname">${username}</div>
      ${faction ? `<div class="fpill">${factionEmoji ?? ""} ${factionLabel ?? faction}</div>` : ""}
      ${badges && badges.length ? `<div class="bdg">${badges.slice(0, 8).map(b => `<span>${b}</span>`).join("")}</div>` : ""}
    </div>
    <div class="xpsec">
      <div class="xprow"><span class="xplbl">Level ${accountLevel}</span><span class="xpval">${accountExp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP</span></div>
      <div class="xpbar"><div class="xpfill" style="width:${xpPct}%"></div></div>
    </div>
    <div class="bio">${bio || "No bio set."}</div>
    <div class="stats">
      <div class="srow"><span class="slbl">Cards Owned</span><span class="sval">${totalCards}</span></div>
      <div class="srow"><span class="slbl">Power Score</span><span class="sval">${combatPower.toLocaleString()}</span></div>
      <div class="srow"><span class="slbl">Login Streak</span><span class="sval">🔥 ${loginStreak}d</span></div>
    </div>
    <div class="lfoot">
      <div class="uid">SeorinTCG</div>
      <div class="streak">🔥 ${loginStreak}d</div>
    </div>
  </div>
  <div class="right">
    <div>
      <div class="shead"><span class="sicon">🌟</span><span class="stitle">Favorite Card</span></div>
      ${cardSlot(favoriteCard, true)}
    </div>
    <div>
      <div class="shead"><span class="sicon">⚔️</span><span class="stitle">Team</span></div>
      <div class="trow">${team.map(c => cardSlot(c, false)).join("")}</div>
    </div>
  </div>
</div>
</body></html>`;

  return await renderHTML(html, { width: 900, height: 500 });
}

module.exports = { renderProfileCard };
