# Firebase Login + Palpites Self-Serve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o bolão Copa 2026 de um fluxo manual (localStorage + import/export JSON + commit) para Firebase Firestore com login por usuário, palpites self-serve, bloqueio automático 1h antes da rodada, empate com pênaltis, e aba de palpites por jogo/participante.

**Architecture:** Todo o estado vai para o Firestore (5 coleções: config, usuarios, rodadas, palpites, pontuacao). O site continua 100% estático no GitHub Pages — o Firebase SDK é carregado via CDN ESM. Autenticação é comparação de senha no JS sem Firebase Auth; sessão fica no sessionStorage.

**Tech Stack:** Vanilla JS (ES modules), Firebase Firestore v10 (CDN), GitHub Pages.

## Global Constraints

- Sem frameworks ou bundlers — apenas HTML/CSS/JS puro com módulos ES nativos
- Firebase SDK via CDN: `https://www.gstatic.com/firebasejs/10.14.1/`
- Sem Firebase Authentication — login é comparação de senha em texto plano no JS
- Regras Firestore: leitura e escrita abertas (`allow read, write: if true`)
- Todos os arquivos JS usam `type="module"` — importações relativas com `./`
- IDs de documentos no Firestore seguem o mesmo padrão das rodadas: `dezesseis_avos`, `oitavas`, `quartas`, `semi`, `final`
- ID de usuário no Firestore = nome do participante (case-sensitive)

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `js/firebase.js` | Criar | Inicializa SDK, exporta `db` + helpers do Firestore |
| `js/auth.js` | Criar | Sessão no sessionStorage, guards `requireAuth` / `requireAdmin` |
| `index.html` | Modificar | Campo senha no login, aba Palpites, link admin no header, botão Sair |
| `js/app.js` | Reescrever | Auth guard, Firestore data layer, todas as abas |
| `admin.html` | Modificar | Remove Dados+Palpites, adiciona Usuários, horario_abertura |
| `js/admin.js` | Reescrever | Firebase guard, CRUD Firestore, gestão de usuários, rodada, resultados |
| `css/style.css` | Modificar | Novos estilos: login c/ senha, palpites tab, pênaltis row, admin badge |
| `data.json` | Remover | Substituído pelo Firestore |
| `js/scoring.js` | Sem mudança | Recebe objeto montado — interface não muda |
| `js/bracket.js` | Sem mudança | Estrutura do chaveamento não muda |

---

## Task 1: Firebase setup — js/firebase.js + js/auth.js + projeto Firebase

**Files:**
- Create: `js/firebase.js`
- Create: `js/auth.js`

**Interfaces:**
- Produces: `db` (Firestore instance), `doc`, `getDoc`, `setDoc`, `getDocs`, `collection`, `deleteDoc` — re-exportados de `firebase.js`
- Produces: `getSession() → {nome, isAdmin}|null`, `saveSession(user)`, `clearSession()`, `requireAuth()`, `requireAdmin()` — exportados de `auth.js`

- [ ] **Step 1: Criar projeto Firebase**

  1. Acesse https://console.firebase.google.com → "Criar projeto" → nome: `bolao-copa-2026`
  2. Desative Google Analytics → "Criar projeto"
  3. No menu lateral: **Build → Firestore Database** → "Create database"
  4. Escolha modo **production** → selecione região `southamerica-east1` → "Ativar"
  5. Em **Regras**, substitua o conteúdo por:
     ```
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /{document=**} {
           allow read, write: if true;
         }
       }
     }
     ```
     Clique "Publicar".
  6. No menu lateral: **Visão geral do projeto** (ícone engrenagem) → "Configurações do projeto" → aba "Geral" → role até "Seus apps" → clique `</>` (Web)
  7. Registre o app com nome `bolao-copa-2026-web`, **sem** Firebase Hosting → "Registrar app"
  8. Copie o objeto `firebaseConfig` exibido — você vai usá-lo no próximo step

- [ ] **Step 2: Criar js/firebase.js**

  ```javascript
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
  import {
    getFirestore, doc, getDoc, setDoc,
    getDocs, collection, deleteDoc
  } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

  const firebaseConfig = {
    apiKey:            "SUBSTITUA_PELA_SUA_API_KEY",
    authDomain:        "SUBSTITUA.firebaseapp.com",
    projectId:         "SUBSTITUA_PELO_SEU_PROJECT_ID",
    storageBucket:     "SUBSTITUA.firebasestorage.app",
    messagingSenderId: "SUBSTITUA_PELO_SENDER_ID",
    appId:             "SUBSTITUA_PELO_APP_ID"
  };

  initializeApp(firebaseConfig);
  export const db = getFirestore();
  export { doc, getDoc, setDoc, getDocs, collection, deleteDoc };
  ```

  Substitua cada `"SUBSTITUA..."` com os valores do `firebaseConfig` copiado no Step 1.

- [ ] **Step 3: Criar js/auth.js**

  ```javascript
  const SESSION_KEY = 'bolao_session';

  export function getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  export function saveSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  export function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  export function requireAuth() {
    if (!getSession()) {
      window.location.href = 'index.html';
      throw new Error('not authenticated');
    }
  }

  export function requireAdmin() {
    const s = getSession();
    if (!s || !s.isAdmin) {
      window.location.href = 'index.html';
      throw new Error('not admin');
    }
  }
  ```

- [ ] **Step 4: Seed inicial do Firestore**

  No console do Firebase → **Firestore Database** → "Iniciar coleção":

  **Coleção `config`, doc `app`:**
  ```json
  { "rodada_atual": "dezesseis_avos" }
  ```

  **Coleção `rodadas`** — criar 5 docs (`dezesseis_avos`, `oitavas`, `quartas`, `semi`, `final`), cada um com:
  ```json
  { "status": "nao_iniciada", "jogos": [], "horario_abertura": null }
  ```

  **Coleção `usuarios`, doc `Admin`** (ou o nome que você quiser usar para o admin):
  ```json
  { "nome": "Admin", "senha": "SUA_SENHA_ADMIN", "isAdmin": true }
  ```

- [ ] **Step 5: Verificar no browser**

  Abra o console do browser em `index.html` e execute:
  ```javascript
  import { db, doc, getDoc } from './js/firebase.js';
  const snap = await getDoc(doc(db, 'config', 'app'));
  console.log(snap.data()); // deve imprimir { rodada_atual: "dezesseis_avos" }
  ```
  Se não houver erros de CORS ou de config, o Firebase está funcionando.

- [ ] **Step 6: Commit**

  ```bash
  git add js/firebase.js js/auth.js
  git commit -m "feat: add Firebase SDK module and auth session helpers"
  ```

---

## Task 2: CSS + index.html — estrutura atualizada

**Files:**
- Modify: `css/style.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: nenhum módulo JS ainda — apenas estrutura HTML e estilos
- Produces: HTML com IDs/classes que `app.js` (Task 3-5) vai usar

- [ ] **Step 1: Adicionar estilos ao css/style.css**

  Append ao final do arquivo:

  ```css
  /* ── Landing com senha ── */
  .landing-input + .landing-input { margin-top: 0.75rem; }

  /* ── Header extras ── */
  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  /* ── Palpitar: horário da rodada ── */
  .rodada-horario {
    font-size: 0.85rem;
    color: #8fa8c0;
    margin-bottom: 1rem;
    padding: 0.5rem 0.8rem;
    background: #1a3a5c;
    border-left: 3px solid #f5a623;
    border-radius: 0 4px 4px 0;
  }

  /* ── Palpitar: label dinâmico pênaltis ── */
  .passou-label { min-width: 170px; }
  .passou-label.penaltis { color: #f5a623; font-weight: 600; }

  /* ── Aba Palpites ── */
  .palpites-tab-controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .palpites-mode-btn { opacity: 0.6; }
  .palpites-mode-btn.active { opacity: 1; }

  .palpites-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }

  .palpites-table th {
    padding: 0.6rem 0.8rem;
    text-align: left;
    background: #1a3a5c;
    color: #f5a623;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .palpites-table td {
    padding: 0.55rem 0.8rem;
    border-bottom: 1px solid #1e3a5a;
  }

  .palpites-table tr:hover td { background: #1a3a5c44; }

  .palpites-table .acertou { color: #7dffaa; font-weight: 700; }
  .palpites-table .errou   { color: #ff8a8a; }

  /* ── Admin: badge isAdmin ── */
  .admin-badge {
    font-size: 0.65rem;
    background: #f5a623;
    color: #0a1628;
    padding: 0.1rem 0.4rem;
    border-radius: 8px;
    font-weight: 700;
    text-transform: uppercase;
    margin-left: 0.3rem;
  }

  /* ── Admin: campo senha no form de usuários ── */
  .usuarios-form {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  .usuarios-form .form-col { display: flex; flex-direction: column; gap: 0.3rem; }
  .usuarios-form label { font-size: 0.8rem; color: #8fa8c0; }
  ```

- [ ] **Step 2: Reescrever index.html**

  ```html
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bolão Copa 2026</title>
    <link rel="stylesheet" href="css/style.css">
  </head>
  <body>

    <!-- Tela de login -->
    <div id="landing" class="landing-overlay">
      <div class="landing-card">
        <div class="landing-icon">⚽</div>
        <h2>Bolão Copa 2026</h2>
        <p class="landing-subtitle">Entre com seu nome e senha</p>
        <input id="landing-nome" class="landing-input" type="text"
               placeholder="Seu nome" autocomplete="off">
        <input id="landing-senha" class="landing-input" type="password"
               placeholder="Senha" autocomplete="off">
        <button id="landing-btn" class="btn btn-primary landing-btn-enter">Entrar</button>
        <p id="landing-msg" class="landing-msg"></p>
      </div>
    </div>

    <!-- Conteúdo principal -->
    <div id="main-content" style="display:none">
      <header class="site-header">
        <h1>⚽ Bolão Copa 2026</h1>
        <div class="header-actions">
          <span id="header-nome" class="header-nome"></span>
          <a id="admin-link" href="admin.html" class="header-link" style="display:none">Admin</a>
          <button id="btn-logout" class="btn btn-secondary"
                  style="font-size:0.8rem;padding:0.3rem 0.7rem">Sair</button>
        </div>
      </header>

      <nav class="tabs">
        <button class="tab-btn active" data-tab="chaveamento">Chaveamento</button>
        <button class="tab-btn" data-tab="palpitar">Palpitar</button>
        <button class="tab-btn" data-tab="palpites">Palpites</button>
        <button class="tab-btn" data-tab="classificacao">Classificação</button>
      </nav>

      <!-- Chaveamento -->
      <section id="tab-chaveamento" class="tab-panel active">
        <div id="bracket-container" class="bracket-container">
          <p style="color:#8fa8c0">Carregando chaveamento...</p>
        </div>
      </section>

      <!-- Palpitar -->
      <section id="tab-palpitar" class="tab-panel">
        <div id="palpitar-form"></div>
        <div id="palpitar-acoes" style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap"></div>
      </section>

      <!-- Palpites -->
      <section id="tab-palpites" class="tab-panel">
        <div class="palpites-tab-controls">
          <button class="btn btn-secondary palpites-mode-btn active" data-mode="jogo">Por jogo</button>
          <button class="btn btn-secondary palpites-mode-btn" data-mode="participante">Por participante</button>
        </div>
        <div id="palpites-select-container" style="margin-bottom:1rem"></div>
        <div id="palpites-content"></div>
      </section>

      <!-- Classificação -->
      <section id="tab-classificacao" class="tab-panel">
        <table class="classificacao-table">
          <thead>
            <tr>
              <th>#</th><th>Participante</th>
              <th>16 Avos</th><th>Oitavas</th><th>Quartas</th><th>Semi</th><th>Final</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="classificacao-body">
            <tr><td colspan="8" style="color:#8fa8c0;text-align:center">Carregando...</td></tr>
          </tbody>
        </table>
      </section>
    </div>

    <script type="module" src="js/app.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 3: Verificar no browser**

  Abra `index.html`. Deve aparecer: campo Nome, campo Senha, botão Entrar. Sem erros no console JS. As abas ainda não funcionam (app.js será reescrito nos próximos tasks).

- [ ] **Step 4: Commit**

  ```bash
  git add index.html css/style.css
  git commit -m "feat: update index.html with password login, palpites tab, admin link"
  ```

---

## Task 3: app.js — auth, data loading, chaveamento, classificação

**Files:**
- Modify: `js/app.js` (rewrite completo)

**Interfaces:**
- Consumes: `db`, `doc`, `getDoc`, `setDoc`, `getDocs`, `collection` de `./firebase.js`
- Consumes: `getSession`, `saveSession`, `clearSession` de `./auth.js`
- Consumes: `BRACKET_ESTRUTURA`, `RODADAS`, `RODADA_LABELS` de `./bracket.js`
- Produces: função `init()` (entry point), funções internas usadas por Tasks 4 e 5

- [ ] **Step 1: Reescrever js/app.js — parte 1 (imports, auth, data loading)**

  Substituir todo o conteúdo de `js/app.js` por:

  ```javascript
  import { BRACKET_ESTRUTURA, RODADAS, RODADA_LABELS } from './bracket.js';
  import { db, doc, getDoc, setDoc, getDocs, collection } from './firebase.js';
  import { getSession, saveSession, clearSession } from './auth.js';

  // ── Auth ──────────────────────────────────────────────────────────
  async function handleLogin() {
    const nome  = document.getElementById('landing-nome').value.trim();
    const senha = document.getElementById('landing-senha').value;
    const msg   = document.getElementById('landing-msg');
    msg.textContent = '';

    if (!nome || !senha) { msg.textContent = 'Preencha nome e senha.'; return; }

    try {
      const snap = await getDoc(doc(db, 'usuarios', nome));
      if (!snap.exists() || snap.data().senha !== senha) {
        msg.textContent = 'Nome ou senha incorretos.';
        return;
      }
      const user = { nome, isAdmin: snap.data().isAdmin || false };
      saveSession(user);
      mostrarApp(user);
    } catch (e) {
      msg.textContent = 'Erro ao conectar. Tente novamente.';
    }
  }

  function handleLogout() {
    clearSession();
    window.location.reload();
  }

  function mostrarApp(user) {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('main-content').style.display = '';
    document.getElementById('header-nome').textContent = user.nome;
    if (user.isAdmin) document.getElementById('admin-link').style.display = '';
    initTabs();
    carregarEInicializar(user);
  }

  // ── Tabs ──────────────────────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  // ── Data loading ──────────────────────────────────────────────────
  async function carregarDados() {
    const snaps = await Promise.all([
      getDoc(doc(db, 'config', 'app')),
      ...RODADAS.map(r => getDoc(doc(db, 'rodadas', r)))
    ]);
    const config   = snaps[0].exists() ? snaps[0].data() : { rodada_atual: 'dezesseis_avos' };
    const rodadas  = {};
    RODADAS.forEach((r, i) => {
      rodadas[r] = snaps[i + 1].exists()
        ? snaps[i + 1].data()
        : { status: 'nao_iniciada', jogos: [] };
    });
    return { config, rodadas };
  }

  async function carregarPalpitesUsuario(nome) {
    const snap = await getDoc(doc(db, 'palpites', nome));
    return snap.exists() ? snap.data() : {};
  }

  async function carregarTodosPalpites() {
    const snap = await getDocs(collection(db, 'palpites'));
    const result = {};
    snap.forEach(d => { result[d.id] = d.data(); });
    return result;
  }

  async function carregarTodosParticipantes() {
    const snap = await getDocs(collection(db, 'usuarios'));
    return snap.docs.map(d => d.id).sort();
  }

  async function carregarPontuacao() {
    const snap = await getDocs(collection(db, 'pontuacao'));
    const result = {};
    snap.forEach(d => { result[d.id] = d.data(); });
    return result;
  }
  ```

- [ ] **Step 2: Adicionar renderBracket e renderClassificacao ao app.js**

  Append (não substituir — continue a partir do Step 1):

  ```javascript
  // ── Chaveamento ───────────────────────────────────────────────────
  function renderTeamRow(team, placar, isVencedor) {
    const isEmpty = !team;
    const scoreHtml = isVencedor !== null && placar !== null && placar !== undefined
      ? `<span class="bracket-score">${placar}</span>` : '';
    return `<div class="bracket-team ${isVencedor ? 'vencedor' : ''} ${isEmpty ? 'placeholder' : ''}">
      <span>${team || 'A definir'}</span>${scoreHtml}
    </div>`;
  }

  function renderBracket(data) {
    const container = document.getElementById('bracket-container');
    container.innerHTML = '';
    for (const rodada of RODADAS) {
      const estrutura  = BRACKET_ESTRUTURA[rodada];
      const jogosData  = data.rodadas[rodada]?.jogos ?? [];
      const jogoMap    = Object.fromEntries(jogosData.map(j => [j.id, j]));
      const col        = document.createElement('div');
      col.className    = 'bracket-round';
      col.innerHTML    = `<div class="bracket-round-title">${RODADA_LABELS[rodada]}</div>`;
      for (const slot of estrutura) {
        const jogo      = jogoMap[slot.id] || null;
        const mandante  = jogo?.mandante  || (rodada === 'dezesseis_avos' ? slot.label_mandante  : null);
        const visitante = jogo?.visitante || (rodada === 'dezesseis_avos' ? slot.label_visitante : null);
        const resultado = jogo?.resultado ?? null;
        const temRes    = resultado !== null;
        const wrapper   = document.createElement('div');
        wrapper.className = 'bracket-match-wrapper';
        wrapper.innerHTML = `
          <div class="bracket-match" style="flex:1">
            ${renderTeamRow(mandante,  jogo?.placar_mandante,  temRes ? resultado === mandante  : null)}
            ${renderTeamRow(visitante, jogo?.placar_visitante, temRes ? resultado === visitante : null)}
          </div>`;
        col.appendChild(wrapper);
      }
      container.appendChild(col);
    }
  }

  // ── Classificação ──────────────────────────────────────────────────
  function renderClassificacao(pontuacao, participantes) {
    const tbody = document.getElementById('classificacao-body');
    if (!participantes.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="color:#8fa8c0;text-align:center">Nenhum participante ainda.</td></tr>`;
      return;
    }
    const sorted = [...participantes].sort((a, b) => (pontuacao[b]?.total ?? 0) - (pontuacao[a]?.total ?? 0));
    tbody.innerHTML = sorted.map((nome, idx) => {
      const p   = pontuacao[nome] || { dezesseis_avos: 0, oitavas: 0, quartas: 0, semi: 0, final: 0, total: 0 };
      const pos = idx + 1;
      const badgeHtml = pos <= 3
        ? `<span class="pos-badge pos-${pos}">${pos}</span>`
        : `<span style="color:#8fa8c0">${pos}</span>`;
      return `<tr>
        <td>${badgeHtml}</td><td>${nome}</td>
        <td>${p.dezesseis_avos}</td><td>${p.oitavas}</td><td>${p.quartas}</td>
        <td>${p.semi}</td><td>${p.final}</td>
        <td class="total-cell">${p.total}</td>
      </tr>`;
    }).join('');
  }
  ```

- [ ] **Step 3: Adicionar carregarEInicializar ao app.js**

  Append:

  ```javascript
  // ── Init principal ────────────────────────────────────────────────
  async function carregarEInicializar(user) {
    try {
      const [dados, participantes, pontuacao] = await Promise.all([
        carregarDados(),
        carregarTodosParticipantes(),
        carregarPontuacao()
      ]);
      renderBracket(dados);
      renderClassificacao(pontuacao, participantes);
      // initPalpitar e initPalpitesTab são adicionadas nos Tasks 4 e 5;
      // o try/catch silencia o ReferenceError durante a execução parcial do plano.
      try { await initPalpitar(user, dados); } catch {}
      try { initPalpitesTab(user, dados, participantes); } catch {}
    } catch (e) {
      document.getElementById('bracket-container').innerHTML =
        `<p style="color:#ff6b6b">Erro ao carregar dados: ${e.message}</p>`;
    }
  }

  // ── Entry point ───────────────────────────────────────────────────
  async function init() {
    document.getElementById('landing-btn').addEventListener('click', handleLogin);
    document.getElementById('landing-senha').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLogin();
    });
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    const session = getSession();
    if (session) mostrarApp(session);
  }

  init();
  ```

  Nota: `initPalpitar` e `initPalpitesTab` são definidas nos Tasks 4 e 5 — o arquivo será completo ao final de Task 5.

- [ ] **Step 4: Testar no browser**

  1. Abra `index.html`. Deve aparecer o form de login.
  2. Tente logar com nome e senha do admin cadastrado no Firestore (Task 1, Step 4).
  3. Deve mostrar o conteúdo principal com o nome no header, link "Admin" visível, e as abas.
  4. Aba "Chaveamento" deve carregar (vazia por enquanto, sem times cadastrados).
  5. Aba "Classificação" deve carregar (vazia por enquanto).
  6. Abrir nova aba anônima, logar com outro usuário inexistente → deve aparecer "Nome ou senha incorretos".

- [ ] **Step 5: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: app.js — Firebase data loading, auth flow, bracket and classificacao"
  ```

---

## Task 4: app.js — aba Palpitar (empate, bloqueio 1h, Firestore save)

**Files:**
- Modify: `js/app.js` (append)

**Interfaces:**
- Consumes: `carregarPalpitesUsuario(nome)`, `carregarDados()` — definidos em Task 3
- Produces: `initPalpitar(user, dados)` — chamado em `carregarEInicializar`

- [ ] **Step 1: Adicionar lógica da aba Palpitar ao app.js**

  Append ao `js/app.js` (antes da linha `init();`):

  ```javascript
  // ── Palpitar ──────────────────────────────────────────────────────
  function isPalpitesBloqueado(rodadaData) {
    if (!rodadaData.horario_abertura) return false;
    const cutoff = new Date(rodadaData.horario_abertura).getTime() - 60 * 60 * 1000;
    return Date.now() >= cutoff;
  }

  function renderPalpiteCards(jogos, palpitesRodada, bloqueado) {
    const list = document.getElementById('palpite-list-inner');
    if (!list) return;

    list.innerHTML = jogos.map(jogo => {
      const p = palpitesRodada[jogo.id] || {};
      const mVal = p.placar_mandante ?? '';
      const vVal = p.placar_visitante ?? '';
      const isEmpate = mVal !== '' && vVal !== '' && Number(mVal) === Number(vVal);
      const disabled = bloqueado ? 'disabled' : '';

      return `
        <div class="palpite-card" data-jogo-id="${jogo.id}">
          <h3>${jogo.id}: ${jogo.mandante} x ${jogo.visitante}</h3>
          <div class="placar-row">
            <span class="team-name">${jogo.mandante}</span>
            <input class="placar-input" type="number" min="0" max="20"
              data-campo="placar_mandante" value="${mVal}" placeholder="0" ${disabled}>
            <span style="color:#8fa8c0">x</span>
            <input class="placar-input" type="number" min="0" max="20"
              data-campo="placar_visitante" value="${vVal}" placeholder="0" ${disabled}>
            <span class="team-name right">${jogo.visitante}</span>
          </div>
          <div class="passou-row">
            <label class="passou-label${isEmpate ? ' penaltis' : ''}">${isEmpate ? 'Quem passa nos pênaltis?' : 'Quem avança:'}</label>
            <select class="passou-select" data-campo="passou" ${disabled}>
              <option value="">-- selecione --</option>
              <option value="${jogo.mandante}" ${p.passou === jogo.mandante ? 'selected' : ''}>${jogo.mandante}</option>
              <option value="${jogo.visitante}" ${p.passou === jogo.visitante ? 'selected' : ''}>${jogo.visitante}</option>
            </select>
          </div>
        </div>`;
    }).join('');

    if (!bloqueado) {
      list.querySelectorAll('.palpite-card').forEach(card => {
        const mInput = card.querySelector('[data-campo="placar_mandante"]');
        const vInput = card.querySelector('[data-campo="placar_visitante"]');
        const label  = card.querySelector('.passou-label');
        const updateLabel = () => {
          const m = mInput.value, v = vInput.value;
          const empate = m !== '' && v !== '' && Number(m) === Number(v);
          label.textContent = empate ? 'Quem passa nos pênaltis?' : 'Quem avança:';
          label.classList.toggle('penaltis', empate);
        };
        mInput.addEventListener('input', updateLabel);
        vInput.addEventListener('input', updateLabel);
      });
    }
  }

  async function salvarPalpites(nome, rodadaAtual) {
    const novosRodada = {};
    document.querySelectorAll('.palpite-card').forEach(card => {
      const jogoId          = card.dataset.jogoId;
      const placar_mandante = Number(card.querySelector('[data-campo="placar_mandante"]').value);
      const placar_visitante= Number(card.querySelector('[data-campo="placar_visitante"]').value);
      const passou          = card.querySelector('[data-campo="passou"]').value;
      novosRodada[jogoId]   = { placar_mandante, placar_visitante, passou };
    });

    const ref     = doc(db, 'palpites', nome);
    const current = await getDoc(ref);
    const existing = current.exists() ? current.data() : {};
    existing[rodadaAtual] = novosRodada;
    await setDoc(ref, existing);
  }

  async function initPalpitar(user, dados) {
    const form   = document.getElementById('palpitar-form');
    const acoes  = document.getElementById('palpitar-acoes');
    const rodadaAtual = dados.config.rodada_atual;
    const rodadaData  = dados.rodadas[rodadaAtual];

    if (!rodadaData || rodadaData.status === 'nao_iniciada') {
      form.innerHTML = `<div class="rodada-fechada-aviso">Nenhuma rodada aberta. Aguarde o admin.</div>`;
      acoes.innerHTML = '';
      return;
    }

    if (rodadaData.status === 'fechada' || rodadaData.status === 'concluida') {
      form.innerHTML = `<div class="rodada-fechada-aviso">Rodada encerrada. Não é mais possível alterar palpites.</div>`;
      acoes.innerHTML = '';
      return;
    }

    const bloqueado = isPalpitesBloqueado(rodadaData);

    let headerHtml = '';
    if (rodadaData.horario_abertura) {
      const dt = new Date(rodadaData.horario_abertura);
      headerHtml = `<p class="rodada-horario">Início da rodada: <strong>${dt.toLocaleString('pt-BR')}</strong>${bloqueado ? ' — <span style="color:#ff8a8a">palpites encerrados</span>' : ' — palpites fecham 1h antes'}</p>`;
    }

    if (bloqueado) {
      form.innerHTML = headerHtml + `<div class="rodada-fechada-aviso">Palpites encerrados — jogos começam em breve.</div>`;
      acoes.innerHTML = '';
      return;
    }

    const jogos = rodadaData.jogos || [];
    if (!jogos.length) {
      form.innerHTML = headerHtml + `<p style="color:#8fa8c0">Aguardando admin preencher os times.</p>`;
      acoes.innerHTML = '';
      return;
    }

    const palpitesUsuario = await carregarPalpitesUsuario(user.nome);
    const palpitesRodada  = palpitesUsuario[rodadaAtual] || {};

    form.innerHTML = headerHtml + `<div class="palpite-list"><div id="palpite-list-inner"></div></div>`;
    acoes.innerHTML = `<button class="btn btn-primary" id="btn-salvar-palpites">Salvar palpites</button>`;

    renderPalpiteCards(jogos, palpitesRodada, false);

    document.getElementById('btn-salvar-palpites').addEventListener('click', async () => {
      const btn = document.getElementById('btn-salvar-palpites');
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        await salvarPalpites(user.nome, rodadaAtual);
        btn.textContent = 'Salvo!';
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Salvar palpites'; }, 2000);
      } catch (e) {
        alert('Erro ao salvar: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Salvar palpites';
      }
    });
  }
  ```

- [ ] **Step 2: Testar empate no browser**

  1. Logue como usuário, vá à aba "Palpitar" (rodada precisa estar aberta e com jogos — pode criar via console Firebase ou aguardar Task 8)
  2. Digite 1 para mandante e 1 para visitante → label "Quem avança:" deve mudar para "Quem passa nos pênaltis?" em amarelo
  3. Digite 2 para mandante → label volta para "Quem avança:"
  4. Clique "Salvar palpites" → deve aparecer "Salvo!" sem erros
  5. Verifique no Firestore console que o doc `/palpites/{nome}` foi criado corretamente

- [ ] **Step 3: Testar bloqueio por horário**

  No Firestore console, altere `horario_abertura` da rodada `dezesseis_avos` para um valor 30 minutos no futuro (ex: `2026-01-01T12:00:00-03:00` onde agora é 11:35). Recarregue → palpites devem aparecer normais. Mude para 30 minutos no passado → palpites devem aparecer bloqueados.

  Após o teste, restaure o valor original.

- [ ] **Step 4: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: app.js — palpitar tab with draw detection, time lock, and Firestore save"
  ```

---

## Task 5: app.js — aba Palpites (por jogo / por participante)

**Files:**
- Modify: `js/app.js` (append)

**Interfaces:**
- Consumes: `carregarTodosPalpites()`, `carregarTodosParticipantes()` — definidos em Task 3
- Produces: `initPalpitesTab(user, dados, participantes)` — chamado em `carregarEInicializar`

- [ ] **Step 1: Adicionar aba Palpites ao app.js**

  Append ao `js/app.js` (antes da linha `init();`):

  ```javascript
  // ── Aba Palpites ──────────────────────────────────────────────────
  function renderPorJogo(jogo, todosOsPalpites, participantes, rodadaAtual, rodadaAberta, session, container) {
    const rows = participantes.map(nome => {
      const palpite = todosOsPalpites[nome]?.[rodadaAtual]?.[jogo.id];
      const visivel = !rodadaAberta || session.isAdmin || nome === session.nome;

      if (!palpite || !visivel) {
        return `<tr><td>${nome}</td><td style="color:#4a6a8a">—</td><td style="color:#4a6a8a">—</td></tr>`;
      }
      const placar = `${palpite.placar_mandante ?? '?'} x ${palpite.placar_visitante ?? '?'}`;
      const passou = palpite.passou || '—';
      const acertouPassou = jogo.resultado && palpite.passou === jogo.resultado;
      const acertouPlacar = jogo.resultado &&
        Number(palpite.placar_mandante) === Number(jogo.placar_mandante) &&
        Number(palpite.placar_visitante) === Number(jogo.placar_visitante);
      const classPts = acertouPassou ? (acertouPlacar ? 'acertou' : '') : 'errou';
      return `<tr>
        <td>${nome}</td>
        <td class="${classPts}">${placar}</td>
        <td class="${acertouPassou ? 'acertou' : jogo.resultado ? 'errou' : ''}">${passou}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="palpites-table">
        <thead><tr><th>Participante</th><th>Placar palpitado</th><th>Quem avança</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderPorParticipante(nomeAlvo, jogos, todosOsPalpites, rodadaAtual, rodadaAberta, session, container) {
    const podeMostrar = !rodadaAberta || session.isAdmin || nomeAlvo === session.nome;
    if (!podeMostrar) {
      container.innerHTML = `<div class="rodada-fechada-aviso">Palpites de outros participantes ficam visíveis após a rodada fechar.</div>`;
      return;
    }
    const rows = jogos.map(jogo => {
      const palpite = todosOsPalpites[nomeAlvo]?.[rodadaAtual]?.[jogo.id];
      if (!palpite) return `<tr><td>${jogo.mandante} x ${jogo.visitante}</td><td style="color:#4a6a8a">—</td><td style="color:#4a6a8a">—</td></tr>`;
      const placar = `${palpite.placar_mandante ?? '?'} x ${palpite.placar_visitante ?? '?'}`;
      const acertouPassou = jogo.resultado && palpite.passou === jogo.resultado;
      const acertouPlacar = jogo.resultado &&
        Number(palpite.placar_mandante) === Number(jogo.placar_mandante) &&
        Number(palpite.placar_visitante) === Number(jogo.placar_visitante);
      const classPts = acertouPassou ? (acertouPlacar ? 'acertou' : '') : (jogo.resultado ? 'errou' : '');
      return `<tr>
        <td>${jogo.mandante} x ${jogo.visitante}</td>
        <td class="${classPts}">${placar}</td>
        <td class="${acertouPassou ? 'acertou' : jogo.resultado ? 'errou' : ''}">${palpite.passou || '—'}</td>
      </tr>`;
    }).join('');
    container.innerHTML = `
      <table class="palpites-table">
        <thead><tr><th>Jogo</th><th>Placar palpitado</th><th>Quem avança</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  async function initPalpitesTab(user, dados, participantes) {
    const rodadaAtual  = dados.config.rodada_atual;
    const rodadaData   = dados.rodadas[rodadaAtual];
    const jogos        = rodadaData?.jogos || [];
    const rodadaAberta = rodadaData?.status === 'aberta';

    // Carregamento lazy: carrega na primeira vez que a aba é aberta
    let todosOsPalpites = null;
    document.querySelector('[data-tab="palpites"]').addEventListener('click', async () => {
      if (todosOsPalpites) return;
      todosOsPalpites = await carregarTodosPalpites();
      renderPalpitesContent(modoAtual);
    });

    let modoAtual = 'jogo';
    const controls = document.querySelector('.palpites-tab-controls');

    function renderPalpitesContent(modo) {
      if (!todosOsPalpites) {
        document.getElementById('palpites-content').innerHTML = `<p style="color:#8fa8c0">Carregando palpites...</p>`;
        return;
      }
      const selectContainer = document.getElementById('palpites-select-container');
      const content = document.getElementById('palpites-content');

      if (modo === 'jogo') {
        selectContainer.innerHTML = jogos.length
          ? `<label style="font-size:0.85rem;color:#8fa8c0;margin-right:0.5rem">Jogo:</label>
             <select class="select-field" id="select-jogo-palpites">
               <option value="">-- selecione --</option>
               ${jogos.map(j => `<option value="${j.id}">${j.id}: ${j.mandante} x ${j.visitante}</option>`).join('')}
             </select>`
          : `<p style="color:#8fa8c0">Nenhum jogo na rodada atual.</p>`;
        content.innerHTML = '';
        if (jogos.length) {
          document.getElementById('select-jogo-palpites').addEventListener('change', e => {
            if (!e.target.value) { content.innerHTML = ''; return; }
            const jogo = jogos.find(j => j.id === e.target.value);
            renderPorJogo(jogo, todosOsPalpites, participantes, rodadaAtual, rodadaAberta, user, content);
          });
        }
      } else {
        selectContainer.innerHTML = participantes.length
          ? `<label style="font-size:0.85rem;color:#8fa8c0;margin-right:0.5rem">Participante:</label>
             <select class="select-field" id="select-participante-palpites">
               <option value="">-- selecione --</option>
               ${participantes.map(n => `<option value="${n}">${n}</option>`).join('')}
             </select>`
          : `<p style="color:#8fa8c0">Nenhum participante cadastrado.</p>`;
        content.innerHTML = '';
        if (participantes.length) {
          document.getElementById('select-participante-palpites').addEventListener('change', e => {
            if (!e.target.value) { content.innerHTML = ''; return; }
            renderPorParticipante(e.target.value, jogos, todosOsPalpites, rodadaAtual, rodadaAberta, user, content);
          });
        }
      }
    }

    controls.querySelectorAll('.palpites-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        controls.querySelectorAll('.palpites-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        modoAtual = btn.dataset.mode;
        renderPalpitesContent(modoAtual);
      });
    });
  }
  ```

- [ ] **Step 2: Testar aba Palpites no browser**

  Com palpites já salvos no Firestore (de Task 4):
  1. Abra aba "Palpites" → deve carregar (spinner breve)
  2. Modo "Por jogo": selecione um jogo → veja tabela com participantes e palpites
  3. Com rodada `aberta`: você (usuário logado) deve ver seus palpites; outros aparecem "—"
  4. Mude status da rodada para `fechada` no Firestore console → recarregue → todos os palpites devem aparecer
  5. Modo "Por participante": selecione um nome → veja lista de jogos com palpites desse participante

- [ ] **Step 3: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat: app.js — palpites tab with per-game and per-participant views"
  ```

---

## Task 6: admin.html — nova estrutura

**Files:**
- Modify: `admin.html`

**Interfaces:**
- Produces: IDs usados por `admin.js` (Task 7-9): `sec-usuarios`, `sec-rodada`, `sec-resultados` e todos os inputs dentro de cada seção

- [ ] **Step 1: Reescrever admin.html**

  ```html
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin — Bolão Copa 2026</title>
    <link rel="stylesheet" href="css/style.css">
  </head>
  <body class="admin-body">
    <header class="site-header">
      <h1>⚽ Bolão Copa 2026 — Admin</h1>
      <div class="header-actions">
        <a href="index.html" class="header-link">← Site público</a>
        <button id="btn-admin-logout" class="btn btn-secondary"
                style="font-size:0.8rem;padding:0.3rem 0.7rem">Sair</button>
      </div>
    </header>

    <nav class="admin-nav">
      <button class="btn btn-secondary active-nav" data-sec="usuarios">Usuários</button>
      <button class="btn btn-secondary" data-sec="rodada">Rodada</button>
      <button class="btn btn-secondary" data-sec="resultados">Resultados</button>
    </nav>

    <!-- Usuários -->
    <section id="sec-usuarios" class="admin-section active">
      <h2>Participantes</h2>
      <div id="participant-list" class="participant-list"></div>
      <div class="usuarios-form">
        <div class="form-col">
          <label for="input-new-participant">Nome</label>
          <input type="text" id="input-new-participant" class="input-text" placeholder="Nome do participante">
        </div>
        <div class="form-col">
          <label for="input-new-senha">Senha</label>
          <input type="text" id="input-new-senha" class="input-text" placeholder="Senha inicial">
        </div>
        <button class="btn btn-success" id="btn-add-participant" style="align-self:flex-end">Adicionar</button>
      </div>
    </section>

    <!-- Rodada -->
    <section id="sec-rodada" class="admin-section">
      <h2>Gerenciar Rodada</h2>
      <div id="rodada-status-painel"></div>
      <div class="form-group" style="margin-top:1rem">
        <div>
          <label for="input-horario-abertura" style="font-size:0.85rem;color:#8fa8c0;display:block;margin-bottom:0.3rem">
            Horário de início da rodada (palpites fecham 1h antes):
          </label>
          <input type="datetime-local" id="input-horario-abertura" class="input-text">
        </div>
        <button class="btn btn-secondary" id="btn-salvar-horario" style="align-self:flex-end">Salvar horário</button>
      </div>
      <div style="margin-top:1.5rem">
        <h3 style="margin-bottom:1rem;font-size:1rem;color:#e8eaf0">Times da rodada atual</h3>
        <div id="rodada-times-form"></div>
        <div id="rodada-acoes" style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap">
          <button id="btn-salvar-times"  class="btn btn-secondary">Salvar times</button>
          <button id="btn-abrir-rodada"  class="btn btn-success">Abrir rodada</button>
          <button id="btn-fechar-rodada" class="btn btn-danger">Fechar rodada</button>
          <button id="btn-abrir-proxima" class="btn btn-success">Abrir próxima rodada</button>
        </div>
      </div>
    </section>

    <!-- Resultados -->
    <section id="sec-resultados" class="admin-section">
      <h2>Resultados da Rodada</h2>
      <div id="resultados-form"></div>
      <div style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap">
        <button id="btn-salvar-resultados" class="btn btn-secondary">Salvar resultados</button>
        <button id="btn-calcular-pontos"   class="btn btn-primary">Calcular pontos</button>
      </div>
    </section>

    <script type="module" src="js/admin.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 2: Adicionar estilo .active-nav ao css/style.css**

  Append:
  ```css
  .admin-nav .active-nav { background: #1a4a7c; border: 1px solid #4a8adc; }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add admin.html css/style.css
  git commit -m "feat: admin.html — simplified structure with Usuarios, Rodada, Resultados sections"
  ```

---

## Task 7: admin.js — guard + inicialização + seção Usuários

**Files:**
- Modify: `js/admin.js` (rewrite completo)

**Interfaces:**
- Consumes: `db`, `doc`, `getDoc`, `setDoc`, `getDocs`, `collection`, `deleteDoc` de `./firebase.js`
- Consumes: `requireAdmin`, `clearSession` de `./auth.js`
- Consumes: `BRACKET_ESTRUTURA`, `RODADAS`, `RODADA_LABELS` de `./bracket.js`
- Produces: módulo completo — Tasks 8 e 9 fazem append a este arquivo

- [ ] **Step 1: Reescrever js/admin.js — parte 1 (imports, guard, nav, usuários)**

  Substituir todo o conteúdo de `js/admin.js` por:

  ```javascript
  import { BRACKET_ESTRUTURA, RODADAS, RODADA_LABELS } from './bracket.js';
  import { calcularTodosPontos } from './scoring.js';
  import { db, doc, getDoc, setDoc, getDocs, collection, deleteDoc } from './firebase.js';
  import { requireAdmin, clearSession } from './auth.js';

  requireAdmin();

  // ── Nav ───────────────────────────────────────────────────────────
  function initNav() {
    document.querySelectorAll('.admin-nav [data-sec]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.admin-nav [data-sec]').forEach(b => b.classList.remove('active-nav'));
        document.getElementById('sec-' + btn.dataset.sec).classList.add('active');
        btn.classList.add('active-nav');
        renderSection(btn.dataset.sec);
      });
    });
    document.getElementById('btn-admin-logout').addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  }

  function renderSection(sec) {
    if (sec === 'usuarios')   renderUsuarios();
    if (sec === 'rodada')     renderRodadaAdmin();
    if (sec === 'resultados') renderResultadosAdmin();
  }

  // ── Usuários ──────────────────────────────────────────────────────
  async function renderUsuarios() {
    const snap    = await getDocs(collection(db, 'usuarios'));
    const usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nome.localeCompare(b.nome));
    const list    = document.getElementById('participant-list');

    list.innerHTML = usuarios.length
      ? usuarios.map(u => `
          <div class="participant-chip">
            <span>${u.nome}${u.isAdmin ? '<span class="admin-badge">admin</span>' : ''}</span>
            <button class="chip-remove" data-nome="${u.nome}"
              ${u.isAdmin ? 'disabled title="Não é possível remover o admin"' : ''}>×</button>
          </div>`).join('')
      : '<p style="color:#8fa8c0;font-size:0.9rem">Nenhum participante ainda.</p>';

    list.querySelectorAll('.chip-remove:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nome = btn.dataset.nome;
        if (!confirm(`Remover "${nome}"? Os palpites e pontuação serão apagados.`)) return;
        await Promise.all([
          deleteDoc(doc(db, 'usuarios',  nome)),
          deleteDoc(doc(db, 'palpites',  nome)),
          deleteDoc(doc(db, 'pontuacao', nome))
        ]);
        renderUsuarios();
      });
    });
  }

  function initUsuarios() {
    const adicionar = async () => {
      const nome  = document.getElementById('input-new-participant').value.trim();
      const senha = document.getElementById('input-new-senha').value.trim();
      if (!nome || !senha) { alert('Nome e senha são obrigatórios.'); return; }
      const existing = await getDoc(doc(db, 'usuarios', nome));
      if (existing.exists()) { alert(`"${nome}" já está cadastrado.`); return; }
      await Promise.all([
        setDoc(doc(db, 'usuarios',  nome), { nome, senha, isAdmin: false }),
        setDoc(doc(db, 'palpites',  nome), {}),
        setDoc(doc(db, 'pontuacao', nome), { dezesseis_avos: 0, oitavas: 0, quartas: 0, semi: 0, final: 0, total: 0 })
      ]);
      document.getElementById('input-new-participant').value = '';
      document.getElementById('input-new-senha').value = '';
      renderUsuarios();
    };

    document.getElementById('btn-add-participant').addEventListener('click', adicionar);
    document.getElementById('input-new-senha').addEventListener('keydown', e => {
      if (e.key === 'Enter') adicionar();
    });
  }

  // ── Seed inicial ──────────────────────────────────────────────────
  async function seedSeNecessario() {
    const configSnap = await getDoc(doc(db, 'config', 'app'));
    if (configSnap.exists()) return;
    await setDoc(doc(db, 'config', 'app'), { rodada_atual: 'dezesseis_avos' });
    await Promise.all(RODADAS.map(r =>
      setDoc(doc(db, 'rodadas', r), { status: 'nao_iniciada', jogos: [], horario_abertura: null })
    ));
  }

  // ── Init ──────────────────────────────────────────────────────────
  async function init() {
    await seedSeNecessario();
    initNav();
    initUsuarios();
    renderUsuarios();
  }

  init();
  ```

  Nota: `renderRodadaAdmin` e `renderResultadosAdmin` serão adicionados nos Tasks 8 e 9.

- [ ] **Step 2: Testar no browser**

  1. Abra `admin.html` sem estar logado → deve redirecionar para `index.html`
  2. Logue como admin, depois acesse `admin.html` → deve aparecer o painel
  3. Aba "Usuários" deve listar o admin com badge laranja "admin"
  4. Adicione um participante (nome + senha) → deve aparecer na lista
  5. Remova o participante → deve sumir da lista e ser deletado do Firestore

- [ ] **Step 3: Testar login com novo participante**

  No site público (`index.html`), logue com o nome e senha do participante criado → deve funcionar.

- [ ] **Step 4: Commit**

  ```bash
  git add js/admin.js
  git commit -m "feat: admin.js — Firebase guard, nav, and Usuarios section"
  ```

---

## Task 8: admin.js — seção Rodada (Firestore + horario_abertura)

**Files:**
- Modify: `js/admin.js` (append antes de `init()`)

**Interfaces:**
- Consumes: `db`, `doc`, `getDoc`, `setDoc` de `./firebase.js`; `BRACKET_ESTRUTURA`, `RODADAS`, `RODADA_LABELS` de `./bracket.js`
- Produces: `renderRodadaAdmin()` — chamado por `renderSection`

- [ ] **Step 1: Adicionar renderRodadaAdmin ao admin.js**

  No arquivo `js/admin.js`, inserir o bloco abaixo **antes** da linha `async function init() {`:

  ```javascript
  // ── Rodada ────────────────────────────────────────────────────────
  async function renderRodadaAdmin() {
    const configSnap = await getDoc(doc(db, 'config', 'app'));
    const config     = configSnap.exists() ? configSnap.data() : { rodada_atual: 'dezesseis_avos' };
    const rodadaAtual = config.rodada_atual;
    const rodadaSnap  = await getDoc(doc(db, 'rodadas', rodadaAtual));
    const rodadaData  = rodadaSnap.exists()
      ? rodadaSnap.data()
      : { status: 'nao_iniciada', jogos: [], horario_abertura: null };
    const status      = rodadaData.status;
    const estrutura   = BRACKET_ESTRUTURA[rodadaAtual];

    const instrucoes = {
      nao_iniciada: 'Preencha os times, salve e clique <strong>Abrir rodada</strong>.',
      aberta:       'Rodada aberta — participantes podem palpitar. Clique <strong>Fechar rodada</strong> quando os jogos começarem.',
      fechada:      'Rodada fechada. Vá em <strong>Resultados</strong> para inserir placares e calcular pontos.',
      concluida:    'Pontos calculados. Preencha os times da próxima fase e clique <strong>Abrir próxima rodada</strong>.'
    };

    document.getElementById('rodada-status-painel').innerHTML = `
      <div class="alert alert-info">
        <div>Rodada atual: <strong>${RODADA_LABELS[rodadaAtual]}</strong>
          &nbsp;<span class="status-badge status-${status}">${status.replace('_', ' ')}</span></div>
        <div style="margin-top:0.5rem;font-size:0.85rem">${instrucoes[status] || ''}</div>
      </div>`;

    // Preencher horario_abertura
    if (rodadaData.horario_abertura) {
      const dt = new Date(rodadaData.horario_abertura);
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('input-horario-abertura').value = local;
    } else {
      document.getElementById('input-horario-abertura').value = '';
    }

    document.getElementById('btn-salvar-horario').onclick = async () => {
      const val = document.getElementById('input-horario-abertura').value;
      const iso = val ? new Date(val).toISOString() : null;
      await setDoc(doc(db, 'rodadas', rodadaAtual), { ...rodadaData, horario_abertura: iso });
      alert('Horário salvo.');
    };

    // Times form
    const form = document.getElementById('rodada-times-form');
    if (status === 'fechada') {
      form.innerHTML = `<p style="color:#8fa8c0;font-size:0.9rem">Insira os resultados em <strong style="color:#f5a623">Resultados</strong>.</p>`;
    } else {
      const jogosExistentes = Object.fromEntries((rodadaData.jogos || []).map(j => [j.id, j]));
      form.innerHTML = estrutura.map(slot => {
        const jogo   = jogosExistentes[slot.id] || {};
        const labelM = slot.label_mandante  || `Vencedor de ${slot.origem_mandante}`;
        const labelV = slot.label_visitante || `Vencedor de ${slot.origem_visitante}`;
        return `
          <div class="admin-jogo-card" data-slot-id="${slot.id}">
            <h4>${slot.id} &nbsp;|&nbsp; <em>${labelM}</em> vs <em>${labelV}</em></h4>
            <div class="placar-row">
              <input class="input-text" type="text" data-campo="mandante"
                placeholder="${labelM}" value="${jogo.mandante || ''}" style="min-width:0;flex:1">
              <span style="color:#8fa8c0;padding:0 0.5rem">x</span>
              <input class="input-text" type="text" data-campo="visitante"
                placeholder="${labelV}" value="${jogo.visitante || ''}" style="min-width:0;flex:1">
            </div>
          </div>`;
      }).join('');
    }

    // Botões
    const btnSalvarTimes  = document.getElementById('btn-salvar-times');
    const btnAbrir        = document.getElementById('btn-abrir-rodada');
    const btnFechar       = document.getElementById('btn-fechar-rodada');
    const btnProxima      = document.getElementById('btn-abrir-proxima');

    btnSalvarTimes.style.display = (status === 'nao_iniciada' || status === 'aberta') ? '' : 'none';
    btnAbrir.style.display       = status === 'nao_iniciada' ? '' : 'none';
    btnFechar.style.display      = status === 'aberta'       ? '' : 'none';
    btnProxima.style.display     = (status === 'concluida' || status === 'fechada') ? '' : 'none';

    btnSalvarTimes.onclick = async () => {
      const novosJogos = [];
      const atual = Object.fromEntries((rodadaData.jogos || []).map(j => [j.id, j]));
      document.querySelectorAll('#rodada-times-form .admin-jogo-card').forEach(card => {
        const id        = card.dataset.slotId;
        const mandante  = card.querySelector('[data-campo="mandante"]').value.trim();
        const visitante = card.querySelector('[data-campo="visitante"]').value.trim();
        novosJogos.push({
          id, mandante, visitante,
          placar_mandante:  atual[id]?.placar_mandante  ?? null,
          placar_visitante: atual[id]?.placar_visitante ?? null,
          resultado:        atual[id]?.resultado        ?? null,
          penaltis:         atual[id]?.penaltis         ?? false
        });
      });
      await setDoc(doc(db, 'rodadas', rodadaAtual), { ...rodadaData, jogos: novosJogos });
      alert('Times salvos!');
      renderRodadaAdmin();
    };

    btnAbrir.onclick = async () => {
      if (!confirm(`Abrir "${RODADA_LABELS[rodadaAtual]}" para palpites?`)) return;
      await setDoc(doc(db, 'rodadas', rodadaAtual), { ...rodadaData, status: 'aberta' });
      renderRodadaAdmin();
    };

    btnFechar.onclick = async () => {
      if (!confirm(`Fechar "${RODADA_LABELS[rodadaAtual]}"?`)) return;
      await setDoc(doc(db, 'rodadas', rodadaAtual), { ...rodadaData, status: 'fechada' });
      renderRodadaAdmin();
    };

    btnProxima.onclick = async () => {
      const idx = RODADAS.indexOf(rodadaAtual);
      if (idx === RODADAS.length - 1) { alert('Esta é a última rodada.'); return; }
      if (status !== 'concluida') {
        if (!confirm('Pontos ainda não calculados. Avançar mesmo assim?')) return;
      }
      const proxima = RODADAS[idx + 1];
      const proximaSnap = await getDoc(doc(db, 'rodadas', proxima));
      const proximaData = proximaSnap.exists()
        ? proximaSnap.data()
        : { status: 'nao_iniciada', jogos: [], horario_abertura: null };
      await Promise.all([
        setDoc(doc(db, 'config', 'app'), { rodada_atual: proxima }),
        setDoc(doc(db, 'rodadas', proxima), { ...proximaData, status: 'aberta' })
      ]);
      alert(`"${RODADA_LABELS[proxima]}" aberta. Preencha os times.`);
      renderRodadaAdmin();
    };
  }
  ```

- [ ] **Step 2: Testar seção Rodada no browser**

  1. Vá em "Rodada" no painel admin.
  2. Defina um horário e clique "Salvar horário" → verifique no Firestore console que `horario_abertura` foi salvo.
  3. Preencha os 16 slots de times e clique "Salvar times" → verifique Firestore.
  4. Clique "Abrir rodada" → status deve mudar para `aberta`, botão some, aparece "Fechar rodada".
  5. No site público, palpitar deve agora mostrar os jogos.

- [ ] **Step 3: Commit**

  ```bash
  git add js/admin.js
  git commit -m "feat: admin.js — Rodada section with Firestore, horario_abertura, and status buttons"
  ```

---

## Task 9: admin.js — seção Resultados + cálculo de pontuação

**Files:**
- Modify: `js/admin.js` (append antes de `init()`)

**Interfaces:**
- Consumes: `calcularTodosPontos({ participantes, rodadas, palpites })` de `./scoring.js`
- Produces: `renderResultadosAdmin()` — chamado por `renderSection`

- [ ] **Step 1: Adicionar renderResultadosAdmin ao admin.js**

  Inserir antes de `async function init() {`:

  ```javascript
  // ── Resultados ────────────────────────────────────────────────────
  async function renderResultadosAdmin() {
    const configSnap = await getDoc(doc(db, 'config', 'app'));
    const rodadaAtual = configSnap.exists()
      ? configSnap.data().rodada_atual
      : 'dezesseis_avos';

    const rodadaSnap = await getDoc(doc(db, 'rodadas', rodadaAtual));
    const rodadaData = rodadaSnap.exists()
      ? rodadaSnap.data()
      : { status: 'nao_iniciada', jogos: [] };

    const form = document.getElementById('resultados-form');
    if (rodadaData.status !== 'aberta' && rodadaData.status !== 'fechada') {
      form.innerHTML = `<p style="color:#8fa8c0">Nenhuma rodada aberta ou fechada para inserir resultados.</p>`;
      return;
    }

    const jogos = rodadaData.jogos || [];
    if (!jogos.length) {
      form.innerHTML = `<p style="color:#8fa8c0">Configure os times da rodada em "Rodada" primeiro.</p>`;
      return;
    }

    form.innerHTML =
      `<p style="color:#8fa8c0;margin-bottom:1rem">Rodada: <strong style="color:#f5a623">${RODADA_LABELS[rodadaAtual]}</strong></p>` +
      jogos.map(jogo => {
        const pmVal = jogo.placar_mandante ?? '';
        const pvVal = jogo.placar_visitante ?? '';
        const foiEmpate = pmVal !== '' && pvVal !== '' && Number(pmVal) === Number(pvVal);
        return `
          <div class="admin-jogo-card" data-jogo-id="${jogo.id}">
            <h4>${jogo.id}: ${jogo.mandante} x ${jogo.visitante}</h4>
            <div class="placar-row">
              <span class="team-name">${jogo.mandante}</span>
              <input class="placar-input" type="number" min="0" max="20"
                data-campo="placar_mandante" value="${pmVal}">
              <span style="color:#8fa8c0">x</span>
              <input class="placar-input" type="number" min="0" max="20"
                data-campo="placar_visitante" value="${pvVal}">
              <span class="team-name right">${jogo.visitante}</span>
            </div>
            <div class="passou-row" style="margin-top:0.6rem">
              <label style="font-size:0.85rem;color:#8fa8c0">Quem avançou:</label>
              <select class="passou-select" data-campo="resultado">
                <option value="">-- selecione --</option>
                <option value="${jogo.mandante}" ${jogo.resultado === jogo.mandante ? 'selected' : ''}>${jogo.mandante}</option>
                <option value="${jogo.visitante}" ${jogo.resultado === jogo.visitante ? 'selected' : ''}>${jogo.visitante}</option>
              </select>
            </div>
            <div class="passou-row penaltis-resultado-row" style="margin-top:0.4rem;${foiEmpate ? '' : 'display:none'}">
              <label style="font-size:0.85rem;color:#f5a623">
                <input type="checkbox" data-campo="penaltis" ${jogo.penaltis ? 'checked' : ''}> Decisão nos pênaltis
              </label>
            </div>
          </div>`;
      }).join('');

    // Mostrar/ocultar checkbox pênaltis conforme placar
    form.querySelectorAll('.admin-jogo-card').forEach(card => {
      const mInput = card.querySelector('[data-campo="placar_mandante"]');
      const vInput = card.querySelector('[data-campo="placar_visitante"]');
      const penRow = card.querySelector('.penaltis-resultado-row');
      const togglePen = () => {
        const m = mInput.value, v = vInput.value;
        penRow.style.display = (m !== '' && v !== '' && Number(m) === Number(v)) ? '' : 'none';
      };
      mInput.addEventListener('input', togglePen);
      vInput.addEventListener('input', togglePen);
    });

    document.getElementById('btn-salvar-resultados').onclick = async () => {
      const novosJogos = rodadaData.jogos.map(jogo => {
        const card = form.querySelector(`.admin-jogo-card[data-jogo-id="${jogo.id}"]`);
        if (!card) return jogo;
        return {
          ...jogo,
          placar_mandante:  Number(card.querySelector('[data-campo="placar_mandante"]').value),
          placar_visitante: Number(card.querySelector('[data-campo="placar_visitante"]').value),
          resultado:        card.querySelector('[data-campo="resultado"]').value || null,
          penaltis:         card.querySelector('[data-campo="penaltis"]')?.checked ?? false
        };
      });
      await setDoc(doc(db, 'rodadas', rodadaAtual), { ...rodadaData, jogos: novosJogos });
      alert('Resultados salvos. Clique "Calcular pontos" quando todos os jogos tiverem resultado.');
    };

    document.getElementById('btn-calcular-pontos').onclick = async () => {
      if (!confirm('Calcular pontos para todos? Isso sobrescreve a pontuação atual desta rodada.')) return;

      const [usuariosSnap, palpitesSnap, ...rodadasSnaps] = await Promise.all([
        getDocs(collection(db, 'usuarios')),
        getDocs(collection(db, 'palpites')),
        ...RODADAS.map(r => getDoc(doc(db, 'rodadas', r)))
      ]);

      const participantes = usuariosSnap.docs.map(d => d.id);
      const palpites = {};
      palpitesSnap.forEach(d => { palpites[d.id] = d.data(); });
      const rodadas = {};
      RODADAS.forEach((r, i) => {
        rodadas[r] = rodadasSnaps[i].exists()
          ? rodadasSnaps[i].data()
          : { status: 'nao_iniciada', jogos: [] };
      });

      const novaPontuacao = calcularTodosPontos({ participantes, rodadas, palpites });

      await Promise.all([
        ...participantes.map(nome =>
          setDoc(doc(db, 'pontuacao', nome), novaPontuacao[nome] || { dezesseis_avos: 0, oitavas: 0, quartas: 0, semi: 0, final: 0, total: 0 })
        ),
        setDoc(doc(db, 'rodadas', rodadaAtual), { ...rodadas[rodadaAtual], status: 'concluida' })
      ]);

      alert('Pontos calculados e salvos no Firestore!');
      renderResultadosAdmin();
    };
  }
  ```

- [ ] **Step 2: Testar fluxo completo no browser**

  1. Admin → Rodada: abrir rodada, preencher times
  2. Participante → Palpitar: fazer palpites (incluindo um empate)
  3. Admin → Rodada: fechar rodada
  4. Admin → Resultados: inserir placares (inclua um empate com checkbox pênaltis marcado)
  5. Admin → Calcular pontos → confirmar
  6. Site público → Classificação: verificar pontos atualizados
  7. Site público → Palpites: verificar que os palpites agora aparecem para todos

- [ ] **Step 3: Commit**

  ```bash
  git add js/admin.js
  git commit -m "feat: admin.js — Resultados section with penaltis checkbox and score calculation"
  ```

---

## Task 10: Cleanup — remover data.json e smoke test final

**Files:**
- Delete: `data.json`

- [ ] **Step 1: Remover data.json**

  ```bash
  git rm data.json
  git commit -m "chore: remove data.json — replaced by Firestore"
  ```

- [ ] **Step 2: Smoke test completo**

  Teste o fluxo ponta a ponta:

  1. **Login inválido** → "Nome ou senha incorretos"
  2. **Login válido (usuário comum)** → conteúdo carrega, sem link Admin
  3. **Login válido (admin)** → conteúdo carrega, link Admin visível
  4. **Palpitar** → fazer palpites, incluindo empate (label muda), salvar → verificar no Firestore
  5. **Palpites — Por jogo** → rodada aberta: outros participantes aparecem "—"
  6. **Palpites — Por participante** → rodada aberta: ver seus próprios palpites; outros bloqueados
  7. **Admin — Usuários** → adicionar e remover participante
  8. **Admin — Rodada** → salvar horário, times, abrir, fechar, avançar
  9. **Admin — Resultados** → inserir resultado com empate + pênaltis, calcular pontos
  10. **Classificação** → reflete pontuação calculada
  11. **Palpites** com rodada `concluida` → todos os palpites visíveis, acertos em verde, erros em vermelho
  12. **Logout** → redireciona para tela de login

- [ ] **Step 3: Push para GitHub Pages**

  ```bash
  git push origin master
  ```

  Aguarde ~2 minutos e verifique o site publicado no GitHub Pages.
