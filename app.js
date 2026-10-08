// Where "let us know" links point (a form, email, or GitHub issues URL).
const REPORT_URL = "";

const STATUS = {
  pe_controlled: {
    label: "PE-controlled",
    verdict: "Yes — controlled by private equity",
    explain: "A private equity or investment firm owns a majority stake or the whole business.",
  },
  pe_backed: {
    label: "PE-backed",
    verdict: "Partly — backed by private equity",
    explain: "Investment firms hold a significant minority stake, but haven't been reported to control the company.",
  },
  vc_backed: {
    label: "Venture-backed",
    verdict: "Not PE, but venture-funded",
    explain: "Funded by venture capital to grow fast. Not PE-owned, but not a small independent either.",
  },
  other_owner: {
    label: "Investor-owned",
    verdict: "Not PE, but investor-owned",
    explain: "Majority-owned by an individual investor or non-PE company.",
  },
  public: {
    label: "Public chain",
    verdict: "Not PE, but a public chain",
    explain: "A publicly traded corporation. Not PE-owned, but not independent either.",
  },
};

const $ = (sel) => document.querySelector(sel);
let brands = [];
let byName = new Map();
let activeFilter = "all";

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

const badge = (status) => el("span", { class: `badge ${status}` }, STATUS[status]?.label || status);

function reportLink(text) {
  return REPORT_URL ? el("a", { href: REPORT_URL }, text) : text;
}

function showBrand(brand) {
  const s = STATUS[brand.status];
  const facts = [
    ["Owned by", brand.owners.join(", ")],
    ["Owner type", brand.owner_type],
    ["Stake", brand.stake],
    ["Since", brand.year],
  ].filter(([, v]) => v);

  const sources = [brand.source_1, brand.source_2].filter(Boolean);
  let host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  const card = el("article", { class: `card ${brand.status}` },
    badge(brand.status),
    el("p", { class: "verdict" }, `${brand.name}: ${s.verdict}`),
    el("h2", {}, s.explain),
    el("p", {}, brand.note),
    el("dl", { class: "facts" }, facts.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
    brand.related.length
      ? el("div", { class: "related" },
          el("strong", {}, "Same owners also own: "),
          el("br"),
          brand.related.map((name) =>
            byName.has(normalize(name))
              ? el("button", { type: "button", onclick: () => select(byName.get(normalize(name))) }, name)
              : el("button", { type: "button", disabled: "" }, name)))
      : null,
    el("p", { class: "sources" },
      sources.length ? "Sources: " : "",
      sources.flatMap((u, i) => [i ? " · " : "", el("a", { href: u, target: "_blank", rel: "noopener" }, host(u))]),
      brand.last_verified ? ` · Last checked ${brand.last_verified}` : "",
      brand.confidence === "medium" ? " · Some details unconfirmed" : "",
      " · ", reportLink("Report a correction")),
    brand.status !== "pe_controlled" && brand.status !== "pe_backed" ? null :
      el("p", { class: "cta" },
        el("strong", {}, "Want to keep your money local? "),
        `Look for an independently owned ${brand.category === "fast food" ? "spot" : brand.category.replace(/s$/, "") + " shop"} in your neighborhood instead.`),
  );

  $("#result").replaceChildren(card);
}

function showNotFound(query) {
  const card = el("article", { class: "card unknown" },
    el("p", { class: "verdict" }, `We don't have “${query}” yet`),
    el("h2", {}, "That doesn't mean it's independent — we just haven't researched it."),
    el("p", {}, "Our list covers NYC brands with documented outside ownership. ",
      reportLink("Suggest this business"), " and we'll look into it."),
  );
  $("#result").replaceChildren(card);
}

function select(brand) {
  $("#q").value = brand.name;
  hideSuggestions();
  showBrand(brand);
  history.replaceState(null, "", `?q=${encodeURIComponent(brand.name)}`);
  $("#result").scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    }, el("span", {}, b.name), badge(b.status))));
  list.hidden = false;
}

function renderList() {
  const items = brands
    .filter((b) => activeFilter === "all" || b.status === activeFilter)
    .sort((a, b) => a.name.localeCompare(b.name));
  $("#brand-list").replaceChildren(...items.map((b) =>
    el("li", {}, el("button", { type: "button", onclick: () => select(b) },
      el("span", {}, el("span", { class: "name" }, b.name), " ", el("span", { class: "owner" }, b.owners[0] || "")),
      badge(b.status)))));
}

function renderFilters() {
  const options = [["all", "All"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])];
  $("#filters").replaceChildren(...options.map(([key, label]) =>
    el("button", {
      type: "button",
      "aria-pressed": String(key === activeFilter),
      onclick: () => { activeFilter = key; renderFilters(); renderList(); },
    }, label)));
}

function renderLegend() {
  $("#legend").replaceChildren(...Object.entries(STATUS).flatMap(([k, v]) =>
    [el("dt", {}, badge(k)), el("dd", {}, v.explain)]));
}

async function init() {
  const text = await fetch("data/brands.csv").then((r) => r.text());
  brands = parseCSV(text).map((row) => ({
    ...row,
    owners: splitList(row.owners),
    related: splitList(row.same_owner_also_owns),
    keys: [row.name, ...splitList(row.aliases)].map(normalize).filter(Boolean),
  }));
  for (const b of brands) for (const k of b.keys) byName.set(k, b);

  if (REPORT_URL) $("#report-link").href = REPORT_URL;
  else $("#report-link").replaceWith("let us know");

  renderFilters();
  renderList();
  renderLegend();

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
    el("p", { class: "verdict" }, "Couldn't load the data"),
    el("p", {}, "If you opened index.html directly, run a local server instead (see README).")));
  console.error(err);
});
