/* OYAN сайтының тіл жүйесі: ҚАЗ / РУС / ENG.
 * Беттегі мәтін түйіндерін сөздік бойынша ауыстырады. Таңдалған тіл "oyan-lang" кілтімен сақталады
 * және "oyan:lang" оқиғасы арқылы Ойботқа беріледі.
 * Қолдану: OyanI18n.init({ base: "kk", dict: { ru: {...}, en: {...} }, onChange: (lang) => {...} })
 */
(() => {
  const LANGS = ["kk", "ru", "en"];
  const LABELS = { kk: "ҚАЗ", ru: "РУС", en: "ENG" };
  const HTML_LANG = { kk: "kk", ru: "ru", en: "en" };
  let base = "kk", dict = {}, lang = "kk", nodes = [], attrs = [], listeners = [];

  function stored() {
    try { const l = localStorage.getItem("oyan-lang"); if (LANGS.includes(l)) return l; } catch {}
    const nav = (navigator.language || "").slice(0, 2);
    return nav === "ru" ? "ru" : nav === "en" ? "en" : "kk";
  }
  const skip = (el) => el.closest("script,style,.oyb-panel,.oyb-fab,[data-noi18n]");

  function collect() {
    nodes = []; attrs = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.parentElement || skip(n.parentElement)) continue;
      const raw = n.nodeValue, key = raw.replace(/\s+/g, " ").trim();
      if (!key) continue;
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
      nodes.push({ n, key, lead, trail });
    }
    document.querySelectorAll("[aria-label],[placeholder],[title]").forEach((el) => {
      if (skip(el)) return;
      ["aria-label", "placeholder", "title"].forEach((a) => {
        const v = el.getAttribute(a);
        if (v) attrs.push({ el, a, key: v });
      });
    });
  }
  function t(s) {
    if (lang === base) return s;
    const d = dict[lang] || {};
    return d[s] ?? s;
  }
  function apply() {
    nodes.forEach(({ n, key, lead, trail }) => { n.nodeValue = lead + t(key) + trail; });
    attrs.forEach(({ el, a, key }) => el.setAttribute(a, t(key)));
    document.documentElement.lang = HTML_LANG[lang];
    document.querySelectorAll("[data-setlang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.setlang === lang));
  }
  function setLang(l) {
    if (!LANGS.includes(l)) return;
    lang = l;
    try { localStorage.setItem("oyan-lang", l); } catch {}
    apply();
    listeners.forEach((f) => { try { f(l); } catch (e) { console.warn(e); } });
    document.dispatchEvent(new CustomEvent("oyan:lang", { detail: l }));
  }
  function switcher(container) {
    if (!container) return;
    container.innerHTML = LANGS.map((l) =>
      `<button type="button" data-setlang="${l}" aria-pressed="${l === lang}">${LABELS[l]}</button>`).join("");
    container.querySelectorAll("button").forEach((b) => (b.onclick = () => setLang(b.dataset.setlang)));
  }
  function init(opts) {
    base = opts.base || "kk"; dict = opts.dict || {};
    if (opts.onChange) listeners.push(opts.onChange);
    lang = stored();
    try { localStorage.setItem("oyan-lang", lang); } catch {}
    collect();
    switcher(document.getElementById("langSwitch"));
    if (lang !== base) apply(); else document.documentElement.lang = HTML_LANG[lang];
    listeners.forEach((f) => { try { f(lang); } catch (e) { console.warn(e); } });
  }
  window.OyanI18n = { init, setLang, t, get lang() { return lang; }, onChange: (f) => listeners.push(f) };
})();
