import { BRACKET_ESTRUTURA, RODADAS, RODADA_LABELS } from './bracket.js';
import { calcularTodosPontos } from './scoring.js';

// ── State ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'bolao_admin_state';

function getState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function setState(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function emptyState() {
  return {
    config: { rodada_atual: 'dezesseis_avos' },
    rodadas: {
      dezesseis_avos: { status: 'nao_iniciada', jogos: [] },
      oitavas:        { status: 'nao_iniciada', jogos: [] },
      quartas:        { status: 'nao_iniciada', jogos: [] },
      semi:           { status: 'nao_iniciada', jogos: [] },
      final:          { status: 'nao_iniciada', jogos: [] }
    },
    participantes: [],
    palpites: {},
    pontuacao: {}
  };
}

// ── Section navigation ────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.admin-nav [data-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
      document.getElementById('sec-' + btn.dataset.sec).classList.add('active');
      renderSection(btn.dataset.sec);
    });
  });
}

function renderSection(sec) {
  if (sec === 'participantes') renderParticipantes();
  if (sec === 'palpites')      renderPalpitesAdmin();
  if (sec === 'rodada')        renderRodadaAdmin();
  if (sec === 'resultados')    renderResultadosAdmin();
}

// ── Import / Export ───────────────────────────────────────────────
function initDados() {
  const trigger  = document.getElementById('btn-import-trigger');
  const fileInput = document.getElementById('import-file');
  const btnExport = document.getElementById('btn-export');
  const status    = document.getElementById('dados-status');

  trigger.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        setState(data);
        status.innerHTML = `<div class="alert alert-success">JSON importado com sucesso. Estado carregado na memória.</div>`;
        fileInput.value = '';
      } catch {
        status.innerHTML = `<div class="alert alert-warning">Erro ao ler JSON. Verifique o arquivo.</div>`;
      }
    };
    reader.readAsText(file);
  });

  btnExport.addEventListener('click', () => {
    const data = getState() || emptyState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
    status.innerHTML = `<div class="alert alert-success">data.json baixado. Substitua o arquivo no repositório e faça commit + push.</div>`;
  });
}

// ── Participantes ─────────────────────────────────────────────────
function renderParticipantes() {
  const data = getState() || emptyState();
  const list = document.getElementById('participant-list');

  list.innerHTML = data.participantes.length
    ? data.participantes.map(nome => `
        <div class="participant-chip">
          <span>${nome}</span>
          <button class="chip-remove" data-nome="${nome}" title="Remover">×</button>
        </div>`).join('')
    : '<p style="color:#8fa8c0;font-size:0.9rem">Nenhum participante ainda.</p>';

  list.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const nome = btn.dataset.nome;
      if (!confirm(`Remover "${nome}"? Os palpites e pontos dele serão apagados.`)) return;
      const state = getState() || emptyState();
      state.participantes = state.participantes.filter(n => n !== nome);
      delete state.palpites[nome];
      delete state.pontuacao[nome];
      setState(state);
      renderParticipantes();
    });
  });
}

function initParticipantes() {
  const input = document.getElementById('input-new-participant');
  const btn   = document.getElementById('btn-add-participant');

  const adicionar = () => {
    const nome = input.value.trim();
    if (!nome) return;
    const state = getState() || emptyState();
    if (state.participantes.includes(nome)) {
      alert(`"${nome}" já está cadastrado.`);
      return;
    }
    state.participantes.push(nome);
    if (!state.palpites[nome])   state.palpites[nome] = {};
    if (!state.pontuacao[nome])  state.pontuacao[nome] = { dezesseis_avos: 0, oitavas: 0, quartas: 0, semi: 0, final: 0, total: 0 };
    setState(state);
    input.value = '';
    renderParticipantes();
  };

  btn.addEventListener('click', adicionar);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') adicionar(); });
}

// ── Palpites admin ────────────────────────────────────────────────
function renderPalpitesAdmin() {
  const selParticipante = document.getElementById('select-participant');
  const selRodada       = document.getElementById('select-rodada-palpite');
  const btn             = document.getElementById('btn-salvar-palpite-admin');
  const form            = document.getElementById('palpites-admin-form');

  // Populate selects
  const data = getState() || emptyState();
  const currentNome   = selParticipante.value;
  const currentRodada = selRodada.value;

  selParticipante.innerHTML = '<option value="">-- selecione --</option>' +
    data.participantes.map(n => `<option value="${n}" ${n === currentNome ? 'selected' : ''}>${n}</option>`).join('');

  selRodada.innerHTML = RODADAS.map(r =>
    `<option value="${r}" ${r === currentRodada ? 'selected' : ''}>${RODADA_LABELS[r]}</option>`
  ).join('');

  const renderForm = () => {
    const nome   = selParticipante.value;
    const rodada = selRodada.value;
    if (!nome) { form.innerHTML = ''; btn.style.display = 'none'; return; }

    const state  = getState() || emptyState();
    const jogos  = state.rodadas[rodada]?.jogos ?? [];
    const palpites = state.palpites[nome]?.[rodada] ?? {};

    if (jogos.length === 0) {
      form.innerHTML = `<p style="color:#8fa8c0">Nenhum jogo nesta rodada. Configure os times em "Rodada" primeiro.</p>`;
      btn.style.display = 'none';
      return;
    }

    form.innerHTML = jogos.map(jogo => {
      const p = palpites[jogo.id] || {};
      return `
        <div class="admin-jogo-card" data-jogo-id="${jogo.id}">
          <h4>${jogo.id}: ${jogo.mandante} x ${jogo.visitante}</h4>
          <div class="placar-row">
            <span class="team-name">${jogo.mandante}</span>
            <input class="placar-input" type="number" min="0" max="20" data-campo="placar_mandante"
              value="${p.placar_mandante ?? ''}">
            <span style="color:#8fa8c0">x</span>
            <input class="placar-input" type="number" min="0" max="20" data-campo="placar_visitante"
              value="${p.placar_visitante ?? ''}">
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
    }).join('');

    btn.style.display = 'inline-block';
  };

  selParticipante.addEventListener('change', renderForm);
  selRodada.addEventListener('change', renderForm);
  renderForm();

  btn.onclick = () => {
    const nome   = selParticipante.value;
    const rodada = selRodada.value;
    if (!nome) return;
    const state = getState() || emptyState();
    if (!state.palpites[nome])         state.palpites[nome] = {};
    if (!state.palpites[nome][rodada]) state.palpites[nome][rodada] = {};
    document.querySelectorAll('#palpites-admin-form .admin-jogo-card').forEach(card => {
      const jogoId = card.dataset.jogoId;
      state.palpites[nome][rodada][jogoId] = {
        placar_mandante:  Number(card.querySelector('[data-campo="placar_mandante"]').value),
        placar_visitante: Number(card.querySelector('[data-campo="placar_visitante"]').value),
        passou: card.querySelector('[data-campo="passou"]').value
      };
    });
    setState(state);
    alert(`Palpites de ${nome} para ${RODADA_LABELS[rodada]} salvos. Lembre de Exportar JSON.`);
  };
}

// ── Rodada ────────────────────────────────────────────────────────
function renderRodadaAdmin() {
  const data        = getState() || emptyState();
  const rodadaAtual = data.config.rodada_atual;
  const rodadaData  = data.rodadas[rodadaAtual];
  const estrutura   = BRACKET_ESTRUTURA[rodadaAtual];

  document.getElementById('rodada-status-painel').innerHTML = `
    <div class="alert alert-info">
      Rodada atual: <strong>${RODADA_LABELS[rodadaAtual]}</strong>
      &nbsp;<span class="status-badge status-${rodadaData.status}">${rodadaData.status.replace('_', ' ')}</span>
    </div>`;

  const form = document.getElementById('rodada-times-form');
  const jogosExistentes = Object.fromEntries((rodadaData.jogos || []).map(j => [j.id, j]));

  form.innerHTML = estrutura.map(slot => {
    const jogo = jogosExistentes[slot.id] || {};
    const labelM = slot.label_mandante  || `Vencedor de ${slot.origem_mandante}`;
    const labelV = slot.label_visitante || `Vencedor de ${slot.origem_visitante}`;
    return `
      <div class="admin-jogo-card" data-slot-id="${slot.id}">
        <h4>${slot.id} &nbsp;|&nbsp; <em>${labelM}</em> vs <em>${labelV}</em></h4>
        <div class="placar-row">
          <input class="input-text" type="text" data-campo="mandante"
            placeholder="${labelM}" value="${jogo.mandante || ''}"
            style="min-width:0;flex:1">
          <span style="color:#8fa8c0;padding:0 0.5rem">x</span>
          <input class="input-text" type="text" data-campo="visitante"
            placeholder="${labelV}" value="${jogo.visitante || ''}"
            style="min-width:0;flex:1">
        </div>
      </div>`;
  }).join('');

  document.getElementById('btn-salvar-times').onclick = () => {
    const state = getState() || emptyState();
    const novosJogos = [];
    document.querySelectorAll('#rodada-times-form .admin-jogo-card').forEach(card => {
      const id        = card.dataset.slotId;
      const mandante  = card.querySelector('[data-campo="mandante"]').value.trim();
      const visitante = card.querySelector('[data-campo="visitante"]').value.trim();
      const atual     = Object.fromEntries((state.rodadas[rodadaAtual].jogos || []).map(j => [j.id, j]));
      novosJogos.push({
        id,
        mandante,
        visitante,
        placar_mandante:  atual[id]?.placar_mandante  ?? null,
        placar_visitante: atual[id]?.placar_visitante ?? null,
        resultado:        atual[id]?.resultado        ?? null
      });
    });
    state.rodadas[rodadaAtual].jogos = novosJogos;
    setState(state);
    alert('Times salvos. Não esqueça de Exportar JSON.');
  };

  document.getElementById('btn-fechar-rodada').onclick = () => {
    if (!confirm(`Fechar "${RODADA_LABELS[rodadaAtual]}"? Participantes não poderão mais alterar palpites.`)) return;
    const state = getState() || emptyState();
    state.rodadas[rodadaAtual].status = 'fechada';
    setState(state);
    renderRodadaAdmin();
    alert('Rodada fechada.');
  };

  document.getElementById('btn-abrir-proxima').onclick = () => {
    const idx = RODADAS.indexOf(rodadaAtual);
    if (idx === RODADAS.length - 1) { alert('Esta é a última rodada.'); return; }
    const proxima = RODADAS[idx + 1];
    if (rodadaData.status !== 'concluida') {
      if (!confirm('A rodada atual ainda não está concluída (pontos não calculados). Deseja abrir a próxima mesmo assim?')) return;
    }
    const state = getState() || emptyState();
    state.config.rodada_atual       = proxima;
    state.rodadas[proxima].status   = 'aberta';
    setState(state);
    renderRodadaAdmin();
    alert(`"${RODADA_LABELS[proxima]}" aberta.`);
  };
}

// ── Resultados ────────────────────────────────────────────────────
function renderResultadosAdmin() {
  const data = getState() || emptyState();
  const form = document.getElementById('resultados-form');

  // Find the latest round that is open or closed (has games to enter results for)
  let rodadaAlvo = null;
  for (const r of RODADAS) {
    if (data.rodadas[r].status === 'aberta' || data.rodadas[r].status === 'fechada') {
      rodadaAlvo = r;
    }
  }

  if (!rodadaAlvo) {
    form.innerHTML = `<p style="color:#8fa8c0">Nenhuma rodada aberta ou fechada para inserir resultados.</p>`;
    return;
  }

  const jogos = data.rodadas[rodadaAlvo]?.jogos ?? [];
  if (jogos.length === 0) {
    form.innerHTML = `<p style="color:#8fa8c0">Configure os times da rodada "${RODADA_LABELS[rodadaAlvo]}" em "Rodada" primeiro.</p>`;
    return;
  }

  form.innerHTML =
    `<p style="color:#8fa8c0;margin-bottom:1rem">Rodada: <strong style="color:#f5a623">${RODADA_LABELS[rodadaAlvo]}</strong></p>` +
    jogos.map(jogo => `
      <div class="admin-jogo-card" data-jogo-id="${jogo.id}">
        <h4>${jogo.id}: ${jogo.mandante} x ${jogo.visitante}</h4>
        <div class="placar-row">
          <span class="team-name">${jogo.mandante}</span>
          <input class="placar-input" type="number" min="0" max="20" data-campo="placar_mandante"
            value="${jogo.placar_mandante ?? ''}">
          <span style="color:#8fa8c0">x</span>
          <input class="placar-input" type="number" min="0" max="20" data-campo="placar_visitante"
            value="${jogo.placar_visitante ?? ''}">
          <span class="team-name right">${jogo.visitante}</span>
        </div>
        <div class="passou-row">
          <label>Quem avançou:</label>
          <select class="passou-select" data-campo="resultado">
            <option value="">-- selecione --</option>
            <option value="${jogo.mandante}" ${jogo.resultado === jogo.mandante ? 'selected' : ''}>${jogo.mandante}</option>
            <option value="${jogo.visitante}" ${jogo.resultado === jogo.visitante ? 'selected' : ''}>${jogo.visitante}</option>
          </select>
        </div>
      </div>`).join('');

  document.getElementById('btn-salvar-resultados').onclick = () => {
    const state = getState() || emptyState();
    document.querySelectorAll('#resultados-form .admin-jogo-card').forEach(card => {
      const id   = card.dataset.jogoId;
      const jogo = state.rodadas[rodadaAlvo].jogos.find(j => j.id === id);
      if (!jogo) return;
      jogo.placar_mandante  = Number(card.querySelector('[data-campo="placar_mandante"]').value);
      jogo.placar_visitante = Number(card.querySelector('[data-campo="placar_visitante"]').value);
      jogo.resultado        = card.querySelector('[data-campo="resultado"]').value || null;
    });
    setState(state);
    alert('Resultados salvos. Clique "Calcular pontos" quando todos os jogos tiverem resultado.');
  };

  document.getElementById('btn-calcular-pontos').onclick = () => {
    if (!confirm('Calcular pontos para todos os participantes? Isso sobrescreve a pontuação atual desta rodada.')) return;
    const state = getState() || emptyState();
    state.pontuacao = calcularTodosPontos(state);
    state.rodadas[rodadaAlvo].status = 'concluida';
    setState(state);
    renderResultadosAdmin();
    renderRodadaAdmin();
    alert('Pontos calculados! Exporte o JSON e faça commit + push para publicar.');
  };
}

// ── Init ──────────────────────────────────────────────────────────
function init() {
  if (!getState()) setState(emptyState());
  initNav();
  initDados();
  initParticipantes();
  renderParticipantes();
}

init();
