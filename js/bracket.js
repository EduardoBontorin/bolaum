export const RODADAS = [
  'dezesseis_avos', 'oitavas', 'quartas', 'semi', 'final'
];

export const RODADA_LABELS = {
  dezesseis_avos: '16 Avos de Final',
  oitavas: 'Oitavas de Final',
  quartas: 'Quartas de Final',
  semi: 'Semifinal',
  final: 'Final'
};

// Bracket path: winner of origem_mandante plays winner of origem_visitante.
// dezesseis_avos slots are filled by admin with actual team names.
export const BRACKET_ESTRUTURA = {
  dezesseis_avos: [
    { id: 'R1G01', label_mandante: '1º Grupo A', label_visitante: '2º Grupo B' },
    { id: 'R1G02', label_mandante: '1º Grupo C', label_visitante: '2º Grupo D' },
    { id: 'R1G03', label_mandante: '1º Grupo E', label_visitante: '2º Grupo F' },
    { id: 'R1G04', label_mandante: '1º Grupo G', label_visitante: '2º Grupo H' },
    { id: 'R1G05', label_mandante: '1º Grupo I', label_visitante: '2º Grupo J' },
    { id: 'R1G06', label_mandante: '1º Grupo K', label_visitante: '2º Grupo L' },
    { id: 'R1G07', label_mandante: '2º Grupo A', label_visitante: '1º Grupo B' },
    { id: 'R1G08', label_mandante: '2º Grupo C', label_visitante: '1º Grupo D' },
    { id: 'R1G09', label_mandante: '2º Grupo E', label_visitante: '1º Grupo F' },
    { id: 'R1G10', label_mandante: '2º Grupo G', label_visitante: '1º Grupo H' },
    { id: 'R1G11', label_mandante: '2º Grupo I', label_visitante: '1º Grupo J' },
    { id: 'R1G12', label_mandante: '2º Grupo K', label_visitante: '1º Grupo L' },
    { id: 'R1G13', label_mandante: '3º ABEF',    label_visitante: '3º CDIJ' },
    { id: 'R1G14', label_mandante: '3º GHKL',    label_visitante: '3º ACFG' },
    { id: 'R1G15', label_mandante: '3º BDEH',    label_visitante: '3º IJKL' },
    { id: 'R1G16', label_mandante: '3º ABCD',    label_visitante: '3º EFGH' }
  ],
  oitavas: [
    { id: 'R2G01', origem_mandante: 'R1G01', origem_visitante: 'R1G02' },
    { id: 'R2G02', origem_mandante: 'R1G03', origem_visitante: 'R1G04' },
    { id: 'R2G03', origem_mandante: 'R1G05', origem_visitante: 'R1G06' },
    { id: 'R2G04', origem_mandante: 'R1G07', origem_visitante: 'R1G08' },
    { id: 'R2G05', origem_mandante: 'R1G09', origem_visitante: 'R1G10' },
    { id: 'R2G06', origem_mandante: 'R1G11', origem_visitante: 'R1G12' },
    { id: 'R2G07', origem_mandante: 'R1G13', origem_visitante: 'R1G14' },
    { id: 'R2G08', origem_mandante: 'R1G15', origem_visitante: 'R1G16' }
  ],
  quartas: [
    { id: 'R3G01', origem_mandante: 'R2G01', origem_visitante: 'R2G02' },
    { id: 'R3G02', origem_mandante: 'R2G03', origem_visitante: 'R2G04' },
    { id: 'R3G03', origem_mandante: 'R2G05', origem_visitante: 'R2G06' },
    { id: 'R3G04', origem_mandante: 'R2G07', origem_visitante: 'R2G08' }
  ],
  semi: [
    { id: 'R4G01', origem_mandante: 'R3G01', origem_visitante: 'R3G02' },
    { id: 'R4G02', origem_mandante: 'R3G03', origem_visitante: 'R3G04' }
  ],
  final: [
    { id: 'R5G01', origem_mandante: 'R4G01', origem_visitante: 'R4G02' }
  ]
};
