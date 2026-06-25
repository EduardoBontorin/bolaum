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
