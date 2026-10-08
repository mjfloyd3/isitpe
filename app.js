const STATUS = {
  pe_controlled: "PE-controlled",
  pe_backed: "PE-backed",
  vc_backed: "Venture-backed",
  other_owner: "Investor-owned",
  public: "Public chain",
};

const $ = (sel) => document.querySelector(sel);
let brands = [];

// Minimal RFC 4180 CSV parser (handles quoted fields with commas and "").
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || "").trim()])));
}

const splitList = (s) => s.split(";").map((x) => x.trim()).filter(Boolean);

// Lowercase, fold accents, treat "&" as "and", drop punctuation and filler words.
function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|nyc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(brand, q) {
  let best = 0;
  for (const key of brand.keys) {
    if (key === q) return 100;
    if (key.startsWith(q)) best = Math.max(best, 80);
    else if (key.split(" ").some((w) => w.startsWith(q))) best = Math.max(best, 60);
    else if (q.length >= 3 && key.includes(q)) best = Math.max(best, 40);
    else if (q.startsWith(key) && key.length >= 4) best = Math.max(best, 50);
  }
  return best;
}

function search(query) {
  const q = normalize(query);
  if (!q) return [];
  return brands
    .map((b) => ({ b, s: score(b, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.b.name.localeCompare(b.b.name))
    .map((x) => x.b);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child != null && child !== "") node.append(child);
  }
  return node;
}

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

function showBrand(brand) {
  const sources = [brand.source_1, brand.source_2].filter(Boolean);
  const facts = [
    brand.year && ["Since", brand.year],
    sources.length && ["Source", sources.flatMap((u, i) =>
      [i ? ", " : "", el("a", { href: u, target: "_blank", rel: "noopener" }, host(u))])],
  ].filter(Boolean);

  $("#result").replaceChildren(el("article", { class: `card ${brand.status}` },
    el("p", { class: "name" }, brand.name),
    el("p", { class: `status ${brand.status}` }, STATUS[brand.status] || brand.status),
    facts.length ? el("dl", { class: "facts" }, facts.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])) : null,
  ));
}

function showNotFound(query) {
  $("#result").replaceChildren(el("article", { class: "card unknown" },
    el("p", { class: "name" }, query),
    el("p", { class: "status" }, "Not in our list yet"),
    el("p", { class: "hint" }, "That doesn't mean it's independent. We just haven't researched it."),
  ));
}

function select(brand) {
  $("#q").value = brand.name;
  hideSuggestions();
  showBrand(brand);
  history.replaceState(null, "", `?q=${encodeURIComponent(brand.name)}`);
}

function submit(query) {
  const results = search(query);
  hideSuggestions();
  if (!query.trim()) return;
  if (results.length) select(results[0]);
  else {
    showNotFound(query.trim());
    history.replaceState(null, "", `?q=${encodeURIComponent(query.trim())}`);
  }
}

// Autocomplete
let highlighted = -1;
function hideSuggestions() { $("#suggestions").hidden = true; highlighted = -1; }

function renderSuggestions() {
  const list = $("#suggestions");
  const results = search($("#q").value).slice(0, 6);
  if (!results.length) return hideSuggestions();
  list.replaceChildren(...results.map((b, i) =>
    el("li", {
      role: "option",
      "aria-selected": String(i === highlighted),
      onmousedown: (e) => { e.preventDefault(); select(b); },
    }, b.name)));
  list.hidden = false;
}

async function init() {
  const text = await fetch("data/brands.csv").then((r) => r.text());
  brands = parseCSV(text).map((row) => ({
    ...row,
    keys: [row.name, ...splitList(row.aliases)].map(normalize).filter(Boolean),
  }));

  const input = $("#q");
  input.addEventListener("input", () => { highlighted = -1; renderSuggestions(); });
  input.addEventListener("blur", hideSuggestions);
  input.addEventListener("keydown", (e) => {
    const count = $("#suggestions").hidden ? 0 : $("#suggestions").children.length;
    if (e.key === "ArrowDown" && count) { e.preventDefault(); highlighted = (highlighted + 1) % count; renderSuggestions(); }
    else if (e.key === "ArrowUp" && count) { e.preventDefault(); highlighted = (highlighted - 1 + count) % count; renderSuggestions(); }
    else if (e.key === "Escape") hideSuggestions();
    else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      select(search(input.value)[highlighted]);
    }
  });
  $("#search-form").addEventListener("submit", (e) => { e.preventDefault(); submit(input.value); });

  const initial = new URLSearchParams(location.search).get("q");
  if (initial) { input.value = initial; submit(initial); }
}

init().catch((err) => {
  $("#result").replaceChildren(el("article", { class: "card unknown" },
    el("p", { class: "status" }, "Couldn't load the data"),
    el("p", { class: "hint" }, "If you opened index.html directly, run a local server instead (see README).")));
  console.error(err);
});
