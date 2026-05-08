/*
  ============================================================================
  Project:      KI Netzwerk Schweinfurt
  File:         i18n.js
  Seite / Rolle: Übersetzungen DE / EN (alle Seiten)
  Projekt-Pfad: assets/js/i18n.js

  Developed by: Oliver Braun
  GitHub:       https://github.com/olli-br

  Development Start: April 2026
  Current Version:   0.1.0

  Update History:
  - 02.05.2026  [Oliver Braun]   Project initialization


  Independently developed by me.
  ============================================================================
*/

window.I18N = {
  de: {
    nav: { home: "Start", events: "Events", blog: "Blog", about: "Über uns", faq: "FAQ", contact: "Kontakt" },
    theme: {
      switchToDark: "Dunkelmodus aktivieren",
      switchToLight: "Hellmodus aktivieren"
    },
    common: {
      showAll: "Alle anzeigen",
      register: "Zur Anmeldung",
      details: "Details ansehen",
      readMore: "Weiterlesen",
      loading: "Lädt...",
      noData: "Keine Inhalte gefunden."
    },
    home: {
      heroLabel: "Initiative für KI in Mainfranken",
      heroTitle: "KI Netzwerk Schweinfurt",
      heroText:
        "Wir vernetzen Unternehmen, Bildung, Verwaltung und Community rund um praxisnahe Künstliche Intelligenz. Mit offenen Treffen, Workshops und Erfahrungsberichten schaffen wir einen Raum für Austausch, konkrete Projekte und nachhaltigen Wissenstransfer in der Region Schweinfurt.",
      heroCtaPrimary: "Nächstes Event entdecken",
      heroCtaSecondary: "Mehr über uns",
      heroStatus: "Regional. Praxisnah. Vertrauenswürdig.",
      heroPanelTitle: "Praxisorientierte KI für Mainfranken",
      heroPanelText:
        "Von generativer KI über Agentensysteme bis zu Automatisierung und Embedded AI: Wir schaffen einen offenen Raum für technologische Impulse, Vernetzung und praktische Umsetzung in der Region Mainfranken.",
      nextEventsLabel: "Termine",
      nextEvents: "Nächste Events",
      nextEventsIntro: "Veranstaltungen, Netzwerktreffen und Workshops in Mainfranken.",
      nextEventBar: "Nächstes Event:",
      recapLabel: "Aus dem Netzwerk",
      recapTitle: "Rückblicke",
      recapIntro: "Erfahren Sie, was in den vergangenen Veranstaltungen passiert ist und welche Impulse wir gemeinsam gesetzt haben.",
      missionLabel: "Unsere Mission",
      missionTitle: "Praxisnahe KI für die Region",
      missionIntro: "Wir gestalten eine verantwortungsvolle KI-Community, die wirtschaftlichen Nutzen mit nachhaltigem Austausch verbindet.",
      faqLabel: "FAQ",
      feature1Title: "Regional vernetzen",
      feature1Text: "Wir verbinden Unternehmen, Hochschulen, Verwaltung und Tech-Community in Mainfranken zu einem offenen KI-Austauschraum.",
      feature2Title: "Praxis ermöglichen",
      feature2Text: "Wir zeigen reale KI-Anwendungen, Tools und Use Cases aus Industrie, Engineering, Softwareentwicklung und Alltag.",
      feature3Title: "Kompetenz aufbauen",
      feature3Text: "Workshops, Impulse und Hands-on-Formate helfen der Region, KI sicher und wirksam einzusetzen.",
      feature4Title: "Vertrauen schaffen",
      feature4Text: "Datenschutz, Transparenz, geistiges Eigentum und verantwortungsvolle Nutzung stehen im Zentrum unserer Netzwerkarbeit.",
      faqTitle: "Du hast Fragen?",
      faqIntro: "Antworten zu Teilnahme, Formaten und wie das Netzwerk funktioniert.",
      ctaLabel: "Mitmachen",
      ctaTitle: "Gestalten Sie die KI-Zukunft in Mainfranken mit",
      ctaText: "Ob Sprecher, Teilnehmer oder Partner – wir freuen uns auf Impulse aus der Region und ermöglichen einen einfachen Einstieg in unsere Formate.",
      ctaButton: "Jetzt Kontakt aufnehmen",
      ctaSecondary: "Mehr über Events"
    },
    events: {
      eyebrow: "Veranstaltungen",
      title: "Alle Termine im Überblick",
      subtitle: "Netzwerktreffen, Workshops und öffentliche Formate – mit Filter, Details und Anmeldung.",
      filterLabel: "Filtern",
      filterPlaceholder: "Suchbegriff eingeben...",
      backToList: "Zurück zur Event-Übersicht",
      pastBadge: "Vergangen",
      nextBadge: "Nächstes Event",
      archiveLink: "Recap"
    },
    blog: {
      eyebrow: "Blog",
      title: "Rückblicke & Impulse",
      subtitle: "Impulse, Rückblicke und Wissen aus dem Netzwerk.",
      backToList: "Zurück zur Übersicht",
      readTime: "Min Lesezeit"
    },
    about: {
      title: "Über uns",
      intro: "Das KI Netzwerk Schweinfurt verbindet Menschen rund um praxisnahe KI in der Region.",
      missionTitle: "Treffen",
      missionText: "Inhalte werden aus about-page.json geladen.",
      targetTitle: "Teilnehmende",
      targetText: "Bitte about-page.json pflegen.",
      partnersTitle: "Partner",
      partnersText: "Unsere Partner unterstützen die Initiative."
    },
    footer: {
      tagline: "Miteinander KI gestalten",
      events: "Events",
      blog: "Blog",
      about: "Über uns",
      faq: "FAQ",
      contact: "Kontakt"
    },
    faq: {
      q1: {
        question: "Wer kann am Netzwerk teilnehmen?",
        answer: "Unternehmen, Studierende, Entwickler, Verwaltung und Interessierte aus Mainfranken sind eingeladen, sich zu vernetzen und auszutauschen."
      },
      q2: {
        question: "Wie finde ich das nächste Event?",
        answer: "Die aktuellen Termine finden Sie oben auf der Startseite. Weitere Details gibt es auf der Events-Seite."
      },
      q3: {
        question: "Welche Themen werden behandelt?",
        answer: "Wir konzentrieren uns auf praxisnahe KI-Anwendungen, Datenschutz, verantwortliche Nutzung und regionale Zusammenarbeit."
      },
      q4: {
        question: "Wie kann ich selbst aktiv werden?",
        answer: "Melden Sie sich als Speaker, Partner oder Teilnehmer – am besten direkt über den Kontaktbereich oder per E-Mail."
      }
    },
    countdown: { days: "Tage", hours: "Std", minutes: "Min", seconds: "Sek", started: "Gestartet" }
  },
  en: {
    nav: { home: "Home", events: "Events", blog: "Blog", about: "About", faq: "FAQ", contact: "Contact" },
    theme: {
      switchToDark: "Switch to dark mode",
      switchToLight: "Switch to light mode"
    },
    common: {
      showAll: "Show all",
      register: "Register now",
      details: "View details",
      readMore: "Read more",
      loading: "Loading...",
      noData: "No content found."
    },
    home: {
      heroLabel: "AI initiative in Schweinfurt",
      heroTitle: "AI Network Schweinfurt",
      heroText:
        "We connect companies, education, public institutions and the local community around practical Artificial Intelligence. Through open meetups, workshops and experience sharing, we create space for collaboration, real projects and sustainable knowledge transfer in the Schweinfurt region.",
      heroCtaPrimary: "Discover the next event",
      heroCtaSecondary: "Learn more about us",
      heroStatus: "Regional. Practical. Trustworthy.",
      heroPanelTitle: "Practice-Oriented AI for Mainfranken",
      heroPanelText:
        "From generative AI and agent systems to automation and embedded AI: we create an open space for technological inspiration, networking, and practical implementation in the Mainfranken region.",
      nextEventsLabel: "Schedule",
      nextEvents: "Upcoming events",
      nextEventsIntro: "Meetups, workshops and network formats in Mainfranken.",
      nextEventBar: "Next event:",
      recapLabel: "From the network",
      recapTitle: "Recaps",
      recapIntro: "Discover what happened at our recent gatherings and which insights shaped the network.",
      missionLabel: "Our mission",
      missionTitle: "Practical AI for the region",
      missionIntro: "We build a responsible AI community that links practical value with transparent regional collaboration.",
      faqLabel: "FAQ",
      feature1Title: "Regional networking",
      feature1Text: "We connect companies, universities, public administration, and the tech community in Mainfranken in an open AI exchange space.",
      feature2Title: "Enable practice",
      feature2Text: "We showcase real AI applications, tools, and use cases from industry, engineering, software development, and daily work.",
      feature3Title: "Build competence",
      feature3Text: "Workshops, impulses, and hands-on formats help the region use AI safely and effectively.",
      feature4Title: "Building trust",
      feature4Text: "Data protection, transparency, intellectual property, and responsible use are at the core of our network activities.",
      faqTitle: "Got questions?",
      faqIntro: "Answers about participation, formats and how the network works.",
      ctaLabel: "Get involved",
      ctaTitle: "Help shape AI in Mainfranken",
      ctaText: "Whether speaker, partner or participant – we are looking forward to impulses from the region and make it easy to join our formats.",
      ctaButton: "Contact us now",
      ctaSecondary: "Explore events"
    },
    events: {
      eyebrow: "Events",
      title: "Meetups and dates at a glance",
      subtitle: "Network meetups, workshops and public formats — filter, details and registration in one place.",
      filterLabel: "Filter",
      filterPlaceholder: "Enter search term...",
      backToList: "Back to event overview",
      pastBadge: "Past",
      nextBadge: "Next event",
      archiveLink: "Recap"
    },
    blog: {
      eyebrow: "Journal",
      title: "Recaps & insights",
      subtitle: "Insights, recaps and knowledge from the network.",
      backToList: "Back to overview",
      readTime: "min read"
    },
    about: {
      title: "About us",
      intro: "The AI Network Schweinfurt connects people around practical AI in the region.",
      missionTitle: "Meetups",
      missionText: "Content is loaded from about-page.json.",
      targetTitle: "Participants",
      targetText: "Please edit about-page.json.",
      partnersTitle: "Partners",
      partnersText: "Our partners support the initiative."
    },
    footer: {
      tagline: "Shaping AI together",
      events: "Events",
      blog: "Blog",
      about: "About",
      faq: "FAQ",
      contact: "Contact"
    },
    faq: {
      q1: {
        question: "Who can join the network?",
        answer: "Companies, students, developers, public institutions and interested people from Mainfranken are invited to connect and exchange ideas."
      },
      q2: {
        question: "How do I find the next event?",
        answer: "Upcoming dates are listed at the top of the homepage. More details are available on the Events page."
      },
      q3: {
        question: "What topics are covered?",
        answer: "We focus on practical AI applications, data protection, responsible use and regional collaboration."
      },
      q4: {
        question: "How can I get involved?",
        answer: "Sign up as a speaker, partner or participant – best via the contact area or by email."
      }
    },
    countdown: { days: "Days", hours: "Hrs", minutes: "Min", seconds: "Sec", started: "Started" }
  }
};
