(() => {
  'use strict';

  const STORAGE_KEY = 'maths-lgc-psr-v1';
  const app = document.querySelector('#app');

  const teacherPreview = new URLSearchParams(location.search).get('preview') === 'teacher';
  const state = loadState();
  const activitySessionId = createStudentId();
  const routesSeenThisSession = new Set();
  let activitySessionStarted = false;

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
    { title: 'Équations', text: 'Trouver une quantité inconnue dans une situation simple.', available: false },
    { title: 'Graphiques & fonctions', text: 'Relier une grandeur à une autre et lire une évolution.', available: false },
    { title: 'Prix & commerce', text: 'Coûts, prix, facture, réduction et marge simple.', available: false },
    { title: 'Probabilités', text: 'Comprendre le hasard, les événements et les simulations.', available: false }
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
      donnees: 'Données · lire et comparer'
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
      ['donnees', 'Données']
    ];

    app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <a class="brand-home" href="#parcours" aria-label="Retour au parcours" title="Retour au parcours"><span class="brand-mark">∑</span></a>
          <span class="brand-title">${pageTitle}</span>
        </div>
        <span class="teacher-chip">${teacherPreview ? 'Vue prof · navigation libre' : (['durees','proportion','pourcentages','donnees'].includes(route) ? 'CAP PSR · modules' : 'CAP PSR · séance 1')}</span>
      </header>
      ${teacherPreview ? `
        <nav class="teacher-preview-nav" aria-label="Navigation de prévisualisation enseignant">
          <span class="teacher-preview-label">Inspection prof</span>
          <div class="teacher-preview-links">
            ${previewLinks.map(([target, label]) => `<a class="${route === target ? 'current' : ''}" href="#${target}">${label}</a>`).join('')}
          </div>
        </nav>
      ` : ''}
      ${['durees','proportion','pourcentages','donnees'].includes(route) ? '' : `<div class="progress-strip" aria-label="Progression dans la séance">${dots}</div>`}
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

  function renderCorrection() {
    if (!state.diagnosticDone && !teacherPreview) return go('diagnostic');
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
        ${result.details.map((d, i) => `<article class="correction ${teacherPreview ? '' : d.correct ? 'ok' : 'retry'}">
          <strong>${i+1}. ${teacherPreview ? d.domain : d.correct ? '✓ Bonne stratégie' : '↻ À reprendre'}</strong>
          ${teacherPreview ? '' : `<p><b>Ta réponse :</b> ${escapeHtml(d.value)}</p>`}
          <p>${d.explain}</p>
          ${d.id === 'q4' ? `
            <div class="fraction-demo">
              <h3>Voir la fraction</h3>
              <p>Une même quantité peut s’écrire de plusieurs façons.</p>
              <div id="fraction-parts" class="fraction-parts"></div>
              <div class="actions fraction-actions">
                <button class="btn btn-secondary" type="button" data-fraction="1/2">1/2</button>
                <button class="btn btn-secondary" type="button" data-fraction="2/4">2/4</button>
                <button class="btn btn-secondary" type="button" data-fraction="3/4">3/4</button>
              </div>
              <p id="fraction-label" class="fraction-label"></p>
            </div>` : ''}
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

    document.querySelector('#to-challenge').addEventListener('click', () => go('defi'));
    document.querySelector('#redo-diagnostic').addEventListener('click', () => go('diagnostic'));
    document.querySelector('#correction-back').addEventListener('click', () => go('parcours'));
  }

  function renderChallenge() {
    if (!state.diagnosticDone && !teacherPreview) return go('diagnostic');
    shell(`
      <section class="card hero">
        <p class="eyebrow">Étape 4 · Défi PSR</p>
        <h2>Préparer le service.</h2>
        <p class="lead">La fiche technique ci-dessous est prévue pour 10 portions de salade de fruits. Le nombre de clients change : adapte la production, puis réponds aux questions du service.</p>
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
            <legend><span class="question-index">1</span><span>Pour le nombre de portions choisi ci-dessus, quel calcul permet de passer de la recette de base à la nouvelle recette ?</span></legend>
            <span class="question-domain">Proportionnalité</span>
            <div class="answer-row"><select id="factor-choice"><option value="">Choisir…</option><option value="divide">10 ÷ nombre de portions</option><option value="multiply">nombre de portions ÷ 10</option><option value="add">nombre de portions + 10</option></select></div>
          </fieldset>
          <fieldset class="question">
            <legend><span class="question-index">2</span><span>Le service commence à 11 h 45. La préparation et la mise en place demandent 35 minutes. Au plus tard, à quelle heure faut-il commencer ?</span></legend>
            <span class="question-domain">Durées</span>
            <div class="answer-row"><input id="start-time" type="text" placeholder="ex. 11 h 10" /></div>
          </fieldset>
          <fieldset class="question">
            <legend><span class="question-index">3</span><span>Si chaque portion est vendue 2,50 €, quel chiffre d’affaires correspond au nombre de portions choisi ?</span></legend>
            <span class="question-domain">Prix & calcul</span>
            <div class="answer-row"><input id="revenue" inputmode="decimal" type="text" placeholder="Ta réponse" /><span>€</span></div>
          </fieldset>
        </div>
        <div id="challenge-feedback" class="callout hidden"></div>
        <div class="actions">
          <button class="btn btn-primary" id="check-challenge">Vérifier le défi</button>
          ${teacherPreview ? '<button class="btn btn-secondary" id="preview-bilan">Voir le bilan sans répondre</button>' : ''}
          <button class="btn btn-secondary" id="challenge-back">Retour au parcours</button>
        </div>
      </section>
    `, 4);

    const range = document.querySelector('#portions');
    const update = () => updateRecipe(Number(range.value));
    range.addEventListener('input', update);
    update();

    document.querySelector('#check-challenge').addEventListener('click', () => {
      const portions = Number(range.value);
      const factorOk = document.querySelector('#factor-choice').value === 'multiply';
      const timeOk = ['11h10','11 h 10','11:10','11.10'].some(v => normaliseText(v) === normaliseText(document.querySelector('#start-time').value));
      const revenueExpected = portions * 2.5;
      const revenueOk = Math.abs(parseNumber(document.querySelector('#revenue').value) - revenueExpected) < 0.001;
      const count = [factorOk, timeOk, revenueOk].filter(Boolean).length;
      const feedback = document.querySelector('#challenge-feedback');
      feedback.classList.remove('hidden');
      feedback.innerHTML = `<strong>${count}/3 réponses justes.</strong><br>${factorOk ? '✓' : '↻'} Coefficient : nombre de portions ÷ 10.<br>${timeOk ? '✓' : '↻'} Horaire : 11 h 45 − 35 min = 11 h 10.<br>${revenueOk ? '✓' : '↻'} Chiffre d’affaires : ${portions} × 2,50 € = ${formatMoney(revenueExpected)}.`;
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

  window.addEventListener('hashchange', render);
  render();
})();
