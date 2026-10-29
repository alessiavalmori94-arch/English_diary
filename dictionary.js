const dict = {
  root: document.getElementById("dict"),
  open: document.getElementById("dict-open"),
  openCount: document.getElementById("dict-open-count"),
  close: document.getElementById("dict-close"),
  title: document.getElementById("dict-title"),
  search: document.getElementById("dict-search"),
  count: document.getElementById("dict-count"),
  list: document.getElementById("dict-list"),
};

function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// One entry per English word + meaning, dated to the first day it was written.
function dictionaryEntries() {
  const seen = new Map();
  for (const date of Object.keys(state.data).sort()) {
    for (const entry of state.data[date]) {
      if (!hasWord(entry)) continue;
      const en = entry.en.trim();
      const it = entry.it?.trim() || "";
      const key = `${normalize(en)}|${normalize(it)}`;
      if (!seen.has(key)) seen.set(key, { en, it, date });
    }
  }
  return [...seen.values()].sort((a, b) => a.en.localeCompare(b.en, "en", { sensitivity: "base" }));
}

function wordCountLabel(n) {
  return `${n} ${n === 1 ? "word" : "words"}`;
}

function updateDictionaryButton() {
  dict.openCount.textContent = wordCountLabel(dictionaryEntries().length);
}

function renderDictionary() {
  const all = dictionaryEntries();
  const query = normalize(dict.search.value);
  const found = query ? all.filter((w) => normalize(w.en).includes(query) || normalize(w.it).includes(query)) : all;

  dict.title.innerHTML = state.mode === "teaching" ? `${state.ownerName}'s <em>words.</em>` : "All your <em>words.</em>";
  dict.count.textContent = query ? `${found.length} of ${wordCountLabel(all.length)}` : wordCountLabel(all.length);

  if (!found.length) {
    const text = all.length ? `No words match “${dict.search.value.trim()}”.` : "No words yet — write the first five in the diary!";
    dict.list.replaceChildren(el("p", "dict-empty", text));
    return;
  }

  const groups = new Map();
  for (const word of found) {
    const first = normalize(word.en).charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(word);
  }

  dict.list.replaceChildren(
    ...[...groups].map(([letter, words]) => {
      const group = el("section", "dict-group");
      const items = el("ul", "dict-items");
      for (const word of words) {
        const row = el("button", "dict-row");
        row.type = "button";
        row.title = "Open this day in the diary";
        row.append(el("span", "dict-en", word.en), el("span", "dict-it", word.it || "—"), el("span", "dict-date", shortDate(word.date)));
        row.addEventListener("click", () => {
          closeDictionary();
          goTo(word.date);
        });
        const li = el("li");
        li.appendChild(row);
        items.appendChild(li);
      }
      group.append(el("h3", "dict-letter", letter), items);
      return group;
    })
  );
}

function openDictionary() {
  dict.search.value = "";
  renderDictionary();
  dict.root.hidden = false;
  document.body.classList.add("no-scroll");
  dict.list.scrollTop = 0;
  // On phones, focusing would pop the keyboard up over the list.
  if (matchMedia("(hover: hover)").matches) dict.search.focus();
}

function closeDictionary() {
  dict.root.hidden = true;
  document.body.classList.remove("no-scroll");
}

dict.open.addEventListener("click", openDictionary);
dict.close.addEventListener("click", closeDictionary);
dict.search.addEventListener("input", renderDictionary);
dict.root.addEventListener("click", (e) => {
  if (e.target === dict.root) closeDictionary();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dict.root.hidden) closeDictionary();
});

hooks.onProgress = () => {
  updateDictionaryButton();
  if (!dict.root.hidden) renderDictionary();
};
updateDictionaryButton();
