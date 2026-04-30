const { renderHTML } = require("./renderer");

const RARITY_COLOR = {
  exceptional: "#FFD700",
  special:     "#AB47BC",
  rare:        "#42A5F5",
  common:      "#78909C",
};

const RARITY_LABEL = {
  exceptional: "EX",
  special:     "SP",
  rare:        "R",
  common:      "C",
};

/**
 * Build trade card HTML
 * @param {object} params
 * @param {string} params.title         - "Active Trade" or "Trade Completed"
 * @param {string} params.subtitle      - "Player1 ⇌ Player2"
 * @param {string} params.statusText    - "Awaiting confirmations." or "Status: Completed"
 * @param {object[]} params.sections    - [{ name, status, items, imageUrl }]
 * @param {string} params.footer        - footer text
 */
function buildTradeHTML({ title, subtitle, statusText, sections, footer }) {
  const sectionsHTML = sections.map(s => {
    const itemsHTML = s.items.map(item => `
      <div class="item">
        ${item.rarity ? `<span class="rarity-badge" style="background:${RARITY_COLOR[item.rarity] ?? "#555"}">${RARITY_LABEL[item.rarity] ?? "?"}</span>` : ""}
        <span class="item-name">${item.label}</span>
      </div>
    `).join("");

    return `
      <div class="section">
        <div class="section-left">
          <div class="section-header">
            <span class="player-name">${s.name}</span>
            <span class="status-badge ${s.confirmed ? "confirmed" : "pending"}">
              ${s.confirmed ? "✅ Confirmed" : "⏳ Pending"}
            </span>
          </div>
          <div class="items">
            ${itemsHTML || '<span class="empty">Nothing offered yet</span>'}
          </div>
        </div>
        ${s.avatarUrl ? `<div class="section-img"><img src="${s.avatarUrl}" /></div>` : ""}
      </div>
    `;
  }).join('<div class="divider"></div>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #1e1f22;
    color: #e0e0e0;
    width: 460px;
    padding: 0;
  }
  .card {
    background: #2b2d31;
    border-left: 4px solid #5865f2;
    border-radius: 6px;
    padding: 16px 16px 12px;
    margin: 0;
  }
  .title {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 2px;
  }
  .subtitle {
    font-size: 13px;
    color: #b5bac1;
    margin-bottom: 4px;
  }
  .status-text {
    font-size: 12px;
    color: #b5bac1;
    margin-bottom: 14px;
  }
  .section {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
  }
  .section-left { flex: 1; min-width: 0; }
  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .player-name {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }
  .status-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .status-badge.confirmed { color: #57f287; }
  .status-badge.pending   { color: #fee75c; }
  .items { display: flex; flex-direction: column; gap: 4px; }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #dbdee1;
  }
  .rarity-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    padding: 1px 5px;
    border-radius: 3px;
    min-width: 20px;
    text-align: center;
  }
  .item-name { font-weight: 500; }
  .empty { font-size: 12px; color: #6b6f76; font-style: italic; }
  .section-img {
    width: 64px;
    height: 64px;
    flex-shrink: 0;
    border-radius: 50%;
    overflow: hidden;
    background: #1e1f22;
    border: 2px solid #3f4147;
  }
  .section-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .divider {
    height: 1px;
    background: #3f4147;
    margin: 2px 0;
  }
  .footer {
    font-size: 11px;
    color: #6b6f76;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #3f4147;
  }
</style>
</head>
<body>
<div class="card">
  <div class="title">${title}</div>
  <div class="subtitle">${subtitle}</div>
  <div class="status-text">${statusText}</div>
  ${sectionsHTML}
  <div class="footer">${footer}</div>
</div>
</body>
</html>`;
}

/**
 * Render trade as PNG buffer
 */
async function renderTrade(params) {
  const html = buildTradeHTML(params);
  return renderHTML(html, { width: 460, height: 600 });
}

module.exports = { renderTrade };
