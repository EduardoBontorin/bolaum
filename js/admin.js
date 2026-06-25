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

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  await seedSeNecessario();
  initNav();
  initUsuarios();
  renderUsuarios();
}

init();
