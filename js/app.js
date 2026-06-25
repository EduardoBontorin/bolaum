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
