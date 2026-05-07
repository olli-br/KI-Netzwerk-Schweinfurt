/*
  ============================================================================
  Project:      Ki Netzwerk Schweinfurt
  File:         main.js
  Seite / Rolle: App-Logik, Daten, UI (alle Seiten)
  Projekt-Pfad: assets/js/main.js

  Developed by: Oliver Braun
  GitHub:       https://github.com/olli-br

  Development Start: April 2026
  Current Version:   0.1.0

  Update History:
  - 02.05.2026  [Oliver Braun]   Project initialization


  Independently developed by me.
  ============================================================================
*/

(function () {
  const STORAGE_KEY = "kins-language";
  const THEME_KEY = "kins-theme";
  const DEFAULT_LANG = "de";
  const state = {
    lang: localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG,
    components: {},
    stopNetworkAnimation: null,
    stopHeaderNetworkAnimation: null,
    /** @type {unknown[] | null} */
    homeEvents: null,
    _eventsData: null,
    _postsData: null,
    _startPageContent: null,
    _aboutPageContent: null,
    _eventsPageContent: null,
    _blogPageContent: null,
    _eventCardCountdownTimer: null,
    /** @type {null | (() => void)} */
    _networkScrollCleanup: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    console.log("Init started");
    await loadBaseLayout();
    console.log("Base layout loaded");
    initTheme();
    console.log("Theme initialized");
    await loadPageTextContent();
    console.log("Page text content loaded");
    initHeaderNetworkAnimation();
    applyTranslations();
    console.log("Translations applied");
    wireLanguageSwitch();
    wireMobileMenu();
    highlightActiveNav();
    setFooterYear();
    await runPageScript();
    console.log("Page script run");
  }

  function showNeedsServerBanner() {
    if (sessionStorage.getItem("kins-hide-fetch-alert") === "1") return;
    const bar = document.createElement("aside");
    bar.className = "fetch-blocked-banner";
    bar.innerHTML =
      "<strong>Hinweis:</strong> Ohne lokalen HTTP-Server blockieren Browser das Laden (<code>Kopf-/Fußbereich und JSON-Inhalte</code>). Im Projektordner: <code>python3 -m http.server 8000</code> — dann <code>http://localhost:8000</code> öffnen. Auf GitHub Pages funktioniert es direkt.";
    bar.setAttribute("role", "status");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Verstanden";
    btn.className = "fetch-blocked-dismiss";
    btn.addEventListener("click", () => {
      sessionStorage.setItem("kins-hide-fetch-alert", "1");
      bar.remove();
    });
    bar.appendChild(btn);
    document.body.insertAdjacentElement("afterbegin", bar);
  }

  async function loadBaseLayout() {
    const headerSlot = document.getElementById("site-header");
    const footerSlot = document.getElementById("site-footer");
    if (headerSlot) {
      headerSlot.innerHTML = await fetchText("./components/header.html");
    }
    if (footerSlot) {
      footerSlot.innerHTML = await fetchText("./components/footer.html");
    }
    state.components.eventCard = await fetchText("./components/event-card.html");
    state.components.blogCard = await fetchText("./components/blog-card.html");

    const headerMounted = !!(headerSlot?.querySelector?.(".site-header") || document.querySelector(".site-header"));
    const cardsLoaded = Boolean(state.components.eventCard && state.components.blogCard);
    if (!headerMounted || !cardsLoaded) showNeedsServerBanner();
  }

  async function runPageScript() {
    const page = document.body.dataset.page;
    if (page === "home") await renderHomePage();
    if (page === "events") await renderEventsPage();
    if (page === "blog") await renderBlogPage();
    if (page === "about") renderAboutPage();
    initScrollReveal();
    initFaqAccordion();
  }

  function initScrollReveal() {
    const items = Array.from(document.querySelectorAll(".fade-in"));
    if (!items.length) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = Number(el.dataset.revealDelay || 0);
          if (delay > 0) {
            window.setTimeout(() => el.classList.add("is-visible"), delay);
          } else {
            el.classList.add("is-visible");
          }
          obs.unobserve(el);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );

    items.forEach((el) => {
      if (el.classList.contains("is-visible")) return;
      observer.observe(el);
    });
  }

  function prepareCardReveal(container) {
    if (!container) return;
    container.querySelectorAll(".card").forEach((card) => {
      card.classList.remove("fade-in");
      card.classList.add("is-visible");
      delete card.dataset.revealDelay;
      card.style.gridRowEnd = "";
    });
  }

  function pickAboutField(key) {
    const obj = state._aboutPageContent?.[key];
    if (!obj || typeof obj !== "object") return "";
    return obj[state.lang] || obj.de || "";
  }

  function renderAboutChipRow(el, chips) {
    if (!el || !Array.isArray(chips)) return;
    el.innerHTML = chips
      .map((chip) => {
        const label = chip?.[state.lang] || chip?.de || "";
        const t = String(label).trim();
        if (!t) return "";
        return `<span class="about-chip">${escapeHtml(t)}</span>`;
      })
      .filter(Boolean)
      .join("");
  }

  function renderAboutPage() {
    if (!state._aboutPageContent) return;
    const set = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text || "";
    };
    set("about-eyebrow", pickAboutField("eyebrow"));
    set("about-title", pickAboutField("title"));
    set("about-subtitle", pickAboutField("subtitle"));
    set("about-intro", pickAboutField("intro"));
    set("about-meeting-title", pickAboutField("meetingTitle"));
    set("about-meeting-lead", pickAboutField("meetingLead"));
    set("about-meeting-body", pickAboutField("meetingBody"));
    set("about-participants-title", pickAboutField("participantsTitle"));
    set("about-participants-lead", pickAboutField("participantsLead"));
    renderAboutChipRow(document.getElementById("about-participant-chips"), state._aboutPageContent.participantChips);
    set("about-participants-closing", pickAboutField("participantsClosing"));
    set("about-partners-title", pickAboutField("partnersTitle"));
    set("about-partners-text", pickAboutField("partnersText"));
    renderAboutChipRow(document.getElementById("about-partner-chips"), state._aboutPageContent.partnerChips);
  }

  function getI18n(path) {
    const dynamic = getDynamicPageText(path);
    if (dynamic) return dynamic;
    const table = window.I18N?.[state.lang] || {};
    return path.split(".").reduce((acc, key) => (acc ? acc[key] : ""), table) || "";
  }

  function getDynamicPageText(path) {
    const parts = path.split(".");
    const section = parts.shift();
    if (!section || !parts.length) return "";
    let source = null;
    if (section === "home") source = state._startPageContent;
    if (section === "about") source = state._aboutPageContent;
    if (section === "events") source = state._eventsPageContent;
    if (section === "blog") source = state._blogPageContent;
    if (!source) return "";
    const value = parts.reduce((acc, key) => (acc ? acc[key] : ""), source);
    if (typeof value !== "object") return "";
    return value[state.lang] || value.de || "";
  }

  async function loadPageTextContent() {
    console.log("Loading page text content");
    const [startData, aboutData, eventsData, blogData] = await Promise.all([
      fetchJson("./data/start/start-page.json"),
      fetchJson("./data/about/about-page.json"),
      fetchJson("./data/event/events-page.json"),
      fetchJson("./data/blog/blog-page.json")
    ]);
    console.log("Fetched data:", { startData, aboutData, eventsData, blogData });
    state._startPageContent = startData || null;
    state._aboutPageContent = aboutData || null;
    state._eventsPageContent = eventsData || null;
    state._blogPageContent = blogData || null;
  }

  function applyTranslations() {
    console.log("Applying translations");
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      el.textContent = getI18n(key);
    });
    const filter = document.getElementById("event-filter");
    if (filter) filter.placeholder = getI18n("events.filterPlaceholder");
    syncThemeAria();
  }

  function wireLanguageSwitch() {
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === state.lang);
      if (btn.dataset.wired === "true") return;
      btn.dataset.wired = "true";
      btn.addEventListener("click", async () => {
        state.lang = btn.dataset.lang;
        localStorage.setItem(STORAGE_KEY, state.lang);
        applyTranslations();
        wireLanguageSwitch();
        await runPageScript();
      });
    });
  }

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
    applyTheme(theme);
    document.querySelectorAll(".theme-toggle").forEach((toggle) => {
      if (toggle.dataset.themeBound === "true") return;
      toggle.dataset.themeBound = "true";
      toggle.addEventListener("click", () => {
        const nextTheme = document.body.classList.contains("theme-light") ? "dark" : "light";
        const goingLight = nextTheme === "light";
        localStorage.setItem(THEME_KEY, nextTheme);
        playThemeDiagonalTransition(goingLight, () => applyTheme(nextTheme));
      });
    });
  }

  function syncThemeAria() {
    const isLight = document.body.classList.contains("theme-light");
    document.querySelectorAll(".theme-toggle").forEach((toggle) => {
      toggle.setAttribute("aria-pressed", String(isLight));
      toggle.setAttribute(
        "aria-label",
        isLight ? getI18n("theme.switchToDark") : getI18n("theme.switchToLight")
      );
    });
  }

  function playThemeDiagonalTransition(goingLight, applyFn) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      applyFn();
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "theme-flash-overlay theme-flash-overlay--sweep";
    if (goingLight) overlay.setAttribute("data-to", "light");
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);

    let settled = false;

    const watchdog = window.setTimeout(() => {
      if (!overlay.isConnected || settled) return;
      settled = true;
      overlay.removeEventListener("animationend", onSweepEnd);
      overlay.removeEventListener("animationend", onFadeEnd);
      applyFn();
      overlay.remove();
    }, 950);

    function onFadeEnd(event) {
      const name = String(event.animationName || "");
      if (!name.includes("themeDiagonalFadeOut")) return;
      window.clearTimeout(watchdog);
      overlay.removeEventListener("animationend", onFadeEnd);
      settled = true;
      overlay.remove();
    }

    function onSweepEnd(event) {
      const name = String(event.animationName || "");
      if (!name.includes("themeDiagonalSweep")) return;
      window.clearTimeout(watchdog);
      overlay.removeEventListener("animationend", onSweepEnd);
      applyFn();
      overlay.classList.remove("theme-flash-overlay--sweep");
      window.requestAnimationFrame(() => overlay.classList.add("theme-flash-overlay--fade"));
      overlay.addEventListener("animationend", onFadeEnd);
    }

    overlay.addEventListener("animationend", onSweepEnd);
  }

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("theme-light", isLight);
    document.querySelectorAll(".theme-toggle").forEach((toggle) =>
      toggle.classList.toggle("theme-light", isLight)
    );
    syncThemeAria();
  }

  function initFaqAccordion() {
    document.querySelectorAll(".faq-question").forEach((button) => {
      if (button.dataset.faqInit === "true") return;
      button.dataset.faqInit = "true";
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        const panel = document.getElementById(button.getAttribute("aria-controls") || "");
        if (!panel) return;
        button.setAttribute("aria-expanded", String(!expanded));
        panel.hidden = expanded;
        panel.classList.toggle("open", !expanded);
      });
    });
  }

  function wireMobileMenu() {
    const header = document.querySelector(".site-header");
    const toggle = document.getElementById("menu-toggle");
    const navLinks = document.querySelectorAll(".nav a");
    if (!header || !toggle) return;

    const closeMenu = () => {
      header.classList.remove("menu-open");
      toggle.classList.remove("active");
      toggle.setAttribute("aria-expanded", "false");
    };

    toggle.addEventListener("click", () => {
      const open = header.classList.toggle("menu-open");
      toggle.classList.toggle("active", open);
      toggle.setAttribute("aria-expanded", String(open));
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    header.querySelectorAll(".nav-drawer-tools .lang-btn, .nav-drawer-tools .theme-toggle").forEach((ctrl) => {
      ctrl.addEventListener("click", () => window.requestAnimationFrame(closeMenu));
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 760) closeMenu();
    });
  }

  function highlightActiveNav() {
    const page = document.body.dataset.page;
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.classList.toggle("active", el.dataset.nav === page);
    });
  }

  function setFooterYear() {
    const year = document.getElementById("current-year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  async function renderHomePage() {
    const [events, posts] = await Promise.all([loadEvents(), loadPostsIndex()]);
    state.homeEvents = Array.isArray(events) ? events : [];
    renderNextEvents(state.homeEvents);
    renderLatestPosts(Array.isArray(posts) ? posts : []);
    initNetworkAnimation();
  }

  function initHeaderNetworkAnimation() {
    if (typeof state.stopHeaderNetworkAnimation === "function") {
      state.stopHeaderNetworkAnimation();
      state.stopHeaderNetworkAnimation = null;
    }
    const canvas = document.getElementById("header-network-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssWidth = canvas.clientWidth || 44;
    const cssHeight = canvas.clientHeight || 30;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sx = cssWidth / 44;
    const sy = cssHeight / 30;

    const points = [
      { x: 8, y: 7, vx: 0.11 * sx, vy: 0.06 * sy, r: 2.1 },
      { x: 22, y: 6, vx: -0.09 * sx, vy: 0.08 * sy, r: 1.9 },
      { x: 36, y: 11, vx: 0.08 * sx, vy: -0.06 * sy, r: 2 },
      { x: 14, y: 20, vx: 0.08 * sx, vy: -0.05 * sy, r: 1.85 },
      { x: 30, y: 22, vx: -0.1 * sx, vy: 0.07 * sy, r: 2 }
    ].map((p) => ({
      x: p.x * sx,
      y: p.y * sy,
      vx: p.vx,
      vy: p.vy,
      r: Math.min(p.r * Math.min(sx, sy), 2.6)
    }));

    const edges = [
      [0, 1],
      [1, 2],
      [0, 3],
      [1, 3],
      [2, 4],
      [3, 4]
    ];

    const packets = [
      { edge: 0, t: 0.2, speed: 0.0065 },
      { edge: 2, t: 0.55, speed: 0.007 },
      { edge: 4, t: 0.35, speed: 0.0068 }
    ];

    let rafId = 0;
    const pad = 6;
    const animate = () => {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      points.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < pad || p.x > cssWidth - pad) p.vx *= -1;
        if (p.y < pad || p.y > cssHeight - pad) p.vy *= -1;
      });

      edges.forEach(([a, b]) => {
        const p1 = points[a];
        const p2 = points[b];
        const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
        grad.addColorStop(0, "rgba(56,189,248,0.38)");
        grad.addColorStop(0.5, "rgba(96,165,250,0.48)");
        grad.addColorStop(1, "rgba(37,99,235,0.34)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      packets.forEach((packet) => {
        const [a, b] = edges[packet.edge];
        const p1 = points[a];
        const p2 = points[b];
        packet.t += packet.speed;
        if (packet.t > 1) packet.t = 0;
        const x = p1.x + (p2.x - p1.x) * packet.t;
        const y = p1.y + (p2.y - p1.y) * packet.t;
        ctx.fillStyle = "rgba(14,165,233,0.92)";
        ctx.beginPath();
        ctx.arc(x, y, 1.45, 0, Math.PI * 2);
        ctx.fill();
      });

      points.forEach((p) => {
        ctx.fillStyle = "rgba(37,99,235,0.12)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(30,64,175,0.92)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);
    state.stopHeaderNetworkAnimation = () => window.cancelAnimationFrame(rafId);
  }

  function initNetworkAnimation() {
    if (typeof state.stopNetworkAnimation === "function") {
      state.stopNetworkAnimation();
      state.stopNetworkAnimation = null;
    }
    const canvas = document.getElementById("network-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssWidth = canvas.clientWidth || 420;
    const cssHeight = canvas.clientHeight || 260;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const points = [
      { x: 36, y: 40, vx: 0.14, vy: 0.08, r: 4.1 },
      { x: 108, y: 52, vx: 0.12, vy: -0.08, r: 3.6 },
      { x: 188, y: 38, vx: -0.11, vy: 0.09, r: 3.9 },
      { x: 278, y: 50, vx: 0.13, vy: -0.1, r: 3.7 },
      { x: 364, y: 72, vx: -0.09, vy: 0.12, r: 4.2 },
      { x: 72, y: 138, vx: -0.12, vy: 0.08, r: 3.8 },
      { x: 158, y: 128, vx: 0.1, vy: -0.07, r: 4 },
      { x: 248, y: 144, vx: -0.08, vy: 0.11, r: 3.6 },
      { x: 338, y: 168, vx: 0.11, vy: -0.09, r: 4 },
      { x: 218, y: 206, vx: 0.07, vy: 0.09, r: 3.7 },
      { x: 118, y: 206, vx: -0.1, vy: -0.07, r: 3.8 },
      { x: 298, y: 218, vx: 0.1, vy: -0.08, r: 3.9 }
    ];

    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 5],
      [1, 6],
      [2, 6],
      [2, 7],
      [3, 7],
      [4, 8],
      [5, 6],
      [6, 7],
      [7, 8],
      [6, 9],
      [7, 9],
      [5, 9],
      [9, 10],
      [9, 11],
      [10, 11],
      [6, 10],
      [7, 11]
    ];

    const packets = [
      { edge: 0, t: 0.15, speed: 0.0048 },
      { edge: 3, t: 0.5, speed: 0.0054 },
      { edge: 6, t: 0.23, speed: 0.0061 },
      { edge: 10, t: 0.66, speed: 0.0052 },
      { edge: 14, t: 0.36, speed: 0.0064 },
      { edge: 17, t: 0.48, speed: 0.0057 },
      { edge: 20, t: 0.08, speed: 0.006 }
    ];

    let rafId = 0;
    const animate = () => {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      points.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 10 || p.x > cssWidth - 10) p.vx *= -1;
        if (p.y < 10 || p.y > cssHeight - 10) p.vy *= -1;
      });

      edges.forEach(([a, b]) => {
        const p1 = points[a];
        const p2 = points[b];
        const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
        grad.addColorStop(0, "rgba(45, 212, 191, 0.75)");
        grad.addColorStop(0.5, "rgba(56, 189, 248, 0.82)");
        grad.addColorStop(1, "rgba(148, 232, 255, 0.65)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      packets.forEach((packet) => {
        const [a, b] = edges[packet.edge];
        const p1 = points[a];
        const p2 = points[b];
        packet.t += packet.speed;
        if (packet.t > 1) packet.t = 0;
        const x = p1.x + (p2.x - p1.x) * packet.t;
        const y = p1.y + (p2.y - p1.y) * packet.t;
        ctx.fillStyle = "rgba(191, 255, 255, 0.98)";
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      });

      points.forEach((p) => {
        ctx.fillStyle = "rgba(45, 212, 191, 0.2)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(179, 248, 248, 0.94)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);
    canvas.style.opacity = "0.42";

    const wrapper = canvas.closest(".hero-network-visual");
    if (wrapper && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const ratio = entry.intersectionRatio;
            const opacity = Math.min(1, Math.max(0.32, 0.38 + ratio * 0.62));
            canvas.style.opacity = String(opacity);
          });
        },
        { threshold: [0, 0.12, 0.28, 0.45, 0.65, 0.85, 1] }
      );
      observer.observe(wrapper);
      state._networkScrollCleanup = () => observer.disconnect();
    }

    state.stopNetworkAnimation = () => {
      window.cancelAnimationFrame(rafId);
      if (typeof state._networkScrollCleanup === "function") {
        state._networkScrollCleanup();
        state._networkScrollCleanup = null;
      }
    };
  }

  async function renderEventsPage() {
    const rawEvents = await loadEvents();
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("event");
    if (eventId) {
      renderEventDetail(rawEvents, eventId);
      return;
    }

    const listView = document.getElementById("events-list-view");
    const detailView = document.getElementById("event-detail-view");
    const list = document.getElementById("events-list");
    if (!list || !listView || !detailView) return;
    listView.classList.remove("hidden");
    detailView.classList.add("hidden");
    clearEventCardCountdown();

    renderEventCards(list, sortEventsForList(rawEvents));

    const filterInput = document.getElementById("event-filter");
    if (filterInput && filterInput.dataset.eventsFilterBound !== "true") {
      filterInput.dataset.eventsFilterBound = "true";
      filterInput.addEventListener("input", async () => {
        const fresh = await loadEvents();
        const term = filterInput.value.toLowerCase().trim();
        const nextFiltered = sortEventsForList(
          fresh.filter((e) => {
            const addr = (e.addressPlain || "").toLowerCase();
            return (
              e.title.toLowerCase().includes(term) ||
              e.description.toLowerCase().includes(term) ||
              addr.includes(term)
            );
          })
        );
        renderEventCards(list, nextFiltered);
      });
    }
  }

  async function renderBlogPage() {
    const posts = await loadPostsIndex();
    const params = new URLSearchParams(window.location.search);
    const selectedSlug = params.get("post");
    if (selectedSlug) {
      await renderBlogDetail(posts, selectedSlug);
    } else {
      renderBlogList(posts);
    }
  }

  async function loadEvents() {
    const rawItems = await loadEventEntries();
    if (!Array.isArray(rawItems)) return [];
    const items = rawItems
      .filter(Boolean)
      .map((item) => {
        const loc = item.location && typeof item.location === "object" ? item.location : {};
        const plain = formatLocationPlain(loc, state.lang);
        return {
          ...item,
          title: item.title?.[state.lang] || item.title?.de || "",
          description:
            item.detail?.description?.[state.lang] ||
            item.detail?.description?.de ||
            item.description?.[state.lang] ||
            item.description?.de ||
            "",
          content:
            item.detail?.content?.[state.lang] ||
            item.detail?.content?.de ||
            item.content?.[state.lang] ||
            item.content?.de ||
            "",
          addressPlain: plain,
          addressHtml: formatLocationAddressHtml(loc, state.lang),
          geo: item.geo && typeof item.geo === "object" ? item.geo : null
        };
      })
      .filter((item) => item && item.date);
    return items.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function formatLocationPlain(loc, lang) {
    if (!loc || typeof loc !== "object") return "";
    const venue =
      typeof loc.venue === "string"
        ? loc.venue
        : loc.venue?.[lang] || loc.venue?.de || "";
    const line2 = [loc.street, [loc.postalCode, loc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return [venue, line2].filter(Boolean).join(", ");
  }

  function formatLocationAddressHtml(loc, lang) {
    if (!loc || typeof loc !== "object") return "";
    const venue =
      typeof loc.venue === "string"
        ? loc.venue
        : loc.venue?.[lang] || loc.venue?.de || "";
    const line2 = [loc.street, [loc.postalCode, loc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (!venue && !line2) return "";
    const v = venue ? `<span class="event-addr-line event-addr-line--venue">${escapeHtml(venue)}</span>` : "";
    const s = line2 ? `<span class="event-addr-line">${escapeHtml(line2)}</span>` : "";
    return `${v}${s}`;
  }

  function buildMapsUrls(plainAddress, geo) {
    const q = plainAddress.trim();
    const google = q
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
      : geo && typeof geo.lat === "number"
        ? `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`
        : "#";
    const apple = q
      ? `https://maps.apple.com/?q=${encodeURIComponent(q)}`
      : geo && typeof geo.lat === "number"
        ? `https://maps.apple.com/?ll=${geo.lat},${geo.lng}&q=${encodeURIComponent("Location")}`
        : "#";
    return { google, apple };
  }

  function buildOsmEmbedSrc(geo) {
    if (!geo || typeof geo.lat !== "number" || typeof geo.lng !== "number") return "";
    const lat = geo.lat;
    const lng = geo.lng;
    const dLat = 0.007;
    const dLng = 0.011;
    const bbox = `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`;
  }

  function getEventDateBadgeParts(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { day: "–", month: "–" };
    const locale = state.lang === "de" ? "de-DE" : "en-US";
    const day = String(d.getDate());
    const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(d).replace(".", "");
    return { day, month: month.toUpperCase() };
  }

  function renderCountdownChipsHtml(targetMs, labelText) {
    const parts = getRemainingParts(targetMs);
    const label =
      labelText !== undefined && labelText !== null && String(labelText).length
        ? `<span class="event-card-countdown__label">${String(labelText)}</span>`
        : "";
    return `${label}
        <span class="next-event-countdown" aria-live="polite">
          <span class="countdown-chip"><strong>${parts.days}</strong><small>${escapeHtml(
            getI18n("countdown.days")
          )}</small></span>
          <span class="countdown-chip"><strong>${parts.hours}</strong><small>${escapeHtml(
            getI18n("countdown.hours")
          )}</small></span>
          <span class="countdown-chip"><strong>${parts.minutes}</strong><small>${escapeHtml(
            getI18n("countdown.minutes")
          )}</small></span>
          <span class="countdown-chip"><strong>${parts.seconds}</strong><small>${escapeHtml(
            getI18n("countdown.seconds")
          )}</small></span>
        </span>`;
  }

  function clearEventCardCountdown() {
    if (state._eventCardCountdownTimer) {
      window.clearInterval(state._eventCardCountdownTimer);
      state._eventCardCountdownTimer = null;
    }
  }

  function bindEventCardCountdowns() {
    clearEventCardCountdown();
    const host = document.querySelector("[data-event-countdown]");
    if (!host) return;
    const raw = host.getAttribute("data-target-date") || "";
    const target = new Date(raw).getTime();
    if (!Number.isFinite(target)) return;
    const labelHtml = escapeHtml(getI18n("home.nextEventBar"));
    const tick = () => {
      host.innerHTML = renderCountdownChipsHtml(target, labelHtml);
    };
    tick();
    state._eventCardCountdownTimer = window.setInterval(tick, 1000);
  }

  function isEventPast(event) {
    return new Date(event.date).getTime() < Date.now();
  }

  /** Kommende zuerst (aufsteigend), danach Vergangene (neueste zuerst). */
  function sortEventsForList(events) {
    const upcoming = events
      .filter((e) => !isEventPast(e))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const past = events
      .filter((e) => isEventPast(e))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return [...upcoming, ...past];
  }

  function eventCardTemplateData(event, nextUpcomingId = null) {
    const past = isEventPast(event);
    const isNext = !past && nextUpcomingId !== null && String(event.id) === String(nextUpcomingId);
    const badge = past
      ? `<span class="event-status-badge event-status-badge--past">${escapeHtml(
          getI18n("events.pastBadge")
        )}</span>`
      : isNext
        ? `<span class="event-status-badge event-status-badge--next">${escapeHtml(
            getI18n("events.nextBadge")
          )}</span>`
        : "";
    const { day, month } = getEventDateBadgeParts(event.date);
    const countdownBlock =
      isNext && !past
        ? `<div class="event-card-countdown" data-event-countdown="1" data-target-date="${escapeHtml(
            String(event.date)
          )}">${renderCountdownChipsHtml(
            new Date(event.date).getTime(),
            escapeHtml(getI18n("home.nextEventBar"))
          )}</div>`
        : "";
    return {
      ...event,
      image: withDevAssetCacheBust(event.image || ""),
      date: formatDate(event.date),
      dateBadgeDay: day,
      dateBadgeMonth: month,
      buttonText: getI18n("events.detail.details"),
      detailUrl: `./events.html?event=${encodeURIComponent(event.id)}`,
      registerUrl: past ? event.recapLink || event.link : event.link,
      registerText: past ? getI18n("events.detail.archiveLink") : getI18n("events.detail.register"),
      pastClass: past ? " event-card--past" : "",
      nextClass: isNext ? " event-card--next" : "",
      statusBadgeHtml: badge,
      countdownBlock,
      addressBlock: event.addressHtml
        ? `<div class="event-card__address" aria-label="${escapeHtml(event.addressPlain || "")}">${event.addressHtml}</div>`
        : ""
    };
  }

  function renderNextEvents(events) {
    const slot = document.getElementById("next-events");
    if (!slot) return;
    const upcoming = events
      .filter((e) => !isEventPast(e))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let toShow = upcoming.slice(0, 3);
    if (!toShow.length && Array.isArray(events) && events.length) {
      const past = events
        .filter((e) => isEventPast(e))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      toShow = past.slice(0, 3);
    }
    renderEventCards(slot, toShow);
  }

  function getRemainingParts(targetMs) {
    const remaining = targetMs - Date.now();
    if (remaining <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds };
  }

  function renderEventCards(target, events) {
    if (!events.length) {
      target.innerHTML = `<p>${getI18n("common.noData")}</p>`;
      return;
    }
    const nextUpcoming = events
      .filter((e) => !isEventPast(e))
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const nextUpcomingId = nextUpcoming ? nextUpcoming.id : null;
    target.innerHTML = events
      .map((event) =>
        renderTemplate(state.components.eventCard, eventCardTemplateData(event, nextUpcomingId))
      )
      .join("");
    prepareCardReveal(target);
    bindEventCardCountdowns();
  }

  function renderEventDetail(events, eventId) {
    clearEventCardCountdown();
    const listView = document.getElementById("events-list-view");
    const detailView = document.getElementById("event-detail-view");
    const event = events.find((item) => String(item.id) === String(eventId));
    if (!listView || !detailView || !event) {
      if (listView) listView.classList.remove("hidden");
      if (detailView) detailView.classList.add("hidden");
      return;
    }

    listView.classList.add("hidden");
    detailView.classList.remove("hidden");
    document.getElementById("event-detail-image").src = withDevAssetCacheBust(event.image || "");
    document.getElementById("event-detail-image").alt = event.title;
    document.getElementById("event-detail-date").textContent = formatDate(event.date);
    document.getElementById("event-detail-title").textContent = event.title;
    document.getElementById("event-detail-description").textContent = event.description;
    const past = isEventPast(event);
    const regBtn = document.getElementById("event-detail-link");
    if (regBtn) {
      regBtn.href = past ? event.recapLink || event.link : event.link;
    }
    const nextUpcoming = events
      .filter((e) => !isEventPast(e))
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const isNext = !past && nextUpcoming && String(nextUpcoming.id) === String(event.id);
    const statusEl = document.getElementById("event-detail-status");
    if (statusEl) {
      if (past) {
        statusEl.textContent = getI18n("events.detail.pastBadge");
        statusEl.className = "event-status-badge event-status-badge--past";
      } else if (isNext) {
        statusEl.textContent = getI18n("events.detail.nextBadge");
        statusEl.className = "event-status-badge event-status-badge--next";
      } else {
        statusEl.textContent = "";
        statusEl.className = "event-status-badge hidden";
      }
    }
    if (regBtn) {
      if (past) {
        regBtn.textContent = getI18n("events.detail.archiveLink");
        regBtn.removeAttribute("data-i18n");
        regBtn.classList.add("btn-ghost");
        regBtn.classList.remove("btn-primary");
      } else {
        regBtn.setAttribute("data-i18n", "events.detail.register");
        regBtn.textContent = getI18n("events.detail.register");
        regBtn.classList.add("btn-primary");
        regBtn.classList.remove("btn-ghost");
      }
    }

    const locSection = document.getElementById("event-detail-location-section");
    const locHeading = document.getElementById("event-detail-location-heading");
    const addrEl = document.getElementById("event-detail-address");
    const mapWrap = document.getElementById("event-detail-map-wrap");
    const mapHint = document.getElementById("event-detail-map-hint");
    const mapFrame = document.getElementById("event-detail-map-frame");
    const mapHit = document.getElementById("event-detail-map-hit");
    const mapGoogle = document.getElementById("event-detail-map-google");
    const mapApple = document.getElementById("event-detail-map-apple");
    const plain = event.addressPlain || "";
    if (locSection && locHeading && addrEl) {
      if (plain) {
        locSection.classList.remove("hidden");
        locHeading.textContent = getI18n("events.detail.locationHeading");
        addrEl.innerHTML = event.addressHtml || escapeHtml(plain);
      } else {
        locSection.classList.add("hidden");
        locHeading.textContent = "";
        addrEl.textContent = "";
      }
    }
    const maps = buildMapsUrls(plain, event.geo);
    const embedSrc = buildOsmEmbedSrc(event.geo);
    if (mapWrap && mapFrame && mapHit && mapGoogle && mapApple && mapHint) {
      if (!plain) {
        mapWrap.classList.add("hidden");
        mapFrame.removeAttribute("src");
        mapFrame.classList.remove("hidden");
        mapHit.classList.add("hidden");
      } else {
        mapWrap.classList.remove("hidden");
        mapHint.textContent = getI18n("events.detail.mapHint");
        mapGoogle.href = maps.google;
        mapGoogle.textContent = getI18n("events.detail.openGoogleMaps");
        mapApple.href = maps.apple;
        mapApple.textContent = getI18n("events.detail.openAppleMaps");
        if (embedSrc) {
          mapFrame.classList.remove("hidden");
          mapFrame.setAttribute("title", getI18n("events.detail.mapFrameTitle"));
          mapFrame.src = embedSrc;
          mapHit.classList.remove("hidden");
          mapHit.href = maps.google;
          const hitLabel = mapHit.querySelector(".event-map-hit__label");
          if (hitLabel) hitLabel.textContent = getI18n("events.detail.openGoogleMaps");
        } else {
          mapFrame.removeAttribute("src");
          mapFrame.classList.add("hidden");
          mapHit.classList.add("hidden");
        }
      }
    }

    const bodyEl = document.getElementById("event-detail-body");
    if (bodyEl) {
      const extra = event.content || "";
      if (extra.trim()) {
        bodyEl.innerHTML = markdownToHtml(extra.trim());
        bodyEl.classList.remove("hidden");
      } else {
        bodyEl.innerHTML = "";
        bodyEl.classList.add("hidden");
      }
    }

    const cdHost = document.getElementById("event-detail-countdown");
    if (cdHost) {
      if (isNext && !past) {
        cdHost.classList.remove("hidden");
        cdHost.setAttribute("data-target-date", String(event.date));
        const target = new Date(event.date).getTime();
        const tick = () => {
          cdHost.innerHTML = renderCountdownChipsHtml(target, "");
        };
        tick();
        clearEventCardCountdown();
        state._eventCardCountdownTimer = window.setInterval(tick, 1000);
      } else {
        cdHost.classList.add("hidden");
        cdHost.innerHTML = "";
      }
    }
  }

  function blogReadTimeLabel(item) {
    const fromJson = item.readTime?.[state.lang] || item.readTime?.de;
    if (fromJson && String(fromJson).trim()) return String(fromJson).trim();
    const teaser = item.teaser?.[state.lang] || item.teaser?.de || "";
    const body =
      item.detail?.content?.[state.lang] ||
      item.detail?.content?.de ||
      item.content?.[state.lang] ||
      item.content?.de ||
      "";
    const words = `${teaser} ${body}`.trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 200));
    return `${minutes} ${getI18n("blog.list.readTime")}`;
  }

  async function loadPostsIndex() {
    const rawItems = await loadPostEntries();
    if (!Array.isArray(rawItems)) return [];
    const items = rawItems
      .filter(Boolean)
      .map((item) => ({
        ...item,
        title: item.title?.[state.lang] || item.title?.de || "",
        teaser: item.teaser?.[state.lang] || item.teaser?.de || "",
        content:
          item.detail?.content?.[state.lang] ||
          item.detail?.content?.de ||
          item.content?.[state.lang] ||
          item.content?.de ||
          "",
        readTime: blogReadTimeLabel(item)
      }))
      .filter((item) => item && item.date);
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function renderLatestPosts(posts) {
    const slot = document.getElementById("latest-posts");
    if (!slot) return;
    const latest = posts.slice(0, 3);
    if (!latest.length) {
      slot.innerHTML = `<p>${getI18n("common.noData")}</p>`;
      return;
    }
    slot.innerHTML = latest
      .map((post) => renderTemplate(state.components.blogCard, blogCardTemplateData(post)))
      .join("");
    prepareCardReveal(slot);
  }

  function renderBlogList(posts) {
    const listView = document.getElementById("blog-list-view");
    const detailView = document.getElementById("blog-detail-view");
    const list = document.getElementById("blog-list");
    if (!list || !listView || !detailView) return;
    listView.classList.remove("hidden");
    detailView.classList.add("hidden");

    if (!posts.length) {
      list.innerHTML = `<p>${getI18n("common.noData")}</p>`;
      return;
    }
    list.innerHTML = posts
      .map((post) => renderTemplate(state.components.blogCard, blogCardTemplateData(post)))
      .join("");
    prepareCardReveal(list);
  }

  function blogCardTemplateData(post) {
    return {
      ...post,
      image: withDevAssetCacheBust(post.image || ""),
      absoluteDate: formatDate(post.date),
      relativeDate: formatRelativeDate(post.date),
      readTime: post.readTime || "",
      readMore: getI18n("blog.list.readMore"),
      recapBadge: getI18n("blog.list.recapBadge")
    };
  }

  function formatRelativeDate(dateStr) {
    const targetDate = parseIsoDateLoose(dateStr);
    if (!targetDate) return formatDate(dateStr);
    const nowDate = new Date();
    const locale = state.lang === "de" ? "de-DE" : "en-US";
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
    const day = 24 * 60 * 60 * 1000;
    const targetStart = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    ).getTime();
    const nowStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
    const dayDiff = Math.floor((nowStart - targetStart) / day);

    if (dayDiff <= 0) return state.lang === "de" ? "heute" : "today";

    // Blog-Karten sollen bewusst als vergangene Beiträge dargestellt werden.
    const absDays = dayDiff;
    if (absDays < 28) return rtf.format(-absDays, "day");
    if (absDays < 120) return rtf.format(-Math.floor(absDays / 7), "week");
    if (absDays < 540) return rtf.format(-Math.floor(absDays / 30), "month");
    return rtf.format(-Math.floor(absDays / 365), "year");
  }

  function parseIsoDateLoose(input) {
    const value = String(input || "").trim();
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month, day);
  }

  async function renderBlogDetail(posts, slug) {
    const listView = document.getElementById("blog-list-view");
    const detailView = document.getElementById("blog-detail-view");
    const post = posts.find((item) => item.slug === slug);
    if (!listView || !detailView || !post) return renderBlogList(posts);
    listView.classList.add("hidden");
    detailView.classList.remove("hidden");

    const title = post.title || "";
    const date = post.date;
    const image = post.image || "";

    document.getElementById("blog-detail-title").textContent = title;
    document.getElementById("blog-detail-date").textContent = formatDate(date);
    const readTimeEl = document.getElementById("blog-detail-readtime");
    if (readTimeEl) {
      const rt = (post.readTime || "").trim();
      readTimeEl.textContent = rt;
      readTimeEl.classList.toggle("hidden", !rt);
    }
    const imageEl = document.getElementById("blog-detail-image");
    if (image) {
      imageEl.src = withDevAssetCacheBust(image);
      imageEl.alt = title;
      imageEl.classList.remove("hidden");
    } else {
      imageEl.classList.add("hidden");
    }
    document.getElementById("blog-detail-content").innerHTML = markdownToHtml((post.content || "").trim());
  }

  async function loadEventEntries() {
    if (state._eventsData) return state._eventsData;
    const index = await fetchJson("./data/event/index.json");
    if (!index || !Array.isArray(index.files)) {
      console.warn("Event index missing or invalid:", index);
      state._eventsData = [];
      return state._eventsData;
    }
    const entries = await Promise.all(
      index.files.map(async (name) => {
        const item = await fetchJson(`./data/event/events/${name}`);
        if (!item) console.warn("Failed to load event entry:", name);
        return item;
      })
    );
    state._eventsData = entries.filter(Boolean);
    return state._eventsData;
  }

  async function loadPostEntries() {
    if (state._postsData) return state._postsData;
    const index = await fetchJson("./data/blog/index.json");
    if (!index || !Array.isArray(index.files)) {
      console.warn("Blog index missing or invalid:", index);
      state._postsData = [];
      return state._postsData;
    }
    const entries = await Promise.all(
      index.files.map(async (name) => {
        const item = await fetchJson(`./data/blog/posts/${name}`);
        if (!item) console.warn("Failed to load blog post entry:", name);
        return item;
      })
    );
    state._postsData = entries.filter(Boolean);
    return state._postsData;
  }

  function markdownToHtml(markdown) {
    const escaped = markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return escaped
      .split("\n\n")
      .map((block) => {
        if (block.startsWith("### ")) return `<h3>${inlineMd(block.slice(4))}</h3>`;
        if (block.startsWith("## ")) return `<h2>${inlineMd(block.slice(3))}</h2>`;
        if (block.startsWith("# ")) return `<h1>${inlineMd(block.slice(2))}</h1>`;
        if (block.startsWith("- ")) {
          const items = block
            .split("\n")
            .map((line) => line.replace(/^- /, "").trim())
            .map((item) => `<li>${inlineMd(item)}</li>`)
            .join("");
          return `<ul>${items}</ul>`;
        }
        return `<p>${inlineMd(block.replace(/\n/g, "<br />"))}</p>`;
      })
      .join("");
  }

  function inlineMd(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a class="link" href="$2">$1</a>');
  }

  function renderTemplate(template, data) {
    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => data[key.trim()] ?? "");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(dateStr) {
    const locale = state.lang === "de" ? "de-DE" : "en-US";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(dateStr));
  }

  let devAssetBustToken = 0;
  function isLocalDevHost() {
    if (typeof window === "undefined" || !window.location) return false;
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  /** Gegen hartnäckiges Browser-Caching von Bildern nur auf localhost (ein Token pro Seitenaufruf). */
  function withDevAssetCacheBust(url) {
    if (!url || typeof url !== "string") return url || "";
    if (!isLocalDevHost()) return url;
    if (!devAssetBustToken) devAssetBustToken = Date.now();
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${devAssetBustToken}`;
  }

  async function fetchJson(url) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${url}:`, error);
      return null;
    }
  }

  async function fetchText(url) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        return "";
      }
      return await response.text();
    } catch (error) {
      console.error(`Error fetching ${url}:`, error);
      return "";
    }
  }
})();
