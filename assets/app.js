(() => {
  'use strict';

  const STORAGE_KEY = 'maths-lgc-psr-v1';
  const app = document.querySelector('#app');

  const teacherPreview = new URLSearchParams(location.search).get('preview') === 'teacher';
  const state = loadState();

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
    ['Durées', 'Lire, convertir et calculer avec des horaires.'],
    ['Recettes & proportionnalité', 'Adapter une fiche technique et raisonner par coefficient.'],
    ['Pourcentages', 'Réductions, évolutions, parts et repères.'],
    ['Données & statistiques', 'Lire un tableau, une moyenne, une fréquence et un graphique.'],
    ['Équations', 'Trouver une quantité inconnue dans une situation simple.'],
    ['Graphiques & fonctions', 'Relier une grandeur à une autre et lire une évolution.'],
    ['Prix & commerce', 'Coûts, prix, facture, réduction et marge simple.'],
    ['Probabilités', 'Comprendre le hasard, les événements et les simulations.']
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
        serverSync: 'pending',
        answers: {},
        selfEval: {},
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      };
    } catch {
      return { entered: false, introDone: false, diagnosticDone: false, challengeDone: false, studentId: createStudentId(), displayName: '', serverSync: 'pending', answers: {}, selfEval: {} };
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
    if (teacherPreview || !state.displayName || !state.studentId) return;
    const result = state.diagnosticDone ? diagnosticResult() : null;
    const payload = {
      student_id: state.studentId,
      display_name: state.displayName,
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

    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark">∑</span><span>Maths LGC · CAP PSR</span></div>
        <span class="teacher-chip">${teacherPreview ? 'Vue prof · navigation libre' : 'Support de rentrée · V1'}</span>
      </header>
      <div class="progress-strip" aria-label="Progression dans la séance">${dots}</div>
      ${content}
    `;
  }

  function render() {
    const route = location.hash.replace('#', '') || (teacherPreview ? 'parcours' : (state.entered ? 'parcours' : 'bienvenue'));
    if (route === 'bienvenue') return renderPrehome();
    if (route === 'intro') return renderIntro();
    if (route === 'diagnostic') return renderDiagnostic();
    if (route === 'correction') return renderCorrection();
    if (route === 'defi') return renderChallenge();
    if (route === 'bilan') return renderBilan();
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
          <label class="info-tile" style="display:block;max-width:34rem">
            <strong>Ton prénom ou le code donné par le professeur</strong>
            <div class="answer-row" style="margin-top:10px">
              <input id="display-name" type="text" maxlength="40" autocomplete="given-name" value="${escapeHtml(state.displayName || '')}" placeholder="Ex. Lina ou PSR-07" />
            </div>
            <small>Pas besoin de nom de famille.</small>
          </label>
          <p class="form-error hidden" id="name-error">Indique un prénom ou un code avant de commencer.</p>
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
      const name = document.querySelector('#display-name').value.trim();
      if (!name) {
        document.querySelector('#name-error').classList.remove('hidden');
        return;
      }
      state.displayName = name.slice(0, 40);
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
        <p class="lead">Peser, adapter une recette, lire un horaire, contrôler une quantité, rendre la monnaie, comparer des ventes : le but n’est pas d’apprendre des calculs “dans le vide”, mais de savoir choisir le bon outil au bon moment.</p>
        <div class="lesson-grid">
          <article class="info-tile use-case"><span class="use-case-icon" aria-hidden="true">kg</span><h3>Produire</h3><p>Quantités, unités, proportions, temps et contrôles.</p></article>
          <article class="info-tile use-case"><span class="use-case-icon" aria-hidden="true">⏱</span><h3>Servir</h3><p>Horaires, monnaie, prix, estimations et organisation.</p></article>
          <article class="info-tile use-case"><span class="use-case-icon" aria-hidden="true">%</span><h3>Comprendre des données</h3><p>Tableaux, moyennes, fréquences et graphiques.</p></article>
          <article class="info-tile use-case"><span class="use-case-icon" aria-hidden="true">→</span><h3>Résoudre un problème</h3><p>Repérer les informations utiles, calculer, vérifier et expliquer.</p></article>
        </div>
        <div class="callout"><strong>Objectif sur les deux années :</strong> devenir autonome face à une situation professionnelle, et pas seulement reproduire une méthode.</div>
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
          <div class="lesson-grid">${modules.map(([title, text]) => `<article class="info-tile"><span class="pill">À venir</span><h3>${title}</h3><p>${text}</p></article>`).join('')}</div>
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
        <p class="lead">Ce n’est pas une note. Si tu ne sais pas, donne la réponse qui te paraît la plus logique. On corrigera ensemble ensuite.</p>
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
          <p class="form-error hidden" id="diag-error">Réponds à toutes les questions avant de valider.</p>
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
    document.querySelector('#preview-correction')?.addEventListener('click', () => go('correction'));
    document.querySelector('#diag-back').addEventListener('click', () => go('parcours'));
  }

  function questionMarkup(q, i) {
    const previous = state.answers[q.id] ?? '';
    let input;
    if (q.type === 'select') {
      input = `<select name="${q.id}" aria-label="Réponse à la question ${i+1}"><option value="">Choisir…</option>${q.options.map(o => `<option ${previous === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    } else {
      input = `<input type="text" inputmode="${q.type === 'text' ? 'text' : 'decimal'}" name="${q.id}" value="${escapeHtml(previous)}" placeholder="${q.placeholder || 'Ta réponse'}" aria-label="Réponse à la question ${i+1}" />`;
    }
    return `<fieldset class="question"><legend><span class="question-index">${i+1}</span><span>${q.prompt}</span></legend><span class="question-domain">${q.domain}</span><div class="answer-row">${input}${q.suffix ? `<span>${q.suffix}</span>` : ''}</div></fieldset>`;
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
          ? '<div class="callout"><strong>Vue prof :</strong> correction complète affichée sans simuler de score élève.</div>'
          : `<div class="result-summary">
              <div class="result-score">${result.score}/10</div>
              <div><h3>Ce score est un repère, pas une note.</h3><p>${summary}</p><div class="domain-chips">${result.weakDomains.length ? result.weakDomains.map(d => `<span class="pill warm">À travailler · ${d}</span>`).join('') : '<span class="pill ok">Bases solides sur ce diagnostic</span>'}</div></div>
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

  function renderBilan() {
    if (!state.challengeDone && !teacherPreview) return go('defi');
    const result = diagnosticResult();
    const priorities = result.weakDomains.length ? result.weakDomains : ['Consolider et expliquer mes méthodes'];
    const firstPriority = priorities[0];
    const scoreLabel = teacherPreview ? 'Score calculé après le diagnostic' : `${result.score}/10`;
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
          <article class="info-tile"><span class="pill ok">Diagnostic</span><h3>${scoreLabel}</h3><p>Un repère pour savoir où commencer, pas une note.</p></article>
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
