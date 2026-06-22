/**
 * Returns points for a single guess vs a single completed match.
 * palpite: { placar_mandante, placar_visitante, passou }
 * jogo:    { placar_mandante, placar_visitante, resultado }
 * Returns null if match not yet completed.
 */
export function calcularPonto(palpite, jogo) {
  if (jogo.resultado === null || jogo.resultado === undefined) return null;
  if (!palpite) return 0;

  const acertouPassou = palpite.passou === jogo.resultado;
  if (!acertouPassou) return 0;

  const acertouPlacar =
    Number(palpite.placar_mandante) === Number(jogo.placar_mandante) &&
    Number(palpite.placar_visitante) === Number(jogo.placar_visitante);

  return acertouPlacar ? 2 : 1;
}

/**
 * Recalculates all participants' scores from scratch.
 * Returns a new pontuacao object.
 */
export function calcularTodosPontos(data) {
  const RODADAS = ['dezesseis_avos', 'oitavas', 'quartas', 'semi', 'final'];
  const pontuacao = {};

  for (const nome of data.participantes) {
    pontuacao[nome] = { dezesseis_avos: 0, oitavas: 0, quartas: 0, semi: 0, final: 0, total: 0 };

    for (const rodada of RODADAS) {
      const jogos = data.rodadas[rodada]?.jogos ?? [];
      const palpitesRodada = data.palpites[nome]?.[rodada] ?? {};
      let pontosRodada = 0;

      for (const jogo of jogos) {
        const palpite = palpitesRodada[jogo.id];
        const pts = calcularPonto(palpite, jogo);
        if (pts !== null) pontosRodada += pts;
      }

      pontuacao[nome][rodada] = pontosRodada;
      pontuacao[nome].total += pontosRodada;
    }
  }

  return pontuacao;
}
