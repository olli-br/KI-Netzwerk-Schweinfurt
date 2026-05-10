/*
  ============================================================================
  Project:      KI Netzwerk Schweinfurt
  File:         main.js
  Seite / Rolle: App-Logik, Daten, UI (alle Seiten)
  Projekt-Pfad: assets/js/main.js

  Developed by: Oliver Braun
  GitHub:       https://github.com/olli-br

  Development Start: April 2026
  Current Version:   0.1.0

  Update History:
  - 02.05.2026  [Oliver Braun]   Project initialization
  - 08.05.2026  [Oliver Braun]   Polish responsive UI and layout consistency, including updated JSON content structure and Markdown-based content handling.
  - 08.05.2026  [Oliver Braun]   Add local WebLLM chat assistant.
  - 09.05.2026  [Oliver Braun]   Markdown rendering and mobile UX polish.
  - 09.05.2026  [Oliver Braun]   UI-Feinschliff: Layout, Mobile/Safari, KI-Chat & WebLLM.
  - 10.05.2026  [Oliver Braun]   Faster AI chat: parallel init, streaming deltas, same-origin crawler with cache; light-mode tweaks; drop dead settings.

  Independently developed by me.
  ============================================================================
*/

(function () {
  const STORAGE_KEY = "kins-language";
  const THEME_KEY = "kins-theme";
  const AI_CHAT_SETTINGS_KEY = "kins-ai-chat-settings";
  const AI_ASSISTANT_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
  /* Engine-Konstanten (kein UI-Regler — stabilere Inferenz auf kleinen Modellen) */
  const AI_CHAT_TOP_P = 0.92;
  /* Crawl-/Kontext-Budget */
  const AI_CRAWL_TTL_MS = 90_000;
  const AI_CRAWL_CONCURRENCY = 4;
  const AI_CRAWL_MAX_PAGES = 30;
  const AI_CRAWL_PER_PAGE_CHARS = 1100;
  const AI_CRAWL_TOTAL_CHARS = 4000;
  const AI_CONTEXT_TTL_MS = 90_000;
  /* Streaming: Live-Anzeige nicht öfter als alle ~180ms */
  const AI_LIVE_UPDATE_MIN_MS = 180;
  const FALLBACK_AI_CHAT_SETTINGS = {
    model: AI_ASSISTANT_MODEL,
    temperature: 0.35,
    maxTokens: 320,
    contextChars: 5200,
    historyMessages: 6,
    maxQuestionChars: 700,
    cacheBackend: "indexeddb",
    useFallback: true,
    showTech: false,
    showDebugData: false
  };
  const DEFAULT_LANG = "de";

  /** Nur `de` / `en`; ohne gespeicherte Wahl → Browser-Sprache (`navigator.languages`). */
  function resolveInitialLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "de" || stored === "en") return stored;
    const list =
      typeof navigator.languages !== "undefined" && navigator.languages?.length
        ? Array.from(navigator.languages)
        : [navigator.language || ""];
    for (const raw of list) {
      const tag = String(raw).toLowerCase();
      if (tag.startsWith("de")) return "de";
      if (tag.startsWith("en")) return "en";
    }
    return DEFAULT_LANG;
  }

  const state = {
    lang: resolveInitialLanguage(),
    components: {},
    stopNetworkAnimation: null,
    stopHeaderNetworkAnimation: null,
    /** @type {unknown[] | null} */
    homeEvents: null,
    _eventsData: null,
    _postsData: null,
    _homePageContent: null,
    _aboutPageContent: null,
    _eventsPageContent: null,
    _blogPageContent: null,
    _globalData: null,
    _aiChatContent: null,
    _eventCardCountdownTimer: null,
    _markdownParser: null,
    _markdownReadyPromise: null,
    _assistantEnginePromise: null,
    _assistantEngine: null,
    _assistantContextData: null,
    _assistantMessages: [],
    _assistantBusy: false,
    _assistantCancelRequested: false,
    _assistantRunId: 0,
    /** @type {null | Promise<GPUAdapter | null>} */
    _aiAdapterPromise: null,
    /** Per-URL Crawl-Cache (Klartext + Links + Zeitstempel). */
    _aiSiteCrawl: null,
    /** @type {null | (() => void)} */
    _aiChatViewportUnbind: null,
    _assistantSettings: { ...FALLBACK_AI_CHAT_SETTINGS },
    _assistantTech: {
      model: AI_ASSISTANT_MODEL,
      runtime: "WebLLM + WebGPU",
      webgpu: "prüft...",
      adapter: "prüft...",
      progress: "nicht geladen",
      loadMs: null,
      lastLatencyMs: null,
      lastPromptChars: 0,
      lastContextChars: 0,
      contextStatus: "",
      downloadProgress: "",
      fallback: false,
      lastError: ""
    },
    /** @type {null | (() => void)} */
    _networkScrollCleanup: null
  };

  document.documentElement.lang = state.lang;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    console.log("Init started");
    ensureMarkdownParser();
    await loadBaseLayout();
    console.log("Base layout loaded");
    initTheme();
    console.log("Theme initialized");
    await loadPageTextContent();
    console.log("Page text content loaded");
    bindViewportLayoutVars();
    bindBrowserLanguageListener();
    initHeaderNetworkAnimation();
    applyTranslations();
    console.log("Translations applied");
    wireLanguageSwitch();
    wireMobileMenu();
    highlightActiveNav();
    setFooterYear();
    await runPageScript();
    await initAiChatAssistant();
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
    let aiChatSlot = document.getElementById("ai-chat-root");
    if (headerSlot) {
      headerSlot.innerHTML = await fetchText("./components/header.html");
    }
    if (footerSlot) {
      footerSlot.innerHTML = await fetchText("./components/footer.html");
    }
    if (!aiChatSlot) {
      aiChatSlot = document.createElement("div");
      aiChatSlot.id = "ai-chat-root";
      document.body.appendChild(aiChatSlot);
    }
    state.components.aiChat = await fetchText("./components/ai-chat.html");
    aiChatSlot.innerHTML = state.components.aiChat;
    state.components.eventCard = await fetchText("./components/event-card.html");
    state.components.blogCard = await fetchText("./components/blog-card.html");

    const headerMounted = !!(headerSlot?.querySelector?.(".site-header") || document.querySelector(".site-header"));
    const cardsLoaded = Boolean(state.components.eventCard && state.components.blogCard);
    const aiChatLoaded = Boolean(aiChatSlot.querySelector?.(".ai-chat"));
    if (!headerMounted || !cardsLoaded || !aiChatLoaded) showNeedsServerBanner();
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

  function renderPartnerLogos() {
    const host = document.getElementById("about-partner-logos");
    if (!host) return;
    const logos = state._aboutPageContent?.partnerLogos;
    if (!Array.isArray(logos) || !logos.length) {
      return;
    }
    host.innerHTML = logos
      .map((logo) => {
        const src = String(logo?.src || "").trim();
        const name = String(logo?.name || "").trim();
        const href = String(logo?.href || "").trim();
        if (!src || !name) return "";
        const logoImg = `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" loading="lazy" />`;
        if (href) {
          const normalized = href.startsWith("http") ? href : `https://${href}`;
          return `<a class="about-partner-logo" href="${escapeHtml(normalized)}" target="_blank" rel="noopener noreferrer">${logoImg}</a>`;
        }
        return `<span class="about-partner-logo">${logoImg}</span>`;
      })
      .filter(Boolean)
      .join("");
  }

  function renderInitiators() {
    const eyebrowEl = document.getElementById("about-initiators-eyebrow");
    const container = document.getElementById("about-initiators-container");
    if (!container) return;
    const initiators = state._aboutPageContent?.initiators;
    if (!Array.isArray(initiators) || !initiators.length) {
      document.getElementById("about-initiators-section")?.remove();
      return;
    }
    if (eyebrowEl) eyebrowEl.textContent = pickAboutField("initiatorsEyebrow");
    container.innerHTML = initiators
      .map((person) => {
        const bio = person.bio?.[state.lang] || person.bio?.de || "";
        const role = person.role?.[state.lang] || person.role?.de || "";
        const linkedinHref = person.linkedin
          ? person.linkedin.startsWith("http")
            ? person.linkedin
            : "https://" + person.linkedin
          : "";
        const imgSrc = person.image ? escapeHtml(person.image) : "";
        const imgAlt = escapeHtml(person.name || "");
        return `
        <article class="initiator-card">
          ${imgSrc ? `<img class="initiator-image" src="${imgSrc}" alt="${imgAlt}" loading="lazy" />` : ""}
          <div class="initiator-info">
            <h2 class="initiator-name">${escapeHtml(person.name || "")}</h2>
            ${role ? `<p class="initiator-role">${escapeHtml(role)}</p>` : ""}
            <p class="initiator-bio">${escapeHtml(bio)}</p>
            ${linkedinHref ? `<a class="initiator-linkedin" href="${escapeHtml(linkedinHref)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}
          </div>
        </article>`;
      })
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
    renderPartnerLogos();
    renderAboutChipRow(document.getElementById("about-partner-chips"), state._aboutPageContent.partnerChips);
    renderInitiators();
  }

  function getI18n(path) {
    const dynamic = getDynamicPageText(path);
    if (dynamic) return dynamic;
    const table = state._globalData?.[state.lang] || {};
    return path.split(".").reduce((acc, key) => (acc ? acc[key] : ""), table) || "";
  }

  function getDynamicPageText(path) {
    const parts = path.split(".");
    const section = parts.shift();
    if (!section || !parts.length) return "";
    let source = null;
    if (section === "home") source = state._homePageContent;
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
    const [homeData, aboutData, eventsData, blogData, globalData, aiChatData] = await Promise.all([
      fetchJson("./data/home/home-page.json"),
      fetchJson("./data/about/about-page.json"),
      fetchJson("./data/event/events-page.json"),
      fetchJson("./data/blog/blog-page.json"),
      fetchJson("./data/global/global.json"),
      fetchJson("./data/global/ai-chat.json")
    ]);
    console.log("Fetched data:", { homeData, aboutData, eventsData, blogData, globalData, aiChatData });
    state._homePageContent = homeData || null;
    state._aboutPageContent = aboutData || null;
    state._eventsPageContent = eventsData || null;
    state._blogPageContent = blogData || null;
    state._globalData = globalData || null;
    state._aiChatContent = aiChatData || null;
    state._assistantSettings = loadAiChatSettings();
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
        /* Kontext-Snapshot ist sprachgebunden — erzwingt Neuaufbau bei nächstem Senden. */
        state._assistantContextData = null;
        applyTranslations();
        wireLanguageSwitch();
        await runPageScript();
        await initAiChatAssistant();
      });
    });
  }

  /** Ohne gespeichertes Theme: Hell/Dunkel an `prefers-color-scheme` koppeln. */
  function readStoredOrSystemTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function bindSystemThemeListener() {
    if (bindSystemThemeListener._done) return;
    bindSystemThemeListener._done = true;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (localStorage.getItem(THEME_KEY)) return;
      applyTheme(mq.matches ? "light" : "dark");
    };
    mq.addEventListener("change", onChange);
  }

  function initTheme() {
    applyTheme(readStoredOrSystemTheme());
    bindSystemThemeListener();
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

  /** Sichtbare Viewport-Höhe/Offset (mobile Browser-Leisten) → CSS-Variablen für Seitenhöhe & Abstände. */
  function bindViewportLayoutVars() {
    const root = document.documentElement;
    const update = () => {
      const vv = window.visualViewport;
      const h = vv ? Math.max(1, Math.round(vv.height)) : window.innerHeight;
      const top = vv ? Math.round(vv.offsetTop) : 0;
      root.style.setProperty("--layout-viewport-height", `${h}px`);
      root.style.setProperty("--layout-viewport-offset-top", `${top}px`);
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
  }

  /** Ohne gespeicherte Sprache: bei Browser-Sprachwechsel nachziehen. */
  function bindBrowserLanguageListener() {
    if (bindBrowserLanguageListener._done) return;
    bindBrowserLanguageListener._done = true;
    window.addEventListener("languagechange", async () => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next = resolveInitialLanguage();
      if (next === state.lang) return;
      state.lang = next;
      document.documentElement.lang = state.lang;
      applyTranslations();
      wireLanguageSwitch();
      highlightActiveNav();
      await runPageScript();
      await initAiChatAssistant();
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

  function syncThemeColorMeta(isLight) {
    let meta = document.getElementById("theme-color-meta");
    if (!meta) {
      meta = document.createElement("meta");
      meta.id = "theme-color-meta";
      meta.setAttribute("name", "theme-color");
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport?.parentNode) viewport.parentNode.insertBefore(meta, viewport.nextSibling);
      else document.head.appendChild(meta);
    }
    /* Hell: Weiß wie Kopfzeile — bündig zur Statusleiste (Safari/iOS). */
    meta.setAttribute("content", isLight ? "#ffffff" : "#060a12");
  }

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.documentElement.style.colorScheme = isLight ? "light" : "dark";
    document.body.classList.toggle("theme-light", isLight);
    document.querySelectorAll(".theme-toggle").forEach((toggle) =>
      toggle.classList.toggle("theme-light", isLight)
    );
    syncThemeColorMeta(isLight);
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
      if (window.innerWidth >= 980) closeMenu();
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
    renderHomeSponsors();
    initNetworkAnimation();
  }

  /** Mobil: Chat an den unteren sichtbaren Rand (über der Tastatur) ausrichten. */
  function syncAiChatVisualInsets(chatEl) {
    if (!chatEl) return;
    const vv = window.visualViewport;
    if (!vv) {
      chatEl.style.removeProperty("--ai-chat-keyboard-gap");
      chatEl.style.removeProperty("--ai-chat-vvh");
      chatEl.style.removeProperty("--ai-chat-bottom-extra");
      return;
    }
    const layoutH = document.documentElement.clientHeight || window.innerHeight;
    let gap = Math.max(0, layoutH - vv.height - vv.offsetTop);
    /* iOS: Leiste über der Tastatur / minimale Lücken — sonst wirkt --ai-chat-keyboard-gap zu klein */
    if (gap > 24) gap += 16;
    chatEl.style.setProperty("--ai-chat-keyboard-gap", `${gap}px`);
    const vvh = Math.max(0, Math.round(vv.height));
    chatEl.style.setProperty("--ai-chat-vvh", `${vvh}px`);
    if (gap > 56) {
      chatEl.style.setProperty("--ai-chat-bottom-extra", "0px");
    } else {
      chatEl.style.removeProperty("--ai-chat-bottom-extra");
    }
  }

  function bindAiChatVisualViewport(chatEl) {
    const update = () => syncAiChatVisualInsets(chatEl);
    update();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      if (chatEl) {
        chatEl.style.removeProperty("--ai-chat-keyboard-gap");
        chatEl.style.removeProperty("--ai-chat-vvh");
        chatEl.style.removeProperty("--ai-chat-bottom-extra");
      }
    };
  }

  async function initAiChatAssistant() {
    if (typeof state._aiChatViewportUnbind === "function") {
      try {
        state._aiChatViewportUnbind();
      } catch (_) {
        /* ignore */
      }
      state._aiChatViewportUnbind = null;
    }

    let root = document.getElementById("ai-chat-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "ai-chat-root";
      document.body.appendChild(root);
    }
    if (state.components.aiChat) root.innerHTML = state.components.aiChat;

    const labels = getAiChatLabels();
    const knownGreetings = Object.values(state._aiChatContent?.labels || {}).map((entry) => entry?.greeting).filter(Boolean);
    if (!state._assistantMessages.length) {
      state._assistantMessages = [{ role: "assistant", content: labels.greeting }];
    } else if (
      state._assistantMessages.length === 1 &&
      state._assistantMessages[0].role === "assistant" &&
      knownGreetings.includes(state._assistantMessages[0].content)
    ) {
      state._assistantMessages[0].content = labels.greeting;
    }

    const chat = root.querySelector(".ai-chat");
    const toggle = root.querySelector(".ai-chat-toggle");
    const panel = root.querySelector(".ai-chat-panel");
    const close = root.querySelector(".ai-chat-close");
    const settingsToggle = root.querySelector(".ai-chat-settings-toggle");
    const settingsPanel = root.querySelector("#ai-chat-settings");
    const form = root.querySelector("[data-ai-chat-form]");
    const input = root.querySelector("#ai-chat-input");
    const status = root.querySelector("[data-ai-chat-status]");
    const submit = root.querySelector(".ai-chat-form button[type='submit']");
    state._aiChatViewportUnbind = bindAiChatVisualViewport(chat);
    applyAiChatLabels(root, labels);
    renderAiChatModelOptions(root);

    const sendMessage = async (rawMessage) => {
      if (state._assistantBusy) {
        cancelAiChatRun(root);
        return;
      }
      const message = String(rawMessage || "").trim();
      if (!message) return;
      if (input) input.value = "";
      resizeAiChatInput(input);
      await handleAiChatMessage(message, root, status, input, submit);
    };

    const setOpen = (open) => {
      if (!chat || !panel || !toggle) return;
      chat.classList.toggle("ai-chat--open", open);
      panel.hidden = !open;
      panel.setAttribute("aria-hidden", String(!open));
      toggle.setAttribute("aria-expanded", String(open));
      if (!open && settingsPanel) {
        chat.classList.remove("ai-chat--settings-open");
        settingsPanel.hidden = true;
        settingsPanel.setAttribute("aria-hidden", "true");
        settingsToggle?.setAttribute("aria-expanded", "false");
      }
      if (open) {
        window.setTimeout(() => {
          resizeAiChatInput(input);
          input?.focus();
          syncAiChatVisualInsets(chat);
        }, 0);
      }
    };

    applyAiChatSettings(root);
    setOpen(false);

    toggle?.addEventListener("click", () => setOpen(panel.hidden));
    close?.addEventListener("click", () => setOpen(false));
    settingsToggle?.addEventListener("click", () => {
      const open = Boolean(settingsPanel?.hidden);
      chat?.classList.toggle("ai-chat--settings-open", open);
      if (settingsPanel) {
        settingsPanel.hidden = !open;
        settingsPanel.setAttribute("aria-hidden", String(!open));
      }
      settingsToggle.setAttribute("aria-expanded", String(open));
    });
    root.querySelectorAll("[data-ai-setting]").forEach((control) => {
      control.addEventListener("input", () => {
        updateAiChatSettingFromControl(control);
        saveAiChatSettings();
        applyAiChatSettings(root);
      });
      control.addEventListener("change", () => {
        updateAiChatSettingFromControl(control);
        saveAiChatSettings();
        applyAiChatSettings(root);
      });
    });
    root.querySelector(".ai-chat-reset")?.addEventListener("click", () => {
      state._assistantSettings = getAiChatDefaultSettings();
      /* Reset wirkt sich auf Kontextbudget aus — Snapshot fallen lassen. */
      state._assistantContextData = null;
      saveAiChatSettings();
      applyAiChatSettings(root);
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendMessage(input?.value || "");
    });
    submit?.addEventListener("click", (event) => {
      if (!state._assistantBusy) return;
      event.preventDefault();
      cancelAiChatRun(root);
    });
    input?.addEventListener("input", () => resizeAiChatInput(input));
    input?.addEventListener("focus", () => {
      const sync = () => syncAiChatVisualInsets(chat);
      window.requestAnimationFrame(sync);
      [120, 320, 620, 900].forEach((ms) => window.setTimeout(sync, ms));
    });
    resizeAiChatInput(input);

    renderAiChatMessages(root);
    renderAiChatTechInfo(root);
    renderAiChatDebugData(root);
    detectAiChatRuntime(root);
  }

  function getAiChatLabels() {
    const labels = state._aiChatContent?.labels || {};
    return labels[state.lang] || labels.de || {};
  }

  function getAiChatModels() {
    const models = state._aiChatContent?.models;
    return Array.isArray(models) && models.length ? models : [{ id: AI_ASSISTANT_MODEL, label: "Qwen2.5 0.5B" }];
  }

  function getAiChatModuleUrls() {
    const urls = state._aiChatContent?.webLlmModuleUrls;
    return Array.isArray(urls) && urls.length ? urls : [];
  }

  function getAiChatDefaultSettings() {
    return { ...FALLBACK_AI_CHAT_SETTINGS, ...(state._aiChatContent?.defaultSettings || {}) };
  }

  function clampAiChatNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeAiChatSettings(settings) {
    const defaults = getAiChatDefaultSettings();
    const next = { ...defaults, ...(settings || {}) };
    const modelIds = getAiChatModels().map((model) => model.id);
    if (!modelIds.includes(next.model)) next.model = defaults.model;

    next.temperature = clampAiChatNumber(next.temperature, 0, 1, defaults.temperature);
    next.maxTokens = Math.round(clampAiChatNumber(next.maxTokens, 120, 2048, defaults.maxTokens));
    next.contextChars = Math.round(clampAiChatNumber(next.contextChars, 1800, 9000, defaults.contextChars));
    next.historyMessages = Math.round(clampAiChatNumber(next.historyMessages, 2, 24, defaults.historyMessages));
    next.maxQuestionChars = Math.round(clampAiChatNumber(next.maxQuestionChars, 200, 2000, defaults.maxQuestionChars));
    next.cacheBackend = next.cacheBackend === "cache" ? "cache" : "indexeddb";
    next.useFallback = Boolean(next.useFallback);
    next.showTech = Boolean(next.showTech);
    next.showDebugData = Boolean(next.showDebugData);
    /* Alte localStorage-Werte aufräumen */
    delete next.accent;
    delete next.topP;
    delete next.frequencyPenalty;
    delete next.presencePenalty;

    return next;
  }

  function formatAiChatValueLabel(key, value) {
    if (key === "temperature") return Number(value).toFixed(2);
    return String(value);
  }

  function syncAiChatSettingValueLabels(root) {
    const settings = state._assistantSettings;
    root?.querySelectorAll?.("[data-ai-value-for]")?.forEach((el) => {
      const key = el.dataset.aiValueFor;
      if (key && key in settings) el.textContent = formatAiChatValueLabel(key, settings[key]);
    });
  }

  function applyAiChatLabels(root, labels) {
    root.querySelectorAll("[data-ai-label]").forEach((el) => {
      const key = el.dataset.aiLabel;
      el.textContent = labels[key] || "";
    });
    const chat = root.querySelector(".ai-chat");
    const toggle = root.querySelector(".ai-chat-toggle");
    const close = root.querySelector(".ai-chat-close");
    const settingsToggle = root.querySelector(".ai-chat-settings-toggle");
    const metrics = root.querySelector(".ai-chat-metrics");
    const input = root.querySelector("#ai-chat-input");
    const submit = root.querySelector(".ai-chat-submit");
    chat?.setAttribute("aria-label", labels.title || "");
    toggle?.setAttribute("aria-label", labels.button || "");
    toggle?.setAttribute("title", labels.button || "");
    close?.setAttribute("aria-label", labels.close || "");
    settingsToggle?.setAttribute("aria-label", labels.settings || "");
    metrics?.setAttribute("aria-label", labels.metricsLabel || "");
    if (input) input.placeholder = labels.placeholder || "";
    if (submit) {
      submit.setAttribute("aria-label", labels.send || "");
      submit.title = labels.send || "";
    }
    resizeAiChatInput(input);
  }

  function renderAiChatModelOptions(root) {
    const select = root?.querySelector?.("[data-ai-setting='model']");
    if (!select) return;
    select.innerHTML = getAiChatModels()
      .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.label || model.id)}</option>`)
      .join("");
  }

  function getSelectedAiChatModelInfo() {
    const selected = state._assistantSettings.model || AI_ASSISTANT_MODEL;
    return getAiChatModels().find((model) => model.id === selected) || getAiChatModels()[0] || {};
  }

  function renderAiChatModelInfo(root) {
    const box = root?.querySelector?.("[data-ai-model-info]");
    if (!box) return;
    const model = getSelectedAiChatModelInfo();
    const localModelValue = (value) => (typeof value === "object" ? value[state.lang] || value.de || "" : value || "");
    const note = typeof model.bestFor === "object" ? model.bestFor[state.lang] || model.bestFor.de : model.bestFor;
    box.innerHTML = `
      <strong>${escapeHtml(model.label || model.id || "")}</strong>
      <span>${escapeHtml([model.size, localModelValue(model.speed), localModelValue(model.memory)].filter(Boolean).join(" · "))}</span>
      ${note ? `<p>${escapeHtml(note)}</p>` : ""}
    `;
  }

  function loadAiChatSettings() {
    const defaults = getAiChatDefaultSettings();
    try {
      const saved = JSON.parse(localStorage.getItem(AI_CHAT_SETTINGS_KEY) || "null");
      if (!saved || typeof saved !== "object") return defaults;
      return normalizeAiChatSettings(saved);
    } catch (_) {
      return defaults;
    }
  }

  function saveAiChatSettings() {
    localStorage.setItem(AI_CHAT_SETTINGS_KEY, JSON.stringify(state._assistantSettings));
  }

  function updateAiChatSettingFromControl(control) {
    const key = control?.dataset?.aiSetting;
    if (!key || !(key in state._assistantSettings)) return;
    const previousModel = state._assistantSettings.model;
    if (control.type === "checkbox") {
      state._assistantSettings[key] = Boolean(control.checked);
    } else if (control.type === "number" || control.type === "range") {
      state._assistantSettings[key] = Number(control.value);
    } else {
      state._assistantSettings[key] = control.value;
    }
    state._assistantSettings = normalizeAiChatSettings(state._assistantSettings);
    if ((key === "model" && state._assistantSettings.model !== previousModel) || key === "cacheBackend") {
      state._assistantEnginePromise = null;
      state._assistantEngine = null;
      state._assistantTech.progress = "Modell gewechselt";
      state._assistantTech.loadMs = null;
    }
    if (key === "contextChars") {
      /* Kontextbudget verändert ⇒ vorhandenen Snapshot verwerfen, beim nächsten Prompt neu bauen. */
      state._assistantContextData = null;
    }
    state._assistantTech.model = state._assistantSettings.model;
  }

  function applyAiChatSettings(root) {
    const chat = root?.querySelector?.(".ai-chat");
    if (!chat) return;
    state._assistantSettings = normalizeAiChatSettings(state._assistantSettings);
    const settings = state._assistantSettings;
    chat.classList.add("ai-chat--compact", "ai-chat--right");
    chat.style.removeProperty("--ai-chat-accent");
    state._assistantTech.model = settings.model || AI_ASSISTANT_MODEL;

    const setVisible = (selector, visible) => {
      root.querySelectorAll(selector).forEach((el) => {
        el.hidden = !visible;
      });
    };
    setVisible(".ai-chat-metrics", true);
    setVisible(".ai-chat-tech", settings.showTech);
    setVisible(".ai-chat-debug", settings.showDebugData);
    const modelChip = root.querySelector("[data-ai-chip-model]");
    if (modelChip) modelChip.textContent = settings.model.replace("-Instruct-q4f16_1-MLC", "");
    renderAiChatModelInfo(root);
    renderAiChatDebugData(root);

    root.querySelectorAll("[data-ai-setting]").forEach((control) => {
      const key = control.dataset.aiSetting;
      if (!(key in settings)) return;
      if (control.type === "checkbox") {
        control.checked = Boolean(settings[key]);
      } else {
        control.value = settings[key];
      }
    });
    const input = root.querySelector("#ai-chat-input");
    if (input) {
      const maxQ = Number(settings.maxQuestionChars);
      input.maxLength = Number.isFinite(maxQ) ? Math.max(100, Math.min(2000, Math.round(maxQ))) : 700;
    }
    syncAiChatSettingValueLabels(root);
  }

  function resizeAiChatInput(input) {
    if (!input) return;
    const cs = typeof window !== "undefined" ? window.getComputedStyle(input) : null;
    const maxPx =
      cs && cs.maxHeight && cs.maxHeight !== "none" ? Number.parseFloat(cs.maxHeight) || 112 : 112;
    input.style.height = "auto";
    const scroll = input.scrollHeight;
    input.style.height = `${Math.min(scroll, maxPx)}px`;
  }

  function setAiChatBusy(root, busy) {
    const chat = root?.querySelector?.(".ai-chat");
    const submit = root?.querySelector?.(".ai-chat-submit");
    const labels = getAiChatLabels();
    chat?.classList.toggle("ai-chat--busy", busy);
    if (submit) {
      submit.setAttribute("aria-label", busy ? labels.stop : labels.send);
      submit.title = busy ? labels.stop : labels.send;
    }
  }

  function cancelAiChatRun(root) {
    const labels = getAiChatLabels();
    if (!state._assistantBusy) return;
    state._assistantCancelRequested = true;
    state._assistantRunId += 1;
    state._assistantBusy = false;
    setAiChatBusy(root, false);
    setAiChatLive(root, labels.canceling, true);
    try {
      state._assistantEngine?.interruptGenerate?.();
    } catch (error) {
      console.warn("Could not interrupt WebLLM generation:", error);
    }
    state._assistantEnginePromise = null;
    state._assistantTech.progress = labels.cancelled || "cancelled";
    renderAiChatTechInfo(root);
  }

  /* -------- Same-Origin Site-Crawler (parallel, mit Session-TTL-Cache) ----------------------- */

  /** Strippt Skript-/Style-/Layout-Hülsen und liefert kompakten Klartext der Seiteninhalte. */
  function stripHtmlForAiContext(html) {
    if (!html) return "";
    let doc;
    try {
      doc = new DOMParser().parseFromString(String(html), "text/html");
    } catch (_) {
      return "";
    }
    const removeSelectors = [
      "script", "style", "noscript", "template", "svg", "iframe",
      ".ai-chat", "#ai-chat-root", ".fetch-blocked-banner",
      ".site-header", ".site-footer", "#site-header", "#site-footer"
    ];
    doc.querySelectorAll(removeSelectors.join(",")).forEach((el) => el.remove());
    const root = doc.querySelector("main") || doc.body;
    if (!root) return "";
    const raw = root.innerText || root.textContent || "";
    return raw.replace(/\s+/g, " ").trim();
  }

  function pathnameDirname(pathname) {
    const p = String(pathname || "");
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.slice(0, i + 1) : "/";
  }

  function isAllowedAiHtmlCrawlPathname(pathname) {
    const lower = String(pathname || "").toLowerCase();
    if (!lower.endsWith(".html")) return false;
    if (lower.includes("/components/")) return false;
    return true;
  }

  function isSameSiteForAiCrawl(target, baseline) {
    try {
      if (baseline.protocol === "https:" || baseline.protocol === "http:") {
        return (target.protocol === "https:" || target.protocol === "http:") && target.origin === baseline.origin;
      }
      if (baseline.protocol === "file:" && target.protocol === "file:") {
        return pathnameDirname(target.pathname) === pathnameDirname(baseline.pathname);
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  /** Stabile URL-Schreibweise (gleiche Seite ⇒ gleicher Schlüssel). */
  function normalizeAiCrawlUrl(url) {
    const u = url instanceof URL ? new URL(url.href) : new URL(String(url));
    u.hash = "";
    u.search = "";
    if (u.pathname === "/" || u.pathname === "") u.pathname = "/index.html";
    return u.href;
  }

  function collectSameOriginHtmlLinksFromHtml(html, pageHref) {
    const found = new Set();
    let doc;
    try {
      doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    } catch (_) {
      return found;
    }
    const base = String(pageHref || "").trim() || window.location.href;
    const baseline = new URL(window.location.href);
    doc.querySelectorAll("a[href]").forEach((el) => {
      const raw = el.getAttribute("href");
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("mailto:") || lower.startsWith("javascript:") || lower.startsWith("tel:")) return;
      try {
        const u = new URL(trimmed, base);
        if (!isSameSiteForAiCrawl(u, baseline)) return;
        if (!isAllowedAiHtmlCrawlPathname(u.pathname)) return;
        found.add(normalizeAiCrawlUrl(u));
      } catch (_) {
        /* ignore */
      }
    });
    return found;
  }

  function shortLabelForHtmlDigestUrl(pageHref) {
    try {
      const u = new URL(pageHref);
      const tail = u.pathname.split("/").filter(Boolean).pop() || u.pathname;
      return tail || pageHref;
    } catch (_) {
      return pageHref;
    }
  }

  /**
   * Sammelt Seed-URLs für den BFS-Crawl. Da Header/Footer als Partials zur Laufzeit
   * eingehängt werden, holen wir sie zur reinen Linkermittlung mit ab — damit die
   * gesamte Site-Navigation (alle Top-Level-Seiten) aus dem realen Markup stammt.
   */
  async function harvestAiCrawlSeeds() {
    const seeds = new Set();
    try {
      seeds.add(normalizeAiCrawlUrl(new URL("./index.html", window.location.href)));
    } catch (_) {}
    try {
      const cur = new URL(window.location.href);
      if (cur.pathname.toLowerCase().endsWith(".html")) seeds.add(normalizeAiCrawlUrl(cur));
    } catch (_) {}
    const partials = ["./components/header.html", "./components/footer.html"];
    const partialHtml = await Promise.all(partials.map((url) => fetchText(url, { fresh: true })));
    partials.forEach((url, i) => {
      const html = partialHtml[i];
      if (!html) return;
      const base = (() => {
        try { return new URL(url, window.location.href).href; } catch (_) { return window.location.href; }
      })();
      for (const link of collectSameOriginHtmlLinksFromHtml(html, base)) seeds.add(link);
    });
    return Array.from(seeds);
  }

  /**
   * BFS über Same-Origin-`.html`-Seiten, parallel pro Welle.
   * Cached pro Session: bei TTL-Hit wird nicht erneut geladen.
   */
  async function crawlSiteHtmlPagesForAiDigest(options) {
    const opts = options && typeof options === "object" ? options : {};
    const maxPages = Math.min(Math.max(Number(opts.maxPages) || AI_CRAWL_MAX_PAGES, 4), 60);
    const ttlMs = Number.isFinite(opts.ttlMs) ? Math.max(0, opts.ttlMs) : AI_CRAWL_TTL_MS;
    const concurrency = Math.min(Math.max(Number(opts.concurrency) || AI_CRAWL_CONCURRENCY, 1), 8);

    if (!state._aiSiteCrawl) state._aiSiteCrawl = { pages: new Map() };
    const cache = state._aiSiteCrawl.pages;
    const now = Date.now();

    const scheduled = new Set();
    const queue = [];
    const ordered = [];

    function schedule(href) {
      let u;
      try {
        u = new URL(href, window.location.href);
      } catch (_) {
        return;
      }
      if (!isSameSiteForAiCrawl(u, new URL(window.location.href))) return;
      if (!isAllowedAiHtmlCrawlPathname(u.pathname)) return;
      const key = normalizeAiCrawlUrl(u);
      if (scheduled.has(key)) return;
      scheduled.add(key);
      queue.push(key);
    }

    for (const seed of await harvestAiCrawlSeeds()) schedule(seed);

    while (queue.length && ordered.length < maxPages) {
      const slot = Math.min(concurrency, maxPages - ordered.length, queue.length);
      const wave = queue.splice(0, slot);
      const results = await Promise.all(
        wave.map(async (url) => {
          const cached = cache.get(url);
          if (cached && now - cached.fetchedAt < ttlMs) return cached;
          const html = await fetchText(url, { fresh: true });
          const plain = html ? stripHtmlForAiContext(html) : "";
          const links = html ? Array.from(collectSameOriginHtmlLinksFromHtml(html, url)) : [];
          const entry = { url, plain, links, fetchedAt: Date.now() };
          cache.set(url, entry);
          return entry;
        })
      );
      for (const entry of results) {
        if (!entry) continue;
        if (entry.plain) ordered.push({ url: entry.url, plain: entry.plain });
        if (ordered.length >= maxPages) break;
        for (const link of entry.links || []) schedule(link);
      }
    }
    return ordered;
  }

  function buildHtmlDigestFromPages(pages, perPageMax, totalBudget) {
    const maxTotal = typeof totalBudget === "number" && totalBudget > 0 ? totalBudget : AI_CRAWL_TOTAL_CHARS;
    const per = typeof perPageMax === "number" && perPageMax > 0 ? perPageMax : AI_CRAWL_PER_PAGE_CHARS;
    const chunks = [];
    let used = 0;
    for (const { url, plain } of pages) {
      if (!plain || used >= maxTotal) continue;
      const slice = Math.min(per, maxTotal - used);
      const trimmed = plain.length > slice ? plain.slice(0, slice) : plain;
      if (!trimmed) continue;
      const label = shortLabelForHtmlDigestUrl(url);
      const block = `--- ${label} ---\n${trimmed}`;
      chunks.push(block);
      used += block.length + 2;
    }
    return chunks.join("\n\n").trim();
  }

  /**
   * Liefert einen frischen oder gecachten Kontext-Snapshot. Wiederverwendung über
   * mehrere Folgefragen → keine erneuten Fetches innerhalb des TTL.
   */
  async function getOrBuildAiContextSnapshot(root, { force = false } = {}) {
    const snapshot = state._assistantContextData;
    const fresh =
      !force &&
      snapshot &&
      snapshot.lang === state.lang &&
      Number.isFinite(snapshot.ts) &&
      Date.now() - snapshot.ts < AI_CONTEXT_TTL_MS;
    if (fresh) return snapshot;

    const labels = getAiChatLabels();
    state._assistantTech.contextStatus = labels.loadingContext || "loading";
    setAiChatLive(root, labels.loadingContext || labels.loading, true);
    renderAiChatTechInfo(root);

    const [events, posts, homeSnap, globalSnap, htmlPages] = await Promise.all([
      loadEvents({ force: true }),
      loadPostsIndex({ force: true }),
      fetchJson("./data/home/home-page.json", { fresh: true }),
      fetchJson("./data/global/global.json", { fresh: true }),
      crawlSiteHtmlPagesForAiDigest({ maxPages: AI_CRAWL_MAX_PAGES, ttlMs: AI_CRAWL_TTL_MS })
    ]);

    const htmlDigest = htmlPages.length
      ? buildHtmlDigestFromPages(htmlPages, AI_CRAWL_PER_PAGE_CHARS, AI_CRAWL_TOTAL_CHARS)
      : "";
    const context = buildAiAssistantContext(events, posts, {
      home: homeSnap && typeof homeSnap === "object" ? homeSnap : null,
      globalData: globalSnap && typeof globalSnap === "object" ? globalSnap : null,
      htmlDigest: htmlDigest || null
    });

    state._assistantContextData = {
      lang: state.lang,
      ts: Date.now(),
      builtAt: new Date().toISOString(),
      events: Array.isArray(events) ? events : [],
      posts: Array.isArray(posts) ? posts : [],
      crawledPages: htmlPages.length,
      context
    };
    state._assistantTech.contextStatus = labels.contextLoaded || "loaded";
    state._assistantTech.lastContextChars = context.length;
    renderAiChatTechInfo(root);
    renderAiChatDebugData(root);
    return state._assistantContextData;
  }

  async function handleAiChatMessage(message, root, statusEl, inputEl, submitEl) {
    const labels = getAiChatLabels();
    const startedAt = performance.now();
    const runId = state._assistantRunId + 1;
    state._assistantRunId = runId;
    state._assistantCancelRequested = false;
    state._assistantBusy = true;
    if (submitEl) submitEl.disabled = false;
    setAiChatBusy(root, true);
    state._assistantMessages.push({ role: "user", content: message });
    state._assistantTech.lastPromptChars = message.length;
    state._assistantTech.lastError = "";
    renderAiChatMessages(root);
    renderAiChatTechInfo(root);
    setAiChatLive(root, labels.loadingContext || labels.loading, true);
    setAiChatStatus(statusEl, labels.loadingContext || labels.loading);

    try {
      /* Kontext und Engine parallel vorbereiten — Crawl/JSON läuft, während Adapter/Modell wartet. */
      const [contextData, engine] = await Promise.all([
        getOrBuildAiContextSnapshot(root),
        ensureAiAssistantEngine((progressText, mode) => {
          if (state._assistantCancelRequested || runId !== state._assistantRunId) return;
          setAiChatLive(root, progressText || labels.loading, true, mode || "loading");
          setAiChatStatus(statusEl, progressText || labels.loading);
        })
      ]);
      if (state._assistantCancelRequested || runId !== state._assistantRunId) {
        throw new Error("Berechnung abgebrochen");
      }
      setAiChatLive(root, labels.thinking, true);
      setAiChatStatus(statusEl, labels.thinking);

      const histN = Math.round(
        clampAiChatNumber(state._assistantSettings.historyMessages, 2, 24, 6)
      );
      const messages = [
        {
          role: "system",
          content: buildAiAssistantSystemPrompt(contextData.events, contextData.posts, contextData.context)
        },
        ...state._assistantMessages.slice(-histN).map((entry) => ({
          role: entry.role,
          content: entry.content
        }))
      ];
      const answer = await createAiAssistantCompletion(engine, messages, root, runId);
      if (!answer.trim()) {
        state._assistantMessages.push({ role: "assistant", content: labels.error });
      }
      state._assistantTech.fallback = false;
      state._assistantTech.lastLatencyMs = Math.round(performance.now() - startedAt);
      setAiChatLive(root, labels.completed, false);
      setAiChatStatus(statusEl, labels.privacy);
    } catch (error) {
      if (state._assistantCancelRequested || runId !== state._assistantRunId) {
        setAiChatLive(root, labels.cancelled, false);
        return;
      }
      console.warn("AI assistant failed:", error);
      const technicalReason = error?.message || String(error || "Unknown error");
      state._assistantTech.fallback = true;
      state._assistantTech.lastLatencyMs = Math.round(performance.now() - startedAt);
      state._assistantTech.lastError = technicalReason;
      const contextData = state._assistantContextData?.lang === state.lang ? state._assistantContextData : null;
      if (isAiModelDownloadError(error)) {
        const fallback = state._assistantSettings.useFallback
          ? `\n\n${buildLocalContextFallbackAnswer(message, contextData?.events || [], contextData?.posts || [])}`
          : "";
        state._assistantMessages.push({
          role: "assistant",
          content: `${labels.modelDownloadError}${fallback}\n\n${labels.technicalNotice}: ${technicalReason}`
        });
        setAiChatLive(root, `${labels.modelDownloadError}`, true, "error");
        setAiChatStatus(statusEl, labels.modelDownloadError);
        return;
      }
      const fallback = state._assistantSettings.useFallback
        ? buildLocalContextFallbackAnswer(message, contextData?.events || [], contextData?.posts || [])
        : labels.error;
      state._assistantMessages.push({
        role: "assistant",
        content: `${fallback}\n\n${labels.technicalNotice}: ${technicalReason}`
      });
      setAiChatLive(root, `WebLLM nicht verfügbar: ${technicalReason}`, true, "error");
      setAiChatStatus(statusEl, !navigator.gpu ? labels.webgpuMissing : labels.fallback);
    } finally {
      if (runId === state._assistantRunId) {
        state._assistantBusy = false;
        state._assistantCancelRequested = false;
        setAiChatBusy(root, false);
      }
      renderAiChatMessages(root);
      renderAiChatTechInfo(root);
      renderAiChatDebugData(root);
      inputEl?.focus();
    }
  }

  async function createAiAssistantCompletion(engine, messages, root, runId) {
    const s = state._assistantSettings;
    /* WebLLM/MLC: frequency_/presence_penalty führen mit manchen Modellen/Versionen zu Fehlern — nicht mitschicken. */
    /* top_p ist Konstante (AI_CHAT_TOP_P): stabilere Inferenz als gemischte localStorage-Werte. */
    const request = {
      messages,
      temperature: clampAiChatNumber(s.temperature, 0, 1, 0.35),
      max_tokens: Math.round(clampAiChatNumber(s.maxTokens, 120, 2048, 320)),
      top_p: AI_CHAT_TOP_P
    };

    const assistantMessage = { role: "assistant", content: "" };
    state._assistantMessages.push(assistantMessage);
    renderAiChatMessages(root);
    let lastLiveAt = 0;

    try {
      if (state._assistantCancelRequested || runId !== state._assistantRunId) {
        removeAiChatMessage(assistantMessage);
        return "";
      }
      const stream = await engine.chat.completions.create({
        ...request,
        stream: true
      });
      for await (const chunk of stream) {
        if (state._assistantCancelRequested || runId !== state._assistantRunId) {
          try {
            state._assistantEngine?.interruptGenerate?.();
          } catch (_) {
            // ignore unsupported interruption
          }
          removeAiChatMessage(assistantMessage);
          renderAiChatMessages(root);
          return "";
        }
        const delta = chunk?.choices?.[0]?.delta?.content || "";
        if (!delta) continue;
        assistantMessage.content += delta;
        /* Inkrementell: nur die letzte Sprechblase aktualisieren statt das ganze Listen-DOM. */
        if (!appendAssistantStreamDelta(root, delta)) renderAiChatMessages(root);
        const now = performance.now();
        if (now - lastLiveAt > AI_LIVE_UPDATE_MIN_MS) {
          lastLiveAt = now;
          setAiChatLive(root, `WebLLM: ${assistantMessage.content.length} Zeichen`, true);
        }
      }
      assistantMessage.content = assistantMessage.content.trim();
      renderAiChatMessages(root);
      return assistantMessage.content;
    } catch (streamError) {
      removeAiChatMessage(assistantMessage);
      if (state._assistantCancelRequested || runId !== state._assistantRunId) return "";
      console.warn("WebLLM streaming failed, retrying without stream:", streamError);
      setAiChatLive(root, getAiChatLabels().streamFallback, true);
      const completion = await engine.chat.completions.create(request);
      if (state._assistantCancelRequested || runId !== state._assistantRunId) return "";
      const answer = completion?.choices?.[0]?.message?.content?.trim() || "";
      state._assistantMessages.push({ role: "assistant", content: answer });
      renderAiChatMessages(root);
      return answer;
    }
  }

  /** Hängt einen Streaming-Delta an die letzte Assistant-Bubble an (wenn vorhanden). */
  function appendAssistantStreamDelta(root, delta) {
    const list = root?.querySelector?.("[data-ai-chat-messages]");
    if (!list) return false;
    const last = list.lastElementChild;
    if (!last || !last.classList.contains("ai-chat-message--assistant")) return false;
    last.appendChild(document.createTextNode(delta));
    list.scrollTop = list.scrollHeight;
    return true;
  }

  function removeAiChatMessage(message) {
    const index = state._assistantMessages.indexOf(message);
    if (index >= 0) state._assistantMessages.splice(index, 1);
  }

  /** Einmalige WebGPU-Adapter-Erkennung (geteilt zwischen Runtime-UI und Engine-Init). */
  function ensureWebGpuAdapter() {
    if (!navigator.gpu) return Promise.resolve(null);
    if (!state._aiAdapterPromise) {
      state._aiAdapterPromise = navigator.gpu.requestAdapter().catch((error) => {
        state._aiAdapterPromise = null;
        throw error;
      });
    }
    return state._aiAdapterPromise;
  }

  async function ensureAiAssistantEngine(onProgress) {
    const labels = getAiChatLabels();
    if (!navigator.gpu) {
      throw new Error("WebGPU is not available");
    }
    const adapter = await ensureWebGpuAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter found");
    }
    if (state._assistantEnginePromise) return state._assistantEnginePromise;
    const loadStartedAt = performance.now();
    state._assistantTech.downloadProgress = labels.downloadPreparing || "";
    onProgress?.(state._assistantTech.downloadProgress, "loading");
    state._assistantEnginePromise = importWebLlmModule()
      .then((webllm) =>
        webllm.CreateMLCEngine(state._assistantSettings.model || AI_ASSISTANT_MODEL, {
          appConfig: {
            ...(webllm.prebuiltAppConfig || {}),
            cacheBackend: state._assistantSettings.cacheBackend || "indexeddb"
          },
          initProgressCallback: (progress) => {
            const formatted = formatAiModelDownloadProgress(progress);
            state._assistantTech.downloadProgress = formatted;
            state._assistantTech.progress = formatted || labels.loading;
            onProgress?.(state._assistantTech.progress, "loading");
          }
        })
      )
      .then((engine) => {
        state._assistantEngine = engine;
        state._assistantTech.progress = "bereit";
        state._assistantTech.downloadProgress = "";
        state._assistantTech.loadMs = Math.round(performance.now() - loadStartedAt);
        return engine;
      })
      .catch((error) => {
        state._assistantEnginePromise = null;
        state._assistantEngine = null;
        state._assistantTech.progress = "Fehler";
        state._assistantTech.downloadProgress = "";
        state._assistantTech.lastError = error?.message || String(error || "Unbekannter Fehler");
        renderAiChatTechInfo(document.getElementById("ai-chat-root"));
        throw error;
      });
    return state._assistantEnginePromise;
  }

  async function importWebLlmModule() {
    let lastError = null;
    for (const url of getAiChatModuleUrls()) {
      try {
        return await import(url);
      } catch (error) {
        lastError = error;
        console.warn("WebLLM module import failed:", url, error);
      }
    }
    throw lastError || new Error("WebLLM module could not be imported");
  }

  function renderAiChatMessages(root) {
    const list = root?.querySelector?.("[data-ai-chat-messages]");
    if (!list) return;
    list.innerHTML = state._assistantMessages
      .map(
        (message) => `
          <div class="ai-chat-message ai-chat-message--${message.role === "user" ? "user" : "assistant"}">
            ${escapeHtml(message.content)}
          </div>
        `
      )
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  function setAiChatStatus(statusEl, text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
  }

  function setAiChatLive(root, text, keepVisible, mode = "") {
    const live = root?.querySelector?.("[data-ai-chat-live]");
    if (!live) return;
    live.textContent = text || "";
    live.hidden = !keepVisible && !text;
    live.classList.toggle("ai-chat-live--loading", mode === "loading");
    live.classList.toggle("ai-chat-live--error", mode === "error");
    if (!keepVisible && text) {
      window.setTimeout(() => {
        if (live.textContent === text) live.hidden = true;
      }, 2200);
    }
  }

  function formatAiModelDownloadProgress(progress) {
    const labels = getAiChatLabels();
    const rawText = String(progress?.text || "").trim();
    const percent = typeof progress?.progress === "number" ? Math.max(0, Math.min(100, Math.round(progress.progress * 100))) : null;
    const cacheMatch = rawText.match(/cache\[(\d+)\/(\d+)\]/i);
    const fetchedMatch = rawText.match(/([\d.]+\s*(?:KB|MB|GB))\s+fetched/i);
    const elapsedMatch = rawText.match(/(\d+)\s+secs?\s+elapsed/i);
    const parts = [labels.downloadingModel || labels.loading];
    if (cacheMatch) parts.push(`${cacheMatch[1]}/${cacheMatch[2]}`);
    if (percent !== null) parts.push(`${percent}%`);
    if (fetchedMatch) parts.push(fetchedMatch[1]);
    if (elapsedMatch) parts.push(`${elapsedMatch[1]}s`);
    if (parts.length > 1) return parts.join(" · ");
    return rawText || labels.downloadPreparing || labels.loading;
  }

  function isAiModelDownloadError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return (
      message.includes("cache.add") ||
      (message.includes("cache") && message.includes("network error")) ||
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      (message.includes("model") && message.includes("download"))
    );
  }

  async function detectAiChatRuntime(root) {
    const chip = root?.querySelector?.("[data-ai-chip-webgpu]");
    if (!navigator.gpu) {
      state._assistantTech.webgpu = "nicht verfügbar";
      state._assistantTech.adapter = "kein WebGPU-Adapter";
      if (chip) chip.textContent = "WebGPU fehlt";
      renderAiChatTechInfo(root);
      return;
    }

    state._assistantTech.webgpu = "verfügbar";
    if (chip) chip.textContent = "WebGPU aktiv";
    try {
      const adapter = await ensureWebGpuAdapter();
      const info = adapter?.info || {};
      const adapterName = [info.vendor, info.architecture || info.device, info.description]
        .filter(Boolean)
        .join(" / ");
      state._assistantTech.adapter = adapterName || (adapter ? "Adapter erkannt" : "kein Adapter erkannt");
    } catch (error) {
      state._assistantTech.adapter = "Adapterdetails blockiert";
      state._assistantTech.lastError = error?.message || String(error || "Adapterfehler");
    }
    renderAiChatTechInfo(root);
  }

  function renderAiChatTechInfo(root) {
    const list = root?.querySelector?.("[data-ai-chat-tech]");
    if (!list) return;
    const labels = getAiChatLabels();
    const tech = state._assistantTech;
    const cfg = state._assistantSettings;
    const rows = [
      [labels.techModel, tech.model],
      [labels.techRuntime, tech.runtime],
      [labels.techWebgpu, tech.webgpu],
      [labels.techAdapter, tech.adapter],
      [labels.techProgress, tech.progress],
      [labels.techDownloadProgress, tech.downloadProgress || "-"],
      [labels.techCacheBackend, cfg.cacheBackend || "indexeddb"],
      [labels.techLoadMs, formatMs(tech.loadMs)],
      [labels.techLastLatencyMs, formatMs(tech.lastLatencyMs)],
      [labels.techLastPromptChars, `${tech.lastPromptChars} ${labels.chars}`],
      [labels.techLastContextChars, `${tech.lastContextChars} ${labels.chars}`],
      [labels.techTemperature, formatAiChatValueLabel("temperature", cfg.temperature)],
      [labels.techTopP, AI_CHAT_TOP_P.toFixed(2)],
      [labels.techHistoryMessages, String(cfg.historyMessages ?? "")],
      [labels.techMaxQuestionChars, String(cfg.maxQuestionChars ?? "")],
      [labels.techContextStatus, tech.contextStatus || labels.contextNotLoaded],
      [labels.techFallback, tech.fallback ? labels.active : labels.inactive],
      [labels.techLastError, tech.lastError || "-"]
    ];
    list.innerHTML = rows
      .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`)
      .join("");
  }

  function renderAiChatDebugData(root) {
    const pre = root?.querySelector?.("[data-ai-chat-debug-data]");
    if (!pre) return;
    const labels = getAiChatLabels();
    const data = state._assistantContextData?.lang === state.lang ? state._assistantContextData : null;
    if (!data) {
      pre.textContent = labels.debugNotReady || "";
      return;
    }
    pre.textContent = JSON.stringify(
      {
        language: state.lang,
        model: state._assistantSettings.model,
        settings: {
          temperature: state._assistantSettings.temperature,
          topP: AI_CHAT_TOP_P,
          maxTokens: state._assistantSettings.maxTokens,
          contextChars: state._assistantSettings.contextChars,
          historyMessages: state._assistantSettings.historyMessages,
          maxQuestionChars: state._assistantSettings.maxQuestionChars,
          useFallback: state._assistantSettings.useFallback
        },
        context: {
          builtAt: data.builtAt,
          ageMs: Number.isFinite(data.ts) ? Date.now() - data.ts : null,
          chars: data.context.length,
          events: data.events.length,
          posts: data.posts.length,
          crawledPages: data.crawledPages || 0,
          preview: data.context.slice(0, 1800)
        },
        runtime: state._assistantTech,
        lastMessages: state._assistantMessages.slice(-6)
      },
      null,
      2
    );
  }

  function formatMs(value) {
    if (!Number.isFinite(value)) return "-";
    if (value < 1000) return `${Math.round(value)} ms`;
    return `${(value / 1000).toFixed(1)} s`;
  }

  function buildLocalContextFallbackAnswer(question, events, posts) {
    const labels = getAiChatLabels();
    const query = normalizeSearchText(question);
    const intentAnswer = buildIntentFallbackAnswer(query, events, posts);
    if (intentAnswer) return `${labels.fallback}\n\n${intentAnswer}`;

    const candidates = [];
    const home = state._homePageContent || {};
    candidates.push({
      title: pickLocalized(home.heroTitle) || "KI Netzwerk Schweinfurt",
      text: [pickLocalized(home.heroText), pickLocalized(home.missionIntro)].filter(Boolean).join(" ")
    });
    (Array.isArray(events) ? sortEventsForList(events) : []).forEach((event) => {
      candidates.push({
        title: event.title,
        text: [event.description, event.addressPlain, event.date ? formatDate(event.date) : "", event.link]
          .filter(Boolean)
          .join(" ")
      });
    });
    (Array.isArray(posts) ? posts : []).forEach((post) => {
      candidates.push({
        title: post.title,
        text: [post.teaser, post.date ? formatDate(post.date) : ""].filter(Boolean).join(" ")
      });
    });

    const best = candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreSearchCandidate(query, `${candidate.title} ${candidate.text}`)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter((candidate) => candidate.score > 0 || query.length < 3);

    if (!best.length) {
      return `${labels.fallback}\n\n${buildGeneralFallbackAnswer(events, posts)}`;
    }

    const bullets = best.map((candidate) => `- ${candidate.title}: ${candidate.text}`).join("\n");
    return `${labels.fallback}\n\nDas passt am besten zu deiner Frage:\n${bullets}`;
  }

  function buildIntentFallbackAnswer(query, events, posts) {
    const eventWords = ["event", "termin", "wann", "treffen", "workshop", "veranstaltung", "naechste", "nächste"];
    const joinWords = ["mitmachen", "teilnehmen", "kontakt", "speaker", "partner", "unterstuetzen", "unterstützen"];
    const topicWords = ["thema", "themen", "ki", "comfyui", "automatisierung", "agentur", "agentisch", "praxis"];
    const aboutWords = ["was", "wer", "netzwerk", "initiative", "schweinfurt", "mainfranken"];

    if (matchesAny(query, eventWords)) {
      const next = getNextFallbackEvent(events);
      if (!next) return "Aktuell sind in den Website-Daten keine kommenden Events hinterlegt.";
      return [
        `Das nächste Event ist: ${next.title}.`,
        next.date ? `Termin: ${formatDate(next.date)}.` : "",
        next.addressPlain ? `Ort: ${next.addressPlain}.` : "",
        next.description ? `Kurzbeschreibung: ${next.description}` : "",
        next.link ? `Anmeldung: ${next.link}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (matchesAny(query, joinWords)) {
      return "Du kannst mitmachen, ein Thema einbringen oder als Partner unterstützen. Am besten meldest du dich per E-Mail unter ki.netzwerk.schweinfurt@gmail.com.";
    }

    if (matchesAny(query, topicWords)) {
      const event = getNextFallbackEvent(events);
      const eventTopic = event?.description ? ` Beim nächsten Event geht es um: ${event.description}` : "";
      return `Das Netzwerk fokussiert praxisnahe KI-Anwendungen, reale Use Cases, moderne KI-Technologien, agentische Systeme, Automatisierung und Wissensaustausch in der Region.${eventTopic}`;
    }

    if (matchesAny(query, aboutWords)) {
      return buildGeneralFallbackAnswer(events, posts);
    }

    return "";
  }

  function buildGeneralFallbackAnswer(events, posts) {
    const home = state._homePageContent || {};
    const next = getNextFallbackEvent(events);
    const latestPost = Array.isArray(posts) ? posts[0] : null;
    return [
      pickLocalized(home.heroText) ||
        "Das KI Netzwerk Schweinfurt schafft einen offenen Austauschraum für angewandte Künstliche Intelligenz in der Region.",
      next ? `Nächstes Event: ${next.title}${next.date ? ` am ${formatDate(next.date)}` : ""}.` : "",
      latestPost ? `Aktueller Rückblick/Beitrag: ${latestPost.title}.` : "",
      "Kontakt: ki.netzwerk.schweinfurt@gmail.com."
    ]
      .filter(Boolean)
      .join("\n");
  }

  function getNextFallbackEvent(events) {
    const list = Array.isArray(events) ? sortEventsForList(events) : [];
    return list.find((event) => !isEventPast(event)) || list[0] || null;
  }

  function matchesAny(query, words) {
    return words.some((word) => query.includes(normalizeSearchText(word)));
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9äöüß\s.-]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function scoreSearchCandidate(query, text) {
    const haystack = normalizeSearchText(text);
    return query
      .split(" ")
      .filter((word) => word.length >= 3)
      .reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
  }

  function buildAiAssistantSystemPrompt(events, posts, prebuiltContext) {
    const languageName = state.lang === "en" ? "English" : "German";
    const labels = getAiChatLabels();
    const context =
      typeof prebuiltContext === "string" && prebuiltContext.trim()
        ? prebuiltContext.trim()
        : buildAiAssistantContext(events, posts);
    const liveNote =
      labels.systemContextLive ||
      "The website context below was just fetched over HTTP from this deployment (JSON + optional HTML); it is not baked into the model.";
    return [
      `You are the helpful website assistant for "KI Netzwerk Schweinfurt". Answer in ${languageName}.`,
      "Use only the provided website context. If information is missing, say that the website does not contain it and suggest contacting ki.netzwerk.schweinfurt@gmail.com.",
      "Keep answers concise, friendly and practical. Do not invent dates, locations or links.",
      liveNote,
      "",
      "Website context:",
      context
    ].join("\n");
  }

  function buildAiAssistantContext(events, posts, extras) {
    const x = extras && typeof extras === "object" ? extras : {};
    const home = (x.home && typeof x.home === "object" ? x.home : null) || state._homePageContent || {};
    const globalSrc = (x.globalData && typeof x.globalData === "object" ? x.globalData : null) || state._globalData || {};
    const faq = globalSrc[state.lang]?.faq || globalSrc.de?.faq || {};
    const sponsors = Array.isArray(home.sponsors)
      ? home.sponsors.map((s) => `${s.name || ""}${s.link ? ` (${s.link})` : ""}`).filter(Boolean)
      : [];
    const features = [1, 2, 3, 4]
      .map((index) =>
        [
          pickLocalized(home[`feature${index}Title`]),
          pickLocalized(home[`feature${index}Text`])
        ]
          .filter(Boolean)
          .join(": ")
      )
      .filter(Boolean);
    const eventLines = (Array.isArray(events) ? sortEventsForList(events) : [])
      .slice(0, 6)
      .map((event) =>
        [
          event.title,
          event.date ? formatDate(event.date) : "",
          event.addressPlain || "",
          event.description || "",
          event.link ? `Anmeldung/Link: ${event.link}` : ""
        ]
          .filter(Boolean)
          .join(" | ")
      );
    const postLines = (Array.isArray(posts) ? posts : []).slice(0, 4).map((post) =>
      [
        post.title,
        post.date ? formatDate(post.date) : "",
        post.teaser || "",
        post.slug ? `URL: ./blog.html?post=${post.slug}` : ""
      ]
        .filter(Boolean)
        .join(" | ")
    );
    const faqLines = Object.values(faq)
      .map((item) => `${item.question || ""} ${item.answer || ""}`.trim())
      .filter(Boolean);

    /* Strukturierte Daten zuerst — füllen den Großteil des Budgets sicher. */
    const structured = [
      `Name: ${pickLocalized(home.heroTitle) || "KI Netzwerk Schweinfurt"}`,
      `Kurzbeschreibung: ${pickLocalized(home.heroText)}`,
      `Mission: ${pickLocalized(home.missionTitle)} - ${pickLocalized(home.missionIntro)}`,
      `Schwerpunkte: ${features.join("; ")}`,
      `Sponsoren/Partner: ${sponsors.join("; ") || "keine Angabe"}`,
      `Kontakt: ki.netzwerk.schweinfurt@gmail.com`,
      `Events: ${eventLines.join("\n- ") || "keine Events gefunden"}`,
      `Blog/Rueckblicke: ${postLines.join("\n- ") || "keine Blogbeitraege gefunden"}`,
      `FAQ: ${faqLines.join(" | ")}`
    ].join("\n");

    /* HTML-Digest des Site-Crawls füllt den Rest, ohne mitten im Wort zu schneiden. */
    const totalBudget = Number(state._assistantSettings.contextChars) || 5200;
    const htmlDigest = String(x.htmlDigest || "").trim();
    const headerText = "\n\nHTML/Seiten-Klartext (Same-Origin-Crawl):\n";
    const remaining = Math.max(0, totalBudget - structured.length - headerText.length);
    let htmlBlock = "";
    if (htmlDigest && remaining > 200) {
      const fitted = htmlDigest.length > remaining ? htmlDigest.slice(0, remaining) : htmlDigest;
      htmlBlock = `${headerText}${fitted}`;
    }
    const out = `${structured}${htmlBlock}`;
    return out.length > totalBudget ? out.slice(0, totalBudget) : out;
  }

  function pickLocalized(value) {
    if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
    return value[state.lang] || value.de || "";
  }

  function renderHomeSponsors() {
    const slot = document.getElementById("sponsor-strip");
    if (!slot) return;
    const rawSponsors = Array.isArray(state._homePageContent?.sponsors)
      ? state._homePageContent.sponsors
      : [];
    if (!rawSponsors.length) {
      slot.innerHTML = "";
      return;
    }
    const seen = new Set();
    const sponsors = rawSponsors.filter((entry) => {
      const name = String(entry?.name || "").trim();
      const link = String(entry?.link || "").trim();
      const logo = String(entry?.logo || "").trim();
      if (!name) return false;
      const key = `${name}::${link}::${logo}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!sponsors.length) {
      slot.innerHTML = "";
      return;
    }

    const minVisibleItems = 8;
    const repeatedSponsors = [];
    while (repeatedSponsors.length < minVisibleItems) {
      repeatedSponsors.push(...sponsors);
    }
    const marqueeSponsors = repeatedSponsors.slice(0, Math.max(minVisibleItems, sponsors.length * 4));

    const items = marqueeSponsors
      .map((entry) => {
        const name = String(entry?.name || "").trim();
        const link = String(entry?.link || "").trim();
        const logo = String(entry?.logo || "").trim();
        if (!name) return "";
        const inner = logo
          ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}" loading="lazy" />`
          : escapeHtml(name);
        const safeLink = link.startsWith("./") || link.startsWith("/") || link.startsWith("http")
          ? link
          : `https://${link}`;
        if (safeLink) {
          const external = safeLink.startsWith("http");
          const target = external ? ` target="_blank" rel="noopener noreferrer"` : "";
          return `<a class="sponsor-item" href="${escapeHtml(safeLink)}"${target}>${inner}</a>`;
        }
        return `<span class="sponsor-item">${inner}</span>`;
      })
      .filter(Boolean)
      .join("");

    const duration = Math.max(12, marqueeSponsors.length * 2.4);
    slot.style.setProperty("--sponsor-duration", `${duration}s`);
    slot.innerHTML = `
      <div class="sponsor-marquee">
        <div class="sponsor-track">${items}</div>
        <div class="sponsor-track" aria-hidden="true">${items}</div>
      </div>
    `;
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
    const padY = 9;
    const animate = () => {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      const light = document.body.classList.contains("theme-light");

      points.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < pad || p.x > cssWidth - pad) p.vx *= -1;
        if (p.y < padY || p.y > cssHeight - padY) p.vy *= -1;
      });

      edges.forEach(([a, b]) => {
        const p1 = points[a];
        const p2 = points[b];
        const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
        if (light) {
          grad.addColorStop(0, "rgba(13,148,136,0.42)");
          grad.addColorStop(0.5, "rgba(20,184,166,0.52)");
          grad.addColorStop(1, "rgba(45,212,191,0.38)");
        } else {
          grad.addColorStop(0, "rgba(56,189,248,0.38)");
          grad.addColorStop(0.5, "rgba(96,165,250,0.48)");
          grad.addColorStop(1, "rgba(37,99,235,0.34)");
        }
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
        ctx.fillStyle = light ? "rgba(13,148,136,0.9)" : "rgba(14,165,233,0.92)";
        ctx.beginPath();
        ctx.arc(x, y, 1.45, 0, Math.PI * 2);
        ctx.fill();
      });

      points.forEach((p) => {
        ctx.fillStyle = light ? "rgba(13,148,136,0.14)" : "rgba(37,99,235,0.12)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = light ? "rgba(15,118,110,0.88)" : "rgba(30,64,175,0.92)";
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

    const seedPoints = [
      { x: 0.05, y: 0.11, vx: 0.14, vy: 0.08, r: 4.1 },
      { x: 0.11, y: 0.15, vx: 0.12, vy: -0.08, r: 3.6 },
      { x: 0.17, y: 0.1, vx: -0.11, vy: 0.09, r: 3.9 },
      { x: 0.23, y: 0.14, vx: 0.13, vy: -0.1, r: 3.7 },
      { x: 0.29, y: 0.17, vx: -0.09, vy: 0.12, r: 4.2 },
      { x: 0.35, y: 0.21, vx: -0.08, vy: 0.09, r: 3.5 },
      { x: 0.41, y: 0.24, vx: -0.1, vy: -0.06, r: 3.8 },
      { x: 0.47, y: 0.28, vx: 0.1, vy: -0.08, r: 3.7 },
      { x: 0.08, y: 0.4, vx: -0.12, vy: 0.08, r: 3.8 },
      { x: 0.16, y: 0.44, vx: 0.1, vy: -0.07, r: 4 },
      { x: 0.24, y: 0.47, vx: -0.08, vy: 0.11, r: 3.6 },
      { x: 0.32, y: 0.5, vx: 0.11, vy: -0.09, r: 4 },
      { x: 0.4, y: 0.54, vx: 0.1, vy: -0.08, r: 3.9 },
      { x: 0.48, y: 0.59, vx: -0.09, vy: 0.08, r: 3.7 },
      { x: 0.12, y: 0.72, vx: -0.1, vy: -0.07, r: 3.8 },
      { x: 0.23, y: 0.77, vx: 0.07, vy: 0.09, r: 3.7 },
      { x: 0.35, y: 0.81, vx: 0.1, vy: -0.08, r: 3.9 },
      { x: 0.5, y: 0.85, vx: -0.09, vy: 0.08, r: 3.7 },
      { x: 0.74, y: 0.2, vx: 0.08, vy: -0.07, r: 3.6 },
      { x: 0.88, y: 0.66, vx: 0.08, vy: -0.07, r: 3.6 },
      { x: 0.82, y: 0.12, vx: -0.07, vy: 0.08, r: 3.5 },
      { x: 0.94, y: 0.28, vx: 0.06, vy: -0.06, r: 3.4 },
      { x: 0.79, y: 0.46, vx: -0.06, vy: 0.07, r: 3.5 },
      { x: 0.93, y: 0.84, vx: 0.07, vy: -0.06, r: 3.5 }
    ];
    const speedScale = 1.28;
    const points = seedPoints.map((p) => ({
      x: p.x * cssWidth,
      y: p.y * cssHeight,
      vx: p.vx * speedScale,
      vy: p.vy * speedScale,
      r: p.r
    }));

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
      [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14],
      [15, 16], [16, 17], [17, 18], [18, 19],
      [0, 8], [1, 9], [2, 10], [3, 11], [4, 12], [5, 13], [6, 14],
      [8, 15], [9, 16], [10, 17], [11, 17], [12, 18], [13, 19],
      [2, 9], [3, 10], [4, 11], [5, 12], [6, 13],
      [9, 15], [10, 16], [11, 18], [12, 19],
      [6, 20], [7, 20], [20, 21], [21, 22], [22, 23],
      [14, 22], [19, 23], [13, 22], [10, 21], [18, 22]
    ];

    const packets = [
      { edge: 0, t: 0.15, speed: 0.0062 },
      { edge: 4, t: 0.5, speed: 0.0069 },
      { edge: 7, t: 0.23, speed: 0.0076 },
      { edge: 11, t: 0.66, speed: 0.0067 },
      { edge: 16, t: 0.36, speed: 0.0079 },
      { edge: 20, t: 0.48, speed: 0.0071 },
      { edge: 24, t: 0.08, speed: 0.0073 },
      { edge: 28, t: 0.72, speed: 0.007 },
      { edge: 33, t: 0.31, speed: 0.0068 },
      { edge: 41, t: 0.44, speed: 0.0072 },
      { edge: 46, t: 0.21, speed: 0.0071 }
    ];

    const pointerState = {
      x: cssWidth * 0.5,
      y: cssHeight * 0.5,
      active: false
    };
    const clickBursts = [];
    let draggedPointIndex = -1;

    function getCanvasPos(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function findNearestPoint(x, y) {
      let nearestIndex = -1;
      let nearestDist = Infinity;
      points.forEach((p, i) => {
        const dx = p.x - x;
        const dy = p.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIndex = i;
        }
      });
      return { nearestIndex, nearestDist };
    }

    function onPointerDown(event) {
      const pos = getCanvasPos(event);
      pointerState.x = pos.x;
      pointerState.y = pos.y;
      pointerState.active = true;
      clickBursts.push({ x: pos.x, y: pos.y, radius: 8, life: 1, speed: 2.4 });
      clickBursts.push({ x: pos.x, y: pos.y, radius: 2, life: 0.72, speed: 3.4 });
      const nearest = findNearestPoint(pos.x, pos.y);
      if (nearest.nearestDist <= 22) {
        draggedPointIndex = nearest.nearestIndex;
        canvas.style.cursor = "grabbing";
      }
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (_) {
          // ignore unsupported capture errors
        }
      }
    }

    function onPointerMove(event) {
      const pos = getCanvasPos(event);
      pointerState.x = pos.x;
      pointerState.y = pos.y;
      pointerState.active = true;
      if (draggedPointIndex >= 0) {
        const p = points[draggedPointIndex];
        p.x = Math.max(12, Math.min(cssWidth - 12, pos.x));
        p.y = Math.max(12, Math.min(cssHeight - 12, pos.y));
        p.vx *= 0.84;
        p.vy *= 0.84;
      } else {
        const nearest = findNearestPoint(pos.x, pos.y);
        canvas.style.cursor = nearest.nearestDist <= 24 ? "grab" : "default";
      }
    }

    function onPointerUp(event) {
      draggedPointIndex = -1;
      pointerState.active = false;
      canvas.style.cursor = "default";
      if (event && canvas.releasePointerCapture) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch (_) {
          // ignore unsupported capture errors
        }
      }
    }

    function onPointerLeave() {
      draggedPointIndex = -1;
      pointerState.active = false;
      canvas.style.cursor = "default";
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    let rafId = 0;
    const animate = () => {
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      points.forEach((p, index) => {
        if (index !== draggedPointIndex && pointerState.active) {
          const dx = p.x - pointerState.x;
          const dy = p.y - pointerState.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < 120) {
            const force = (120 - dist) * 0.00115;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }
        if (index !== draggedPointIndex) {
          p.vx *= 0.9975;
          p.vy *= 0.9975;
        }
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

      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const p1 = points[i];
          const p2 = points[j];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < 86) {
            const alpha = (1 - dist / 86) * 0.24;
            ctx.strokeStyle = `rgba(96,165,250,${alpha.toFixed(3)})`;
            ctx.lineWidth = 1.05;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      for (let i = clickBursts.length - 1; i >= 0; i -= 1) {
        const burst = clickBursts[i];
        burst.radius += burst.speed;
        burst.life -= 0.026;
        if (burst.life <= 0) {
          clickBursts.splice(i, 1);
          continue;
        }
        const alpha = Math.max(0, burst.life * 0.72);
        ctx.strokeStyle = `rgba(45,212,191,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, burst.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(125,235,255,${Math.max(0, burst.life * 0.23)})`;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, Math.max(2, burst.radius * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }

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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
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

  async function loadEvents(opts) {
    const rawItems = await loadEventEntries(opts);
    if (!Array.isArray(rawItems)) return [];
    const items = (
      await Promise.all(
        rawItems.filter(Boolean).map(async (item) => {
        const loc = item.location && typeof item.location === "object" ? item.location : {};
        const plain = formatLocationPlain(loc, state.lang);
        const localizedContent = await resolveLocalizedMarkdown(
          item.detail?.contentFile,
          item.detail?.content,
          state.lang,
          opts
        );
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
            localizedContent ||
            item.content?.[state.lang] ||
            item.content?.de ||
            "",
          addressPlain: plain,
          addressHtml: formatLocationAddressHtml(loc, state.lang),
          geo: item.geo && typeof item.geo === "object" ? item.geo : null
        };
      })
      )
    )
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
          getI18n("events.detail.pastBadge")
        )}</span>`
      : isNext
        ? `<span class="event-status-badge event-status-badge--next">${escapeHtml(
            getI18n("events.detail.nextBadge")
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
    let toShow = upcoming.slice(0, 2);
    if (!toShow.length && Array.isArray(events) && events.length) {
      const past = events
        .filter((e) => isEventPast(e))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      toShow = past.slice(0, 2);
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
        bodyEl.classList.remove("hidden");
        renderMarkdownInto(bodyEl, extra.trim());
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

  async function loadPostsIndex(opts) {
    const rawItems = await loadPostEntries(opts);
    if (!Array.isArray(rawItems)) return [];
    const items = (
      await Promise.all(
        rawItems.filter(Boolean).map(async (item) => ({
          ...item,
          title: item.title?.[state.lang] || item.title?.de || "",
          teaser: item.teaser?.[state.lang] || item.teaser?.de || "",
          content:
            (await resolveLocalizedMarkdown(item.detail?.contentFile, item.detail?.content, state.lang, opts)) ||
            item.content?.[state.lang] ||
            item.content?.de ||
            "",
          readTime: blogReadTimeLabel(item)
        }))
      )
    )
      .filter((item) => item && item.date);
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function resolveLocalizedMarkdown(fileRef, inlineRef, lang, opts) {
    const fresh = Boolean(opts && opts.force);
    const filePath =
      (fileRef && typeof fileRef === "object" ? fileRef[lang] || fileRef.de : "") ||
      (typeof fileRef === "string" ? fileRef : "");
    if (filePath) {
      const markdown = await fetchText(filePath, { fresh });
      if (markdown && markdown.trim()) return markdown;
    }
    if (inlineRef && typeof inlineRef === "object") return inlineRef[lang] || inlineRef.de || "";
    if (typeof inlineRef === "string") return inlineRef;
    return "";
  }

  function renderLatestPosts(posts) {
    const slot = document.getElementById("latest-posts");
    if (!slot) return;
    const latest = posts.slice(0, 2);
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
    await renderMarkdownInto(
      document.getElementById("blog-detail-content"),
      (post.content || "").trim()
    );
  }

  async function loadEventEntries(opts) {
    const force = Boolean(opts && opts.force);
    if (!force && state._eventsData) return state._eventsData;
    const index = await fetchJson("./data/event/index.json", { fresh: force });
    if (!index || !Array.isArray(index.files)) {
      console.warn("Event index missing or invalid:", index);
      if (!force) state._eventsData = [];
      return [];
    }
    const entries = await Promise.all(
      index.files.map(async (name) => {
        const item = await fetchJson(`./data/event/events/${name}`, { fresh: force });
        if (!item) console.warn("Failed to load event entry:", name);
        return item;
      })
    );
    const list = entries.filter(Boolean);
    state._eventsData = list;
    return list;
  }

  async function loadPostEntries(opts) {
    const force = Boolean(opts && opts.force);
    if (!force && state._postsData) return state._postsData;
    const index = await fetchJson("./data/blog/index.json", { fresh: force });
    if (!index || !Array.isArray(index.files)) {
      console.warn("Blog index missing or invalid:", index);
      if (!force) state._postsData = [];
      return [];
    }
    const entries = await Promise.all(
      index.files.map(async (name) => {
        const item = await fetchJson(`./data/blog/posts/${name}`, { fresh: force });
        if (!item) console.warn("Failed to load blog post entry:", name);
        return item;
      })
    );
    const list = entries.filter(Boolean);
    state._postsData = list;
    return list;
  }

  async function ensureMarkdownParser() {
    if (state._markdownParser) return state._markdownParser;
    if (state._markdownReadyPromise) return state._markdownReadyPromise;

    const bindMarkedParse = (parseFn) => {
      if (typeof parseFn !== "function") return null;
      return (src) => parseFn(String(src || ""), { async: false, gfm: true, breaks: false });
    };

    if (window.marked?.parse) {
      state._markdownParser = bindMarkedParse(window.marked.parse.bind(window.marked));
      return state._markdownParser;
    }

    const tryImportMarked = async (specifier) => {
      const mod = await import(/* webpackIgnore: true */ specifier);
      const parseFn = mod?.marked?.parse;
      return bindMarkedParse(parseFn ? parseFn.bind(mod.marked) : null);
    };

    const localSpecifier = new URL("./assets/js/vendor/marked.esm.js", document.baseURI).href;
    const cdnSpecifier = "https://cdn.jsdelivr.net/npm/marked@15.0.7/lib/marked.esm.js";

    state._markdownReadyPromise = (async () => {
      try {
        const parser = await tryImportMarked(localSpecifier);
        if (parser) {
          state._markdownParser = parser;
          return parser;
        }
      } catch (err) {
        console.warn("Markdown (lokal): konnte nicht geladen werden:", err);
      }
      try {
        const parser = await tryImportMarked(cdnSpecifier);
        if (parser) {
          state._markdownParser = parser;
          return parser;
        }
      } catch (err) {
        console.warn("Markdown (CDN): konnte nicht geladen werden:", err);
      }
      state._markdownParser = null;
      return null;
    })().finally(() => {
      state._markdownReadyPromise = null;
    });

    return state._markdownReadyPromise;
  }

  /** Minimaler Markdown→HTML-Fallback (ohne externes Paket), wenn Import/CND blockiert ist. */
  function simpleMarkdownToHtml(markdown) {
    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const sanitizeHref = (href) => {
      const h = String(href || "").trim();
      if (!h || /^javascript:/i.test(h) || /^vbscript:/i.test(h) || /^data:/i.test(h)) return "";
      if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h)) return esc(h.replace(/"/g, ""));
      if (h.startsWith("/") || h.startsWith("./") || h.startsWith("../")) return esc(h.replace(/"/g, ""));
      return "";
    };
    const formatInline = (chunk) => {
      const codes = [];
      const links = [];
      let t = String(chunk);
      t = t.replace(/`([^`]+)`/g, (_, code) => {
        const id = codes.length;
        codes.push("<code>" + esc(code) + "</code>");
        return `@@CODEPH${id}@@`;
      });
      t = t.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (full, label, href) => {
        const safe = sanitizeHref(href);
        if (!safe) return full;
        const id = links.length;
        links.push('<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>");
        return `@@LINKPH${id}@@`;
      });
      t = esc(t);
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
      t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
      t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      t = t.replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
      t = t.replace(/@@CODEPH(\d+)@@/g, (_, i) => codes[Number(i)] ?? "");
      t = t.replace(/@@LINKPH(\d+)@@/g, (_, i) => links[Number(i)] ?? "");
      return t;
    };

    let text = String(markdown || "").replace(/\r\n/g, "\n");
    const fences = [];
    text = text.replace(/```[^\n]*\n([\s\S]*?)```/gm, (_, body) => {
      const id = fences.length;
      fences.push("<pre><code>" + esc(body.replace(/\n$/, "")) + "</code></pre>");
      return `\n\n@@FENCE${id}@@\n\n`;
    });

    const segments = text.split(/\n{2,}/);
    const blocks = [];
    for (let seg of segments) {
      seg = seg.trim();
      if (!seg) continue;
      const fm = seg.match(/^@@FENCE(\d+)@@$/);
      if (fm) {
        blocks.push(fences[Number(fm[1])] ?? "");
        continue;
      }
      const lines = seg.split("\n");
      if (lines.length === 1 && /^[-*_]{3,}\s*$/.test(lines[0])) {
        blocks.push("<hr>");
        continue;
      }
      const hm = lines[0].match(/^(#{1,6})\s+(.+)$/);
      if (hm && lines.length === 1) {
        const depth = hm[1].length;
        blocks.push("<h" + depth + ">" + formatInline(hm[2].trim()) + "</h" + depth + ">");
        continue;
      }
      if (lines.every((ln) => /^\s*[-*]\s|^\s*$/.test(ln))) {
        const items = lines
          .filter((ln) => ln.trim())
          .map((ln) => "<li>" + formatInline(ln.replace(/^\s*[-*]\s+/, "").trim()) + "</li>")
          .join("");
        blocks.push("<ul>" + items + "</ul>");
        continue;
      }
      if (lines.every((ln) => /^\s*\d+\.\s|^\s*$/.test(ln))) {
        const items = lines
          .filter((ln) => ln.trim())
          .map((ln) => "<li>" + formatInline(ln.replace(/^\s*\d+\.\s+/, "").trim()) + "</li>")
          .join("");
        blocks.push("<ol>" + items + "</ol>");
        continue;
      }
      if (lines.every((ln) => /^\s*>|^\s*$/.test(ln))) {
        const inner = lines
          .filter((ln) => ln.trim())
          .map((ln) => ln.replace(/^\s*>\s?/, ""))
          .join("\n");
        blocks.push("<blockquote><p>" + formatInline(inner) + "</p></blockquote>");
        continue;
      }
      blocks.push("<p>" + formatInline(lines.join("\n").replace(/\n/g, "<br>\n")) + "</p>");
    }
    return blocks.join("\n");
  }

  function markdownToHtml(markdown) {
    if (typeof state._markdownParser === "function") {
      try {
        return state._markdownParser(String(markdown || ""));
      } catch (err) {
        console.warn("Markdown parser failed, using fallback renderer:", err);
      }
    }
    return simpleMarkdownToHtml(markdown);
  }

  async function renderMarkdownInto(el, markdown) {
    if (!el) return;
    try {
      await ensureMarkdownParser();
    } catch (err) {
      console.warn("Markdown parser could not be ensured:", err);
    }
    el.innerHTML = markdownToHtml(markdown);
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

  async function fetchJson(url, opts) {
    const fresh = Boolean(opts && opts.fresh);
    try {
      const response = await fetch(url, { cache: fresh ? "no-store" : "no-cache" });
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

  async function fetchText(url, opts) {
    const fresh = Boolean(opts && opts.fresh);
    try {
      const response = await fetch(url, { cache: fresh ? "no-store" : "no-cache" });
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
