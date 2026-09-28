(() => {
  'use strict';

  const STORAGE_KEY = 'maths-lgc-psr-v1';
  const app = document.querySelector('#app');

  const teacherPreviewRequested = new URLSearchParams(location.search).get('preview') === 'teacher';
  let teacherPreview = false;
  const state = loadState();
  const activitySessionId = createStudentId();
  const routesSeenThisSession = new Set();
  let activitySessionStarted = false;
  let correctionsUnlocked = false;
  let correctionsStateLoaded = false;

  async function refreshCorrectionsState(force = false) {
    if (teacherPreview) {
      correctionsUnlocked = true;
      correctionsStateLoaded = true;
      return true;
    }
    if (correctionsStateLoaded && !force) return correctionsUnlocked;
    try {
      const response = await fetch('/api/class-state', { cache: 'no-store' });
      if (!response.ok) throw new Error('class state unavailable');
      const payload = await response.json();
      correctionsUnlocked = Boolean(payload.corrections_unlocked);
    } catch {
      correctionsUnlocked = false;
    }
    correctionsStateLoaded = true;
    return correctionsUnlocked;
  }

  const diagnostic = [
    {
      id: 'q1', domain: 'Calcul',
      prompt: 'Une caisse contient 12 bouteilles à 1,50 € chacune. Quel est le prix total ?',
      suffix: '€', answer: 18, tolerance: 0.001,
      explain: '12 × 1,50 = 18. On multiplie le prix unitaire par le nombre de bouteilles.'
    },
    {
      id: 'q2', domain: 'Automatismes',
      prompt: 'Un bac contient 3,6 kg de préparation. Combien cela fait-il en grammes ?',
      suffix: 'g', answer: 3600, tolerance: 0.001,
      explain: '1 kg = 1 000 g, donc 3,6 × 1 000 = 3 600 g.'
    },
    {
      id: 'q3', domain: 'Durées',
      prompt: 'Une préparation commence à 9 h 35 et dure 50 minutes. À quelle heure finit-elle ?',
      type: 'text', placeholder: 'ex. 10 h 25', answer: ['10h25','10 h 25','10:25','10.25'],
      explain: '9 h 35 + 25 min = 10 h, puis encore 25 min : fin à 10 h 25.'
    },
    {
      id: 'q4', domain: 'Fractions & pourcentages',
      prompt: 'La moitié d’une quantité correspond à quel pourcentage ?',
      suffix: '%', answer: 50, tolerance: 0.001,
      explain: '1/2 = 0,5 = 50 %.'
    },
    {
      id: 'q5', domain: 'Proportionnalité',
      prompt: 'Une recette utilise 400 g de riz pour 5 portions. Combien faut-il de riz pour 15 portions ?',
      suffix: 'g', answer: 1200, tolerance: 0.001,
      explain: '15 portions, c’est 3 fois 5 portions. Donc 400 × 3 = 1 200 g.'
    },
    {
      id: 'q6', domain: 'Monnaie',
      prompt: 'Un client paie 20 € pour une commande de 13,70 €. Quelle monnaie faut-il rendre ?',
      suffix: '€', answer: 6.30, tolerance: 0.001,
      explain: '20 − 13,70 = 6,30 €.'
    },
    {
      id: 'q7', domain: 'Données',
      prompt: 'Quatre services ont vendu 18, 22, 20 et 20 menus. Quelle est la moyenne ?',
      suffix: 'menus', answer: 20, tolerance: 0.001,
      explain: '(18 + 22 + 20 + 20) ÷ 4 = 80 ÷ 4 = 20.'
    },
    {
      id: 'q8', domain: 'Équations',
      prompt: 'On cherche un nombre x tel que 3 × x = 24. Quelle est la valeur de x ?',
      suffix: '', answer: 8, tolerance: 0.001,
      explain: 'x = 24 ÷ 3 = 8.'
    },
    {
      id: 'q9', domain: 'Lecture de situation',
      prompt: 'Une machine produit 6 barquettes toutes les 10 minutes. Combien en produit-elle en 30 minutes, au même rythme ?',
      suffix: 'barquettes', answer: 18, tolerance: 0.001,
      explain: '30 minutes = 3 fois 10 minutes. Donc 6 × 3 = 18 barquettes.'
    },
    {
      id: 'q10', domain: 'Ordres de grandeur',
      prompt: 'Un produit coûte 4,98 €. Pour estimer rapidement le coût de 10 produits, quel ordre de grandeur est le plus raisonnable ?',
      type: 'select', options: ['5 €', '50 €', '500 €'], answer: '50 €',
      explain: '4,98 € est proche de 5 €. Pour 10 produits : environ 5 × 10 = 50 €.'
    }
  ];

  const modules = [
    { title: 'Durées', text: 'Lire une heure, calculer une durée et prévoir quand commencer.', route: 'durees', available: true },
    { title: 'Recettes & proportionnalité', text: 'Adapter une fiche technique quand le nombre de portions change.', route: 'proportion', available: true },
    { title: 'Pourcentages', text: 'Comprendre « sur 100 », calculer une part et une réduction.', route: 'pourcentages', available: true },
    { title: 'Données & statistiques', text: 'Lire un tableau ou un graphique, comparer et calculer une moyenne.', route: 'donnees', available: true },
    { title: 'Équations', text: 'Trouver un nombre inconnu et vérifier qu’il convient.', route: 'equations', available: true },
    { title: 'Graphiques & fonctions', text: 'Voir comment une quantité change quand une autre change.', route: 'fonctions', available: true },
    { title: 'Prix & commerce', text: 'Lire une facture, calculer une réduction et distinguer coût, prix et marge.', route: 'commerce', available: true },
    { title: 'Probabilités', text: 'Comprendre le hasard, comparer fréquence et probabilité, puis simuler.', route: 'probabilites', available: true }
  ];

  function loadState() {
    try {
      return {
        entered: false,
        introDone: false,
        diagnosticDone: false,
        challengeDone: false,
        studentId: createStudentId(),
        displayName: '',
        firstName: '',
        lastName: '',
        birthDate: '',
        serverSync: 'pending',
        answers: {},
        selfEval: {},
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      };
    } catch {
      return { entered: false, introDone: false, diagnosticDone: false, challengeDone: false, studentId: createStudentId(), displayName: '', firstName: '', lastName: '', birthDate: '', serverSync: 'pending', answers: {}, selfEval: {} };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function createStudentId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return 'student_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function syncProgress(stage, challenge = null) {
    if (teacherPreview || !state.firstName || !state.lastName || !state.birthDate || !state.studentId) return;
    const result = state.diagnosticDone ? diagnosticResult() : null;
    const payload = {
      student_id: state.studentId,
      display_name: state.firstName,
      first_name: state.firstName,
      last_name: state.lastName,
      birth_date: state.birthDate,
      session_id: activitySessionId,
      stage,
      self_eval: state.selfEval,
      diagnostic: result ? {
        score: result.score,
        details: result.details.map(d => ({ id: d.id, domain: d.domain, correct: d.correct, value: d.value })),
        weak_domains: result.weakDomains,
        strong_domains: result.strongDomains
      } : null,
      challenge
    };
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });
      if (!response.ok) throw new Error('sync failed');
      state.serverSync = 'saved';
    } catch {
      state.serverSync = 'offline';
    }
    saveState();
  }

  async function syncActivity(event, route) {
    if (teacherPreview || !state.firstName || !state.lastName || !state.birthDate || !state.studentId) return;
    const payload = {
      student_id: state.studentId,
      display_name: state.firstName,
      first_name: state.firstName,
      last_name: state.lastName,
      birth_date: state.birthDate,
      stage: 'activity',
      activity: {
        event,
        route,
        session_id: activitySessionId
      }
    };
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });
      if (!response.ok) throw new Error('activity sync failed');
    } catch {
      // Le suivi temporel est indicatif : il ne doit jamais bloquer le cours.
    }
  }

  function observeRoute(route) {
    if (teacherPreview || !state.firstName || !state.lastName || !state.birthDate || !state.studentId) return;
    if (!activitySessionStarted) {
      activitySessionStarted = true;
      syncActivity('session_started', route);
    }
    if (!routesSeenThisSession.has(route)) {
      routesSeenThisSession.add(route);
      syncActivity('route_opened', route);
    }
  }

  function normaliseText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(',', '.')
      .trim();
  }

  function parseNumber(value) {
    const n = Number(String(value || '').replace(',', '.').replace(/\s/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  function isCorrect(question, value) {
    if (question.type === 'select') return value === question.answer;
    if (question.type === 'text') {
      const v = normaliseText(value);
      return question.answer.some(a => normaliseText(a) === v);
    }
    const n = parseNumber(value);
    return Number.isFinite(n) && Math.abs(n - question.answer) <= question.tolerance;
  }

  function diagnosticResult() {
    const details = diagnostic.map(q => ({ ...q, value: state.answers[q.id] ?? '', correct: isCorrect(q, state.answers[q.id]) }));
    const weakDomains = [...new Set(details.filter(d => !d.correct).map(d => d.domain))];
    const strongDomains = [...new Set(details.filter(d => d.correct && !weakDomains.includes(d.domain)).map(d => d.domain))];
    return {
      details,
      score: details.filter(d => d.correct).length,
      weakDomains,
      strongDomains
    };
  }

  function shell(content, current = 0) {
    const total = 5;
    const dots = Array.from({ length: total }, (_, i) => {
      const cls = i < current ? 'done' : i === current ? 'current' : '';
      return `<span class="progress-dot ${cls}"></span>`;
    }).join('');
    const route = location.hash.replace('#', '') || (teacherPreview ? 'parcours' : 'bienvenue');
    const pageTitles = {
      bienvenue: 'Maths LGC · CAP PSR',
      parcours: 'Mon parcours',
      intro: 'À quoi servent les maths ?',
      diagnostic: 'Mon point de départ',
      correction: 'Correction guidée',
      defi: 'Défi PSR',
      bilan: 'Mon bilan',
      durees: 'Durées · heures et minutes',
      proportion: 'Recettes · changer les quantités',
      pourcentages: 'Pourcentages · comprendre « sur 100 »',
      donnees: 'Données · lire et comparer',
      equations: 'Équations · trouver le nombre caché',
      fonctions: 'Graphiques · deux quantités liées',
      commerce: 'Prix & commerce · calculer un montant',
      probabilites: 'Probabilités · comprendre le hasard'
    };
    const pageTitle = pageTitles[route] || 'Maths LGC · CAP PSR';
    const previewLinks = [
      ['parcours', 'Parcours'],
      ['intro', 'Pourquoi ?'],
      ['diagnostic', 'Diagnostic'],
      ['correction', 'Correction'],
      ['defi', 'Défi'],
      ['bilan', 'Bilan'],
      ['durees', 'Durées'],
      ['proportion', 'Recettes'],
      ['pourcentages', 'Pourcentages'],
      ['donnees', 'Données'],
      ['equations', 'Équations'],
      ['fonctions', 'Graphiques'],
      ['commerce', 'Prix'],
      ['probabilites', 'Probabilités']
    ];

    app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <a class="brand-home" href="#parcours" aria-label="Retour au parcours" title="Retour au parcours"><span class="brand-mark">∑</span></a>
          <span class="brand-title">${pageTitle}</span>
        </div>
        <span class="teacher-chip">${teacherPreview ? 'Vue prof · navigation libre' : (['durees','proportion','pourcentages','donnees','equations','fonctions','commerce','probabilites'].includes(route) ? 'CAP PSR · modules' : 'CAP PSR · séance 1')}</span>
      </header>
      ${teacherPreview ? `
        <nav class="teacher-preview-nav" aria-label="Navigation de prévisualisation enseignant">
          <span class="teacher-preview-label">Inspection prof</span>
          <div class="teacher-preview-links">
            <a href="/teacher">Tableau prof</a>
            ${previewLinks.map(([target, label]) => `<a class="${route === target ? 'current' : ''}" href="#${target}">${label}</a>`).join('')}
          </div>
        </nav>
      ` : ''}
      ${['durees','proportion','pourcentages','donnees','equations','fonctions','commerce','probabilites'].includes(route) ? '' : `<div class="progress-strip" aria-label="Progression dans la séance">${dots}</div>`}
      ${content}
    `;
  }

  function render() {
    const hasIdentity = Boolean(state.firstName && state.lastName && state.birthDate);
    const route = location.hash.replace('#', '') || (teacherPreview ? 'parcours' : (state.entered && hasIdentity ? 'parcours' : 'bienvenue'));
    if (!teacherPreview && !hasIdentity && route !== 'bienvenue') {
      location.hash = 'bienvenue';
      return;
    }
    if (!teacherPreview && hasIdentity && route !== 'bienvenue') observeRoute(route);
    if (route === 'bienvenue') return renderPrehome();
    if (route === 'intro') return renderIntro();
    if (route === 'diagnostic') return renderDiagnostic();
    if (route === 'correction') return renderCorrection();
    if (route === 'defi') return renderChallenge();
    if (route === 'bilan') return renderBilan();
    if (route === 'durees') return renderDurationModule();
    if (route === 'proportion') return renderProportionModule();
    if (route === 'pourcentages') return renderPercentageModule();
    if (route === 'donnees') return renderDataModule();
    if (route === 'equations') return renderEquationModule();
    if (route === 'fonctions') return renderFunctionModule();
    if (route === 'commerce') return renderCommerceModule();
    if (route === 'probabilites') return renderProbabilityModule();
    return renderPath();
  }

  function go(route) {
    location.hash = route;
  }

  function renderPrehome() {
    shell(`
      <section class="card hero prehome-grid">
        <div>
          <p class="eyebrow">Bienvenue en CAP PSR</p>
          <h1>Les maths qui servent vraiment.</h1>
          <p class="lead">Aujourd’hui, pas de note et pas de piège. On va repérer ce que tu sais déjà faire, voir à quoi servent les maths en PSR, puis relever un premier défi de restauration.</p>
          <div class="identity-card">
            <div class="identity-heading">
              <div>
                <strong>Avant de commencer</strong>
                <p>Ces informations servent uniquement à te distinguer dans le suivi de classe. Dans le cours, on utilisera seulement ton prénom.</p>
              </div>
              <span class="identity-badge">Suivi individuel</span>
            </div>
            <div class="identity-grid">
              <label>
                <span>Prénom</span>
                <input id="first-name" type="text" maxlength="40" autocomplete="given-name" value="${escapeHtml(state.firstName || state.displayName || '')}" placeholder="Ex. Lina" />
              </label>
              <label>
                <span>Nom</span>
                <input id="last-name" type="text" maxlength="60" autocomplete="family-name" value="${escapeHtml(state.lastName || '')}" placeholder="Ex. Martin" />
              </label>
              <label>
                <span>Date de naissance</span>
                <input id="birth-date" type="date" autocomplete="bday" min="1940-01-01" max="${new Date().toISOString().slice(0, 10)}" value="${escapeHtml(state.birthDate || '')}" />
              </label>
            </div>
            <small>Nom, prénom et date de naissance restent dans le suivi enseignant ; aucune adresse mail n’est demandée.</small>
          </div>
          <p class="form-error hidden" id="name-error">Renseigne ton prénom, ton nom et ta date de naissance avant de commencer.</p>
          <div class="actions">
            <button class="btn btn-primary" id="enter">Commencer</button>
          </div>
          <p class="footer-note">Ta progression reste sur cet appareil et peut être envoyée au tableau de suivi de la classe pour t’aider à choisir la suite.</p>
        </div>
        <div class="qr-placeholder" aria-label="QR code vers maths.lagrandeclasse.fr">
          <img class="qr-image" src="assets/qr-maths-lgc.svg" alt="QR code vers https://maths.lagrandeclasse.fr/" />
          <div class="qr-label">Scanne pour ouvrir le cours<br><small>maths.lagrandeclasse.fr</small></div>
        </div>
      </section>
    `, 0);
    document.querySelector('#enter').addEventListener('click', () => {
      if (teacherPreview) return go('intro');
      const firstName = document.querySelector('#first-name').value.trim();
      const lastName = document.querySelector('#last-name').value.trim();
      const birthDate = document.querySelector('#birth-date').value;
      const error = document.querySelector('#name-error');
      const today = new Date().toISOString().slice(0, 10);
      if (!firstName || !lastName || !birthDate || birthDate > today || birthDate < '1940-01-01') {
        error.textContent = birthDate && (birthDate > today || birthDate < '1940-01-01')
          ? 'Vérifie la date de naissance.'
          : 'Renseigne ton prénom, ton nom et ta date de naissance avant de commencer.';
        error.classList.remove('hidden');
        return;
      }
      state.firstName = firstName.slice(0, 40);
      state.lastName = lastName.slice(0, 60);
      state.birthDate = birthDate;
      state.displayName = state.firstName;
      state.studentId = state.studentId || createStudentId();
      state.entered = true;
      saveState();
      go('intro');
    });
  }

  function renderIntro() {
    shell(`
      <section class="card hero">
        <p class="eyebrow">Étape 1 · À quoi ça sert ?</p>
        <h2>En PSR, les maths sont partout.</h2>
        <p class="lead">Tu utilises les maths pour préparer, servir et vérifier ton travail. On commence avec des situations simples et concrètes. Les mots plus techniques viendront petit à petit.</p>
        <div class="lesson-grid">
          <article class="info-tile use-case">
            <span class="use-case-icon" aria-hidden="true">⚖</span>
            <h3>Préparer</h3>
            <p>Peser. Compter les portions. Changer les quantités.</p>
            <div class="micro-examples">
              <span>10 portions → 25 portions</span>
              <span>2,5 kg → 2 500 g</span>
              <span>prévoir 30 min de cuisson</span>
            </div>
            <span class="course-word">Mot du métier : « produire »</span>
          </article>
          <article class="info-tile use-case">
            <span class="use-case-icon" aria-hidden="true">🕒</span>
            <h3>Servir</h3>
            <p>Lire l’heure. Vérifier un prix. Rendre la monnaie.</p>
            <div class="micro-examples">
              <span>20 € − 13,70 €</span>
              <span>service à 12 h 00</span>
              <span>3 menus à 8,50 €</span>
            </div>
          </article>
          <article class="info-tile use-case">
            <span class="use-case-icon" aria-hidden="true">▥</span>
            <h3>Lire des informations</h3>
            <p>Lire un tableau ou un graphique. Comparer des résultats.</p>
            <div class="micro-examples">
              <span>quel jour a vendu le plus ?</span>
              <span>combien de produits restent ?</span>
              <span>quel choix revient souvent ?</span>
            </div>
            <span class="course-word">Plus tard : moyenne, fréquence…</span>
          </article>
          <article class="info-tile use-case">
            <span class="use-case-icon" aria-hidden="true">?</span>
            <h3>Trouver une solution</h3>
            <p>Comprendre ce qu’on cherche. Choisir un calcul. Vérifier la réponse.</p>
            <div class="micro-examples">
              <span>ai-je assez de portions ?</span>
              <span>à quelle heure commencer ?</span>
              <span>mon résultat est-il possible ?</span>
            </div>
            <span class="course-word">On dira aussi : « résoudre un problème »</span>
          </article>
        </div>
        <div class="callout simple-goal"><strong>Pendant les deux années :</strong> comprendre une situation, choisir le bon outil et vérifier ta réponse. Petit à petit, tu feras cela seul.</div>
        <div class="actions">
          <button class="btn btn-primary" id="intro-done">Voir mon parcours</button>
          <button class="btn btn-secondary" id="back-welcome">Retour</button>
        </div>
      </section>
    `, 1);
    document.querySelector('#intro-done').addEventListener('click', () => {
      if (!teacherPreview) {
        state.introDone = true;
        saveState();
      }
      go('parcours');
    });
    document.querySelector('#back-welcome').addEventListener('click', () => go('bienvenue'));
  }

  function moduleCardMarkup(module) {
    const unlocked = Boolean(module.available && (state.challengeDone || teacherPreview));
    const status = module.available ? (unlocked ? 'Disponible' : 'Après la séance 1') : 'À venir';
    const statusClass = module.available && unlocked ? 'ok' : module.available ? 'warm' : '';
    const action = module.available
      ? `<button class="btn btn-secondary module-open" data-go="${module.route}" ${unlocked ? '' : 'disabled'}>${unlocked ? 'Ouvrir' : 'Bientôt'}</button>`
      : '';
    return `<article class="info-tile module-card"><span class="pill ${statusClass}">${status}</span><h3>${module.title}</h3><p>${module.text}</p>${action}</article>`;
  }

  function renderPath() {
    const correctionLocked = !state.diagnosticDone && !teacherPreview;
    const challengeLocked = !state.diagnosticDone && !teacherPreview;
    shell(`
      <section class="card hero">
        <p class="eyebrow">Ton parcours d’aujourd’hui</p>
        <h2>On avance dans l’ordre.</h2>
        <p class="lead">${teacherPreview ? 'Vue prof : toutes les étapes sont accessibles directement, sans remplir les exercices.' : 'Chaque étape débloque la suivante. Tu peux refaire le diagnostic ou le défi autant de fois que tu veux.'}</p>
        <div class="path">
          <article class="path-step done"><div class="step-num">✓</div><div><h3>Pourquoi des maths en PSR ?</h3><div class="step-meta">Objectifs de la formation</div></div><button class="btn btn-ghost" data-go="intro">Revoir</button></article>
          <article class="path-step ${state.diagnosticDone ? 'done' : 'available'}"><div class="step-num">2</div><div><h3>Mon point de départ</h3><div class="step-meta">« Les maths et moi » + 10 situations courtes · sans note</div></div><button class="btn btn-primary" data-go="diagnostic">${state.diagnosticDone ? 'Refaire' : 'Commencer'}</button></article>
          <article class="path-step ${correctionLocked ? 'locked' : 'available'}"><div class="step-num">3</div><div><h3>Correction guidée</h3><div class="step-meta">Comprendre les stratégies, pas seulement les réponses</div></div><button class="btn btn-secondary" data-go="correction" ${correctionLocked ? 'disabled' : ''}>Voir</button></article>
          <article class="path-step ${challengeLocked ? 'locked' : state.challengeDone ? 'done' : 'available'}"><div class="step-num">4</div><div><h3>Défi PSR</h3><div class="step-meta">Adapter une production, gérer une durée et un coût</div></div><button class="btn btn-primary" data-go="defi" ${challengeLocked ? 'disabled' : ''}>${state.challengeDone ? 'Refaire' : 'Relever le défi'}</button></article>
          <article class="path-step ${state.challengeDone || teacherPreview ? 'available' : 'locked'}"><div class="step-num">5</div><div><h3>Mon bilan</h3><div class="step-meta">Ce que je maîtrise · ce que je vais travailler</div></div><button class="btn btn-secondary" data-go="bilan" ${state.challengeDone || teacherPreview ? '' : 'disabled'}>Voir</button></article>
        </div>
        <div class="actions"><button class="btn btn-ghost" id="show-program">Voir la suite du CAP</button></div>
        <div id="future-program" class="hidden">
          <div class="lesson-grid module-grid">${modules.map(moduleCardMarkup).join('')}</div>
        </div>
      </section>
    `, 1);
    document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
    document.querySelector('#show-program').addEventListener('click', e => {
      const panel = document.querySelector('#future-program');
      panel.classList.toggle('hidden');
      e.currentTarget.textContent = panel.classList.contains('hidden') ? 'Voir la suite du CAP' : 'Masquer la suite du CAP';
    });
  }

  function renderDiagnostic() {
    shell(`
      <section class="card hero">
        <p class="eyebrow">Étape 2 · Diagnostic</p>
        <h2>Montre ce que tu sais déjà faire.</h2>
        <p class="lead">Ce n’est pas une note. Réponds avec ce que tu sais aujourd’hui ; si une notion t’est inconnue, tu peux simplement choisir « Je ne sais pas ». On corrigera ensemble ensuite.</p>
        <form id="diagnostic-form">
          <div class="callout">
            <h3>Les maths et moi</h3>
            <p>Avant les calculs, indique simplement comment tu te sens aujourd’hui. Ces réponses ne sont jamais comptées dans le diagnostic.</p>
            <div class="lesson-grid">
              <label class="info-tile"><strong>Quand je vois un problème de maths…</strong><br><br><select name="mathFeeling"><option value="">Choisir…</option><option value="comfortable">Je me sens plutôt à l’aise</option><option value="try">J’essaie, même si je ne suis pas sûr</option><option value="block">Je bloque assez vite</option></select></label>
              <label class="info-tile"><strong>Ce qui m’aide le plus…</strong><br><br><select name="mathHelp"><option value="">Choisir…</option><option value="example">Voir un exemple</option><option value="explain">Qu’on m’explique autrement</option><option value="practice">Faire plusieurs exercices</option><option value="pair">Travailler avec quelqu’un</option></select></label>
            </div>
          </div>
          <div class="question-list">
            ${diagnostic.map((q, i) => questionMarkup(q, i)).join('')}
          </div>
          <p class="form-error hidden" id="diag-error">Réponds à chaque situation ou utilise « Je ne sais pas » avant de valider.</p>
          <div class="actions">
            ${teacherPreview ? '<button class="btn btn-primary" type="button" id="preview-correction">Voir la correction sans répondre</button>' : '<button class="btn btn-primary" type="submit">Valider mon diagnostic</button>'}
            <button class="btn btn-secondary" type="button" id="diag-back">Retour au parcours</button>
          </div>
        </form>
      </section>
    `, 2);

    document.querySelector('#diagnostic-form').addEventListener('submit', e => {
      e.preventDefault();
      if (teacherPreview) return go('correction');
      const data = new FormData(e.currentTarget);
      const answers = {};
      let complete = true;
      state.selfEval = {
        feeling: String(data.get('mathFeeling') || ''),
        help: String(data.get('mathHelp') || '')
      };
      diagnostic.forEach(q => {
        const value = String(data.get(q.id) ?? '').trim();
        if (!value) complete = false;
        answers[q.id] = value;
      });
      if (!complete) {
        document.querySelector('#diag-error').classList.remove('hidden');
        return;
      }
      state.answers = answers;
      state.diagnosticDone = true;
      saveState();
      syncProgress('diagnostic');
      go('correction');
    });
    document.querySelectorAll('[data-unknown]').forEach(button => button.addEventListener('click', () => {
      const field = document.querySelector(`[name="${button.dataset.unknown}"]`);
      if (!field) return;
      field.value = 'Je ne sais pas';
      field.dispatchEvent(new Event('change', { bubbles: true }));
      button.classList.add('selected');
    }));
    document.querySelector('#preview-correction')?.addEventListener('click', () => go('correction'));
    document.querySelector('#diag-back').addEventListener('click', () => go('parcours'));
  }

  function questionMarkup(q, i) {
    const previous = state.answers[q.id] ?? '';
    let input;
    if (q.type === 'select') {
      input = `<select name="${q.id}" aria-label="Réponse à la question ${i+1}"><option value="">Choisir…</option>${q.options.map(o => `<option ${previous === o ? 'selected' : ''}>${o}</option>`).join('')}<option ${previous === 'Je ne sais pas' ? 'selected' : ''}>Je ne sais pas</option></select>`;
    } else {
      input = `<input type="text" inputmode="${q.type === 'text' ? 'text' : 'decimal'}" name="${q.id}" value="${escapeHtml(previous)}" placeholder="${q.placeholder || 'Ta réponse'}" aria-label="Réponse à la question ${i+1}" />`;
    }
    return `<fieldset class="question"><legend><span class="question-index">${i+1}</span><span>${q.prompt}</span></legend><span class="question-domain">${q.domain}</span><div class="answer-row">${input}${q.suffix ? `<span>${q.suffix}</span>` : ''}<button class="unknown-answer" type="button" data-unknown="${q.id}">Je ne sais pas</button></div></fieldset>`;
  }

  async function renderCorrection() {
    if (!state.diagnosticDone && !teacherPreview) return go('diagnostic');
    const canShowDetailedCorrections = teacherPreview || await refreshCorrectionsState(true);
    if (location.hash.replace('#', '') !== 'correction') return;
    const result = diagnosticResult();
    const summary = result.weakDomains.length
      ? `Tes prochains points de travail prioritaires : ${result.weakDomains.join(', ')}.`
      : 'Tu as réussi les 10 situations proposées. On va maintenant vérifier que tu peux réutiliser ces outils dans un vrai problème PSR.';
    shell(`
      <section class="card hero">
        <p class="eyebrow">Étape 3 · Correction guidée</p>
        <h2>On regarde les stratégies.</h2>
        ${teacherPreview
          ? '<div class="callout"><strong>Vue prof :</strong> correction complète affichée sans simuler de résultat élève.</div>'
          : `<div class="result-summary">
              <div class="result-score"><span>10</span><small>situations</small></div>
              <div><h3>On repère ton point de départ.</h3><p>${summary}</p><div class="domain-chips">${result.weakDomains.length ? result.weakDomains.map(d => `<span class="pill warm">À travailler · ${d}</span>`).join('') : '<span class="pill ok">Bases solides sur ce diagnostic</span>'}</div></div>
            </div>`}
        ${!teacherPreview && !canShowDetailedCorrections ? `
          <div class="correction-access locked">
            <div><strong>Corrigés détaillés encore verrouillés</strong><p>Tu peux voir tes points de travail et continuer au défi. Le professeur ouvrira les solutions quand ce sera le bon moment pour la classe.</p></div>
            <button class="btn btn-secondary" id="refresh-correction-access" type="button">Vérifier si le corrigé est ouvert</button>
          </div>
        ` : ''}
        ${result.details.map((d, i) => `<article class="correction ${teacherPreview ? '' : d.correct ? 'ok' : 'retry'}">
          <div class="correction-heading">
            <strong>${i+1}. ${teacherPreview ? d.domain : d.correct ? '✓ Bonne stratégie' : '↻ À reprendre'}</strong>
            <span class="pill">${d.domain}</span>
          </div>
          <div class="correction-prompt">
            <span>Énoncé</span>
            <p>${escapeHtml(d.prompt)}</p>
          </div>
          ${teacherPreview ? '' : `<div class="correction-student-answer"><span>Ta réponse</span><p>${escapeHtml(d.value || '—')}</p></div>`}
          ${canShowDetailedCorrections ? `
            <div class="correction-solution">
              <span>Correction</span>
              <p>${escapeHtml(d.explain)}</p>
            </div>
            ${d.id === 'q4' ? `
              <div class="fraction-visuals">
                <div class="fraction-demo">
                  <h3>1 · Voir la fraction</h3>
                  <p>Une même quantité peut être découpée en parts différentes.</p>
                  <div id="fraction-parts" class="fraction-parts"></div>
                  <div class="actions fraction-actions">
                    <button class="btn btn-secondary" type="button" data-fraction="1/2">1/2</button>
                    <button class="btn btn-secondary" type="button" data-fraction="2/4">2/4</button>
                    <button class="btn btn-secondary" type="button" data-fraction="3/4">3/4</button>
                  </div>
                  <p id="fraction-label" class="fraction-label"></p>
                </div>
                <div class="fraction-demo percent-correction-demo">
                  <h3>2 · Voir le pourcentage sur 100 cases</h3>
                  <p>Chaque case vaut 1 %. Pour 50 %, les 50 cases de gauche sont colorées.</p>
                  <div id="correction-percent-grid" class="correction-percent-grid" aria-label="Grille de 100 cases"></div>
                  <div class="actions fraction-actions">
                    <button class="btn btn-secondary" type="button" data-correction-percent="25">25 %</button>
                    <button class="btn btn-secondary" type="button" data-correction-percent="50">50 %</button>
                    <button class="btn btn-secondary" type="button" data-correction-percent="75">75 %</button>
                  </div>
                  <p id="correction-percent-label" class="fraction-label"></p>
                </div>
              </div>` : ''}
          ` : `
            <div class="correction-solution locked-solution">
              <span>Correction</span>
              <p>Solution masquée jusqu’au déblocage par le professeur.</p>
            </div>
          `}
        </article>`).join('')}
        <div class="actions">
          <button class="btn btn-primary" id="to-challenge">Passer au défi PSR</button>
          <button class="btn btn-secondary" id="redo-diagnostic">Refaire le diagnostic</button>
          <button class="btn btn-ghost" id="correction-back">Parcours</button>
        </div>
      </section>
    `, 3);

    const fractionParts = document.querySelector('#fraction-parts');
    if (fractionParts) {
      const showFraction = (numerator, denominator) => {
        fractionParts.style.gridTemplateColumns = `repeat(${denominator}, minmax(0, 1fr))`;
        fractionParts.replaceChildren();
        for (let i = 0; i < denominator; i += 1) {
          const part = document.createElement('span');
          part.className = i < numerator ? 'fraction-part filled' : 'fraction-part';
          fractionParts.append(part);
        }
        const percent = (numerator / denominator) * 100;
        document.querySelector('#fraction-label').textContent = numerator / denominator === 0.5
          ? '1/2 = 2/4 = 50 %'
          : `${numerator}/${denominator} = ${formatNumber(percent)} %`;
      };
      document.querySelectorAll('[data-fraction]').forEach(button => button.addEventListener('click', () => {
        const [n, d] = button.dataset.fraction.split('/').map(Number);
        showFraction(n, d);
      }));
      showFraction(1, 2);
    }

    const correctionPercentGrid = document.querySelector('#correction-percent-grid');
    if (correctionPercentGrid) {
      const labels = {
        25: '25 % = 25/100 = 1/4',
        50: '50 % = 50/100 = 2/4 = 1/2',
        75: '75 % = 75/100 = 3/4'
      };
      const showPercent = value => {
        correctionPercentGrid.replaceChildren();
        for (let i = 0; i < 100; i += 1) {
          const row = Math.floor(i / 10);
          const column = i % 10;
          const leftToRightRank = column * 10 + row;
          const cell = document.createElement('span');
          cell.className = leftToRightRank < value ? 'filled' : '';
          correctionPercentGrid.append(cell);
        }
        document.querySelector('#correction-percent-label').textContent = labels[value];
      };
      document.querySelectorAll('[data-correction-percent]').forEach(button => button.addEventListener('click', () => {
        showPercent(Number(button.dataset.correctionPercent));
      }));
      showPercent(50);
    }

    document.querySelector('#refresh-correction-access')?.addEventListener('click', async () => {
      const unlocked = await refreshCorrectionsState(true);
      if (unlocked) renderCorrection();
      else {
        const button = document.querySelector('#refresh-correction-access');
        if (button) button.textContent = 'Toujours verrouillé par le professeur';
      }
    });
    document.querySelector('#to-challenge').addEventListener('click', () => go('defi'));
    document.querySelector('#redo-diagnostic').addEventListener('click', () => go('diagnostic'));
    document.querySelector('#correction-back').addEventListener('click', () => go('parcours'));
  }

  async function renderChallenge() {
    if (!state.diagnosticDone && !teacherPreview) return go('diagnostic');
    await refreshCorrectionsState(true);
    if (location.hash.replace('#', '') !== 'defi') return;
    shell(`
      <section class="card hero">
        <p class="eyebrow">Étape 4 · Défi PSR</p>
        <h2>Préparer le service.</h2>
        <p class="lead">La fiche technique ci-dessous est prévue pour 10 portions de salade de fruits. Le nombre de clients change : adapte la production, puis réponds aux questions du service.</p>
        ${teacherPreview ? '<div class="callout"><strong>Vue prof :</strong> tu peux afficher le corrigé du défi sans enregistrer de résultat élève.</div>' : ''}
        <div class="challenge-board">
          <div class="recipe-card">
            <h3>Fiche technique · 10 portions</h3>
            <table class="recipe-table">
              <thead><tr><th>Ingrédient</th><th>Quantité</th></tr></thead>
              <tbody>
                <tr><td>Pommes</td><td>800 g</td></tr>
                <tr><td>Oranges</td><td>600 g</td></tr>
                <tr><td>Bananes</td><td>400 g</td></tr>
                <tr><td>Jus</td><td>250 mL</td></tr>
              </tbody>
            </table>
            <p class="footer-note">Coût matière pour 10 portions : 8,50 €.</p>
          </div>
          <div class="range-wrap">
            <label for="portions"><strong>Nombre de portions à produire</strong></label>
            <div class="big-number"><span id="portion-count">24</span></div>
            <input id="portions" type="range" min="5" max="40" step="1" value="24" />
            <div class="mini-stats">
              <div class="mini-stat">Pommes<strong id="apples">1 920 g</strong></div>
              <div class="mini-stat">Oranges<strong id="oranges">1 440 g</strong></div>
              <div class="mini-stat">Bananes<strong id="bananas">960 g</strong></div>
              <div class="mini-stat">Jus<strong id="juice">600 mL</strong></div>
              <div class="mini-stat">Coût estimé<strong id="cost">20,40 €</strong></div>
              <div class="mini-stat">Coefficient<strong id="factor">× 2,4</strong></div>
            </div>
          </div>
        </div>
        <div class="question-list">
          <fieldset class="question">
            <legend><span class="question-index">1</span><span>Pour le nombre de portions choisi ci-dessus, comment trouver le coefficient qui permet d’adapter toutes les quantités de la recette ?</span></legend>
            <span class="question-domain">Proportionnalité</span>
            <div class="answer-row"><select id="factor-choice">
              <option value="">Choisir…</option>
              <option value="wrong-inverse">Faire 10 ÷ nombre de portions</option>
              <option value="coefficient">Faire nombre de portions ÷ 10, puis multiplier chaque quantité par ce résultat</option>
              <option value="wrong-add">Ajouter 10 au nombre de portions</option>
            </select></div>
          </fieldset>
          <fieldset class="question">
            <legend><span class="question-index">2</span><span>Le service commence à 11 h 45. La préparation et la mise en place demandent 35 minutes. Au plus tard, à quelle heure faut-il commencer ?</span></legend>
            <span class="question-domain">Durées</span>
            <div class="answer-row"><input id="start-time" type="text" placeholder="ex. 11 h 10" /></div>
          </fieldset>
          <fieldset class="question">
            <legend><span class="question-index">3</span><span>Si chaque portion est vendue 2,50 € et que toutes les portions produites sont vendues, quel chiffre d’affaires obtient-on ?</span></legend>
            <span class="question-domain">Prix & calcul</span>
            <div class="answer-row"><input id="revenue" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div>
          </fieldset>
        </div>
        <div id="challenge-feedback" class="callout hidden"></div>
        <div class="actions">
          <button class="btn btn-primary" id="check-challenge">Vérifier le défi</button>
          ${teacherPreview ? '<button class="btn btn-secondary" id="show-challenge-answers">Afficher le corrigé du défi</button><button class="btn btn-secondary" id="preview-bilan">Voir le bilan sans répondre</button>' : ''}
          <button class="btn btn-secondary" id="challenge-back">Retour au parcours</button>
        </div>
      </section>
    `, 4);

    const range = document.querySelector('#portions');
    const update = () => updateRecipe(Number(range.value));
    range.addEventListener('input', update);
    update();

    const checkChallenge = async () => {
      const portions = Number(range.value);
      const factor = portions / 10;
      const factorOk = document.querySelector('#factor-choice').value === 'coefficient';
      const timeOk = ['11h10','11 h 10','11:10','11.10'].some(v => normaliseText(v) === normaliseText(document.querySelector('#start-time').value));
      const revenueExpected = portions * 2.5;
      const revenueOk = Math.abs(parseNumber(document.querySelector('#revenue').value) - revenueExpected) < 0.001;
      const count = [factorOk, timeOk, revenueOk].filter(Boolean).length;
      const detailed = teacherPreview || await refreshCorrectionsState(true);
      const feedback = document.querySelector('#challenge-feedback');
      feedback.classList.remove('hidden');

      if (detailed) {
        feedback.innerHTML = `<strong>${count}/3 réponses justes.</strong>
          <div class="feedback-lines">
            <span>${factorOk ? '✓' : '↻'} Coefficient : ${portions} ÷ 10 = <b>${formatNumber(factor)}</b>, puis chaque quantité est multipliée par ${formatNumber(factor)}.</span>
            <span>${timeOk ? '✓' : '↻'} Horaire : 11 h 45 − 35 min = <b>11 h 10</b>.</span>
            <span>${revenueOk ? '✓' : '↻'} Chiffre d’affaires : ${portions} × 2,50 € = <b>${formatMoney(revenueExpected)}</b>.</span>
          </div>`;
      } else {
        feedback.innerHTML = `<strong>${count}/3 réponses justes.</strong>
          <div class="feedback-lines">
            <span>${factorOk ? '✓' : '↻'} Question 1 · adapter la recette</span>
            <span>${timeOk ? '✓' : '↻'} Question 2 · heure de début</span>
            <span>${revenueOk ? '✓' : '↻'} Question 3 · chiffre d’affaires</span>
          </div>
          <p class="feedback-lock-note">Le corrigé détaillé est volontairement masqué. Le professeur pourra le débloquer pour toute la classe.</p>`;
      }

      if (count === 3 && !teacherPreview) {
        state.challengeDone = true;
        saveState();
        feedback.innerHTML += '<div class="actions"><button class="btn btn-primary" id="to-summary">Voir mon bilan</button></div>';
        document.querySelector('#to-summary').addEventListener('click', () => go('bilan'));
      }
      syncProgress('challenge', {
        score: count,
        portions,
        factor_ok: factorOk,
        time_ok: timeOk,
        revenue_ok: revenueOk
      });
    };

    document.querySelector('#check-challenge').addEventListener('click', checkChallenge);
    document.querySelector('#show-challenge-answers')?.addEventListener('click', async () => {
      document.querySelector('#factor-choice').value = 'coefficient';
      document.querySelector('#start-time').value = '11 h 10';
      document.querySelector('#revenue').value = formatNumber(Number(range.value) * 2.5);
      await checkChallenge();
    });
    document.querySelector('#preview-bilan')?.addEventListener('click', () => go('bilan'));
    document.querySelector('#challenge-back').addEventListener('click', () => go('parcours'));
  }

  function updateRecipe(portions) {
    const factor = portions / 10;
    document.querySelector('#portion-count').textContent = portions;
    document.querySelector('#apples').textContent = `${formatQty(800 * factor)} g`;
    document.querySelector('#oranges').textContent = `${formatQty(600 * factor)} g`;
    document.querySelector('#bananas').textContent = `${formatQty(400 * factor)} g`;
    document.querySelector('#juice').textContent = `${formatQty(250 * factor)} mL`;
    document.querySelector('#cost').textContent = formatMoney(8.5 * factor);
    document.querySelector('#factor').textContent = `× ${formatNumber(factor)}`;
  }

  function parseClock(value) {
    const raw = String(value || '').trim().toLowerCase();
    const match = raw.match(/^(\d{1,2})\s*(?:h|:|\.)\s*(\d{1,2})$/);
    if (!match) return NaN;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
    return hours * 60 + minutes;
  }

  function minutesToClock(totalMinutes) {
    const wrapped = ((Number(totalMinutes) % 1440) + 1440) % 1440;
    const hours = Math.floor(wrapped / 60);
    const minutes = wrapped % 60;
    return `${hours} h ${String(minutes).padStart(2, '0')}`;
  }

  function renderDurationModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Durées</p>
        <h2>Heures et minutes, sans piège.</h2>
        <p class="lead">En restauration, une heure sert à organiser le travail : commencer une préparation, respecter une cuisson, être prêt avant le service. On va d’abord voir le temps, puis seulement faire les calculs.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">🍲</span><strong>Cuisson</strong><p>Une soupe commence à 9 h 35 et cuit 50 min. Quand est-elle prête ?</p></article>
          <article class="module-context"><span aria-hidden="true">🧑‍🍳</span><strong>Mise en place</strong><p>Le service est à 11 h 45. Il faut 35 min avant. Quand commencer ?</p></article>
          <article class="module-context"><span aria-hidden="true">🧽</span><strong>Organisation</strong><p>Une tâche va de 10 h 15 à 12 h 00. Combien de temps dure-t-elle ?</p></article>
        </div>

        <div class="callout module-rule"><strong>À retenir :</strong> 1 heure = 60 minutes. Une heure n’a pas 100 minutes.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Manipule</span><h3>Fais bouger le temps</h3></div>
            <p>Change l’heure de départ et la durée. L’heure de fin se recalcule tout de suite.</p>
          </div>
          <div class="time-controls">
            <label><span>Départ</span><strong id="time-start-label">9 h 35</strong><input id="time-start-range" type="range" min="480" max="780" step="5" value="575" /></label>
            <label><span>Durée</span><strong><span id="time-duration-label">50</span> min</strong><input id="time-duration-range" type="range" min="10" max="120" step="5" value="50" /></label>
          </div>
          <div class="time-equation" aria-live="polite">
            <span id="time-start-value">9 h 35</span><b>+</b><span id="time-duration-value">50 min</span><b>=</b><strong id="time-end-value">10 h 25</strong>
          </div>
          <div class="time-track" aria-hidden="true"><span class="time-track-fill" id="time-track-fill"></span></div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Une méthode simple</p>
          <div class="method-steps">
            <div><span>1</span><p>Va jusqu’à l’heure ronde.</p></div>
            <div><span>2</span><p>Regarde combien de minutes tu as utilisées.</p></div>
            <div><span>3</span><p>Ajoute les minutes qui restent.</p></div>
          </div>
          <div class="worked-example"><strong>9 h 35 + 50 min</strong><span>+ 25 min → 10 h 00</span><span>il reste 25 min</span><strong>→ 10 h 25</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>Une préparation commence à 9 h 35 et dure 50 min. À quelle heure finit-elle ?</span></legend><span class="question-domain">Ajouter une durée</span><div class="answer-row"><input id="duration-q1" type="text" placeholder="ex. 10 h 25" /></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>Le service commence à 11 h 45. La mise en place demande 35 min. À quelle heure faut-il commencer ?</span></legend><span class="question-domain">Revenir en arrière</span><div class="answer-row"><input id="duration-q2" type="text" placeholder="ex. 11 h 10" /></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>Tu travailles sur une tâche de 10 h 15 à 12 h 00. Combien de minutes cela dure-t-il ?</span></legend><span class="question-domain">Calculer une durée</span><div class="answer-row"><input id="duration-q3" inputmode="numeric" type="text" placeholder="Ta réponse" /><span>min</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>1 h 30 correspond à combien de minutes ?</span></legend><span class="question-domain">Convertir</span><div class="answer-row"><select id="duration-q4"><option value="">Choisir…</option><option value="30">30 min</option><option value="60">60 min</option><option value="90">90 min</option><option value="130">130 min</option></select></div></fieldset>
          </div>
          <div id="duration-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-duration">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-duration-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="proportion">Module suivant · Recettes</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    const startRange = document.querySelector('#time-start-range');
    const durationRange = document.querySelector('#time-duration-range');
    const updateTimeLab = () => {
      const start = Number(startRange.value);
      const duration = Number(durationRange.value);
      const end = start + duration;
      document.querySelector('#time-start-label').textContent = minutesToClock(start);
      document.querySelector('#time-duration-label').textContent = duration;
      document.querySelector('#time-start-value').textContent = minutesToClock(start);
      document.querySelector('#time-duration-value').textContent = `${duration} min`;
      document.querySelector('#time-end-value').textContent = minutesToClock(end);
      document.querySelector('#time-track-fill').style.width = `${Math.min(100, Math.max(12, duration / 1.2))}%`;
    };
    startRange.addEventListener('input', updateTimeLab);
    durationRange.addEventListener('input', updateTimeLab);
    updateTimeLab();

    const showDurationFeedback = () => {
      const checks = [
        parseClock(document.querySelector('#duration-q1').value) === 625,
        parseClock(document.querySelector('#duration-q2').value) === 670,
        Math.abs(parseNumber(document.querySelector('#duration-q3').value) - 105) < 0.001,
        document.querySelector('#duration-q4').value === '90'
      ];
      const feedback = document.querySelector('#duration-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 9 h 35 + 50 min = <b>10 h 25</b></span>
          <span>${checks[1] ? '✓' : '↻'} 11 h 45 − 35 min = <b>11 h 10</b></span>
          <span>${checks[2] ? '✓' : '↻'} De 10 h 15 à 12 h 00 = <b>105 min</b> = 1 h 45</span>
          <span>${checks[3] ? '✓' : '↻'} 1 h 30 = 60 min + 30 min = <b>90 min</b></span>
        </div>`;
    };

    document.querySelector('#check-duration').addEventListener('click', () => {
      showDurationFeedback();
      syncActivity('activity_checked', 'durees');
    });
    document.querySelector('#show-duration-answers')?.addEventListener('click', () => {
      document.querySelector('#duration-q1').value = '10 h 25';
      document.querySelector('#duration-q2').value = '11 h 10';
      document.querySelector('#duration-q3').value = '105';
      document.querySelector('#duration-q4').value = '90';
      showDurationFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }

  function renderProportionModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Recettes</p>
        <h2>Changer les portions, garder la recette.</h2>
        <p class="lead">Si le nombre de clients change, les quantités changent aussi. L’idée est simple : on garde les mêmes proportions pour que la recette reste la même.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">🍚</span><strong>Recette</strong><p>5 portions utilisent 400 g de riz. Pour 15 portions, il faut plus de riz.</p></article>
          <article class="module-context"><span aria-hidden="true">🥤</span><strong>Boisson</strong><p>2 L suffisent pour 8 personnes. Pour 20 personnes, la quantité doit changer de la même façon.</p></article>
          <article class="module-context"><span aria-hidden="true">📦</span><strong>Barquettes</strong><p>Si 6 barquettes demandent une quantité, 18 barquettes en demandent 3 fois plus.</p></article>
        </div>

        <div class="callout module-rule"><strong>L’idée avant le mot :</strong> si les portions sont multipliées par un nombre, chaque quantité est multipliée par le même nombre. En maths, ce lien s’appelle la <b>proportionnalité</b>.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Manipule</span><h3>Fais varier les portions</h3></div>
            <p>La fiche de base est prévue pour 10 portions. Bouge le curseur et observe ce qui change.</p>
          </div>
          <div class="proportion-lab">
            <div class="recipe-card compact-recipe">
              <h3>Base · 10 portions</h3>
              <div class="recipe-simple-row"><span>Riz</span><strong>800 g</strong></div>
              <div class="recipe-simple-row"><span>Légumes</span><strong>500 g</strong></div>
              <div class="recipe-simple-row"><span>Sauce</span><strong>250 mL</strong></div>
            </div>
            <div class="range-wrap proportion-range">
              <label for="proportion-portions"><strong>Je prépare pour</strong></label>
              <div class="big-number"><span id="proportion-count">20</span> <small>portions</small></div>
              <input id="proportion-portions" type="range" min="5" max="30" step="1" value="20" />
              <div class="portion-comparison">
                <div><span>Base</span><strong>10</strong></div>
                <div class="portion-arrow">× <strong id="proportion-factor">2</strong></div>
                <div><span>Nouveau</span><strong id="proportion-new">20</strong></div>
              </div>
              <div class="mini-stats">
                <div class="mini-stat">Riz<strong id="proportion-rice">1 600 g</strong></div>
                <div class="mini-stat">Légumes<strong id="proportion-veg">1 000 g</strong></div>
                <div class="mini-stat">Sauce<strong id="proportion-sauce">500 mL</strong></div>
                <div class="mini-stat">Même coefficient<strong id="proportion-factor-card">× 2</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Une méthode simple</p>
          <div class="method-steps">
            <div><span>1</span><p>Compare le nouveau nombre de portions au nombre de départ.</p></div>
            <div><span>2</span><p>Trouve par combien on multiplie.</p></div>
            <div><span>3</span><p>Multiplie chaque quantité par ce même nombre.</p></div>
          </div>
          <div class="worked-example"><strong>5 portions → 15 portions</strong><span>15 ÷ 5 = 3</span><span>400 g × 3</span><strong>→ 1 200 g</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>400 g de riz suffisent pour 5 portions. Combien faut-il pour 15 portions ?</span></legend><span class="question-domain">Même multiplicateur</span><div class="answer-row"><input id="prop-q1" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>g</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>2 L de soupe suffisent pour 8 personnes. Combien faut-il pour 20 personnes ?</span></legend><span class="question-domain">Coefficient 2,5</span><div class="answer-row"><input id="prop-q2" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>L</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>750 g de fruits sont prévus pour 6 portions. Combien faut-il pour 18 portions ?</span></legend><span class="question-domain">Multiplier par 3</span><div class="answer-row"><input id="prop-q3" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>g</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>On passe de 10 portions à 25 portions. Par quel nombre faut-il multiplier les quantités ?</span></legend><span class="question-domain">Coefficient</span><div class="answer-row"><select id="prop-q4"><option value="">Choisir…</option><option value="1.5">× 1,5</option><option value="2">× 2</option><option value="2.5">× 2,5</option><option value="15">× 15</option></select></div></fieldset>
          </div>
          <div id="proportion-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-proportion">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-proportion-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="pourcentages">Module suivant · Pourcentages</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    const range = document.querySelector('#proportion-portions');
    const updateProportionLab = () => {
      const portions = Number(range.value);
      const factor = portions / 10;
      document.querySelector('#proportion-count').textContent = portions;
      document.querySelector('#proportion-new').textContent = portions;
      document.querySelector('#proportion-factor').textContent = formatNumber(factor);
      document.querySelector('#proportion-factor-card').textContent = `× ${formatNumber(factor)}`;
      document.querySelector('#proportion-rice').textContent = `${formatQty(800 * factor)} g`;
      document.querySelector('#proportion-veg').textContent = `${formatQty(500 * factor)} g`;
      document.querySelector('#proportion-sauce').textContent = `${formatQty(250 * factor)} mL`;
    };
    range.addEventListener('input', updateProportionLab);
    updateProportionLab();

    const showProportionFeedback = () => {
      const checks = [
        Math.abs(parseNumber(document.querySelector('#prop-q1').value) - 1200) < 0.001,
        Math.abs(parseNumber(document.querySelector('#prop-q2').value) - 5) < 0.001,
        Math.abs(parseNumber(document.querySelector('#prop-q3').value) - 2250) < 0.001,
        document.querySelector('#prop-q4').value === '2.5'
      ];
      const feedback = document.querySelector('#proportion-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 15 ÷ 5 = 3, donc 400 × 3 = <b>1 200 g</b></span>
          <span>${checks[1] ? '✓' : '↻'} 20 ÷ 8 = 2,5, donc 2 × 2,5 = <b>5 L</b></span>
          <span>${checks[2] ? '✓' : '↻'} 18 ÷ 6 = 3, donc 750 × 3 = <b>2 250 g</b></span>
          <span>${checks[3] ? '✓' : '↻'} 25 ÷ 10 = <b>2,5</b></span>
        </div>`;
    };

    document.querySelector('#check-proportion').addEventListener('click', () => {
      showProportionFeedback();
      syncActivity('activity_checked', 'proportion');
    });
    document.querySelector('#show-proportion-answers')?.addEventListener('click', () => {
      document.querySelector('#prop-q1').value = '1200';
      document.querySelector('#prop-q2').value = '5';
      document.querySelector('#prop-q3').value = '2250';
      document.querySelector('#prop-q4').value = '2.5';
      showProportionFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }


  function renderPercentageModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Pourcentages</p>
        <h2>Un pourcentage, c’est une part sur 100.</h2>
        <p class="lead">En PSR, les pourcentages servent à lire une part, une réduction ou une évolution. On commence par voir la part, puis on calcule.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">🥗</span><strong>Répartition</strong><p>Sur 100 menus, 30 sont végétariens : cela représente 30 %.</p></article>
          <article class="module-context"><span aria-hidden="true">🏷️</span><strong>Réduction</strong><p>Sur une formule à 10 €, 20 % représentent 2 €. Le nouveau prix est donc 8 €.</p></article>
          <article class="module-context"><span aria-hidden="true">📦</span><strong>Stock</strong><p>Si 25 % de 40 produits sont utilisés, cela fait 10 produits.</p></article>
        </div>

        <div class="callout module-rule"><strong>À retenir :</strong> 50 % = 50 sur 100 = la moitié. Donc <b>50 % = 1/2 = 2/4</b>.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Manipule</span><h3>Colorie une part sur 100</h3></div>
            <p>Bouge le curseur. Chaque petit carré vaut 1 %. Regarde aussi les écritures équivalentes pour les repères les plus simples.</p>
          </div>
          <div class="percent-lab">
            <div>
              <div id="percent-grid" class="percent-grid" aria-label="Grille de 100 cases représentant un pourcentage"></div>
            </div>
            <div class="range-wrap percent-range">
              <label for="percent-slider"><strong>Part choisie</strong></label>
              <div class="big-number"><span id="percent-value">50</span><small>%</small></div>
              <input id="percent-slider" type="range" min="0" max="100" step="5" value="50" />
              <div class="percent-equivalence" id="percent-equivalence">50 % = 50/100 = 1/2 = 2/4</div>
              <div class="mini-stats">
                <div class="mini-stat">Sur 100<strong id="percent-outof">50</strong></div>
                <div class="mini-stat">Décimal<strong id="percent-decimal">0,5</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Une méthode simple</p>
          <div class="method-steps">
            <div><span>1</span><p>Repère le nombre total.</p></div>
            <div><span>2</span><p>Transforme le pourcentage en part sur 100, ou en nombre décimal.</p></div>
            <div><span>3</span><p>Calcule la part, puis vérifie si le résultat est logique.</p></div>
          </div>
          <div class="worked-example"><strong>25 % de 40</strong><span>25 % = 1/4</span><span>40 ÷ 4</span><strong>→ 10</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>25 % de 40 produits sont utilisés. Combien de produits cela représente-t-il ?</span></legend><span class="question-domain">Calculer une part</span><div class="answer-row"><input id="percent-q1" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>produits</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>Un menu coûte 18 €. Une remise de 50 % est appliquée. Quel est le nouveau prix ?</span></legend><span class="question-domain">Moitié / réduction</span><div class="answer-row"><input id="percent-q2" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>Une formule coûte 20 €. On retire 10 %. Quel prix reste à payer ?</span></legend><span class="question-domain">Réduction</span><div class="answer-row"><input id="percent-q3" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>30 commandes sur 50 concernent le menu A. Cela représente quel pourcentage ?</span></legend><span class="question-domain">Part vers pourcentage</span><div class="answer-row"><select id="percent-q4"><option value="">Choisir…</option><option value="30">30 %</option><option value="50">50 %</option><option value="60">60 %</option><option value="80">80 %</option></select></div></fieldset>
          </div>
          <div id="percent-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-percent">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-percent-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="donnees">Module suivant · Données</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    const percentGrid = document.querySelector('#percent-grid');
    percentGrid.innerHTML = Array.from({ length: 100 }, (_, index) => `<span data-cell="${index}"></span>`).join('');
    const percentSlider = document.querySelector('#percent-slider');
    const updatePercentLab = () => {
      const value = Number(percentSlider.value);
      document.querySelector('#percent-value').textContent = value;
      document.querySelector('#percent-outof').textContent = value;
      document.querySelector('#percent-decimal').textContent = formatNumber(value / 100);
      const equivalences = {
        0: '0 % = 0/100 = rien',
        25: '25 % = 25/100 = 1/4',
        50: '50 % = 50/100 = 1/2 = 2/4',
        75: '75 % = 75/100 = 3/4',
        100: '100 % = 100/100 = tout'
      };
      document.querySelector('#percent-equivalence').textContent = equivalences[value] || `${value} % = ${value}/100`;
      percentGrid.querySelectorAll('span').forEach((cell, index) => cell.classList.toggle('filled', index < value));
    };
    percentSlider.addEventListener('input', updatePercentLab);
    updatePercentLab();

    const showPercentFeedback = () => {
      const checks = [
        Math.abs(parseNumber(document.querySelector('#percent-q1').value) - 10) < 0.001,
        Math.abs(parseNumber(document.querySelector('#percent-q2').value) - 9) < 0.001,
        Math.abs(parseNumber(document.querySelector('#percent-q3').value) - 18) < 0.001,
        document.querySelector('#percent-q4').value === '60'
      ];
      const feedback = document.querySelector('#percent-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 25 % de 40 = 1/4 de 40 = <b>10</b></span>
          <span>${checks[1] ? '✓' : '↻'} 50 % de 18 € = 9 €, donc le prix devient <b>9 €</b></span>
          <span>${checks[2] ? '✓' : '↻'} 10 % de 20 € = 2 €, donc 20 € − 2 € = <b>18 €</b></span>
          <span>${checks[3] ? '✓' : '↻'} 30 ÷ 50 = 0,6 = <b>60 %</b></span>
        </div>`;
    };

    document.querySelector('#check-percent').addEventListener('click', () => {
      showPercentFeedback();
      syncActivity('activity_checked', 'pourcentages');
    });
    document.querySelector('#show-percent-answers')?.addEventListener('click', () => {
      document.querySelector('#percent-q1').value = '10';
      document.querySelector('#percent-q2').value = '9';
      document.querySelector('#percent-q3').value = '18';
      document.querySelector('#percent-q4').value = '60';
      showPercentFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }

  function renderDataModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    const baseValues = [24, 32, 28, 40, 26];
    const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Données & statistiques</p>
        <h2>Lire des données pour décider.</h2>
        <p class="lead">Un tableau ou un graphique aide à comparer des jours, repérer un maximum et résumer plusieurs valeurs. On va d’abord lire ce qu’on voit, puis calculer une moyenne.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">📊</span><strong>Ventes</strong><p>Comparer le nombre de menus servis chaque jour.</p></article>
          <article class="module-context"><span aria-hidden="true">📦</span><strong>Stock</strong><p>Repérer les produits les plus ou les moins utilisés.</p></article>
          <article class="module-context"><span aria-hidden="true">🥪</span><strong>Choix clients</strong><p>Voir quel menu revient le plus souvent.</p></article>
        </div>

        <div class="callout module-rule"><strong>Avant de calculer :</strong> lis le titre, les unités et les valeurs. Une moyenne résume plusieurs nombres : <b>on additionne, puis on divise par le nombre de valeurs</b>.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Manipule</span><h3>Une semaine de menus servis</h3></div>
            <p>Fais varier le vendredi. Observe comment le graphique et la moyenne changent.</p>
          </div>
          <div class="stats-lab">
            <div class="stats-chart-wrap">
              <div class="stats-chart" id="stats-chart" aria-label="Graphique du nombre de menus servis du lundi au vendredi">
                ${labels.map((label, index) => `<div class="stats-bar-col"><div class="stats-bar-value" id="stats-value-${index}">${baseValues[index]}</div><div class="stats-bar-track"><span class="stats-bar" id="stats-bar-${index}"></span></div><strong>${label}</strong></div>`).join('')}
              </div>
              <div class="stats-average"><span>Moyenne</span><strong id="stats-average">30</strong> menus</div>
            </div>
            <div class="range-wrap stats-range">
              <label for="stats-friday"><strong>Menus servis vendredi</strong></label>
              <div class="big-number"><span id="stats-friday-value">26</span><small>menus</small></div>
              <input id="stats-friday" type="range" min="10" max="50" step="1" value="26" />
              <div class="mini-stats">
                <div class="mini-stat">Total semaine<strong id="stats-total">150</strong></div>
                <div class="mini-stat">Maximum<strong id="stats-max">40</strong></div>
                <div class="mini-stat">Minimum<strong id="stats-min">24</strong></div>
                <div class="mini-stat">Moyenne<strong id="stats-average-card">30</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Une méthode simple</p>
          <div class="method-steps">
            <div><span>1</span><p>Lis ce que représentent les nombres et leur unité.</p></div>
            <div><span>2</span><p>Compare : plus grand, plus petit, écarts.</p></div>
            <div><span>3</span><p>Si on demande une moyenne : additionne puis divise par le nombre de valeurs.</p></div>
          </div>
          <div class="worked-example"><strong>20, 30 et 40 menus</strong><span>20 + 30 + 40 = 90</span><span>90 ÷ 3</span><strong>→ moyenne 30</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>Lundi : 20 menus. Mardi : 35. Mercredi : 30. Quel jour a le plus de menus servis ?</span></legend><span class="question-domain">Lire et comparer</span><div class="answer-row"><select id="data-q1"><option value="">Choisir…</option><option value="lundi">Lundi</option><option value="mardi">Mardi</option><option value="mercredi">Mercredi</option></select></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>On a servi 20, 30 et 40 menus sur trois jours. Quelle est la moyenne ?</span></legend><span class="question-domain">Moyenne</span><div class="answer-row"><input id="data-q2" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>menus</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>12 commandes sur 40 sont végétariennes. Quelle est leur fréquence en pourcentage ?</span></legend><span class="question-domain">Fréquence</span><div class="answer-row"><input id="data-q3" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>%</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>Une série contient 18, 22, 22 et 30. Quelle valeur apparaît le plus souvent ?</span></legend><span class="question-domain">Valeur fréquente</span><div class="answer-row"><select id="data-q4"><option value="">Choisir…</option><option value="18">18</option><option value="22">22</option><option value="30">30</option><option value="23">23</option></select></div></fieldset>
          </div>
          <div id="data-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-data">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-data-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="equations">Module suivant · Équations</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    const friday = document.querySelector('#stats-friday');
    const updateStatsLab = () => {
      const values = [...baseValues];
      values[4] = Number(friday.value);
      const total = values.reduce((sum, value) => sum + value, 0);
      const average = total / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      values.forEach((value, index) => {
        document.querySelector(`#stats-value-${index}`).textContent = value;
        document.querySelector(`#stats-bar-${index}`).style.height = `${Math.max(8, value / 50 * 100)}%`;
      });
      document.querySelector('#stats-friday-value').textContent = values[4];
      document.querySelector('#stats-total').textContent = total;
      document.querySelector('#stats-max').textContent = max;
      document.querySelector('#stats-min').textContent = min;
      document.querySelector('#stats-average').textContent = formatNumber(average);
      document.querySelector('#stats-average-card').textContent = formatNumber(average);
    };
    friday.addEventListener('input', updateStatsLab);
    updateStatsLab();

    const showDataFeedback = () => {
      const checks = [
        document.querySelector('#data-q1').value === 'mardi',
        Math.abs(parseNumber(document.querySelector('#data-q2').value) - 30) < 0.001,
        Math.abs(parseNumber(document.querySelector('#data-q3').value) - 30) < 0.001,
        document.querySelector('#data-q4').value === '22'
      ];
      const feedback = document.querySelector('#data-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 35 est la plus grande valeur : <b>mardi</b></span>
          <span>${checks[1] ? '✓' : '↻'} (20 + 30 + 40) ÷ 3 = 90 ÷ 3 = <b>30</b></span>
          <span>${checks[2] ? '✓' : '↻'} 12 ÷ 40 = 0,3 = <b>30 %</b></span>
          <span>${checks[3] ? '✓' : '↻'} <b>22</b> apparaît deux fois : c’est la valeur la plus fréquente</span>
        </div>`;
    };

    document.querySelector('#check-data').addEventListener('click', () => {
      showDataFeedback();
      syncActivity('activity_checked', 'donnees');
    });
    document.querySelector('#show-data-answers')?.addEventListener('click', () => {
      document.querySelector('#data-q1').value = 'mardi';
      document.querySelector('#data-q2').value = '30';
      document.querySelector('#data-q3').value = '30';
      document.querySelector('#data-q4').value = '22';
      showDataFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }


  function renderEquationModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Équations</p>
        <h2>Trouver le nombre caché.</h2>
        <p class="lead">Parfois, on connaît le résultat mais pas la quantité de départ. On peut appeler ce nombre <b>x</b>. La lettre n’est pas un nouveau calcul : elle remplace simplement le nombre qu’on cherche.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">📦</span><strong>Barquettes</strong><p>3 lots identiques donnent 24 barquettes. Combien y en a-t-il dans un lot ?</p></article>
          <article class="module-context"><span aria-hidden="true">💶</span><strong>Prix</strong><p>Après avoir ajouté 5 €, on obtient 17 €. Quel était le prix de départ ?</p></article>
          <article class="module-context"><span aria-hidden="true">🥤</span><strong>Quantité</strong><p>4 bouteilles identiques coûtent 36 €. Quel est le prix d’une bouteille ?</p></article>
        </div>

        <div class="callout module-rule"><strong>L’idée avant le mot :</strong> on cherche le nombre qui rend l’égalité vraie. En maths, une égalité avec un nombre inconnu s’appelle une <b>équation</b>.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Manipule</span><h3>Fais équilibrer l’égalité</h3></div>
            <p>On cherche x dans 3 × x = 24. Bouge le curseur jusqu’à ce que les deux côtés donnent la même chose.</p>
          </div>
          <div class="equation-lab">
            <div class="equation-balance" id="equation-balance">
              <div class="equation-side">
                <span>3 × x</span>
                <strong id="equation-left">12</strong>
              </div>
              <div class="balance-sign" id="equation-sign">≠</div>
              <div class="equation-side target">
                <span>Résultat</span>
                <strong>24</strong>
              </div>
            </div>
            <div class="range-wrap equation-range">
              <label for="equation-x"><strong>Valeur de x</strong></label>
              <div class="big-number"><span id="equation-x-value">4</span></div>
              <input id="equation-x" type="range" min="1" max="12" step="1" value="4" />
              <div class="equation-live" id="equation-live">3 × 4 = 12</div>
              <div class="equation-status" id="equation-status">Ce n’est pas encore égal à 24.</div>
            </div>
          </div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Une méthode simple</p>
          <div class="method-steps">
            <div><span>1</span><p>Repère le nombre que tu cherches.</p></div>
            <div><span>2</span><p>Regarde l’opération faite avec ce nombre.</p></div>
            <div><span>3</span><p>Fais l’opération inverse pour revenir au nombre caché.</p></div>
          </div>
          <div class="worked-example"><strong>3 × x = 24</strong><span>on fait l’inverse de × 3</span><span>24 ÷ 3</span><strong>→ x = 8</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>3 × x = 24. Quelle est la valeur de x ?</span></legend><span class="question-domain">Division inverse</span><div class="answer-row"><input id="equation-q1" inputmode="decimal" type="text" placeholder="Ta réponse" /></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>x + 7 = 19. Quel nombre manque ?</span></legend><span class="question-domain">Soustraction inverse</span><div class="answer-row"><input id="equation-q2" inputmode="decimal" type="text" placeholder="Ta réponse" /></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>4 menus identiques coûtent 36 €. Quel est le prix d’un menu ?</span></legend><span class="question-domain">Situation vers équation</span><div class="answer-row"><input id="equation-q3" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>x − 4 = 11. Quelle est la valeur de x ?</span></legend><span class="question-domain">Addition inverse</span><div class="answer-row"><select id="equation-q4"><option value="">Choisir…</option><option value="7">7</option><option value="15">15</option><option value="44">44</option><option value="4">4</option></select></div></fieldset>
          </div>
          <div id="equation-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-equation">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-equation-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="fonctions">Module suivant · Graphiques</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    const slider = document.querySelector('#equation-x');
    const updateEquationLab = () => {
      const x = Number(slider.value);
      const left = 3 * x;
      const solved = left === 24;
      document.querySelector('#equation-x-value').textContent = x;
      document.querySelector('#equation-left').textContent = left;
      document.querySelector('#equation-sign').textContent = solved ? '=' : '≠';
      document.querySelector('#equation-live').textContent = `3 × ${x} = ${left}`;
      document.querySelector('#equation-status').textContent = solved
        ? 'Équilibre trouvé : x = 8.'
        : left < 24 ? 'Le côté gauche est encore trop petit.' : 'Le côté gauche est maintenant trop grand.';
      document.querySelector('#equation-balance').classList.toggle('balanced', solved);
    };
    slider.addEventListener('input', updateEquationLab);
    updateEquationLab();

    const showEquationFeedback = () => {
      const checks = [
        Math.abs(parseNumber(document.querySelector('#equation-q1').value) - 8) < 0.001,
        Math.abs(parseNumber(document.querySelector('#equation-q2').value) - 12) < 0.001,
        Math.abs(parseNumber(document.querySelector('#equation-q3').value) - 9) < 0.001,
        document.querySelector('#equation-q4').value === '15'
      ];
      const feedback = document.querySelector('#equation-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 3 × x = 24 → 24 ÷ 3 = <b>8</b></span>
          <span>${checks[1] ? '✓' : '↻'} x + 7 = 19 → 19 − 7 = <b>12</b></span>
          <span>${checks[2] ? '✓' : '↻'} 36 € ÷ 4 menus = <b>9 €</b> par menu</span>
          <span>${checks[3] ? '✓' : '↻'} x − 4 = 11 → 11 + 4 = <b>15</b></span>
        </div>`;
    };

    document.querySelector('#check-equation').addEventListener('click', () => {
      showEquationFeedback();
      syncActivity('activity_checked', 'equations');
    });
    document.querySelector('#show-equation-answers')?.addEventListener('click', () => {
      document.querySelector('#equation-q1').value = '8';
      document.querySelector('#equation-q2').value = '12';
      document.querySelector('#equation-q3').value = '9';
      document.querySelector('#equation-q4').value = '15';
      showEquationFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }

  function renderFunctionModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Graphiques & fonctions</p>
        <h2>Quand une quantité change, l’autre change aussi.</h2>
        <p class="lead">Si chaque menu est vendu au même prix, plus on vend de menus, plus le montant total augmente. Un graphique permet de voir ce lien d’un coup d’œil.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">🍽️</span><strong>Menus vendus</strong><p>Nombre de menus ↔ montant encaissé.</p></article>
          <article class="module-context"><span aria-hidden="true">🥣</span><strong>Production</strong><p>Nombre de portions ↔ quantité d’ingrédients.</p></article>
          <article class="module-context"><span aria-hidden="true">⏱️</span><strong>Cadence</strong><p>Temps de production ↔ nombre de barquettes produites.</p></article>
        </div>

        <div class="callout module-rule"><strong>L’idée avant le mot :</strong> une quantité dépend d’une autre. En maths, cette relation peut s’appeler une <b>fonction</b>. Le graphique montre comment les deux quantités évoluent ensemble.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Manipule</span><h3>Menus vendus à 8 € l’unité</h3></div>
            <p>Bouge le curseur. Le point se déplace sur la droite et le montant total change.</p>
          </div>
          <div class="function-lab">
            <div class="function-chart-card">
              <svg id="function-chart" class="function-chart" viewBox="0 0 440 280" role="img" aria-label="Graphique reliant le nombre de menus au montant encaissé">
                <defs>
                  <pattern id="grid-small" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(102,86,242,.10)" stroke-width="1"/>
                  </pattern>
                </defs>
                <rect x="50" y="20" width="360" height="220" rx="10" fill="url(#grid-small)"/>
                <line x1="50" y1="240" x2="410" y2="240" class="chart-axis"/>
                <line x1="50" y1="240" x2="50" y2="20" class="chart-axis"/>
                <line x1="50" y1="240" x2="410" y2="20" class="function-line"/>
                <circle id="function-point" cx="194" cy="152" r="8" class="function-point"/>
                <text x="220" y="270" text-anchor="middle" class="chart-label">menus vendus</text>
                <text x="15" y="130" text-anchor="middle" transform="rotate(-90 15 130)" class="chart-label">montant (€)</text>
                <text x="45" y="256" text-anchor="end" class="chart-tick">0</text>
                <text x="230" y="256" text-anchor="middle" class="chart-tick">10</text>
                <text x="410" y="256" text-anchor="middle" class="chart-tick">20</text>
                <text x="42" y="135" text-anchor="end" class="chart-tick">80</text>
                <text x="42" y="25" text-anchor="end" class="chart-tick">160</text>
              </svg>
            </div>
            <div class="range-wrap function-range">
              <label for="function-menus"><strong>Menus vendus</strong></label>
              <div class="big-number"><span id="function-menu-count">8</span><small>menus</small></div>
              <input id="function-menus" type="range" min="0" max="20" step="1" value="8" />
              <div class="function-relation">
                <span id="function-x">8 menus</span>
                <b>× 8 €</b>
                <strong id="function-y">64 €</strong>
              </div>
              <div class="mini-stats">
                <div class="mini-stat">x = menus<strong id="function-x-card">8</strong></div>
                <div class="mini-stat">y = montant<strong id="function-y-card">64 €</strong></div>
                <div class="mini-stat">Relation<strong>y = 8 × x</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Lire un graphique</p>
          <div class="method-steps">
            <div><span>1</span><p>Regarde ce que représente l’axe horizontal.</p></div>
            <div><span>2</span><p>Regarde ce que représente l’axe vertical et les unités.</p></div>
            <div><span>3</span><p>Pars d’une valeur sur un axe et lis la valeur correspondante sur l’autre.</p></div>
          </div>
          <div class="worked-example"><strong>10 menus</strong><span>8 € chacun</span><span>10 × 8 €</span><strong>→ 80 €</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>Un menu coûte 8 €. Quel montant pour 6 menus ?</span></legend><span class="question-domain">Calculer une image</span><div class="answer-row"><input id="function-q1" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>Avec la relation y = 8 × x, quel montant correspond à 10 menus ?</span></legend><span class="question-domain">Lire une relation</span><div class="answer-row"><input id="function-q2" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>On a encaissé 96 € avec des menus à 8 €. Combien de menus ont été vendus ?</span></legend><span class="question-domain">Retrouver l’entrée</span><div class="answer-row"><input id="function-q3" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>menus</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>Quand le nombre de menus est multiplié par 2, que devient le montant si le prix unitaire ne change pas ?</span></legend><span class="question-domain">Comprendre la relation</span><div class="answer-row"><select id="function-q4"><option value="">Choisir…</option><option value="same">Il reste pareil</option><option value="double">Il est multiplié par 2</option><option value="half">Il est divisé par 2</option><option value="plus8">On ajoute seulement 8 €</option></select></div></fieldset>
          </div>
          <div id="function-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-function">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-function-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="commerce">Module suivant · Prix & commerce</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    const slider = document.querySelector('#function-menus');
    const updateFunctionLab = () => {
      const menus = Number(slider.value);
      const revenue = menus * 8;
      const x = 50 + menus / 20 * 360;
      const y = 240 - revenue / 160 * 220;
      document.querySelector('#function-menu-count').textContent = menus;
      document.querySelector('#function-x').textContent = `${menus} menu${menus > 1 ? 's' : ''}`;
      document.querySelector('#function-y').textContent = formatMoney(revenue);
      document.querySelector('#function-x-card').textContent = menus;
      document.querySelector('#function-y-card').textContent = formatMoney(revenue);
      document.querySelector('#function-point').setAttribute('cx', x);
      document.querySelector('#function-point').setAttribute('cy', y);
    };
    slider.addEventListener('input', updateFunctionLab);
    updateFunctionLab();

    const showFunctionFeedback = () => {
      const checks = [
        Math.abs(parseNumber(document.querySelector('#function-q1').value) - 48) < 0.001,
        Math.abs(parseNumber(document.querySelector('#function-q2').value) - 80) < 0.001,
        Math.abs(parseNumber(document.querySelector('#function-q3').value) - 12) < 0.001,
        document.querySelector('#function-q4').value === 'double'
      ];
      const feedback = document.querySelector('#function-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 6 × 8 € = <b>48 €</b></span>
          <span>${checks[1] ? '✓' : '↻'} y = 8 × 10 = <b>80 €</b></span>
          <span>${checks[2] ? '✓' : '↻'} 96 € ÷ 8 € = <b>12 menus</b></span>
          <span>${checks[3] ? '✓' : '↻'} À prix fixe, si les menus doublent, le montant <b>double aussi</b></span>
        </div>`;
    };

    document.querySelector('#check-function').addEventListener('click', () => {
      showFunctionFeedback();
      syncActivity('activity_checked', 'fonctions');
    });
    document.querySelector('#show-function-answers')?.addEventListener('click', () => {
      document.querySelector('#function-q1').value = '48';
      document.querySelector('#function-q2').value = '80';
      document.querySelector('#function-q3').value = '12';
      document.querySelector('#function-q4').value = 'double';
      showFunctionFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }


  function renderCommerceModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Prix & commerce</p>
        <h2>Comprendre ce qu’on paie et ce qu’on gagne.</h2>
        <p class="lead">En restauration, on rencontre des prix, des coûts, des remises et des factures. On va apprendre à distinguer ces nombres avant de les calculer.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">🧾</span><strong>Commande</strong><p>Calculer le montant de plusieurs menus et vérifier une facture.</p></article>
          <article class="module-context"><span aria-hidden="true">🏷️</span><strong>Remise</strong><p>Calculer ce qu’on enlève, puis le nouveau prix à payer.</p></article>
          <article class="module-context"><span aria-hidden="true">💶</span><strong>Marge simple</strong><p>Comparer un prix de vente et un coût pour voir ce qu’il reste avant les autres charges.</p></article>
        </div>

        <div class="callout module-rule"><strong>Trois mots à distinguer :</strong> le <b>coût</b> correspond à ce que le produit coûte ; le <b>prix de vente</b> est ce que paie le client ; dans nos exercices simples, la <b>marge</b> est la différence entre les deux.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Manipule</span><h3>Une commande de menus à 8,50 €</h3></div>
            <p>Change le nombre de menus et la remise. La petite facture se recalcule immédiatement.</p>
          </div>
          <div class="commerce-lab">
            <div class="invoice-card">
              <div class="invoice-heading"><strong>Commande</strong><span id="commerce-qty-label">8 menus</span></div>
              <div class="invoice-line"><span>Sous-total</span><strong id="commerce-subtotal">68,00 €</strong></div>
              <div class="invoice-line discount"><span>Remise <b id="commerce-discount-label">10 %</b></span><strong id="commerce-discount">− 6,80 €</strong></div>
              <div class="invoice-line total"><span>À payer</span><strong id="commerce-net">61,20 €</strong></div>
              <div class="invoice-line muted"><span>Coût estimé des menus</span><strong id="commerce-cost">41,60 €</strong></div>
              <div class="invoice-line margin"><span>Marge simple après remise</span><strong id="commerce-margin">19,60 €</strong></div>
            </div>
            <div class="commerce-controls">
              <div class="range-wrap">
                <label for="commerce-qty"><strong>Nombre de menus</strong></label>
                <div class="big-number"><span id="commerce-qty-value">8</span><small>menus</small></div>
                <input id="commerce-qty" type="range" min="1" max="20" step="1" value="8" />
              </div>
              <div class="range-wrap">
                <label for="commerce-discount-rate"><strong>Remise</strong></label>
                <div class="big-number"><span id="commerce-discount-value">10</span><small>%</small></div>
                <input id="commerce-discount-rate" type="range" min="0" max="30" step="5" value="10" />
              </div>
            </div>
          </div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Une méthode simple</p>
          <div class="method-steps">
            <div><span>1</span><p>Calcule d’abord le prix avant remise : quantité × prix unitaire.</p></div>
            <div><span>2</span><p>Calcule la remise, puis enlève-la au prix de départ.</p></div>
            <div><span>3</span><p>Pour une marge simple : prix de vente − coût.</p></div>
          </div>
          <div class="worked-example"><strong>40 € avec 10 % de remise</strong><span>10 % de 40 € = 4 €</span><span>40 € − 4 €</span><strong>→ 36 €</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>6 menus coûtent 8,50 € chacun. Quel est le montant total ?</span></legend><span class="question-domain">Prix × quantité</span><div class="answer-row"><input id="commerce-q1" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>Un total de 40 € bénéficie d’une remise de 10 %. Combien reste-t-il à payer ?</span></legend><span class="question-domain">Remise</span><div class="answer-row"><input id="commerce-q2" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>Un produit coûte 7,50 € et est vendu 12 €. Quelle est la marge simple de cet exercice ?</span></legend><span class="question-domain">Prix − coût</span><div class="answer-row"><input id="commerce-q3" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>Dans cet exercice, une taxe de 10 % s’applique à 50 €. Quel est le montant de la taxe ?</span></legend><span class="question-domain">Taxe fournie</span><div class="answer-row"><select id="commerce-q4"><option value="">Choisir…</option><option value="5">5 €</option><option value="10">10 €</option><option value="45">45 €</option><option value="55">55 €</option></select></div></fieldset>
          </div>
          <p class="footer-note">Le taux de taxe est donné ici uniquement pour faire le calcul : il n’est pas à mémoriser.</p>
          <div id="commerce-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-commerce">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-commerce-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="probabilites">Module suivant · Probabilités</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    const qty = document.querySelector('#commerce-qty');
    const discountRate = document.querySelector('#commerce-discount-rate');
    const updateCommerceLab = () => {
      const quantity = Number(qty.value);
      const rate = Number(discountRate.value);
      const unitPrice = 8.5;
      const unitCost = 5.2;
      const subtotal = quantity * unitPrice;
      const discount = subtotal * rate / 100;
      const net = subtotal - discount;
      const cost = quantity * unitCost;
      const margin = net - cost;
      document.querySelector('#commerce-qty-label').textContent = `${quantity} menu${quantity > 1 ? 's' : ''}`;
      document.querySelector('#commerce-qty-value').textContent = quantity;
      document.querySelector('#commerce-discount-label').textContent = `${rate} %`;
      document.querySelector('#commerce-discount-value').textContent = rate;
      document.querySelector('#commerce-subtotal').textContent = formatMoney(subtotal);
      document.querySelector('#commerce-discount').textContent = `− ${formatMoney(discount)}`;
      document.querySelector('#commerce-net').textContent = formatMoney(net);
      document.querySelector('#commerce-cost').textContent = formatMoney(cost);
      document.querySelector('#commerce-margin').textContent = formatMoney(margin);
    };
    qty.addEventListener('input', updateCommerceLab);
    discountRate.addEventListener('input', updateCommerceLab);
    updateCommerceLab();

    const showCommerceFeedback = () => {
      const checks = [
        Math.abs(parseNumber(document.querySelector('#commerce-q1').value) - 51) < 0.001,
        Math.abs(parseNumber(document.querySelector('#commerce-q2').value) - 36) < 0.001,
        Math.abs(parseNumber(document.querySelector('#commerce-q3').value) - 4.5) < 0.001,
        document.querySelector('#commerce-q4').value === '5'
      ];
      const feedback = document.querySelector('#commerce-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 6 × 8,50 € = <b>51 €</b></span>
          <span>${checks[1] ? '✓' : '↻'} 10 % de 40 € = 4 €, donc 40 € − 4 € = <b>36 €</b></span>
          <span>${checks[2] ? '✓' : '↻'} 12 € − 7,50 € = <b>4,50 €</b></span>
          <span>${checks[3] ? '✓' : '↻'} 10 % de 50 € = <b>5 €</b></span>
        </div>`;
    };

    document.querySelector('#check-commerce').addEventListener('click', () => {
      showCommerceFeedback();
      syncActivity('activity_checked', 'commerce');
    });
    document.querySelector('#show-commerce-answers')?.addEventListener('click', () => {
      document.querySelector('#commerce-q1').value = '51';
      document.querySelector('#commerce-q2').value = '36';
      document.querySelector('#commerce-q3').value = '4.5';
      document.querySelector('#commerce-q4').value = '5';
      showCommerceFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }

  function renderProbabilityModule() {
    if (!state.challengeDone && !teacherPreview) return go('parcours');
    shell(`
      <section class="card hero module-page">
        <p class="eyebrow">Module · Probabilités</p>
        <h2>Le hasard varie, mais il n’est pas sans repères.</h2>
        <p class="lead">Si on choisit au hasard, on ne peut pas prévoir le prochain résultat avec certitude. En revanche, on peut mesurer les chances d’un événement et observer ce qui se passe quand on recommence beaucoup de fois.</p>

        <div class="module-context-grid">
          <article class="module-context"><span aria-hidden="true">🎟️</span><strong>Tirage</strong><p>Parmi 10 tickets, 3 sont violets. Quelle chance de tirer un ticket violet ?</p></article>
          <article class="module-context"><span aria-hidden="true">🔎</span><strong>Contrôle au hasard</strong><p>Choisir une barquette au hasard dans un lot pour effectuer un contrôle.</p></article>
          <article class="module-context"><span aria-hidden="true">🎲</span><strong>Simulation</strong><p>Répéter virtuellement une expérience des dizaines ou centaines de fois.</p></article>
        </div>

        <div class="callout module-rule"><strong>Repères :</strong> une probabilité est comprise entre <b>0 et 1</b>, donc entre 0 % et 100 %. 0 = impossible ; 1 = certain. Ici, 3 tickets violets sur 10 donnent une probabilité de <b>3/10 = 0,3 = 30 %</b>.</div>

        <section class="learning-lab">
          <div class="lab-heading">
            <div><span class="pill">Simule</span><h3>3 tickets violets sur 10</h3></div>
            <p>Chaque tirage remet le ticket dans le lot. La probabilité reste 30 %, mais la fréquence observée peut bouger, surtout au début.</p>
          </div>
          <div class="probability-lab">
            <div class="probability-bag">
              <div class="ticket-set" aria-label="Lot de dix tickets dont trois violets">
                ${Array.from({length:10}, (_,i) => '<span class="ticket ' + (i < 3 ? 'success' : '') + '">' + (i < 3 ? 'V' : '·') + '</span>').join('')}
              </div>
              <div class="probability-formula"><strong>3</strong><span>/</span><strong>10</strong><b>=</b><strong>30 %</strong></div>
            </div>
            <div class="simulation-panel">
              <div class="simulation-stats">
                <div class="mini-stat">Tirages<strong id="prob-draws">0</strong></div>
                <div class="mini-stat">Violets<strong id="prob-successes">0</strong></div>
                <div class="mini-stat">Fréquence observée<strong id="prob-frequency">—</strong></div>
                <div class="mini-stat">Probabilité théorique<strong>30 %</strong></div>
              </div>
              <div class="probability-meter">
                <span class="probability-theory" title="30 % théorique"></span>
                <span class="probability-observed" id="prob-observed"></span>
              </div>
              <div class="simulation-history" id="prob-history" aria-label="Derniers résultats simulés"></div>
              <div class="actions compact-actions">
                <button class="btn btn-secondary prob-run" data-count="1">1 tirage</button>
                <button class="btn btn-secondary prob-run" data-count="20">20 tirages</button>
                <button class="btn btn-primary prob-run" data-count="100">100 tirages</button>
                <button class="btn btn-ghost" id="prob-reset">Recommencer</button>
              </div>
              <p id="prob-message" class="teacher-muted">Fais quelques tirages, puis compare avec 30 %.</p>
            </div>
          </div>
        </section>

        <section class="method-card">
          <p class="eyebrow">Deux idées importantes</p>
          <div class="method-steps">
            <div><span>1</span><p>Pour des issues équiprobables : compte les cas favorables et les cas possibles.</p></div>
            <div><span>2</span><p>La fréquence observée peut être différente de la probabilité sur peu d’essais.</p></div>
            <div><span>3</span><p>Quand on répète beaucoup, la fréquence a tendance à se rapprocher de la probabilité.</p></div>
          </div>
          <div class="worked-example"><strong>2 tickets rouges sur 10</strong><span>2 cas favorables</span><span>10 cas possibles</span><strong>→ 2/10 = 20 %</strong></div>
        </section>

        <section class="practice-block">
          <p class="eyebrow">À toi</p>
          <h3>4 situations courtes</h3>
          <div class="question-list">
            <fieldset class="question"><legend><span class="question-index">1</span><span>Dans un lot de 10 tickets, 2 sont rouges. Quelle est la probabilité de tirer un rouge au hasard ?</span></legend><span class="question-domain">Cas favorables / possibles</span><div class="answer-row"><input id="prob-q1" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>%</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">2</span><span>Quelle est la probabilité d’un événement impossible ?</span></legend><span class="question-domain">Impossible</span><div class="answer-row"><select id="prob-q2"><option value="">Choisir…</option><option value="0">0</option><option value="0.5">0,5</option><option value="1">1</option><option value="100">100</option></select></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">3</span><span>Un événement a une probabilité de 30 %. Quelle est la probabilité de l’événement contraire (« ne pas arriver ») ?</span></legend><span class="question-domain">Événement contraire</span><div class="answer-row"><input id="prob-q3" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>%</span></div></fieldset>
            <fieldset class="question"><legend><span class="question-index">4</span><span>La probabilité vaut 30 %. Après seulement 10 essais, on observe 40 %. Que peut-on conclure ?</span></legend><span class="question-domain">Fréquence et probabilité</span><div class="answer-row"><select id="prob-q4"><option value="">Choisir…</option><option value="wrong">La probabilité est devenue 40 %</option><option value="normal">C’est possible : la fréquence varie sur peu d’essais</option><option value="impossible">Le résultat est impossible</option></select></div></fieldset>
          </div>
          <div id="prob-feedback" class="callout hidden" aria-live="polite"></div>
          <div class="actions">
            <button class="btn btn-primary" id="check-prob">Vérifier</button>
            ${teacherPreview ? '<button class="btn btn-secondary" id="show-prob-answers">Voir les réponses</button>' : ''}
            <button class="btn btn-secondary" data-go="commerce">Revoir Prix & commerce</button>
            <button class="btn btn-ghost" data-go="parcours">Retour au parcours</button>
          </div>
        </section>
      </section>
    `);

    let draws = 0;
    let successes = 0;
    let history = [];

    const updateSimulation = () => {
      const frequency = draws ? successes / draws * 100 : null;
      document.querySelector('#prob-draws').textContent = draws;
      document.querySelector('#prob-successes').textContent = successes;
      document.querySelector('#prob-frequency').textContent = frequency === null ? '—' : `${formatNumber(frequency)} %`;
      document.querySelector('#prob-observed').style.width = `${frequency === null ? 0 : Math.min(100, frequency)}%`;
      document.querySelector('#prob-history').innerHTML = history.map(success => '<span class="' + (success ? 'success' : '') + '" title="' + (success ? 'violet' : 'autre') + '"></span>').join('');
      document.querySelector('#prob-message').textContent = draws === 0
        ? 'Fais quelques tirages, puis compare avec 30 %.'
        : draws < 20
          ? 'Sur peu de tirages, la fréquence peut être assez loin de 30 %.'
          : draws < 100
            ? 'En répétant, regarde si la fréquence se rapproche de 30 %.'
            : `Après ${draws} tirages, la fréquence observée est de ${formatNumber(frequency)} %. Elle n’a pas besoin d’être exactement égale à 30 %.`;
    };

    const runSimulation = count => {
      for (let i = 0; i < count; i += 1) {
        const success = Math.random() < 0.3;
        draws += 1;
        if (success) successes += 1;
        history.push(success);
      }
      history = history.slice(-40);
      updateSimulation();
    };

    document.querySelectorAll('.prob-run').forEach(button => button.addEventListener('click', () => runSimulation(Number(button.dataset.count))));
    document.querySelector('#prob-reset').addEventListener('click', () => {
      draws = 0;
      successes = 0;
      history = [];
      updateSimulation();
    });
    updateSimulation();

    const showProbabilityFeedback = () => {
      const checks = [
        Math.abs(parseNumber(document.querySelector('#prob-q1').value) - 20) < 0.001,
        document.querySelector('#prob-q2').value === '0',
        Math.abs(parseNumber(document.querySelector('#prob-q3').value) - 70) < 0.001,
        document.querySelector('#prob-q4').value === 'normal'
      ];
      const feedback = document.querySelector('#prob-feedback');
      const count = checks.filter(Boolean).length;
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count} situation${count > 1 ? 's' : ''} réussie${count > 1 ? 's' : ''} sur 4.</strong>
        <div class="feedback-lines">
          <span>${checks[0] ? '✓' : '↻'} 2 sur 10 = 2/10 = <b>20 %</b></span>
          <span>${checks[1] ? '✓' : '↻'} Un événement impossible a une probabilité de <b>0</b></span>
          <span>${checks[2] ? '✓' : '↻'} Événement contraire : 100 % − 30 % = <b>70 %</b></span>
          <span>${checks[3] ? '✓' : '↻'} Sur 10 essais, <b>40 % est tout à fait possible</b> même si la probabilité reste 30 %</span>
        </div>`;
    };

    document.querySelector('#check-prob').addEventListener('click', () => {
      showProbabilityFeedback();
      syncActivity('activity_checked', 'probabilites');
    });
    document.querySelector('#show-prob-answers')?.addEventListener('click', () => {
      document.querySelector('#prob-q1').value = '20';
      document.querySelector('#prob-q2').value = '0';
      document.querySelector('#prob-q3').value = '70';
      document.querySelector('#prob-q4').value = 'normal';
      showProbabilityFeedback();
    });
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  }

  function renderBilan() {
    if (!state.challengeDone && !teacherPreview) return go('defi');
    const result = diagnosticResult();
    const priorities = result.weakDomains.length ? result.weakDomains : ['Consolider et expliquer mes méthodes'];
    const firstPriority = priorities[0];
    const scoreLabel = teacherPreview
      ? 'Résultat calculé après le diagnostic'
      : result.score >= 8
        ? 'Bases solides'
        : result.score >= 5
          ? 'Plusieurs bases en place'
          : 'Priorités repérées';
    const challengeLabel = teacherPreview ? 'État calculé après le défi' : 'Terminé';
    const prioritiesLabel = teacherPreview ? 'Déduites automatiquement des erreurs observées.' : priorities.join(' · ');
    const encouragement = result.score >= 8
      ? `Très bon point de départ. Ton prochain objectif est de consolider ${firstPriority} et d’expliquer tes méthodes clairement.`
      : result.score >= 5
        ? `Tu as déjà plusieurs bases utiles. Commence par ${firstPriority}, puis refais une situation proche pour vérifier que la méthode devient automatique.`
        : `Ce diagnostic montre précisément où commencer : ${firstPriority}. Travaille une étape à la fois, avec un exemple puis un exercice très proche.`;
    shell(`
      <section class="card hero">
        <p class="eyebrow">Étape 5 · Bilan</p>
        <h2>Voilà ton point de départ.</h2>
        <p class="lead">Tu viens de faire ce qu’on attendra souvent en maths : comprendre une situation, choisir un calcul, vérifier le résultat et l’expliquer.</p>
        <div class="lesson-grid">
          <article class="info-tile"><span class="pill ok">Diagnostic</span><h3>${scoreLabel}</h3><p>Un repère pour savoir où commencer, sans note.</p></article>
          <article class="info-tile"><span class="pill ok">Défi PSR</span><h3>${challengeLabel}</h3><p>Tu as adapté une recette, manipulé une durée et calculé un montant.</p></article>
        </div>
        <div class="callout"><strong>Mes priorités :</strong> ${prioritiesLabel}</div>
        <div class="callout"><strong>Mon conseil pour commencer :</strong> ${teacherPreview ? 'Une appréciation personnalisée apparaîtra ici selon les résultats de l’élève.' : encouragement}</div>
        <p>La suite du parcours travaillera les durées, la proportionnalité, les pourcentages, les données, les équations, les graphiques, les prix et les probabilités.</p>
        <div class="actions">
          <button class="btn btn-primary" id="summary-path">Retour au parcours</button>
          <button class="btn btn-secondary" id="print-summary">Imprimer / enregistrer en PDF</button>
          ${teacherPreview ? '' : '<button class="btn btn-danger" id="reset-all">Recommencer depuis zéro</button>'}
        </div>
      </section>
    `, 4);
    document.querySelector('#summary-path').addEventListener('click', () => go('parcours'));
    document.querySelector('#print-summary').addEventListener('click', () => window.print());
    document.querySelector('#reset-all')?.addEventListener('click', () => {
      if (!confirm('Effacer la progression enregistrée sur cet appareil ?')) return;
      localStorage.removeItem(STORAGE_KEY);
      location.hash = 'bienvenue';
      location.reload();
    });
  }

  function formatNumber(n) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
  }

  function formatQty(n) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);
  }

  function formatMoney(n) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  }

  async function initialize() {
    if (teacherPreviewRequested) {
      const teacherToken = sessionStorage.getItem('maths-lgc-teacher-token') || '';
      if (teacherToken) {
        try {
          const response = await fetch('/api/teacher/summary', {
            headers: { Authorization: 'Bearer ' + teacherToken },
            cache: 'no-store'
          });
          teacherPreview = response.ok;
        } catch {
          teacherPreview = false;
        }
      }
      if (!teacherPreview) {
        app.innerHTML = `
          <section class="card hero teacher-preview-denied">
            <p class="eyebrow">Vue enseignant</p>
            <h2>Accès enseignant requis.</h2>
            <p class="lead">Cette prévisualisation contient les corrigés. Ouvre d’abord le tableau enseignant et connecte-toi avec le jeton prévu.</p>
            <div class="actions"><a class="btn btn-primary" href="/teacher">Ouvrir le tableau enseignant</a><a class="btn btn-secondary" href="/">Retour au site élève</a></div>
          </section>
        `;
        return;
      }
    }
    window.addEventListener('hashchange', render);
    render();
  }

  initialize();
})();
