# Design: Login por usuário, palpites self-serve e Firebase

**Data:** 2026-06-25  
**Status:** Em revisão  
**Substitui:** `2026-06-22-bolao-copa-design.md` (arquitetura de dados)

---

## Visão Geral

Evolução do bolão Copa 2026 de um sistema manual (admin entra tudo, palpites no localStorage, ciclo import/export JSON + commit) para um sistema self-serve com persistência real no Firebase Firestore.

Cada participante faz login com nome + senha e cadastra seus próprios palpites diretamente. O admin só precisa cadastrar os times classificados, o horário de cada rodada e os resultados após os jogos. O sistema faz o resto.

**Hospedagem:** GitHub Pages (continua estático — Firebase SDK via CDN no browser).

---

## Arquitetura

### Persistência
Todo o estado migra do `data.json` + `localStorage` para o **Firebase Firestore**. O `data.json` é removido do projeto.

### Autenticação
Sem Firebase Authentication. Login é feito por comparação direta no JS:
1. Buscar `/usuarios/{nome}` no Firestore
2. Comparar campo `senha` (texto plano)
3. Se válido: salvar `{ nome, isAdmin }` no `sessionStorage`

Sessão expira ao fechar o browser. Não há tokens, cookies nem refresh.

### Regras do Firestore
Leitura e escrita abertas (`allow read, write: if true`). A "segurança" é apenas a tela de login no JS — adequado para bolão informal entre amigos.

---

## Modelo de Dados (Firestore)

### `/config/app`
```json
{ "rodada_atual": "dezesseis_avos" }
```

### `/usuarios/{nome}`
```json
{
  "nome": "Eduardo",
  "senha": "1234",
  "isAdmin": false
}
```
O admin tem `isAdmin: true`. Dois perfis existentes: um admin, um ou mais usuários comuns.

### `/rodadas/{rodadaId}`
`rodadaId` ∈ `dezesseis_avos | oitavas | quartas | semi | final`
```json
{
  "status": "aberta",
  "horario_abertura": "2026-07-16T14:00:00-03:00",
  "jogos": [
    {
      "id": "A1",
      "mandante": "Brasil",
      "visitante": "México",
      "placar_mandante": null,
      "placar_visitante": null,
      "resultado": null,
      "penaltis": false
    }
  ]
}
```
`status` ∈ `nao_iniciada | aberta | fechada | concluida`  
`penaltis: true` quando o resultado real foi decidido nos pênaltis (empate no tempo normal).

### `/palpites/{nome}`
```json
{
  "dezesseis_avos": {
    "A1": {
      "placar_mandante": 1,
      "placar_visitante": 1,
      "passou": "Brasil"
    }
  }
}
```
`passou` é sempre quem o usuário acha que vai avançar — se palpitou empate, é quem ele escolheu nos pênaltis.

### `/pontuacao/{nome}`
```json
{
  "dezesseis_avos": 3,
  "oitavas": 0,
  "quartas": 0,
  "semi": 0,
  "final": 0,
  "total": 3
}
```

---

## Regras de Pontuação

| Situação | Pontos |
|---|---|
| Placar exato + acertou quem avançou | 2 |
| Só acertou quem avançou (placar errado) | 1 |
| Errou quem avançou | 0 |

Empate com pênaltis: o campo `passou` armazena quem o usuário escolheu para passar. A comparação usa `resultado` do jogo (quem efetivamente avançou). Não há pontuação extra por acertar que o jogo foi a pênaltis.

---

## Telas

### Login (`index.html` — estado inicial)
- Campo "Nome" + campo "Senha"
- Botão "Entrar"
- Erro inline se credenciais inválidas ("Nome ou senha incorretos")
- Se `isAdmin: true`: link "Painel Admin" aparece no header após login

### Site Público — abas

#### Aba "Chaveamento"
Sem mudança funcional. Lê `/rodadas/*` do Firestore em vez de `data.json`.

#### Aba "Palpitar"
- Lista os jogos da `rodada_atual` com status `aberta`
- Exibe data/hora de início da rodada (`horario_abertura`)
- **Bloqueio automático:** se `horario_abertura` estiver definido e `Date.now() >= horario_abertura - 1h`, campos desabilitados com aviso "Palpites encerrados — jogos começam em breve". Se `horario_abertura` não estiver definido, palpites ficam abertos enquanto o status for `aberta`.
- Por jogo: input placar mandante + input placar visitante
- Se `placar_mandante === placar_visitante` (ambos preenchidos): aparece select "Quem passa nos pênaltis?" com os dois times
- Botão "Salvar palpites" → grava em `/palpites/{nome}` no Firestore
- Ao abrir a aba: palpites já salvos carregam automaticamente
- Rodada `fechada` ou `concluida`: mensagem "Rodada encerrada" sem form

#### Aba "Palpites" *(nova)*
Dois modos alternados por botões no topo: **Por jogo** / **Por participante**.

**Visibilidade:**
- Rodada `aberta`: participante comum vê **apenas os próprios** palpites (dos outros: "—"). Admin vê todos sempre.
- Rodada `fechada` ou `concluida`: todos os palpites visíveis para todos

**Modo "Por jogo":**
- Select para escolher o jogo
- Tabela: Participante | Placar | Quem avança
- Destaque visual em quem acertou (quando resultado disponível)

**Modo "Por participante":**
- Select para escolher o participante
- Lista todos os jogos da rodada atual com o palpite daquele participante
- Admin vê todos; usuário comum vê qualquer participante (após rodada fechar)

#### Aba "Classificação"
Sem mudança funcional. Lê `/pontuacao/*` do Firestore.

---

### Painel Admin (`admin.html`)
Redireciona para `index.html` se não houver sessão ativa ou se `isAdmin` não for `true`.

#### Seção "Usuários"
- Lista participantes cadastrados (nome, isAdmin badge)
- Formulário: nome + senha → botão "Adicionar participante"
- Botão remover por participante (remove usuário, palpites e pontuação)

#### Seção "Rodada"
- Status e nome da rodada atual
- Campo `horario_abertura` (datetime-local input)
- Formulário com os slots de jogos: campos mandante + visitante
- Na dezesseis_avos: 16 slots com labels do chaveamento oficial Copa 2026
- Nas rodadas seguintes: slots com origem ("Vencedor de A1" etc.)
- Botões: Salvar times | Abrir rodada | Fechar rodada | Avançar para próxima

#### Seção "Resultados"
- Jogos da rodada com status `aberta` ou `fechada`
- Por jogo: placar mandante + placar visitante
- Se `placar_mandante === placar_visitante`: checkbox "Decisão nos pênaltis?" + select "Quem avançou?"
- Se placar diferente: só select "Quem avançou?"
- Botão "Salvar resultados"
- Botão "Calcular pontos" → recalcula `/pontuacao/*`, status da rodada → `concluida`

---

## Fluxo por Rodada

1. Admin cadastra times nos jogos + define `horario_abertura` em "Rodada"
2. Admin clica "Abrir rodada" → `status = aberta`, Firestore atualizado instantaneamente
3. Participantes acessam, fazem login, palpitam até 1h antes do `horario_abertura`
4. Campos bloqueiam automaticamente 1h antes
5. Admin pode fechar manualmente se quiser
6. Jogos acontecem
7. Admin insere resultados em "Resultados" → salva no Firestore
8. Admin clica "Calcular pontos" → pontuação gravada, rodada → `concluida`
9. Admin abre próxima rodada com os times que avançaram
10. Classificação e aba "Palpites" atualizam em tempo real para todos

---

## Arquivos

### Novos
| Arquivo | Responsabilidade |
|---|---|
| `js/firebase.js` | Config do SDK Firebase + funções utilitárias (getDoc, setDoc, updateDoc) |
| `js/auth.js` | Login, logout, verificar sessão, guard de rota |

### Modificados
| Arquivo | O que muda |
|---|---|
| `index.html` | Login vira nome+senha; aba "Palpites" adicionada |
| `js/app.js` | Troca `fetch(data.json)` por Firestore; lógica de empate; aba Palpites; bloqueio por horário |
| `admin.html` | Remove seções "Dados" e "Palpites"; adiciona "Usuários"; campo horario_abertura na Rodada |
| `js/admin.js` | Troca localStorage por Firestore; gestão de usuários; horario_abertura; pênaltis nos resultados |
| `js/scoring.js` | Ajuste mínimo: campo `passou` vs `resultado` (já compatível) |
| `css/style.css` | Estilos: campo senha, select pênaltis, tabela palpites por jogo, guard admin |

### Removidos
| Arquivo | Motivo |
|---|---|
| `data.json` | Substituído pelo Firestore |

### Sem mudança
- `js/bracket.js` — estrutura do chaveamento não muda

---

## Fora do Escopo

- Firebase Authentication (e-mail/senha, tokens JWT)
- Regras de segurança granulares no Firestore
- Notificações em tempo real com `onSnapshot` (leitura pontual é suficiente)
- Jogo pelo 3º lugar
- Fase de grupos
