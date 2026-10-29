const STORAGE_KEY = "diario-inglese-v2";
const SENTENCES_KEY = `${STORAGE_KEY}:sentences`;

// Who can do what, depending on whose diary is open.
//   local    — no online account, everything on this computer
//   solo     — your own diary, nobody corrects it
//   student  — your own diary, your teacher writes the Italian sentences and corrections
//   teaching — the teacher looking at a student's diary
const PERMISSIONS = {
  local: { words: "edit", it: "edit", en: "edit", fix: "hidden" },
  solo: { words: "edit", it: "edit", en: "edit", fix: "hidden" },
  student: { words: "edit", it: "read", en: "edit", fix: "read" },
  teaching: { words: "read", it: "edit", en: "read", fix: "edit" },
};

const READ_ONLY_PLACEHOLDERS = {
  words: { en: "No word yet", it: "" },
  sentences: { it: "No sentence yet", en: "Not translated yet", fix: "" },
};

const state = {
  date: todayKey(),
  view: "diary",
  mode: "local",
  owner: null,
  ownerName: "",
  data: loadJSON(STORAGE_KEY),
  sentences: loadJSON(SENTENCES_KEY),
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  reviewTabLabel: document.getElementById("review-tab-label"),
  heroEyebrow: document.getElementById("hero-eyebrow"),
  heroDate: document.getElementById("hero-date"),
  heroScore: document.getElementById("hero-score"),
  heroTitle: document.getElementById("hero-title"),
  heroSub: document.getElementById("hero-sub"),
  dayView: document.getElementById("day-view"),
  reviewView: document.getElementById("review-view"),
  rulesView: document.getElementById("rules-view"),
  total: document.getElementById("total-number"),
  bigDay: document.getElementById("big-day"),
  bigWeekday: document.getElementById("big-weekday"),
  bigMonth: document.getElementById("big-month"),
  prev: document.getElementById("prev-day"),
  next: document.getElementById("next-day"),
  today: document.getElementById("today-btn"),
  progressCount: document.getElementById("progress-count"),
  progressSize: document.getElementById("progress-size"),
  progressLabel: document.getElementById("progress-label"),
  progressFill: document.getElementById("progress-fill"),
  saved: document.getElementById("saved"),
  week: document.getElementById("week"),
  streak: document.getElementById("streak-number"),
  days: document.getElementById("days-number"),
  words: document.getElementById("words"),
  sentences: document.getElementById("sentences"),
};

const hooks = { onChange: null, onProgress: null };

const lists = {
  diary: {
    kind: "words",
    store: "data",
    storageKey: STORAGE_KEY,
    el: els.words,
    template: document.getElementById("word-template"),
    size: 5,
    fields: ["en", "it"],
    isDone: hasWord,
    progress: (n, size) => (n >= size ? "Day complete — well done!" : `${size - n} ${size - n === 1 ? "word" : "words"} to go`),
    score: (n, size) => `${n} of ${size} words`,
  },
  sentences: {
    kind: "sentences",
    store: "sentences",
    storageKey: SENTENCES_KEY,
    el: els.sentences,
    template: document.getElementById("sentence-template"),
    size: 5,
    fields: ["it", "en", "fix"],
    isDone: (e) => Boolean(e?.it?.trim() && e?.en?.trim()),
    progress: (n, size) => (n >= size ? "All sentences translated!" : `${size - n} to translate`),
    score: (n, size) => `${n} of ${size} translated`,
  },
};

function heroFor(view) {
  const teaching = state.mode === "teaching";
  const name = state.ownerName;
  const texts = {
    diary: teaching
      ? { eyebrow: `${name}'s words`, title: `${name}'s <em>words.</em>`, sub: `The English words ${name} wrote on this day.` }
      : { eyebrow: "Words of the Day", title: "Five new <em>words.</em>", sub: "Five English words a day, each with its meaning. Small steps, every single day." },
    sentences: teaching
      ? { eyebrow: "Homework", title: "Five <em>sentences.</em>", sub: `Write five sentences in Italian for ${name}, then correct the English translations.` }
      : state.mode === "student"
        ? { eyebrow: "Homework", title: "Five <em>sentences.</em>", sub: "Translate today's sentences into English. Corrections appear under each one." }
        : { eyebrow: "Sentences of the Day", title: "Five <em>sentences.</em>", sub: "Write a sentence in Italian, then translate it into English." },
    review: teaching
      ? { eyebrow: "Review statistics", title: `${name}'s <em>progress.</em>`, sub: `How ${name}'s daily flashcard reviews are going.` }
      : { eyebrow: "Daily Review", title: "Flip the <em>cards.</em>", sub: "Read the Italian word, say it in English, then flip the card to check." },
    rules: { eyebrow: teaching ? `${name}'s English notes` : "English notes", title: "Useful <em>rules.</em>", sub: "Clear explanations and examples to help new English rules stick." },
  };
  return texts[view];
}

function todayKey() {
  return toKey(new Date());
}

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDate(key, days) {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

function loadJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function keyFor(base) {
  return state.owner ? `${base}:${state.owner}` : base;
}

let savedTimer;
function flashSaved() {
  els.saved.classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => els.saved.classList.remove("show"), 1200);
}

function hasWord(entry) {
  return Boolean(entry?.en?.trim());
}

function access(list, field) {
  const rules = PERMISSIONS[state.mode];
  return list.kind === "words" ? rules.words : rules[field];
}

function getEntries(list, date = state.date) {
  return state[list.store][date] || [];
}

function countDone(list, date) {
  return getEntries(list, date).filter(list.isDone).length;
}

function writeEntry(list, date, index, field, value) {
  const store = state[list.store];
  const entries = (store[date] ??= []);
  entries[index] = { ...entries[index], [field]: value };

  if (entries.every((e) => !e || list.fields.every((f) => !e[f]?.trim()))) {
    delete store[date];
  }
  localStorage.setItem(keyFor(list.storageKey), JSON.stringify(store));
}

function setEntry(list, index, field, value) {
  writeEntry(list, state.date, index, field, value);
  hooks.onChange?.(list, state.date, index, field, value);
  flashSaved();
}

function replaceStore(list, store) {
  state[list.store] = store;
  localStorage.setItem(keyFor(list.storageKey), JSON.stringify(store));
}

function updateFixBox(row) {
  const fix = row.querySelector(".fix");
  if (!fix) return;
  const rule = access(lists.sentences, "fix");
  const hasFix = Boolean(fix.value.trim());
  const hasTranslation = Boolean(row.querySelector(".en").value.trim());
  row.querySelector(".fix-box").hidden =
    rule === "hidden" || (rule === "read" && !hasFix) || (rule === "edit" && !hasFix && !hasTranslation);
}

function refreshInputs() {
  for (const list of Object.values(lists)) {
    const entries = getEntries(list);
    list.el.querySelectorAll(".row").forEach((row, i) => {
      for (const field of list.fields) {
        const input = row.querySelector(`.${field}`);
        const value = entries[i]?.[field] || "";
        if (input !== document.activeElement && input.value !== value) input.value = value;
      }
      updateFixBox(row);
    });
  }
  resizeAll();
  renderProgress();
}

// Updates a field changed on another computer without disturbing the one being typed in.
function applyRemoteEntry(list, date, index, field, value) {
  writeEntry(list, date, index, field, value);
  if (date !== state.date) return;

  const row = list.el.querySelectorAll(".row")[index];
  const input = row?.querySelector(`.${field}`);
  if (input && input !== document.activeElement && input.value !== value) {
    input.value = value;
    if (input.tagName === "TEXTAREA") autoResize(input);
  }
  if (row) updateFixBox(row);
}

function countWords() {
  return Object.values(state.data).reduce((sum, entries) => sum + entries.filter(hasWord).length, 0);
}

function isActiveDay(date) {
  return countDone(lists.diary, date) > 0 || countDone(lists.sentences, date) > 0;
}

function activeDays() {
  const dates = new Set([...Object.keys(state.data), ...Object.keys(state.sentences)]);
  return [...dates].filter(isActiveDay).length;
}

function streak() {
  let day = todayKey();
  if (!isActiveDay(day)) day = shiftDate(day, -1);
  let n = 0;
  while (isActiveDay(day)) {
    n++;
    day = shiftDate(day, -1);
  }
  return n;
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function resizeAll() {
  document.querySelectorAll(".rows textarea").forEach(autoResize);
}

function renderHero() {
  const hero = heroFor(state.view);
  els.heroEyebrow.textContent = hero.eyebrow;
  els.heroTitle.innerHTML = hero.title;
  els.heroSub.textContent = hero.sub;
  els.heroDate.textContent = fromKey(state.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  els.reviewTabLabel.textContent = state.mode === "teaching" ? "Progress" : "Review";

  const list = lists[state.view];
  els.heroScore.textContent = list ? list.score(countDone(list, state.date), list.size) : "";
}

function renderDate() {
  const d = fromKey(state.date);
  els.bigDay.textContent = d.getDate();
  els.bigWeekday.textContent = d.toLocaleDateString("en-GB", { weekday: "long" });
  els.bigMonth.textContent = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  els.next.disabled = state.date >= todayKey();
  els.today.style.visibility = state.date === todayKey() ? "hidden" : "visible";
}

function renderWeek() {
  const today = todayKey();
  const end = state.date > shiftDate(today, -7) ? today : shiftDate(state.date, 3);
  const list = lists[state.view] || lists.diary;
  els.week.innerHTML = "";

  for (let i = 6; i >= 0; i--) {
    const key = shiftDate(end, -i);
    const d = fromKey(key);
    const done = countDone(list, key);

    const btn = document.createElement("button");
    btn.className = "day-cell";
    btn.classList.toggle("active", key === state.date);
    btn.classList.toggle("partial", done > 0 && done < list.size);
    btn.classList.toggle("complete", done >= list.size);
    btn.disabled = key > today;
    btn.title = `${done} of ${list.size}`;
    btn.addEventListener("click", () => goTo(key));

    const week = document.createElement("span");
    week.className = "dc-week";
    week.textContent = d.toLocaleDateString("en-GB", { weekday: "short" });
    const num = document.createElement("span");
    num.className = "dc-num";
    num.textContent = d.getDate();
    const dot = document.createElement("span");
    dot.className = "dc-dot";

    btn.append(week, num, dot);
    const li = document.createElement("li");
    li.appendChild(btn);
    els.week.appendChild(li);
  }
}

function renderProgress() {
  els.total.textContent = countWords();
  els.streak.textContent = streak();
  els.days.textContent = activeDays();
  hooks.onProgress?.();

  for (const list of Object.values(lists)) {
    const entries = getEntries(list);
    list.el.querySelectorAll(".row").forEach((row, i) => {
      row.classList.toggle("done", list.isDone(entries[i]));
    });
  }

  const list = lists[state.view];
  if (!list) return;
  const done = countDone(list, state.date);
  els.progressCount.textContent = done;
  els.progressSize.textContent = `/${list.size}`;
  els.progressLabel.textContent = list.progress(done, list.size);
  els.progressFill.style.width = `${Math.min(done / list.size, 1) * 100}%`;
  renderHero();
  renderWeek();
}

function renderList(list) {
  const entries = getEntries(list);
  list.el.innerHTML = "";

  for (let i = 0; i < list.size; i++) {
    const row = list.template.content.firstElementChild.cloneNode(true);
    const entry = entries[i] || {};
    row.querySelector(".row-num").textContent = String(i + 1).padStart(2, "0");

    for (const field of list.fields) {
      const input = row.querySelector(`.${field}`);
      const rule = access(list, field);
      input.value = entry[field] || "";

      if (rule === "read") {
        input.readOnly = true;
        input.tabIndex = -1;
        input.classList.add("readonly");
        input.placeholder = READ_ONLY_PLACEHOLDERS[list.kind][field];
        continue;
      }

      input.addEventListener("input", () => {
        setEntry(list, i, field, input.value);
        if (input.tagName === "TEXTAREA") autoResize(input);
        renderProgress();
      });
    }

    updateFixBox(row);
    list.el.appendChild(row);
  }
}

function render() {
  renderDate();
  Object.values(lists).forEach(renderList);
  renderHero();
  renderProgress();
  resizeAll();
}

function goTo(date) {
  state.date = date;
  render();
}

// Opens a diary: your own, or (for the teacher) a student's.
function setDiary({ owner, mode, name = "" }) {
  state.owner = owner;
  state.mode = mode;
  state.ownerName = name;
  for (const list of Object.values(lists)) {
    state[list.store] = loadJSON(keyFor(list.storageKey));
  }
  reloadReviewStats();
  render();
  switchView(state.view);
}

function switchView(view) {
  state.view = view;
  els.tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  els.dayView.hidden = view === "review" || view === "rules";
  els.reviewView.hidden = view !== "review";
  els.rulesView.hidden = view !== "rules";
  for (const [name, list] of Object.entries(lists)) {
    list.el.closest(".list").hidden = name !== view;
  }

  renderHero();
  if (view === "review") {
    renderReviewTab();
  } else {
    renderProgress();
    resizeAll();
  }
  updateReviewDot();
}

els.tabs.forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
els.prev.addEventListener("click", () => goTo(shiftDate(state.date, -1)));
els.next.addEventListener("click", () => {
  if (state.date < todayKey()) goTo(shiftDate(state.date, 1));
});
els.today.addEventListener("click", () => goTo(todayKey()));
window.addEventListener("resize", resizeAll);

render();
