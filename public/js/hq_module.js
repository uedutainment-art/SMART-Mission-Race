function initHQModule(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;

  const TEAMS = ["Team1", "Team2", "Team3", "Team4", "Team5", "Team6"];
  const MISSIONS = 9;

  c.style.display = "grid";
  c.style.gridTemplateColumns = "repeat(3, 1fr)";
  c.style.gap = "15px";
  c.style.justifyItems = "center";
  c.style.padding = "10px";

  TEAMS.forEach((team) => {
    const card = document.createElement("div");
    card.className = "hq-card";
    card.style.cssText = `
      background: rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 10px;
      width: 220px;
      text-align: center;
      color: white;
      box-shadow: 0 0 10px rgba(0,0,0,0.4);
    `;
    card.innerHTML = `
      <h4 style="margin:5px 0;">${team}</h4>
      <div class="mission-progress" style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:8px;"></div>
    `;
    const grid = card.querySelector(".mission-progress");

    for (let i = 1; i <= MISSIONS; i++) {
      const box = document.createElement("div");
      box.className = "hq-mission-box";
      box.style.cssText = `
        width: 50px; height: 50px;
        background: #1c1c1c;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: #777;
        cursor: pointer;
      `;
      box.textContent = i;
      box.onclick = () => toggleBox(box);
      grid.appendChild(box);
    }
    c.appendChild(card);
  });

  function toggleBox(box) {
    if (box.style.background === "rgb(28, 28, 28)") {
      box.style.background = "#3498db";
      box.style.color = "white";
    } else if (box.style.background === "rgb(52, 152, 219)") {
      box.style.background = "#2ecc71";
      box.style.color = "white";
    } else {
      box.style.background = "#1c1c1c";
      box.style.color = "#777";
    }
  }
}