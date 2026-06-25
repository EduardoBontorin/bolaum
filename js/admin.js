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
