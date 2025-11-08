export function initMyRankModule({
  elementId = "rankNow",
  totalTeams = 10,
  initialRank = 3,
} = {}) {
  const element = document.getElementById(elementId);
  if (!element) return { update: () => {} };

  function render(rank = initialRank, total = totalTeams) {
    element.textContent = `RANK ${rank} / ${total}`;
  }

  render(initialRank, totalTeams);

  return {
    update: render,
  };
}
