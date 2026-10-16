# ipevox — SPEC

> Documento único que consolida a **análise técnica** (revisão de 2026-02) e o
> **plano de melhorias** (2026-10) em um só lugar, com o **status** de cada item.
>
> **Base de código:** `main` @ `035a962` (`release`), versão `0.3.0`.
> **Origem:** fusão de `ANALISE.md` + `MELHORIAS.md` (ambos substituídos por este arquivo).

## Legenda de status

| Símbolo | Significado |
|---|---|
| ✅ FEITO | Implementado no código atual. |
| 🟡 PARCIAL | Implementado em parte; falta um pedaço. |
| ❌ NÃO FEITO | Ainda pendente. |
| ➖ N/A | Não se aplica: o modelo mudou e o item deixou de fazer sentido. |
| 🔴 NOVO | Problema descoberto agora, que não constava na análise antiga. |

## 1. O que o sistema é hoje (resumo)

- Sistema de votação para assembleias de condomínio, **100% no plano gratuito do
  Firebase** (Firestore + Auth + Hosting). **Não usa Cloud Functions.**
- Dois modos por assembleia: **aberto** (voto atribuível) e **fechado/restrito**
  (voto não exibido ao síndico nem ao morador).
- **Sem placar durante a votação**; a contagem por opção só existe após o
  encerramento, gravada **uma vez** e imutável em `resultados/{id}`.
- Papéis: **morador** (sessão anônima), **síndico** (`/admins/{uid}`) e
  **administrador do sistema** (e-mail na lista em `firestore.rules`).
- A autoridade de segurança está inteiramente em `firestore.rules`.
- Comparado à revisão de 2026-02, o projeto foi **reescrito**: saíram o PIN, o
  `unidadeDocId` e a ausência de regras/índices; entraram UUID de proposta, ID
  determinístico, `writeBatch`, quórum e snapshot de apuração.

---

## 2. Placar: o que foi feito x o que não foi

### 2.1 Bloqueadores da análise antiga

| # | Item (ANALISE.md) | Status | Onde / observação |
|---|---|---|---|
| 2.1 | Firestore aberto, sem regras | ✅ FEITO | `firestore.rules` versionado; autoridade migrada para as regras |
| 2.2 | PIN do síndico no bundle (`NEXT_PUBLIC_ADMIN_PIN`) | ✅ FEITO | Login agora é Firebase Auth e-mail/senha (`src/app/admin/login/page.js`) |
| 2.3 | Sigilo do voto não existia (`votos.unidadeDocId`) | 🟡 PARCIAL | `unidadeDocId` removido; `/votos` só o admin lê. **Mas o ID do voto/espelho embute o número da unidade** — ver P0-01 (novo) |
| 2.4 | "Votação rápida" aceitava voto em branco | ➖ N/A | O "modo rápido" foi removido do painel |
| 2.5 | Sem `firestore.rules` nem índices versionados | ✅ FEITO | Ambos existem; índices órfãos restantes → P1-03 |

### 2.2 Bugs confirmados na análise antiga

| # | Item | Status | Onde / observação |
|---|---|---|---|
| 3.1 | Retomada conta votos duplicados | ✅ FEITO | Retomada vem de `comprovante.votouEm` do servidor (`votacao/[id]/page.js:127-136`) |
| 3.2 | Voto gravado antes de "reservado" (2 escritas) | ✅ FEITO | `writeBatch` único: voto + espelho + comprovante (`api.js:625-651`) |
| 3.3 | Votos órfãos por título de proposta | ✅ FEITO | `propostaId` é UUID imutável (`schema.mjs:novoPropostaId`) |
| 3.4 | Check-in depende de índice/query composta | ✅ FEITO | Comprovante por ID determinístico + `getDoc`; catálogo por igualdade de campo único (`api.js:531-565`) |
| 3.5 | Mesma unidade vota duas vezes (transação) | ✅ FEITO | ID determinístico `asb~numero` é a trava (`api.js:531`) |
| 3.6 | Mensagem "votando em outro dispositivo" inalcançável | ➖ N/A | Fluxo de check-in reescrito; status tipado (`status: 'votando'/'votado'`) |
| 3.7 | Status da sessão nunca limpo ao sair | 🟡 PARCIAL | `sairDaVotacao` limpa só o local; servidor libera por timeout (`votacao/[id]/page.js:272-278`). Sem `beforeunload`/`sendBeacon` |
| 3.8 | `propostas.length` sem guarda | ✅ FEITO | `lerPropostas` + guarda de lista vazia (`votacao/[id]/page.js:110`) |
| 3.9 | Barra de progresso um passo atrás | ✅ FEITO | `numVotadas / total` (`votacao/[id]/page.js:443`) |
| 3.10 | Erro de leitura deixa resultados vazios | 🟡 PARCIAL | Erro de associação exibido; falha do listener de `/votos` ainda só faz `console.error` (`resultados/[id]/page.js:146`) |

### 2.3 Funcionalidades faltantes da análise antiga

| # | Item | Status | Onde / observação |
|---|---|---|---|
| 4.1 | Quórum e base de cálculo | ✅ FEITO | `apurarProposta` (percentual sobre aptas) + cards de quórum na UI |
| 4.2 | Voto por procuração | ❌ NÃO FEITO | Backlog estrutural |
| 4.3 | Trilha de auditoria | ➖ N/A | Removida por design; ausência documentada no README e no `listarAuditoria` |
| 4.4 | Reconciliação / lista de presença | 🟡 PARCIAL | `comprovantes` dão participação; não há lista de presença explícita |
| 4.5 | Operação offline (cache persistente) | ❌ NÃO FEITO | Sem `persistentLocalCache`/`enableIndexedDbPersistence` |
| 4.6 | `error.js` / `not-found.js` / `loading.js` | 🟡 PARCIAL | `error.js` e `global-error.js` existem; faltam `not-found.js` e `loading.js` |
| 4.7 | Testes / CI / tipos | 🟡 PARCIAL | Testes existem (`npm test`); **sem CI e sem TypeScript** |

### 2.4 Qualidade de código da análise antiga

| # | Item | Status | Onde / observação |
|---|---|---|---|
| 5.1 | `src/app/lib/firebase.js` duplicado | 🟡 PARCIAL | Virou stub `export {}`, mas o arquivo **continua versionado** → P2-01 |
| 5.2 | Sem README real | ✅ FEITO | `README.md` completo (papéis, coleções, setup, limitações) |
| 5.3 | React-PDF no bundle inicial | ✅ FEITO | `dynamic import` no handler (`resultados/[id]/page.js:204-209`) |
| 5.4 | Affordances mortas / parallax com re-render | ✅ FEITO | Parallax com `requestAnimationFrame` + refs (`page.js:9-52`); botões ligados |
| 5.5 | Defeitos de markup/classes | ✅ FEITO | `gray-750` e `orderBy` string removidos; lote único; favicon resolvido (`layout.js:22-25`) |
| 5.6 | Padrões de React (key={idx}, mutação, `previousSibling`, 2 fontes de verdade, `confirm/alert`) | ✅ FEITO | `map`/ID por proposta; `CampoNovaOpcao`; `ModalConfirmacao` no lugar de `confirm/alert` |
| 5.7 | Acessibilidade (modais, foco, `Esc`, `aria`) | 🟡 PARCIAL | `Modais.jsx` com `role="dialog"`/`aria-modal`/`Esc`; ainda há emojis como sinal nas telas de resultado |

---

## 3. O que FALTA (itens em aberto, priorizado)

### 3.1 P0 — Integridade e conformidade

#### [ ] P0-01 🔴 NOVO — O espelho anônimo não é anônimo (sigilo quebrado perante o síndico)

**Problema:** `votos_contagem` existe para o síndico **apurar sem ler votos
individuais**. Mas o ID do documento e o campo `tag` embutem o **número da
unidade** (`asb~proposta~numero`), e cada documento guarda `{ propostaId, opcao }`.
Quem lê `votos_contagem` (o síndico/operador) consegue montar, no console,
`unidade → opção escolhida` por proposta. Isso contradiz o README (que afirma que
o leitor descobre "quem participou, não em que votou") e o rótulo "sigilosa" da UI.

**Evidências:**
- `src/lib/api.js:637-642` — grava `{ assembleiaId, propostaId, tag, opcao }` em
  `votos_contagem`, com `tag = número da unidade`.
- `src/lib/api.js:623` — `votoId = idVoto(assembleiaId, propostaId, tag)`, e o
  mesmo `votoId` é usado como ID de `votos_contagem`.
- `shared/schema.mjs:48-56` — o comentário diz "sem número de unidade", o que é
  falso na prática.
- `README.md:101-104` — afirma que só se descobre a participação, não a opção.
- `src/app/resultados/[id]/page.js:307,667` — UI chama o modo de "sigilosa".

**Ação (opções):**
- (a) **Não usar o número** no ID/`tag` de `votos_contagem` — guardar só
  `propostaId/opcao` sem qualquer vínculo com a unidade; ou
- (b) assumir e documentar que o síndico vê a tabela completa (mudaria a promessa
  do produto e o texto do README/telas).

**Critério de aceite:** nenhum leitor de `votos_contagem` consegue associar opção
a unidade; README, schema e textos da UI coerentes com o comportamento real.

#### [ ] P0-02 — Copy de sigilo anuncia cifra/auditoria inexistentes

**Problema:** a UI e o PDF ainda afirmam que o voto é **cifrado (AES-256-GCM)**,
"selado", com "abertura formal registrada em trilha de auditoria". Nada disso
existe: o voto fica em texto claro e a auditoria é um stub vazio.

**Evidências:**
- `src/components/SeloModo.jsx:22` — "Votos cifrados no banco. Leitura exige
  abertura formal registrada."
- `src/components/RelatorioPDF.jsx:219` — "Votação fechada (voto selado)"; `:242,411` — "selados".
- `src/app/admin/historico/page.js:201` — "cifrado e só uma abertura registrada em auditoria o revela".
- `src/app/votacao/[id]/page.js:369-388,523-530` — "cifrados"/"recibo"/"abertura formal".
- `src/app/admin/auditoria/page.js:7-11,406,613` — texto sobre criptograma/ilegibilidade.
- Contradição interna: `shared/schema.mjs:95` ("Votação fechada") x comentário `:84-86` ("restrita").

**Ação:** padronizar para **"voto restrito"**; remover menções a cifra, "selado",
"abertura formal" e "trilha de auditoria".

**Critério de aceite:** zero ocorrências de "cifrad/selad/AES/HMAC/abertura
formal/trilha de auditoria" em texto voltado ao usuário; os 4 pontos que exibem o
modo dizem a mesma coisa.

### 3.2 P1 — Consistência e limpeza

#### [ ] P1-01 — Recibo de voto é código morto

**Problema:** `votar()` nunca devolve `recibo` (`api.js:653` retorna só
`{ votosRegistrados, votoId }`), então `resposta.recibo` é sempre `undefined` e a
seção "Guarde o seu recibo" mostra sempre "Nenhum recibo encontrado".

**Evidências:** `src/app/votacao/[id]/page.js:220-221,369-411`; `src/lib/recibo.js`.

**Ação:** remover a seção de recibo e `src/lib/recibo.js` (ou implementar recibo
honesto, sem cripto).

#### [ ] P1-02 — Código morto / exports órfãos

Sem consumidor: `obterFunctions` (`src/lib/firebase.js:156`), `contarVotos`
(`src/lib/data.js:166`), `identificadorDaUnidade` (`src/lib/auth.js:287`),
`promoverSuperAdmin` (`src/lib/api.js:943`), e no schema `idContagem`
(`:304`), `idParticipacao` (`:309`), `codificarOpcao` (`:318`), `CRYPTO` (`:355`),
`envelopeVotoSelado` (`:387`), `ACOES_AUDITORIA` (`:133`). Verificar também
`montarApuracaoDeResultado` (`data.js:377`), `escutarContagem` (`:448`),
`montarApuracao` (`:478`).

**Ação:** remover o que não tem consumidor; marcar `@deprecated` o que ficar por
compatibilidade.

#### [ ] P1-03 — Índices para coleções que não existem

`firestore.indexes.json` declara índices para `apuracao` (`:19-26`) e `auditoria`
(`:35-42`), coleções inexistentes no modelo atual. Remover e republicar.

#### [ ] P1-04 — Comentários stale sobre "Cloud Functions"/HMAC

- `shared/schema.mjs:6,326,399` e a seção `:340-396` (cripto).
- `.env.example` — seção 4 (`IPEVOX_KEK`/`IPEVOX_HASH_KEY`,
  `firebase functions:secrets:set`) e `npm run chave:gerar` (script inexistente).
- `scripts/seed-unidades.mjs:25-27` ("passa pela Cloud Function").
- `src/lib/sessao.js:9` e `src/app/checkin/[id]/page.js:119` ("tag HMAC"), quando
  a `tag` é o próprio número (`checkin/[id]/page.js:110`).
- Vários cabeçalhos de tela (`admin/page.js:8-11`, `checkin/[id]/page.js:12-13`,
  `votacao/[id]/page.js:28-31`) afirmam operações em "Cloud Functions".

### 3.3 P2 — Polimento e documentação

#### [ ] P2-01 — Arquivos legados versionados
- `src/app/admin/page.js.mangled` (cópia antiga, rastreada no git).
- `src/app/lib/firebase.js` (stub `export {}`).
Remover ambos (`git rm`).

#### [ ] P2-02 — Duplicação no `data.js`
`data.js:261,284` normaliza número à mão e `data.js:116` monta o ID do comprovante
por template, em vez de usar `normalizarNumeroUnidade`/`idComprovante` do schema.

#### [ ] P2-03 — Docstring de teste desatualizada
`tests/schema.test.mjs` cita `npm --prefix functions test`; o correto é `npm test`.

#### [ ] P2-04 — `.env.example` referencia recursos inexistentes
Seções 4 e a menção a "Cloud Functions" na seção 1 (`:49`).

#### [ ] P2-05 — Cobertura de testes das regras do Firestore
`README.md:209-220` admite que as regras nunca foram testadas no emulador (exige
Java). Adicionar um script de verificação no emulador.

### 3.4 Backlog estrutural (itens grandes, sem urgência imediata)

- [ ] **Voto por procuração** (representação de unidade).
- [ ] **Cache offline persistente** + fila de escrita (Wi-Fi ruim em salão).
- [ ] **`not-found.js` e `loading.js`** nas rotas.
- [ ] **TypeScript** + validação de schema (`zod`) — a maioria dos bugs históricos
  era de forma de dados; tipos pegaríamos em compilação.
- [ ] **CI** (lint + build + test) no GitHub Actions.
- [ ] **Extrair componentes** repetidos (`Card`, `Botão`, `Modal`,
  `BarraDeProgresso`) — as telas de admin têm cabeçalhos divergentes.
- [ ] **Acessibilidade**: substituir emojis-sinal por ícones com `aria-label` nas
  telas de resultado; revisar contraste `text-gray-500`/`bg-gray-800`.

---

## 4. Decisão pendente (bloqueia P0-02)

O modo `FECHADA` **não cifra** o voto: `votar()` grava `opcao` em texto claro
(`api.js:637`). A proteção real é a regra de leitura de `/votos`. Portanto:

- **(A) Ajustar a linguagem** para "voto restrito" (não exige servidor). **Recomendado.**
- **(B) Reintroduzir criptografia de verdade**: só com servidor confiável (Cloud
  Functions no Blaze, Apps Script ou VPS) — muda o modelo de custo.

> P0-01 (espelho anônimo) é independente e deve ser tratado mesmo na opção (A).

---

## 5. Definition of Done (global)

- [ ] `npm run lint` sem erros.
- [ ] `npm test` verde.
- [ ] Nenhum **leitor de `votos_contagem`** consegue associar opção a unidade (P0-01).
- [ ] Nada voltado ao usuário afirma cifra/auditoria/HMAC/Functions inexistentes.
- [ ] Sem arquivos legados (`*.mangled`, `firebase.js` duplicado) nem exports órfãos.
- [ ] `README.md`, `SPEC.md` e comentários consistentes com o modelo real.
