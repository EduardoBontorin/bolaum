import { BRACKET_ESTRUTURA, RODADAS, RODADA_LABELS } from './bracket.js';

// ── Data loading ──────────────────────────────────────────────────
async function carregarDados() {
  const res = await fetch('data.json?t=' + Date.now());
  if (!res.ok) throw new Error('Falha ao carregar data.json');
  return res.json();
}

// ── Tab navigation ────────────────────────────────────────────────
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

// ── Chaveamento ───────────────────────────────────────────────────
function renderTeamRow(team, placar, isVencedor) {
  const isEmpty = !team;
  const scoreHtml = isVencedor !== null && placar !== null && placar !== undefined
    ? `<span class="bracket-score">${placar}</span>`
    : '';
  return `<div class="bracket-team ${isVencedor ? 'vencedor' : ''} ${isEmpty ? 'placeholder' : ''}">
    <span>${team || 'A definir'}</span>${scoreHtml}
  </div>`;
}

function renderBracket(data) {
  const container = document.getElementById('bracket-container');
  container.innerHTML = '';

  for (const rodada of RODADAS) {
    const estrutura = BRACKET_ESTRUTURA[rodada];
    const jogosData = data.rodadas[rodada]?.jogos ?? [];
    const jogoMap = Object.fromEntries(jogosData.map(j => [j.id, j]));

    const col = document.createElement('div');
    col.className = 'bracket-round';
    col.innerHTML = `<div class="bracket-round-title">${RODADA_LABELS[rodada]}</div>`;

    for (const slot of estrutura) {
      const jogo = jogoMap[slot.id] || null;
      const mandante = jogo?.mandante || (rodada === 'dezesseis_avos' ? slot.label_mandante : null);
      const visitante = jogo?.visitante || (rodada === 'dezesseis_avos' ? slot.label_visitante : null);
      const resultado = jogo?.resultado ?? null;
      const temResultado = resultado !== null;

      const wrapper = document.createElement('div');
      wrapper.className = 'bracket-match-wrapper';
      wrapper.innerHTML = `
        <div class="bracket-match" style="flex:1">
          ${renderTeamRow(mandante, jogo?.placar_mandante, temResultado ? resultado === mandante : null)}
          ${renderTeamRow(visitante, jogo?.placar_visitante, temResultado ? resultado === visitante : null)}
        </div>`;
      col.appendChild(wrapper);
    }

    container.appendChild(col);
  }
}

// ── LocalStorage palpites ──────────────────────────────────────────
function salvarPalpiteLocal(nome, rodada, jogoId, palpite) {
  const key = `bolao_palpites_${nome}`;
  const all = JSON.parse(localStorage.getItem(key) || '{}');
  if (!all[rodada]) all[rodada] = {};
  all[rodada][jogoId] = palpite;
  localStorage.setItem(key, JSON.stringify(all));
}

function carregarPalpitesLocal(nome) {
  const key = `bolao_palpites_${nome}`;
  return JSON.parse(localStorage.getItem(key) || '{}');
}

// ── Palpitar tab ──────────────────────────────────────────────────
function initPalpitar(data) {
  const btnCarregar = document.getElementById('btn-carregar');
  const btnSalvar = document.getElementById('btn-salvar-palpites');

  btnCarregar.addEventListener('click', () => {
    const nome = document.getElementById('input-nome').value.trim();
    if (!nome) { alert('Digite seu nome primeiro.'); return; }
    renderPalpitarForm(nome, data);
  });

  btnSalvar.addEventListener('click', () => {
    const nome = document.getElementById('input-nome').value.trim();
    if (!nome) return;
    coletarESalvarPalpites(nome, data);
    alert('Palpites salvos! Avise o admin para registrar no sistema.');
  });
}

function renderPalpitarForm(nome, data) {
  const form = document.getElementById('palpitar-form');
  const btnSalvar = document.getElementById('btn-salvar-palpites');
  const rodadaAtual = data.config.rodada_atual;
  const rodadaData = data.rodadas[rodadaAtual];

  if (!rodadaData || rodadaData.status === 'nao_iniciada') {
    form.innerHTML = `<div class="rodada-fechada-aviso">Nenhuma rodada aberta no momento. Aguarde o admin liberar a próxima rodada.</div>`;
    btnSalvar.style.display = 'none';
    return;
  }

  if (rodadaData.status === 'fechada' || rodadaData.status === 'concluida') {
    form.innerHTML = `<div class="rodada-fechada-aviso">Rodada encerrada pelo admin. Não é mais possível alterar palpites.</div>`;
    btnSalvar.style.display = 'none';
    return;
  }

  const palpitesLocal = carregarPalpitesLocal(nome);
  const palpitesRodada = palpitesLocal[rodadaAtual] || {};
  const jogos = rodadaData.jogos;

  if (!jogos || jogos.length === 0) {
    form.innerHTML = `<p style="color:#8fa8c0">Aguardando o admin preencher os times da rodada.</p>`;
    btnSalvar.style.display = 'none';
    return;
  }

  form.innerHTML = `<div class="palpite-list">${jogos.map(jogo => {
    const p = palpitesRodada[jogo.id] || {};
    return `
      <div class="palpite-card" data-jogo-id="${jogo.id}">
        <h3>${jogo.id}: ${jogo.mandante} x ${jogo.visitante}</h3>
        <div class="placar-row">
          <span class="team-name">${jogo.mandante}</span>
          <input class="placar-input" type="number" min="0" max="20" data-campo="placar_mandante"
            value="${p.placar_mandante ?? ''}" placeholder="0">
          <span style="color:#8fa8c0">x</span>
          <input class="placar-input" type="number" min="0" max="20" data-campo="placar_visitante"
            value="${p.placar_visitante ?? ''}" placeholder="0">
          <span class="team-name right">${jogo.visitante}</span>
        </div>
        <div class="passou-row">
          <label>Quem avança:</label>
          <select class="passou-select" data-campo="passou">
            <option value="">-- selecione --</option>
            <option value="${jogo.mandante}" ${p.passou === jogo.mandante ? 'selected' : ''}>${jogo.mandante}</option>
            <option value="${jogo.visitante}" ${p.passou === jogo.visitante ? 'selected' : ''}>${jogo.visitante}</option>
          </select>
        </div>
      </div>`;
  }).join('')}</div>`;

  btnSalvar.style.display = 'inline-block';
}

function coletarESalvarPalpites(nome, data) {
  const rodadaAtual = data.config.rodada_atual;
  document.querySelectorAll('.palpite-card').forEach(card => {
    const jogoId = card.dataset.jogoId;
    const placar_mandante = Number(card.querySelector('[data-campo="placar_mandante"]').value);
    const placar_visitante = Number(card.querySelector('[data-campo="placar_visitante"]').value);
    const passou = card.querySelector('[data-campo="passou"]').value;
    salvarPalpiteLocal(nome, rodadaAtual, jogoId, { placar_mandante, placar_visitante, passou });
  });
}

// ── Classificação ──────────────────────────────────────────────────
function renderClassificacao(data) {
  const tbody = document.getElementById('classificacao-body');
  const participantes = data.participantes || [];

  if (participantes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#8fa8c0;text-align:center">Nenhum participante cadastrado ainda.</td></tr>`;
    return;
  }

  const pontuacao = data.pontuacao || {};
  const sorted = [...participantes].sort((a, b) =>
    (pontuacao[b]?.total ?? 0) - (pontuacao[a]?.total ?? 0)
  );

  tbody.innerHTML = sorted.map((nome, idx) => {
    const p = pontuacao[nome] || { dezesseis_avos: 0, oitavas: 0, quartas: 0, semi: 0, final: 0, total: 0 };
    const pos = idx + 1;
    const badgeHtml = pos <= 3
      ? `<span class="pos-badge pos-${pos}">${pos}</span>`
      : `<span style="color:#8fa8c0">${pos}</span>`;
    return `<tr>
      <td>${badgeHtml}</td>
      <td>${nome}</td>
      <td>${p.dezesseis_avos}</td>
      <td>${p.oitavas}</td>
      <td>${p.quartas}</td>
      <td>${p.semi}</td>
      <td>${p.final}</td>
      <td class="total-cell">${p.total}</td>
    </tr>`;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  initTabs();
  try {
    const data = await carregarDados();
    renderBracket(data);
    initPalpitar(data);
    renderClassificacao(data);
  } catch (e) {
    document.getElementById('bracket-container').innerHTML =
      `<p style="color:#ff6b6b">Erro ao carregar dados: ${e.message}</p>`;
  }
}

init();
