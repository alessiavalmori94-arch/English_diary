(() => {
  const { supabaseUrl, supabaseAnonKey } = window.DIARY_CONFIG || {};
  if (!supabaseUrl || !supabaseAnonKey || !window.supabase) return;

  const FLUSH_DELAY = 600;
  const RETRY_DELAY = 5000;
  const PAGE_SIZE = 1000;
  const MIGRATED_KEY = `${STORAGE_KEY}:migrated`;

  const db = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  const byKind = Object.fromEntries(Object.values(lists).map((l) => [l.kind, l]));
  const pendingCells = new Map();
  const pendingWords = new Map();
  let flushTimer;
  let channel;
  let started = false;
  let me = null;
  let students = [];
  let pullRequest = 0;
  let rulesChannel;
  let rules = [];

  const ui = {
    login: document.getElementById("login"),
    form: document.getElementById("login-form"),
    email: document.getElementById("login-email"),
    password: document.getElementById("login-password"),
    submit: document.getElementById("login-submit"),
    error: document.getElementById("login-error"),
    status: document.getElementById("sync-status"),
    logout: document.getElementById("logout-btn"),
    switcher: document.getElementById("diary-switch"),
    rulesTab: document.getElementById("rules-tab"),
    rulesCopy: document.getElementById("rules-copy"),
    rulesStatus: document.getElementById("rules-status"),
    rulesList: document.getElementById("rules-list"),
  };

  function addText(parent, tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value || "";
    parent.appendChild(element);
    return element;
  }

  function renderRuleSchema(rule, card) {
    const schema = rule.content;
    if (!schema || typeof schema !== "object" || (!schema.intro && !schema.sections?.length)) {
      addText(card, "p", "rule-explanation", rule.explanation);
      if (rule.examples?.trim()) addText(card, "pre", "rule-examples", rule.examples);
      return;
    }

    if (schema.intro) addText(card, "p", "rule-intro", schema.intro);
    for (const [index, section] of (schema.sections || []).entries()) {
      const group = document.createElement("section");
      group.className = `rule-section rule-section-${section.style || "cards"} cols-${section.columns || 2}`;
      const heading = document.createElement("div");
      heading.className = "rule-section-heading";
      addText(heading, "span", "rule-section-number", String(index + 1).padStart(2, "0"));
      addText(heading, "h4", "rule-section-title", section.title);
      group.appendChild(heading);

      const items = document.createElement("div");
      items.className = "rule-card-grid";
      for (const item of section.items || []) {
        const tile = document.createElement("div");
        tile.className = `rule-tile ${item.tone ? `tone-${item.tone}` : ""}`;
        if (item.label) addText(tile, "span", "rule-tile-label", item.label);
        addText(tile, "h5", "rule-tile-title", item.title);
        if (item.formula) addText(tile, "div", "rule-formula", item.formula);
        if (item.description) addText(tile, "p", "rule-tile-description", item.description);
        for (const example of item.examples || []) {
          const exampleBox = document.createElement("div");
          exampleBox.className = "rule-example-pair";
          addText(exampleBox, "p", "rule-example-en", example.en);
          if (example.it) addText(exampleBox, "p", "rule-example-it", example.it);
          tile.appendChild(exampleBox);
        }
        items.appendChild(tile);
      }
      group.appendChild(items);
      if (section.note) addText(group, "p", "rule-note", section.note);
      card.appendChild(group);
    }
    if (schema.takeaway) addText(card, "p", "rule-takeaway", schema.takeaway);
  }

  function renderRules() {
    ui.rulesTab.hidden = !me || !(state.mode === "student" || state.mode === "teaching");
    ui.rulesCopy.textContent = "Each rule gets its own visual guide, made to fit what you are learning.";
    ui.rulesList.replaceChildren();

    if (!rules.length) {
      const empty = document.createElement("div");
      empty.className = "rules-empty";
      addText(empty, "span", "rules-empty-mark", "✳");
      addText(empty, "h3", "rules-empty-title", "Your rulebook starts here.");
      addText(empty, "p", "rules-empty-copy", "When we create a new rule together, its own visual guide will appear here.");
      ui.rulesList.appendChild(empty);
      return;
    }

    for (const rule of rules) {
      const card = document.createElement("article");
      card.className = `rule-card${rule.content?.theme ? ` theme-${rule.content.theme}` : ""}`;
      const number = document.createElement("span");
      number.className = "rule-number";
      number.textContent = String(rules.indexOf(rule) + 1).padStart(2, "0");
      const content = document.createElement("div");
      content.className = "rule-content";
      const title = document.createElement("h3");
      title.className = "rule-card-title";
      title.textContent = rule.title;
      content.appendChild(title);
      card.append(number, content);
      renderRuleSchema(rule, content);
      ui.rulesList.appendChild(card);
    }
  }

  async function pullRules() {
    if (!me || !state.owner || !ui.rulesList) return;
    const owner = state.owner;
    const { data, error } = await db.from("rules")
      .select("id, owner, title, explanation, examples, content, created_at, updated_at")
      .eq("owner", owner)
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      ui.rulesStatus.textContent = "Rules could not be loaded. Check that the Rules table is set up in Supabase.";
      return;
    }
    if (owner !== state.owner) return;
    rules = data || [];
    ui.rulesStatus.textContent = "";
    renderRules();
  }

  function setStatus(kind, text) {
    ui.status.hidden = false;
    ui.status.className = `sync-status ${kind}`;
    ui.status.textContent = text;
  }

  function cellKey(c) {
    return `${c.owner}|${c.kind}|${c.day}|${c.idx}|${c.field}`;
  }

  async function fetchAll(table, columns, owner, order) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .eq("owner", owner)
        .order(order)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE_SIZE) return rows;
    }
  }

  // Words written on this computer before accounts existed are uploaded once into your own diary.
  function legacyCells(owner) {
    if (localStorage.getItem(MIGRATED_KEY)) return [];
    const stores = { words: loadJSON(STORAGE_KEY), sentences: loadJSON(SENTENCES_KEY) };
    const cells = [];
    for (const list of Object.values(lists)) {
      for (const [day, entries] of Object.entries(stores[list.kind])) {
        entries.forEach((entry, idx) => {
          for (const field of ["en", "it"]) {
            const value = entry?.[field];
            if (value?.trim()) cells.push({ owner, kind: list.kind, day, idx, field, value });
          }
        });
      }
    }
    return cells;
  }

  async function pull() {
    const owner = state.owner;
    const request = ++pullRequest;
    setStatus("pending", "Syncing…");
    try {
      let rows = await fetchAll("cells", "kind, day, idx, field, value", owner, "day");

      if (owner === me.id) {
        const legacy = legacyCells(owner);
        if (legacy.length && rows.length === 0) {
          const { error } = await db.from("cells").upsert(legacy);
          if (error) throw error;
          rows = legacy;
        }
        localStorage.setItem(MIGRATED_KEY, "1");
        await pullOwnReviewStats();
      }
      if (request !== pullRequest || owner !== state.owner) return;

      const stores = Object.fromEntries(Object.values(lists).map((l) => [l.kind, {}]));
      const put = (c) => {
        const store = stores[c.kind];
        if (!store) return;
        const entries = (store[c.day] ??= []);
        entries[c.idx] = { ...entries[c.idx], [c.field]: c.value };
      };
      rows.forEach(put);
      for (const c of pendingCells.values()) if (c.owner === owner) put(c);

      for (const list of Object.values(lists)) replaceStore(list, stores[list.kind]);
      refreshInputs();
      updateReviewDot();
      if (!els.reviewView.hidden && state.mode !== "teaching" && rv.session.hidden) renderReviewStart();
      if (!pendingCells.size) setStatus("ok", "Synced");
    } catch (err) {
      console.error(err);
      setStatus("error", "Offline");
    }
  }

  async function pullOwnReviewStats() {
    const [words, last] = await Promise.all([
      fetchAll("review_words", "word_id, known, missed", me.id, "word_id"),
      db.from("review_sessions").select("day").eq("owner", me.id).order("day", { ascending: false }).limit(1),
    ]);
    if (last.error) throw last.error;
    if (state.owner !== me.id) return;

    const local = review.stats.words;
    const merged = {};
    for (const w of words) merged[w.word_id] = { known: w.known, missed: w.missed };
    for (const [id, s] of pendingWords) merged[id] = s;
    for (const [id, s] of Object.entries(local)) merged[id] ??= s;

    const remoteLast = last.data[0]?.day || null;
    const lastDate = [remoteLast, review.stats.lastDate].filter(Boolean).sort().pop() || null;
    setReviewStats({ lastDate, words: merged });
  }

  async function loadProgress(owner) {
    const [sessions, words] = await Promise.all([
      fetchAll("review_sessions", "day, total, known, created_at", owner, "created_at"),
      fetchAll("review_words", "word_id, known, missed", owner, "word_id"),
    ]);
    return { sessions, words };
  }

  async function flush() {
    clearTimeout(flushTimer);
    if (!pendingCells.size && !pendingWords.size) return;

    const cells = [...pendingCells.values()];
    const words = [...pendingWords.entries()];
    pendingCells.clear();
    pendingWords.clear();
    setStatus("pending", "Saving…");

    const now = new Date().toISOString();
    const results = await Promise.all([
      cells.length ? db.from("cells").upsert(cells.map((c) => ({ ...c, updated_at: now }))) : { error: null },
      words.length
        ? db.from("review_words").upsert(words.map(([word_id, s]) => ({ owner: me.id, word_id, ...s, updated_at: now })))
        : { error: null },
    ]);

    const [cellResult, wordResult] = results;
    if (cellResult.error) for (const c of cells) if (!pendingCells.has(cellKey(c))) pendingCells.set(cellKey(c), c);
    if (wordResult.error) for (const [id, s] of words) if (!pendingWords.has(id)) pendingWords.set(id, s);

    if (cellResult.error || wordResult.error) {
      console.error(cellResult.error || wordResult.error);
      setStatus("error", "Offline — will retry");
      flushTimer = setTimeout(flush, RETRY_DELAY);
      return;
    }
    if (!pendingCells.size && !pendingWords.size) setStatus("ok", "Synced");
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_DELAY);
  }

  function queueCell(list, day, idx, field, value) {
    const cell = { owner: state.owner, kind: list.kind, day, idx, field, value };
    pendingCells.set(cellKey(cell), cell);
    scheduleFlush();
  }

  function queueReviewWord(id, s) {
    pendingWords.set(id, { known: s.known, missed: s.missed });
    scheduleFlush();
  }

  async function saveSession(session) {
    await flush();
    const { error } = await db.from("review_sessions").insert({ owner: me.id, ...session });
    if (error) {
      console.error(error);
      setStatus("error", "Couldn't save this review");
    }
  }

  function onRemoteChange(payload) {
    const row = payload.new;
    const list = byKind[row?.kind];
    if (!list || row.owner !== state.owner || pendingCells.has(cellKey(row))) return;

    applyRemoteEntry(list, row.day, row.idx, row.field, row.value);
    if (state.view === "review") updateReviewDot();
    else renderProgress();
  }

  function subscribe() {
    channel?.unsubscribe();
    channel = db
      .channel("cells")
      .on("postgres_changes", { event: "*", schema: "public", table: "cells" }, onRemoteChange)
      .subscribe();
  }

  function renderSwitcher() {
    ui.switcher.hidden = students.length === 0;
    const options = [{ id: me.id, label: "My diary" }, ...students.map((s) => ({ id: s.id, label: s.name }))];
    ui.switcher.replaceChildren(
      ...options.map((o) => {
        const btn = document.createElement("button");
        btn.className = "switch-btn";
        btn.classList.toggle("active", o.id === state.owner);
        btn.textContent = o.label;
        btn.addEventListener("click", () => openDiary(o.id));
        return btn;
      })
    );
  }

  async function openDiary(owner) {
    if (owner === state.owner) return;
    await flush();
    const student = students.find((s) => s.id === owner);
    if (student) setDiary({ owner, mode: "teaching", name: student.name });
    else setDiary({ owner: me.id, mode: me.role === "student" ? "student" : "solo", name: me.name });
    if (state.view === "rules" && state.mode !== "student" && state.mode !== "teaching") switchView("diary");
    rules = [];
    renderSwitcher();
    renderRules();
    pull();
    pullRules();
  }

  async function loadProfiles(userId) {
    const { data, error } = await db.from("profiles").select("id, name, role, teacher_id");
    if (error) {
      console.error(error);
      return { me: { id: userId, name: "", role: "solo" }, students: [] };
    }
    const mine = data.find((p) => p.id === userId) || { id: userId, name: "", role: "solo" };
    return { me: mine, students: data.filter((p) => p.teacher_id === userId) };
  }

  function showLogin(show) {
    ui.login.hidden = !show;
    ui.logout.hidden = show;
    if (show) {
      ui.status.hidden = true;
      ui.switcher.hidden = true;
      ui.email.focus();
    }
  }

  async function start(session) {
    if (started) return;
    started = true;
    showLogin(false);
    setStatus("pending", "Syncing…");

    ({ me, students } = await loadProfiles(session.user.id));
    setDiary({ owner: me.id, mode: me.role === "student" ? "student" : "solo", name: me.name });
    if (state.view === "rules" && state.mode !== "student") switchView("diary");
    rules = [];
    renderSwitcher();
    renderRules();
    await pull();
    await pullRules();
    subscribe();
    rulesChannel?.unsubscribe();
    rulesChannel = db.channel("rules")
      .on("postgres_changes", { event: "*", schema: "public", table: "rules" }, (payload) => {
        if (payload.new?.owner === state.owner || payload.old?.owner === state.owner) pullRules();
      })
      .subscribe();
  }

  ui.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    ui.error.textContent = "";
    ui.submit.disabled = true;
    ui.submit.textContent = "Signing in…";

    const { error } = await db.auth.signInWithPassword({
      email: ui.email.value.trim(),
      password: ui.password.value,
    });

    ui.submit.disabled = false;
    ui.submit.textContent = "Sign in";
    if (error) {
      ui.error.textContent = "Wrong email or password. Please try again.";
      return;
    }
    ui.password.value = "";
  });

  ui.logout.addEventListener("click", async () => {
    await flush();
    channel?.unsubscribe();
    rulesChannel?.unsubscribe();
    await db.auth.signOut();
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      if (session) setTimeout(() => start(session), 0);
      else showLogin(true);
    } else if (event === "SIGNED_OUT") {
      started = false;
      me = null;
      students = [];
      rules = [];
      rulesChannel?.unsubscribe();
      ui.rulesTab.hidden = true;
      ui.rulesList.replaceChildren();
      showLogin(true);
    }
  });

  hooks.onChange = queueCell;
  reviewHooks.onAnswer = queueReviewWord;
  reviewHooks.onFinish = saveSession;
  reviewHooks.loadProgress = loadProgress;

  window.addEventListener("focus", () => {
    if (started) {
      pull();
      pullRules();
    }
  });
  window.addEventListener("online", () => {
    if (!started) return;
    flush();
    pull();
    pullRules();
  });
  window.addEventListener("beforeunload", (e) => {
    if (!pendingCells.size && !pendingWords.size) return;
    flush();
    e.preventDefault();
  });
})();
