import { BRACKET_ESTRUTURA, RODADAS, RODADA_LABELS } from './bracket.js';
import { db, doc, getDoc, setDoc, getDocs, collection } from './firebase.js';
import { getSession, saveSession, clearSession } from './auth.js';
import { calcularPonto } from './scoring.js';

// ── Helper: resultado efetivo (infere do placar quando resultado é null) ──
function resultadoEfetivo(jogo) {
  if (jogo.resultado) return jogo.resultado;
  const pm = jogo.placar_mandante, pv = jogo.placar_visitante;
  if (pm === null || pm === undefined || pv === null || pv === undefined) return null;
  const nm = Number(pm), nv = Number(pv);
  if (nm === nv) return null;
  return nm > nv ? jogo.mandante : jogo.visitante;
}

// ── Estado global da sessão ───────────────────────────────────────
let globalDados          = null;
let globalTodosPalpites  = null;
let globalParticipantes  = null;
let globalPontuacao      = null;
let globalSession        = null;

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
    console.error('[login]', e);
    msg.textContent = 'Erro ao conectar. Tente novamente.';
  }
}

function handleLogout() {
  clearSession();
  window.location.reload();
}

function mostrarApp(user) {
  globalSession = user;
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
  const config  = snaps[0].exists() ? snaps[0].data() : { rodada_atual: 'dezesseis_avos' };
  const rodadas = {};
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
  return snap.docs.filter(d => !d.data().isAdmin).map(d => d.id).sort();
}

async function carregarPontuacao() {
  const snap = await getDocs(collection(db, 'pontuacao'));
  const result = {};
  snap.forEach(d => { result[d.id] = d.data(); });
  return result;
}

// ── Modal ─────────────────────────────────────────────────────────
function abrirModal(titulo, conteudoHtml) {
  const overlay = document.getElementById('modal-overlay');
  overlay.querySelector('.modal-title').textContent = titulo;
  overlay.querySelector('.modal-body').innerHTML = conteudoHtml;
  overlay.classList.add('open');
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── Modal: palpites de uma partida ────────────────────────────────
function abrirModalPalpitesJogo(jogo, rodada) {
  const participantes   = globalParticipantes || [];
  const todosOsPalpites = globalTodosPalpites || {};
  const res             = resultadoEfetivo(jogo);
  const temResultado    = res !== null;

  let headerHtml = '';
  if (temResultado) {
    headerHtml = `
      <div class="modal-placar">
        <div class="mp-times">${jogo.mandante} × ${jogo.visitante}</div>
        <div class="mp-score">${jogo.placar_mandante} – ${jogo.placar_visitante}</div>
        <div class="mp-passou">Avançou: <strong>${res}</strong></div>
      </div>`;
  }

  const rows = participantes.map(nome => {
    const palpite = todosOsPalpites[nome]?.[rodada]?.[jogo.id];
    if (!palpite) {
      return `<tr>
        <td>${nome}</td>
        <td style="color:#4a6a8a">—</td>
        <td style="color:#4a6a8a">—</td>
        <td><span class="pts-badge pts-null">—</span></td>
      </tr>`;
    }
    const placarP       = `${palpite.placar_mandante ?? '?'} x ${palpite.placar_visitante ?? '?'}`;
    const pts           = temResultado ? calcularPonto(palpite, jogo) : null;
    const ptsClass      = pts === 2 ? 'pts-2' : pts === 1 ? 'pts-1' : pts === 0 ? 'pts-0' : 'pts-null';
    const ptsLabel      = pts === null ? '—' : `${pts} pt${pts !== 1 ? 's' : ''}`;
    const acertouPassou = temResultado && palpite.passou === res;
    const acertouPlacar = temResultado &&
      Number(palpite.placar_mandante) === Number(jogo.placar_mandante) &&
      Number(palpite.placar_visitante) === Number(jogo.placar_visitante);
    const classPlacar   = acertouPlacar ? 'acertou' : (temResultado ? (acertouPassou ? '' : 'errou') : '');
    const classPassou   = acertouPassou ? 'acertou' : (temResultado ? 'errou' : '');

    return `<tr>
      <td>${nome}</td>
      <td class="${classPlacar}">${placarP}</td>
      <td class="${classPassou}">${palpite.passou || '—'}</td>
      <td><span class="pts-badge ${ptsClass}">${ptsLabel}</span></td>
    </tr>`;
  }).join('');

  const conteudo = headerHtml + `
    <table class="palpites-table">
      <thead><tr>
        <th>Participante</th><th>Placar palpitado</th><th>Quem avançou</th><th>Pts</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  abrirModal(`${jogo.id}: ${jogo.mandante} × ${jogo.visitante}`, conteudo);
}

// ── Modal: breakdown de pontos de um jogador ──────────────────────
function abrirModalDetalheJogador(nome) {
  const dados           = globalDados;
  const todosOsPalpites = globalTodosPalpites;
  if (!dados || !todosOsPalpites) return;

  const palpitesJogador = todosOsPalpites[nome] || {};
  let totalGeral = 0;
  let secoes     = '';

  for (const rodada of RODADAS) {
    const rodadaData = dados.rodadas[rodada];
    const jogos      = rodadaData?.jogos || [];
    if (!jogos.length) continue;

    const temResultados = jogos.some(j => resultadoEfetivo(j) !== null);
    if (!temResultados) continue;

    const palpitesRodada = palpitesJogador[rodada] || {};
    let totalRodada = 0;
    const jogoRows = jogos
      .filter(jogo => resultadoEfetivo(jogo) !== null)
      .map(jogo => {
        const palpite = palpitesRodada[jogo.id];
        const pts = palpite ? calcularPonto(palpite, jogo) : 0;
        if (pts !== null) totalRodada += pts;

        const ptsClass  = pts === 2 ? 'pts-2' : pts === 1 ? 'pts-1' : 'pts-0';
        const ptsLabel  = `${pts ?? 0} pt${pts !== 1 ? 's' : ''}`;

        let explicacao;
        if (!palpite) {
          explicacao = 'sem palpite';
        } else if (pts === 2) {
          explicacao = 'placar exato + quem avançou';
        } else if (pts === 1) {
          explicacao = 'acertou quem avançou (placar errado)';
        } else {
          explicacao = 'errou quem avançou';
        }

        const placarP   = palpite
          ? `${palpite.placar_mandante ?? '?'} x ${palpite.placar_visitante ?? '?'}`
          : '—';
        const quemP     = palpite?.passou || '—';
        const placarR   = `${jogo.placar_mandante} x ${jogo.placar_visitante}`;
        const resEfetivo = resultadoEfetivo(jogo);

        return `<tr>
          <td style="font-size:0.8rem">${jogo.mandante} x ${jogo.visitante}</td>
          <td style="font-size:0.8rem;color:#8fa8c0">${placarP} · ${quemP}</td>
          <td style="font-size:0.8rem;color:#8fa8c0">${placarR} · ${resEfetivo}</td>
          <td><span class="pts-badge ${ptsClass}">${ptsLabel}</span></td>
          <td style="font-size:0.72rem;color:#8fa8c0">${explicacao}</td>
        </tr>`;
      }).join('');

    totalGeral += totalRodada;
    secoes += `
      <div class="breakdown-rodada">
        <div class="breakdown-rodada-title">
          <span>${RODADA_LABELS[rodada]}</span>
          <span>${totalRodada} pt${totalRodada !== 1 ? 's' : ''}</span>
        </div>
        <table class="palpites-table" style="width:100%">
          <thead><tr>
            <th>Partida</th><th>Palpite</th><th>Resultado</th><th>Pts</th><th>Motivo</th>
          </tr></thead>
          <tbody>${jogoRows}</tbody>
        </table>
      </div>`;
  }

  if (!secoes) {
    secoes = `<p style="color:#8fa8c0">Nenhuma rodada com resultados ainda.</p>`;
  }

  const conteudo = secoes + `<div class="breakdown-total">Total: ${totalGeral} pt${totalGeral !== 1 ? 's' : ''}</div>`;
  abrirModal(`Pontuação de ${nome}`, conteudo);
}

// ── Chaveamento ───────────────────────────────────────────────────
function renderTeamRow(team, placar, isVencedor) {
  const isEmpty   = !team;
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
    const estrutura = BRACKET_ESTRUTURA[rodada];
    const jogosData = data.rodadas[rodada]?.jogos ?? [];
    const jogoMap   = Object.fromEntries(jogosData.map(j => [j.id, j]));
    const col       = document.createElement('div');
    col.className   = 'bracket-round';
    col.innerHTML   = `<div class="bracket-round-title">${RODADA_LABELS[rodada]}</div>`;

    for (const slot of estrutura) {
      const jogo      = jogoMap[slot.id] || null;
      const mandante  = jogo?.mandante  || (rodada === 'dezesseis_avos' ? slot.label_mandante  : null);
      const visitante = jogo?.visitante || (rodada === 'dezesseis_avos' ? slot.label_visitante : null);
      const resultado = jogo ? resultadoEfetivo(jogo) : null;
      const temRes    = resultado !== null;
      const wrapper   = document.createElement('div');
      wrapper.className = 'bracket-match-wrapper';

      const btnPalpites = (temRes && jogo)
        ? `<button class="btn-ver-palpites" data-jogo-id="${jogo.id}" data-rodada="${rodada}">Ver palpites</button>`
        : '';

      wrapper.innerHTML = `
        <div class="bracket-match" style="flex:1">
          ${renderTeamRow(mandante,  jogo?.placar_mandante,  temRes ? resultado === mandante  : null)}
          ${renderTeamRow(visitante, jogo?.placar_visitante, temRes ? resultado === visitante : null)}
          ${btnPalpites}
        </div>`;
      col.appendChild(wrapper);
    }
    container.appendChild(col);
  }

  container.querySelectorAll('.btn-ver-palpites').forEach(btn => {
    btn.addEventListener('click', () => {
      const rodada = btn.dataset.rodada;
      const jogoId = btn.dataset.jogoId;
      const jogo   = data.rodadas[rodada]?.jogos?.find(j => j.id === jogoId);
      if (jogo) abrirModalPalpitesJogo(jogo, rodada);
    });
  });
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
      <td>${badgeHtml}</td>
      <td><button class="nome-link" data-nome="${nome}">${nome}</button></td>
      <td>${p.dezesseis_avos}</td><td>${p.oitavas}</td><td>${p.quartas}</td>
      <td>${p.semi}</td><td>${p.final}</td>
      <td class="total-cell">${p.total}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.nome-link').forEach(btn => {
    btn.addEventListener('click', () => abrirModalDetalheJogador(btn.dataset.nome));
  });
}

// ── Init principal ────────────────────────────────────────────────
async function carregarEInicializar(user) {
  try {
    const [dados, participantes, pontuacao, todosPalpites] = await Promise.all([
      carregarDados(),
      carregarTodosParticipantes(),
      carregarPontuacao(),
      carregarTodosPalpites()
    ]);

    globalDados         = dados;
    globalParticipantes = participantes;
    globalPontuacao     = pontuacao;
    globalTodosPalpites = todosPalpites;

    renderBracket(dados);
    renderClassificacao(pontuacao, participantes);
    await initPalpitar(user, dados);
    initPalpitesTab(user, dados, participantes);
  } catch (e) {
    document.getElementById('bracket-container').innerHTML =
      `<p style="color:#ff6b6b">Erro ao carregar dados: ${e.message}</p>`;
  }
}

// ── Palpitar ──────────────────────────────────────────────────────
function isJogoLocked(jogo) {
  if (!jogo.horario_abertura) return false;
  return Date.now() >= new Date(jogo.horario_abertura).getTime() - 60 * 60 * 1000;
}

function renderPalpiteCards(jogos, palpitesRodada) {
  const list = document.getElementById('palpite-list-inner');
  if (!list) return;

  list.innerHTML = jogos.map(jogo => {
    const p           = palpitesRodada[jogo.id] || {};
    const mVal        = p.placar_mandante ?? '';
    const vVal        = p.placar_visitante ?? '';
    const hasScores   = mVal !== '' && vVal !== '';
    const isEmpate    = hasScores && Number(mVal) === Number(vVal);
    const isNaoEmpate = hasScores && Number(mVal) !== Number(vVal);
    const autoWinner  = isNaoEmpate ? (Number(mVal) > Number(vVal) ? jogo.mandante : jogo.visitante) : '';
    const locked      = isJogoLocked(jogo);
    const disabled    = locked ? 'disabled' : '';
    const horarioHtml = jogo.horario_abertura
      ? `<div class="jogo-horario">${new Date(jogo.horario_abertura).toLocaleString('pt-BR')}${locked ? ' — <span style="color:#ff8a8a">encerrado</span>' : ''}</div>`
      : '';

    return `
      <div class="palpite-card" data-jogo-id="${jogo.id}"
           data-mandante="${jogo.mandante}" data-visitante="${jogo.visitante}">
        <h3>${jogo.id}: ${jogo.mandante} x ${jogo.visitante}</h3>
        ${horarioHtml}
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
          <div class="passou-auto" style="${isNaoEmpate ? '' : 'display:none'}">
            Avança: <strong class="passou-auto-nome">${autoWinner}</strong>
          </div>
          <div class="passou-select-wrap" style="${isEmpate ? '' : 'display:none'}">
            <label class="passou-label penaltis">Quem passa nos pênaltis?</label>
            <select class="passou-select" data-campo="passou" ${disabled}>
              <option value="">-- selecione --</option>
              <option value="${jogo.mandante}" ${p.passou === jogo.mandante ? 'selected' : ''}>${jogo.mandante}</option>
              <option value="${jogo.visitante}" ${p.passou === jogo.visitante ? 'selected' : ''}>${jogo.visitante}</option>
            </select>
          </div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.palpite-card').forEach(card => {
    if (card.querySelector('[data-campo="placar_mandante"]').disabled) return;
    const mInput         = card.querySelector('[data-campo="placar_mandante"]');
    const vInput         = card.querySelector('[data-campo="placar_visitante"]');
    const passouAuto     = card.querySelector('.passou-auto');
    const passouAutoNome = card.querySelector('.passou-auto-nome');
    const passouWrap     = card.querySelector('.passou-select-wrap');
    const passouSelect   = card.querySelector('.passou-select');
    const mandante       = card.dataset.mandante;
    const visitante      = card.dataset.visitante;

    const update = () => {
      const m = mInput.value, v = vInput.value;
      const hasVal  = m !== '' && v !== '';
      const empate  = hasVal && Number(m) === Number(v);
      const nEmpate = hasVal && Number(m) !== Number(v);
      passouWrap.style.display = empate  ? '' : 'none';
      passouAuto.style.display = nEmpate ? '' : 'none';
      if (nEmpate) passouAutoNome.textContent = Number(m) > Number(v) ? mandante : visitante;
      if (!empate) passouSelect.value = '';
    };
    mInput.addEventListener('input', update);
    vInput.addEventListener('input', update);
  });
}

async function salvarPalpites(nome, rodadaAtual) {
  const ref      = doc(db, 'palpites', nome);
  const current  = await getDoc(ref);
  const existing = current.exists() ? current.data() : {};

  const novosRodada = { ...(existing[rodadaAtual] || {}) };

  document.querySelectorAll('.palpite-card').forEach(card => {
    const mInput = card.querySelector('[data-campo="placar_mandante"]');
    if (mInput.disabled) return; // jogo bloqueado — preserva palpite existente
    const jogoId    = card.dataset.jogoId;
    const mandante  = card.dataset.mandante;
    const visitante = card.dataset.visitante;
    const pmStr     = mInput.value;
    const pvStr     = card.querySelector('[data-campo="placar_visitante"]').value;
    const placar_mandante  = Number(pmStr);
    const placar_visitante = Number(pvStr);
    let passou;
    if (pmStr !== '' && pvStr !== '' && Number(pmStr) !== Number(pvStr)) {
      passou = Number(pmStr) > Number(pvStr) ? mandante : visitante;
    } else {
      passou = card.querySelector('[data-campo="passou"]').value;
    }
    novosRodada[jogoId] = { placar_mandante, placar_visitante, passou };
  });

  existing[rodadaAtual] = novosRodada;
  await setDoc(ref, existing);
}

async function initPalpitar(user, dados) {
  const form        = document.getElementById('palpitar-form');
  const acoes       = document.getElementById('palpitar-acoes');
  const rodadaAtual = dados.config.rodada_atual;
  const rodadaData  = dados.rodadas[rodadaAtual];

  if (!rodadaData || rodadaData.status === 'nao_iniciada') {
    form.innerHTML  = `<div class="rodada-fechada-aviso">Nenhuma rodada aberta. Aguarde o admin.</div>`;
    acoes.innerHTML = '';
    return;
  }

  if (rodadaData.status === 'fechada' || rodadaData.status === 'concluida') {
    form.innerHTML  = `<div class="rodada-fechada-aviso">Rodada encerrada. Não é mais possível alterar palpites.</div>`;
    acoes.innerHTML = '';
    return;
  }

  const jogos = rodadaData.jogos || [];
  if (!jogos.length) {
    form.innerHTML  = `<p style="color:#8fa8c0">Aguardando admin preencher os times.</p>`;
    acoes.innerHTML = '';
    return;
  }

  const palpitesUsuario = await carregarPalpitesUsuario(user.nome);
  const palpitesRodada  = palpitesUsuario[rodadaAtual] || {};
  const todosLocked     = jogos.every(isJogoLocked);

  form.innerHTML  = `<div class="palpite-list"><div id="palpite-list-inner"></div></div>`;
  acoes.innerHTML = todosLocked
    ? `<p class="rodada-horario" style="color:#ff8a8a">Todos os jogos já começaram — palpites encerrados.</p>`
    : `<button class="btn btn-primary" id="btn-salvar-palpites">Salvar palpites</button>`;

  renderPalpiteCards(jogos, palpitesRodada);

  document.getElementById('btn-salvar-palpites').addEventListener('click', async () => {
    const btn = document.getElementById('btn-salvar-palpites');
    btn.disabled    = true;
    btn.textContent = 'Salvando...';
    try {
      await salvarPalpites(user.nome, rodadaAtual);
      btn.textContent = 'Salvo!';
      setTimeout(() => { btn.disabled = false; btn.textContent = 'Salvar palpites'; }, 2000);
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
      btn.disabled    = false;
      btn.textContent = 'Salvar palpites';
    }
  });
}

// ── Aba Palpites ──────────────────────────────────────────────────
function renderPorJogo(jogo, rodada, todosOsPalpites, participantes, rodadaAberta, session, container) {
  const res          = resultadoEfetivo(jogo);
  const temResultado = res !== null;

  let resultadoHtml = '';
  if (temResultado) {
    resultadoHtml = `
      <div class="modal-placar" style="margin-bottom:1rem">
        <div class="mp-times">${jogo.mandante} × ${jogo.visitante}</div>
        <div class="mp-score">${jogo.placar_mandante} – ${jogo.placar_visitante}</div>
        <div class="mp-passou">Avançou: <strong>${res}</strong></div>
      </div>`;
  }

  const rows = participantes.map(nome => {
    const palpite = todosOsPalpites[nome]?.[rodada]?.[jogo.id];
    const visivel = !rodadaAberta || session.isAdmin || nome === session.nome;

    if (!palpite || !visivel) {
      return `<tr><td>${nome}</td><td style="color:#4a6a8a">—</td><td style="color:#4a6a8a">—</td><td>—</td></tr>`;
    }

    const placarP       = `${palpite.placar_mandante ?? '?'} x ${palpite.placar_visitante ?? '?'}`;
    const pts           = temResultado ? calcularPonto(palpite, jogo) : null;
    const ptsClass      = pts === 2 ? 'pts-2' : pts === 1 ? 'pts-1' : pts === 0 ? 'pts-0' : 'pts-null';
    const ptsLabel      = pts === null ? '—' : `${pts}`;
    const acertouPassou = temResultado && palpite.passou === res;
    const acertouPlacar = temResultado &&
      Number(palpite.placar_mandante) === Number(jogo.placar_mandante) &&
      Number(palpite.placar_visitante) === Number(jogo.placar_visitante);
    const classPlacar   = acertouPlacar ? 'acertou' : (temResultado ? (acertouPassou ? '' : 'errou') : '');
    const classPassou   = acertouPassou ? 'acertou' : (temResultado ? 'errou' : '');

    return `<tr>
      <td>${nome}</td>
      <td class="${classPlacar}">${placarP}</td>
      <td class="${classPassou}">${palpite.passou || '—'}</td>
      <td><span class="pts-badge ${ptsClass}">${ptsLabel}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = resultadoHtml + `
    <table class="palpites-table">
      <thead><tr>
        <th>Participante</th><th>Placar palpitado</th><th>Quem avança</th><th>Pts</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPorParticipante(nomeAlvo, jogos, rodada, todosOsPalpites, rodadaAberta, session, container) {
  const podeMostrar = !rodadaAberta || session.isAdmin || nomeAlvo === session.nome;
  if (!podeMostrar) {
    container.innerHTML = `<div class="rodada-fechada-aviso">Palpites de outros participantes ficam visíveis após a rodada fechar.</div>`;
    return;
  }

  const rows = jogos.map(jogo => {
    const palpite      = todosOsPalpites[nomeAlvo]?.[rodada]?.[jogo.id];
    const res          = resultadoEfetivo(jogo);
    const temResultado = res !== null;

    if (!palpite) {
      return `<tr>
        <td>${jogo.mandante} x ${jogo.visitante}</td>
        <td style="color:#4a6a8a">—</td><td style="color:#4a6a8a">—</td><td>—</td>
      </tr>`;
    }

    const placarP       = `${palpite.placar_mandante ?? '?'} x ${palpite.placar_visitante ?? '?'}`;
    const pts           = temResultado ? calcularPonto(palpite, jogo) : null;
    const ptsClass      = pts === 2 ? 'pts-2' : pts === 1 ? 'pts-1' : pts === 0 ? 'pts-0' : 'pts-null';
    const ptsLabel      = pts === null ? '—' : `${pts}`;
    const acertouPassou = temResultado && palpite.passou === res;
    const acertouPlacar = temResultado &&
      Number(palpite.placar_mandante) === Number(jogo.placar_mandante) &&
      Number(palpite.placar_visitante) === Number(jogo.placar_visitante);
    const classPlacar   = acertouPlacar ? 'acertou' : (temResultado ? (acertouPassou ? '' : 'errou') : '');
    const classPassou   = acertouPassou ? 'acertou' : (temResultado ? 'errou' : '');

    return `<tr>
      <td>${jogo.mandante} x ${jogo.visitante}</td>
      <td class="${classPlacar}">${placarP}</td>
      <td class="${classPassou}">${palpite.passou || '—'}</td>
      <td><span class="pts-badge ${ptsClass}">${ptsLabel}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="palpites-table">
      <thead><tr>
        <th>Jogo</th><th>Placar palpitado</th><th>Quem avança</th><th>Pts</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function initPalpitesTab(user, dados, participantes) {
  const todasRodadasComJogos = RODADAS.filter(r => (dados.rodadas[r]?.jogos || []).length > 0);
  const rodadaAtual          = dados.config.rodada_atual;
  const rodadaInicial        = todasRodadasComJogos.includes(rodadaAtual)
    ? rodadaAtual
    : (todasRodadasComJogos[todasRodadasComJogos.length - 1] || rodadaAtual);

  let modoAtual         = 'jogo';
  let rodadaSelecionada = rodadaInicial;
  let initialized       = false;

  const controls = document.querySelector('.palpites-tab-controls');

  function getRodadaInfo() {
    const rd = dados.rodadas[rodadaSelecionada];
    return { jogos: rd?.jogos || [], rodadaAberta: rd?.status === 'aberta' };
  }

  function renderRodadaSelector() {
    const existing = document.getElementById('palpites-rodada-select-container');
    if (existing) existing.remove();
    if (todasRodadasComJogos.length <= 1) return;

    const div = document.createElement('div');
    div.id = 'palpites-rodada-select-container';
    div.className = 'palpites-rodada-header';
    div.innerHTML = `
      <label style="font-size:0.85rem;color:#8fa8c0">Rodada:</label>
      <select class="select-field" id="select-rodada-palpites-tab">
        ${todasRodadasComJogos.map(r =>
          `<option value="${r}" ${r === rodadaSelecionada ? 'selected' : ''}>${RODADA_LABELS[r]}</option>`
        ).join('')}
      </select>`;
    controls.parentNode.insertBefore(div, controls);

    document.getElementById('select-rodada-palpites-tab').addEventListener('change', e => {
      rodadaSelecionada = e.target.value;
      renderPalpitesContent(modoAtual);
    });
  }

  function renderPalpitesContent(modo) {
    const { jogos, rodadaAberta } = getRodadaInfo();
    const todosOsPalpites         = globalTodosPalpites || {};
    const selectContainer         = document.getElementById('palpites-select-container');
    const content                 = document.getElementById('palpites-content');

    if (modo === 'jogo') {
      selectContainer.innerHTML = jogos.length
        ? `<label style="font-size:0.85rem;color:#8fa8c0;margin-right:0.5rem">Jogo:</label>
           <select class="select-field" id="select-jogo-palpites">
             <option value="">-- selecione --</option>
             ${jogos.map(j => `<option value="${j.id}">${j.id}: ${j.mandante} x ${j.visitante}</option>`).join('')}
           </select>`
        : `<p style="color:#8fa8c0">Nenhum jogo nesta rodada.</p>`;
      content.innerHTML = '';

      if (jogos.length) {
        document.getElementById('select-jogo-palpites').addEventListener('change', e => {
          if (!e.target.value) { content.innerHTML = ''; return; }
          const jogo = jogos.find(j => j.id === e.target.value);
          renderPorJogo(jogo, rodadaSelecionada, todosOsPalpites, participantes, rodadaAberta, user, content);
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
          renderPorParticipante(e.target.value, jogos, rodadaSelecionada, todosOsPalpites, rodadaAberta, user, content);
        });
      }
    }
  }

  document.querySelector('[data-tab="palpites"]').addEventListener('click', () => {
    if (initialized) return;
    initialized = true;
    renderRodadaSelector();
    renderPalpitesContent(modoAtual);
  });

  controls.querySelectorAll('.palpites-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      controls.querySelectorAll('.palpites-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      modoAtual = btn.dataset.mode;
      if (initialized) renderPalpitesContent(modoAtual);
    });
  });
}

// ── Entry point ───────────────────────────────────────────────────
async function init() {
  document.getElementById('landing-btn').addEventListener('click', handleLogin);
  document.getElementById('landing-senha').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });
  overlay.querySelector('.modal-close').addEventListener('click', fecharModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

  const session = getSession();
  if (session) mostrarApp(session);
}

init();
