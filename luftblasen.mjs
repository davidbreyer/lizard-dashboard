export const LUFTBLASEN_KEY = 'luftblasen.progress.v1';
export const LUFTBLASEN_DIFFICULTIES = ['Easy', 'Casual', 'Medium', 'Quick', 'Hard'];
const themes = ['classic', 'classical', 'bavarian', 'shamrock', 'boardgame', 'theme1776', 'chess'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const difficulty = value => Number.isInteger(value) && value >= 1 && value <= 5;

// Match the game's scoring-version and completed-run validation.
export function validLuftblasenScore(entry) {
  return record(entry) && entry.scoringVersion === 1 && difficulty(entry.difficulty) && themes.includes(entry.theme) &&
    [entry.score, entry.timePlayedMs, entry.bestStreak, entry.bubblesPopped].every(value => Number.isSafeInteger(value) && value >= 0) &&
    Number.isSafeInteger(entry.round) && entry.round >= 1 && typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date));
}

export function validLuftblasenProgress(value) {
  return record(value) && value.version === 1 && record(value.settings) &&
    Array.isArray(value.scores) && value.scores.length <= 50 && value.scores.every(validLuftblasenScore) &&
    (value.settings.theme === undefined || [...themes, 'random'].includes(value.settings.theme)) &&
    (value.settings.difficulty === undefined || difficulty(value.settings.difficulty)) &&
    ['music', 'pops'].every(key => value.settings[key] === undefined || typeof value.settings[key] === 'boolean');
}

export function luftblasenBests(value) {
  if (value !== null && (!record(value) || value.version !== 1 || !Array.isArray(value.scores))) {
    throw new Error('Unsupported saved progress');
  }
  const scores = (value?.scores ?? []).filter(validLuftblasenScore);
  return LUFTBLASEN_DIFFICULTIES.map((name, index) => ({
    name, best: scores.filter(entry => entry.difficulty === index + 1).sort((a, b) => b.score - a.score)[0] ?? null
  }));
}

export function initLuftblasenCard() {
  const list = document.getElementById('luftblasen-bests');
  const status = document.getElementById('luftblasen-status');
  const formatter = new Intl.NumberFormat();
  function refresh() {
    try {
      const progress = JSON.parse(localStorage.getItem(LUFTBLASEN_KEY));
      const bests = luftblasenBests(progress);
      // The game retains ranked runs, so use the most recent recorded run.
      const latest = progress?.scores.filter(validLuftblasenScore).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
      list.replaceChildren(...bests.map(({ name, best }, index) => {
        const row = document.createElement('div');
        row.classList.toggle('latest-difficulty', latest?.difficulty === index + 1);
        const label = document.createElement('dt');
        const value = document.createElement('dd');
        label.textContent = name;
        value.textContent = best ? formatter.format(best.score) : '—';
        if (!best) value.setAttribute('aria-label', 'No saved score');
        row.append(label, value);
        return row;
      }));
      list.hidden = !bests.some(({ best }) => best);
      status.textContent = list.hidden ? 'No scores saved here yet. Finish a game to set your first personal best.' : 'Personal bests · saved in this browser';
    } catch {
      list.hidden = true;
      status.textContent = 'Saved scores unavailable. Open Luftblasen to check your progress.';
    }
  }
  refresh();
  return { refresh };
}
