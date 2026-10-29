const REVIEW_KEY = `${STORAGE_KEY}:review`;
const CARDS_PER_REVIEW = 50;
const CHART_DAYS = 14;

const reviewHooks = { onAnswer: null, onFinish: null, loadProgress: null };

const review = {
  stats: loadReviewStats(),
  deck: [],
  index: 0,
  known: 0,
  flipped: false,
};

const rv = {
  dot: document.getElementById("review-dot"),
  stage: document.getElementById("review-stage"),
  start: document.getElementById("review-start"),
  intro: document.getElementById("review-intro"),
  startBtn: document.getElementById("review-start-btn"),
  session: document.getElementById("review-session"),
  count: document.getElementById("review-count"),
  score: document.getElementById("review-score"),
  fill: document.getElementById("review-fill"),
  card: document.getElementById("flashcard"),
  front: document.getElementById("flash-front"),
  back: document.getElementById("flash-back"),
  answers: document.getElementById("answer-btns"),
  missedBtn: document.getElementById("missed-btn"),
  knownBtn: document.getElementById("known-btn"),
  done: document.getElementById("review-done"),
  summary: document.getElementById("review-summary"),
  againBtn: document.getElementById("review-again-btn"),
  backBtn: document.getElementById("back-to-diary-btn"),
  dash: document.getElementById("progress-dash"),
  dashStatus: document.getElementById("dash-status"),
  dashStats: document.getElementById("dash-stats"),
  dashChart: document.getElementById("dash-chart"),
  dashSessions: document.getElementById("dash-sessions"),
  dashHard: document.getElementById("dash-hard"),
  tricky: document.getElementById("review-tricky"),
  trickyList: document.getElementById("tricky-list"),
};

function loadReviewStats() {
  try {
    return { lastDate: null, words: {}, ...JSON.parse(localStorage.getItem(keyFor(REVIEW_KEY))) };
  } catch {
    return { lastDate: null, words: {} };
  }
}

function saveReviewStats() {
  localStorage.setItem(keyFor(REVIEW_KEY), JSON.stringify(review.stats));
}

function reloadReviewStats() {
  review.stats = loadReviewStats();
}

function setReviewStats(stats) {
  review.stats = { lastDate: null, words: {}, ...stats };
  saveReviewStats();
}

function allWords() {
  const words = [];
  for (const [date, entries] of Object.entries(state.data)) {
    entries.forEach((entry, i) => {
      if (hasWord(entry) && entry.it?.trim()) words.push({ id: `${date}#${i}`, ...entry });
    });
  }
  return words;
}

function wordById(id) {
  const [date, i] = id.split("#");
  return state.data[date]?.[Number(i)];
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function wordScore(id) {
  const s = review.stats.words[id] || { known: 0, missed: 0 };
  return s.known - s.missed * 2;
}

function buildDeck() {
  const picked = shuffle(allWords())
    .sort((a, b) => wordScore(a.id) - wordScore(b.id))
    .slice(0, CARDS_PER_REVIEW);
  return shuffle(picked);
}

function reviewedToday() {
  return review.stats.lastDate === todayKey();
}

function showPanel(panel) {
  for (const p of [rv.start, rv.session, rv.done]) p.hidden = p !== panel;
}

function renderReviewTab() {
  const teaching = state.mode === "teaching";
  rv.stage.hidden = teaching;
  rv.dash.hidden = !teaching;
  if (teaching) {
    rv.tricky.hidden = true;
    renderProgressDash();
  } else {
    renderReviewStart();
  }
}

function hardFirst(a, b) {
  return b.missed - b.known - (a.missed - a.known) || b.missed - a.missed;
}

// The student's most-missed words, shown only once today's review is done.
function renderTricky() {
  rv.tricky.hidden = state.mode === "teaching" || !reviewedToday();
  if (rv.tricky.hidden) return;

  const words = Object.entries(review.stats.words)
    .map(([id, s]) => ({ word: wordById(id), ...s }))
    .filter((w) => w.missed > 0 && hasWord(w.word))
    .sort(hardFirst)
    .slice(0, 8);

  rv.trickyList.replaceChildren(
    ...(words.length
      ? words.map(({ word, known, missed }) => {
          const row = el("li", "dash-row");
          const name = el("span", "dash-word");
          name.append(el("strong", "", word.en), el("em", "", ` ${word.it || ""}`));
          row.append(name, el("span", "muted", `missed ${missed} · knew ${known}`));
          return row;
        })
      : [el("li", "dash-empty", "No tricky words — you knew them all! 🌟")])
  );
}

function renderReviewStart() {
  const total = allWords().length;
  rv.startBtn.hidden = total === 0;

  if (total === 0) {
    rv.intro.textContent =
      "Write some words in your diary (with their meaning) first, then come back here to review them!";
  } else if (reviewedToday()) {
    rv.intro.textContent = "You've already reviewed today ✓ Want to practise a bit more?";
    rv.startBtn.textContent = "Review again";
  } else {
    const n = Math.min(total, CARDS_PER_REVIEW);
    rv.intro.textContent = `${n} ${n === 1 ? "card" : "cards"} ready. The words you find hardest come up more often.`;
    rv.startBtn.textContent = "Start review";
  }
  showPanel(rv.start);
  renderTricky();
}

function updateReviewDot() {
  rv.dot.hidden = state.mode === "teaching" || reviewedToday() || allWords().length === 0;
}

function startReview() {
  review.deck = buildDeck();
  review.index = 0;
  review.known = 0;
  rv.tricky.hidden = true;
  showPanel(rv.session);
  renderCard();
}

function renderCard() {
  const card = review.deck[review.index];
  const total = review.deck.length;

  review.flipped = false;
  rv.card.classList.remove("flipped");
  rv.answers.classList.remove("visible");

  rv.count.textContent = `Card ${review.index + 1} of ${total}`;
  rv.score.textContent = `${review.known} known`;
  rv.fill.style.width = `${(review.index / total) * 100}%`;

  // Wait for the flip-back animation before swapping text, so the answer isn't revealed.
  setTimeout(() => {
    rv.front.textContent = card.it.trim();
    rv.back.textContent = card.en.trim();
  }, review.index === 0 ? 0 : 250);
}

function flipCard() {
  review.flipped = !review.flipped;
  rv.card.classList.toggle("flipped", review.flipped);
  if (review.flipped) rv.answers.classList.add("visible");
}

function answer(knewIt) {
  if (!review.flipped) return;
  const card = review.deck[review.index];
  const s = (review.stats.words[card.id] ??= { known: 0, missed: 0 });
  knewIt ? s.known++ : s.missed++;
  if (knewIt) review.known++;
  reviewHooks.onAnswer?.(card.id, s);

  review.index++;
  if (review.index >= review.deck.length) {
    finishReview();
  } else {
    saveReviewStats();
    renderCard();
  }
}

function finishReview() {
  review.stats.lastDate = todayKey();
  saveReviewStats();
  updateReviewDot();

  const total = review.deck.length;
  reviewHooks.onFinish?.({ day: todayKey(), total, known: review.known });

  const pct = review.known / total;
  const cheer = pct === 1 ? "Perfect score! 🌟" : pct >= 0.6 ? "Great job! 💪" : "Keep going, practice makes perfect! 📚";
  rv.summary.textContent = `You knew ${review.known} of ${total} words. ${cheer}`;
  rv.fill.style.width = "100%";
  showPanel(rv.done);
  renderTricky();
}

/* ---------- Progress dashboard (teacher looking at a student) ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function percent(known, total) {
  return total ? Math.round((known / total) * 100) : 0;
}

function shortDate(key) {
  return fromKey(key).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function reviewStreak(days) {
  let day = todayKey();
  if (!days.has(day)) day = shiftDate(day, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = shiftDate(day, -1);
  }
  return n;
}

let dashRequest = 0;
async function renderProgressDash() {
  const request = ++dashRequest;
  rv.dashStatus.textContent = "Loading…";
  rv.dashStatus.hidden = false;

  let data = { sessions: [], words: [] };
  try {
    if (reviewHooks.loadProgress) data = await reviewHooks.loadProgress(state.owner);
  } catch (err) {
    console.error(err);
    if (request === dashRequest) rv.dashStatus.textContent = "Couldn't load the statistics — are you online?";
    return;
  }
  if (request !== dashRequest) return;
  rv.dashStatus.hidden = true;

  const { sessions, words } = data;
  const byDay = new Map();
  for (const s of sessions) {
    const d = byDay.get(s.day) || { total: 0, known: 0, count: 0 };
    d.total += s.total;
    d.known += s.known;
    d.count++;
    byDay.set(s.day, d);
  }
  const totalCards = sessions.reduce((n, s) => n + s.total, 0);
  const totalKnown = sessions.reduce((n, s) => n + s.known, 0);
  const lastDay = sessions.length ? sessions[sessions.length - 1].day : null;
  const mastered = words.filter((w) => w.known - w.missed >= 3).length;
  const struggling = words.filter((w) => w.missed > w.known).length;

  const cards = [
    [sessions.length, "Reviews done"],
    [`${percent(totalKnown, totalCards)}%`, "Overall accuracy"],
    [reviewStreak(new Set(byDay.keys())), "Review streak (days)"],
    [lastDay ? (lastDay === todayKey() ? "Today" : shortDate(lastDay)) : "—", "Last review"],
    [mastered, "Words mastered"],
    [struggling, "Words to practise"],
  ];
  rv.dashStats.replaceChildren(
    ...cards.map(([value, label]) => {
      const card = el("div", "dash-stat");
      card.append(el("span", "dash-stat-num", String(value)), el("span", "dash-stat-label", label));
      return card;
    })
  );

  const bars = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const key = shiftDate(todayKey(), -i);
    const d = byDay.get(key);
    const pct = d ? percent(d.known, d.total) : 0;
    const col = el("div", "bar-col");
    col.title = d ? `${shortDate(key)}: ${d.known} of ${d.total} (${pct}%)` : `${shortDate(key)}: no review`;
    const track = el("div", "bar-track");
    const bar = el("div", d ? "bar" : "bar empty");
    bar.style.height = d ? `${Math.max(pct, 4)}%` : "4%";
    track.appendChild(bar);
    col.append(el("span", "bar-value", d ? `${pct}%` : ""), track, el("span", "bar-label", fromKey(key).getDate()));
    bars.push(col);
  }
  rv.dashChart.replaceChildren(...bars);

  const recent = sessions.slice(-10).reverse();
  rv.dashSessions.replaceChildren(
    ...(recent.length
      ? recent.map((s) => {
          const row = el("li", "dash-row");
          row.append(
            el("span", "", shortDate(s.day)),
            el("span", "muted", `${s.known} of ${s.total} cards`),
            el("span", "dash-pct", `${percent(s.known, s.total)}%`)
          );
          return row;
        })
      : [el("li", "dash-empty", `No reviews yet. ${state.ownerName}'s sessions will appear here.`)])
  );

  const hard = words
    .filter((w) => w.missed > 0 && wordById(w.word_id))
    .sort(hardFirst)
    .slice(0, 8);
  rv.dashHard.replaceChildren(
    ...(hard.length
      ? hard.map((w) => {
          const word = wordById(w.word_id);
          const row = el("li", "dash-row");
          const name = el("span", "dash-word");
          name.append(el("strong", "", word.en), el("em", "", ` ${word.it || ""}`));
          row.append(name, el("span", "muted", `missed ${w.missed} · knew ${w.known}`));
          return row;
        })
      : [el("li", "dash-empty", "No difficult words yet.")])
  );
}

rv.startBtn.addEventListener("click", startReview);
rv.againBtn.addEventListener("click", startReview);
rv.backBtn.addEventListener("click", () => switchView("diary"));
rv.card.addEventListener("click", flipCard);
rv.missedBtn.addEventListener("click", () => answer(false));
rv.knownBtn.addEventListener("click", () => answer(true));
els.words.addEventListener("input", updateReviewDot);

document.addEventListener("keydown", (e) => {
  if (rv.session.hidden || els.reviewView.hidden || rv.stage.hidden) return;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    flipCard();
  } else if (e.key === "ArrowLeft") {
    answer(false);
  } else if (e.key === "ArrowRight") {
    answer(true);
  }
});

updateReviewDot();
