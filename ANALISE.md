# Análise técnica — ipevox

> Revisão do código em 2026-02. Base: leitura integral dos 18 arquivos-fonte do projeto
> (Next.js 16.2.4 App Router · React 19 · Tailwind 4 · Firebase Web SDK 12 · React-PDF 4).

---

## 1. Retrato do projeto

O ipevox é um sistema de votação para assembleias de condomínio. O fluxo implementado é:

```
Landing (/)  →  Admin (/admin/login → /admin)
                  │  cria assembleia + propostas + opções
                  │  gera QR Code de /checkin/{id}
                  ▼
Morador: /checkin/{id}  →  valida nº da unidade em catalogo_unidades
                           cria sessão em unidades
                           ▼
                        /votacao/{id}  →  uma proposta por tela, voto + confirmar
                           │  grava em votos (addDoc)
                           │  marca votosComputados.{titulo} na sessão
                           ▼
                        /resultados/{id}  →  barras em tempo real + PDF
Admin:   /admin/historico  →  lista, filtra, reabre QR Code, encerra
         /admin/unidades   →  CRUD do catálogo de unidades
```

**Modelo de dados (implícito, 4 coleções):**

| Coleção | Campos | Observações |
|---|---|---|
| `assembleias` | `id` (asb_xxx), `titulo`, `descricao`, `tipo`, `status`, `propostas[]`, `criadoEm` | `propostas[]` é array embutido, não subcoleção |
| `catalogo_unidades` | `numero` (string), `ativo`, `criadoEm` | IDs aleatórios do Firestore |
| `unidades` | `assembleiaId`, `catalogoUnidadeId`, `numero`, `status`, `votosComputados{}`, `criadoEm`, `ultimaAtualizacao` | Sessão de check-in por assembleia |
| `votos` | `assembleiaId`, `propostaId`, `opcao`, `unidadeDocId`, `timestamp` | **`unidadeDocId` quebra o sigilo** |

**Pontos positivos que valem registrar** — a base não é ruim:

- O fluxo principal está completo e é compreensível: criar → distribuir QR → votar → apurar → PDF.
- O check-in já usa `runTransaction` e tem lógica anti-abandono por timeout (10 min).
- O encerramento propaga em tempo real para quem está votando (`onSnapshot` + redirect).
- A assinatura de `votosComputados` impede voto duplicado na mesma proposta.
- Os listeners em tempo real estão com `unsubscribe` no cleanup (memória tratada corretamente).
- A UI é consistente, escura e responsiva; o vocabulário está certo para o domínio.

Os problemas abaixo são, em sua maioria, de **camada de confiança** (não de layout de tela):
falta a fronteira entre o que o cliente pode fazer e o que só o servidor deveria poder fazer.

---

## 2. Bloqueadores — resolver antes de usar em assembleia real

### 2.1 🔴 O Firestore está aberto; toda a autorização é decorativa

Não existe Firebase Authentication em lugar nenhum do projeto, e não há
`firestore.rules` versionado no repositório. Como todo o acesso é feito pelo SDK Web
direto do browser, o modelo de ameaça é:

- `NEXT_PUBLIC_FIREBASE_API_KEY` é **pública por definição** — está no bundle JS.
- Com ela, qualquer pessoa com o link abre o console e escreve direto no banco.
- Nada no código impede: inserir votos falsos, apagar votos, mudar `status` de uma
  assembleia para `encerrada`, criar assembleias, ou desativar unidades.

Sem regras, a aplicação é um formulário com boas intenções. Isso invalida a proposta de
valor inteira: em uma assembleia de condomínio, o resultado precisa ser defensável em ata.

### 2.2 🔴 O PIN do síndico está no bundle do cliente

`src/app/admin/login/page.js:19`

```js
if (pin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
```

O prefixo `NEXT_PUBLIC_` faz o Next.js **embutir o valor literal no JavaScript enviado
ao browser**. O PIN é lido na tela de login ou com um `Ctrl+F` no bundle.

Pior: a sessão é apenas uma flag de `sessionStorage`
(`src/app/admin/page.js:13-18`, `src/app/admin/unidades/page.js:23-28`), e o botão
"Encerrar Votação" chama `updateDoc` direto do cliente
(`src/app/resultados/[id]/page.js:111`). Ou seja: o `isAdmin` controla só a
*visibilidade dos botões*, nunca a *permissão da operação*.

### 2.3 🔴 O sigilo do voto não existe

O produto afirma "Voto 100% secreto" e "Nem o administrador sabe em quem você votou"
(`src/app/page.js:125-129`). O código faz o oposto:

`src/app/votacao/[id]/page.js:153-159`

```js
await addDoc(collection(db, 'votos'), {
  assembleiaId,
  propostaId: propostaAtual.titulo,
  opcao: opcaoSelecionada,
  unidadeDocId: unidadeId,   // ⚠️ liga o voto à unidade
  timestamp: serverTimestamp()
});
```

Cada documento de `votos` carrega `unidadeDocId`, que resolve para o número da unidade
via `unidades.numero`. Uma consulta por `assembleiaId` em `votos` — exatamente a que a
tela de resultados já executa (`src/app/resultados/[id]/page.js:83-91`) — devolve uma
tabela "unidade → opção escolhida". O sigilo é apenas uma promessa de UI.

Esse é o risco mais grave do projeto, inclusive jurídico: uma ata que se baseia em
votação nominal disfarçada de secreta é anulável.

### 2.4 🟠 A "votação rápida" aceita voto em branco

`src/app/admin/page.js:110-116` substitui as propostas pelo título da assembleia, mas
usa `propostas[0].opcoes` — o **estado interno**, não `propostasValidas[0]`. Se o
usuário vier do modo "assembleia" com vários cards e trocar para "rápida", o
`alternarModo` reseta para um card (`page.js:155-159`), então funciona por acaso. Mas se
o primeiro card tiver menos de 2 opções, a validação da linha 119 passa a olhar
`propostasValidas`, que agora é outro objeto — a checagem de "mínimo 2 opções" é
contornada e é possível criar uma votação sem opções válidas.

### 2.5 🟠 Não existe `firestore.rules` nem índices versionados

Consultas compostas já em uso que exigem índice:

- `historico`: `where('status','==',…)` + `orderBy('criadoEm','desc')` (`src/app/admin/historico/page.js:20-22`)
- `votacao`: `where('id','==',…)` + `limit(1)` (`src/app/votacao/[id]/page.js:110-114`)

Sem os índices provisionados no projeto Firebase, o listener falha na primeira execução.
Note que essas consultas **passam hoje** provavelmente porque o índice de campo único
cobre o caso — mas qualquer evolução (adicionar `orderBy` em `titulo`, por exemplo)
quebra em produção, sem aviso no repositório.

---

## 3. Bugs reais confirmados no código

### 3.1 🔴 A retomada de votação conta votos duplicados

`src/app/votacao/[id]/page.js:37-104`

O efeito de carga inicial lê `votosComputados` e tenta achar quais propostas já foram
votadas:

```js
const indicesVotados = [];
propostas.forEach((p, idx) => {          // linha 78
  if (votosComputados[p.titulo]) indicesVotados.push(idx);
});
```

Dois defeitos encadeados:

1. `propostas` aqui é o state do componente, que **ainda é `[]`** neste ponto — o
   `setPropostas(assembleiaData.propostas)` da linha 56 não alterou a variável capturada
   pelo closure. O `forEach` não itera nada.
2. O array de dependências do efeito é `[assembleiaId, router]` (linha 104): `propostas`
   está ausente, então o efeito nunca re-executa quando os dados chegam.

Resultado: `indicesVotados` fica sempre vazio. Quem recarrega a página no meio de uma
assembleia com várias propostas volta para a proposta 1 e **vota de novo**, inflando a
contagem. Isso também anula a proteção "Verifica quais propostas já foram votadas"
(comentário na linha 75) — ela existe no papel, não no comportamento.

### 3.2 🔴 O voto é gravado antes de ser "reservado"; a falha silenciosa duplica

`src/app/votacao/[id]/page.js:153-169` faz duas escritas separadas:

```js
await addDoc(collection(db, 'votos'), { … });          // 1ª escrita
await updateDoc(sessaoRef, {                           // 2ª escrita
  [`votosComputados.${propostaAtual.titulo}`]: true
});
```

Se a segunda falhar (rede caindo no meio da assembleia, regra restritiva futura, conflito),
a exceção cai no `catch` da linha 185 e a UI mostra "Falha ao enviar voto" — **mas o voto
já está contado**, e `votosComputados` continua vazio. O morador tenta de novo: dois votos
no banco, um deles fantasma, sem forma de identificar qual. Não há `writeBatch` nem
transação ligando as duas escritas.

Agravante: a chave é `propostaAtual.titulo` **usada como caminho de campo** do Firestore.
Título com `.` quebra a escrita; título com `/` quebra o caminho; título com espaço
(`"Aprovar reforma da fachada"`) cria nomes de campo com espaço — funcionam, mas são
impossíveis de consultar depois e colidem se dois títulos forem iguais.

### 3.3 🔴 Votos órfãos quando o título da proposta é reutilizado

`src/app/resultados/[id]/page.js:84-91` agrupa por `propostaId`, que é o **título**:

```js
query(collection(db, 'votos'), where('assembleiaId', '==', id))
// …
agrupamento[propostaId][opcao] = …
```

Se duas propostas na mesma assembleia tiverem o mesmo título (nada impede — a validação
em `src/app/admin/page.js:119-123` só checa o número de opções), os votos das duas são
**somados na mesma barra**. E se o admin renomear uma proposta depois de votada, os votos
ficam órfãos: existem no banco e desaparecem do relatório.

A correção é estrutural e simples: gerar `crypto.randomUUID()` (ou um contador) por
proposta no momento da criação e usar esse `propostaId` em todo lugar — voto, agregação,
PDF, chave de `votosComputados`.

### 3.4 🟠 O check-in depende de um índice que pode não existir

`src/app/checkin/[id]/page.js:97-101`

```js
const qSessao = query(
  unidadesRef,
  where('assembleiaId', '==', assembleiaId),
  where('catalogoUnidadeId', '==', unidadeCatalogo.id)
);
```

Consulta composta por igualdade em dois campos. `runTransaction` no SDK Web **falha
imediatamente** com `failed-precondition` se o índice não existir — e ele não está
versionado no repositório. A mensagem exibida será "❌ Falha no check-in: …", sem pista
da causa real. Além disso, o índice pode ser evitado por completo: bastaria usar um ID
determinístico `{assembleiaId}_{numero}` e ler o documento direto (`getDoc`), eliminando
a query, o índice e a corrida.

### 3.5 🟠 A mesma unidade pode votar duas vezes — a transação não protege

A transação em `checkin/page.js:108-166` só é atômica **sobre o documento que ela lê**.
Ela lê um *resultado de query*; duas abas abertas ao mesmo tempo, ambas antes de qualquer
documento existir, veem `snapshot.empty` e **criam duas sessões distintas** para a mesma
unidade (linhas 111-124). Cada sessão passa a ter seu próprio `votosComputados`, e a
unidade vota duas vezes.

Não há `where('numero','==',…)` com unicidade garantida no Firestore — o Firestore não
tem constraint única. A única forma correta é ID determinístico
(`unidades/{assembleiaId}_{numero}`), que torna o `set` idempotente e a corrida impossível.

### 3.6 🟠 "Unidade votando em outro dispositivo" nunca aparece

A mensagem existe e é o texto mais útil da tela (`checkin/page.js:145`), mas é
inalcançável: o filtro em `checkin/page.js:177` procura `'já está votando'`, enquanto a
mensagem lançada na linha 145 diz `"Esta unidade está votando em outro dispositivo."`.
Não há `'já está votando'` na string. O morador recebe o genérico
"❌ Falha no check-in: Esta unidade está votando…" — que, por sorte, ainda informa algo.

Além disso, `runTransaction` reexecuta a função em conflito; erros lançados dentro do
callback chegam embrulhados, então comparações por `error.message.includes(…)` são
frágeis. Use um código de erro tipado (`error.code` / objeto customizado).

### 3.7 🟠 O status da sessão nunca é limpo ao sair

`src/app/votacao/[id]/page.js:341-346` — o botão "Sair da votação" faz
`router.push('/')` e nada mais. A sessão fica `status: 'votando'` e a unidade não
consegue voltar por 10 minutos (`TIMEOUT_MINUTOS`, linha 104), mesmo que a pessoa queira
apenas trocar de aparelho. Um `beforeunload`/`sendBeacon` ou um botão "encerrar minha
sessão" resolveria. Como está, o morador fica trancado para fora da própria votação.

### 3.8 🟡 `assembleia.propostas.length` sem guarda

`src/app/votacao/[id]/page.js:84`

```js
if (indicesVotados.length === assembleiaData.propostas.length) {
```

`propostas` é opcional em qualquer leitura (`assembleiaData.propostas || []` foi usado
duas linhas acima, o que comprova que o autor sabia). Uma assembleia gravada sem o campo
derruba a página com `TypeError` e o usuário fica preso no "Carregando propostas…", porque
a exceção é engolida pelo `catch` da linha 97 que só faz `console.error`.

### 3.9 🟡 Barra de progresso sempre um passo atrás

`src/app/votacao/[id]/page.js:245`

```js
const progresso = ((indiceAtual) / propostas.length) * 100;
```

Na proposta 1 de 3, o progresso mostra **0%**. O correto é `(indiceAtual + 1) / length`.

### 3.10 🟡 Erro de leitura na tela de resultados deixa a página vazia

`src/app/resultados/[id]/page.js:83-99` — se o `onSnapshot` de votos falhar (regra,
índice, offline), o callback de erro só faz `console.error` e `setCarregando(false)`.
A tela renderiza normalmente com **todas as barras em zero**, sem nenhum aviso. Em uma
assembleia, isso é lido como "ninguém votou" — a pior falha possível: silenciosa e
plausível.

---

## 4. Funcionalidades faltantes

### 4.1 Quórum e validade da deliberação

Não há noção de quórum. Uma proposta com 3 votos "Sim" de 59 unidades exibe
`3 (100%)` e barra verde (`resultados/[id]/page.js:234-235`). Em assembleia condominial,
percentual **sobre os votantes** é enganoso: o que vale é o percentual sobre as unidades
aptas. O resultado precisa mostrar simultaneamente `votantes / aptos` e o quórum
atingido, além de registrar a base de cálculo no PDF para a ata.

### 4.2 Voto por procuração (representação)

Condomínios reais votam por procuração. Hoje o modelo permite exatamente um voto por
unidade e nada mais — não há como registrar que a unidade X representou a unidade Y.

### 4.3 Trilha de auditoria

Não existe log de eventos: quem encerrou, quando, quantos votos havia no momento do
encerramento, quem alterou o catálogo de unidades. O PDF é gerado a partir do state da
tela. Para uma ata, é preciso um snapshot imutável da apuração no momento do encerramento.

### 4.4 Reconciliação de votos

A votação é anônima por design (ou deveria ser), então o síndico não consegue responder
"a unidade 16 votou?". A resposta correta hoje só existe porque o sigilo está quebrado.
Falta uma lista de **presença** (quem fez check-in / quem votou em todas as propostas),
sem revelar em que opção — e essa é a informação que a ata realmente exige.

### 4.5 Operação offline

`src/app/checkin/[id]/page.js` e `votacao/[id]/page.js` só fazem `getDocs`/`getDoc` com
`getFirestore(app)`. Não há `enableIndexedDbPersistence`/`persistentLocalCache`. Em salão
de festas com Wi-Fi ruim — o cenário real de uma assembleia — a votação simplesmente não
abre. `enableNetwork`/cache persistente com fila de escrita traria resiliência
considerável por pouquíssimo código.

### 4.6 Sem `error.js`, `not-found.js`, `loading.js`

Nenhuma rota tem tratamento de erro de fronteira. IDs inválidos, rede caída e exceções de
render caem na tela branca padrão do Next.js. Para o público-alvo (moradores, muitos com
pouca familiaridade), isso é uma tela morta.

### 4.7 Sem testes, sem CI, sem tipos

Não há um único teste, nenhum workflow de CI, nenhum `tsconfig.json`. O `jsconfig.json`
tem só o alias `@/*`. Como praticamente todo bug da seção 3 é de **forma de dados**
(título vs. ID, `propostas` possivelmente ausente, chave de campo com espaço), TypeScript
+ um validador de schema seriam o maior retorno por hora investida neste projeto.

---

## 5. Qualidade de código e dependências

### 5.1 Arquivo duplicado: `src/lib/firebase.js` e `src/app/lib/firebase.js`

Os dois arquivos são **byte a byte idênticos**. Todos os imports usam `@/lib/firebase`
(que resolve para `src/lib`), então `src/app/lib/firebase.js` é código morto. Pior: o
`initializeApp` roda no escopo do módulo; se alguém importar o caminho errado em outro
ponto, o Firebase é inicializado duas vezes e o SDK lança
`FirebaseError: Firebase App named '[DEFAULT]' already exists`. Apague `src/app/lib/`.

### 5.2 Nenhum README do projeto

`README.md` é o boilerplate do `create-next-app`, intocado — 36 linhas sobre "Deploy on
Vercel" e nada sobre o ipevox. Falta o essencial: quais variáveis de ambiente existem
(nenhum arquivo `.env.example` no repositório), o significado das 4 coleções, como rodar
o seed, e principalmente **como configurar as regras do Firestore**. Sem isso, o próximo
dev (ou você, em três meses) não tem como saber que falta a camada de segurança.

### 5.3 `@react-pdf/renderer` no bundle inicial da tela de resultados

`src/app/resultados/[id]/page.js:3` importa o componente de PDF no topo, e
`RelatorioPDF.jsx:1` importa `@react-pdf/renderer` — biblioteca pesada. Ela é usada só no
clique de `baixarPDF` (linha 120-134). Um `const { pdf } = await import('@react-pdf/renderer')`
dentro do handler remove dezenas de kB do caminho crítico. Vale o mesmo para
`qrcode.react` em `/admin/historico`.

### 5.4 `README`/UI: funcionalidade morta e affordances falsas

- `src/app/page.js:105-110` — botão "Ver demonstração" sem `onClick`. Não faz nada.
- `src/app/resultados/[id]/page.js:185` e `src/app/admin/page.js:228` — o botão "Sair"
  leva para `/`. Não encerra a sessão de admin (`sessionStorage.removeItem`), então
  "Sair" não sai de nada.
- `src/app/page.js:46-49` — `div` com `onClick` para "voltar ao topo": não é focável,
  não responde a teclado, não tem `role`.
- `src/app/page.js:31-40` — o parallax re-renderiza o componente inteiro (com todo o
  JSX da landing) a cada `mousemove`. Em telas de assembleia com projetor, é desperdício
  puro de CPU. Um `requestAnimationFrame` + `transform` via `ref` resolve.

### 5.5 Classes e markup com defeitos

| Local | Problema |
|---|---|
| `src/app/admin/page.js:253` e `src/app/page.js:124` | `<div className="text-2xl mb-2"></div>` — div vazia (o emoji se perdeu em algum edit). O app tem `Ver demonstração` e cards com ícones faltando |
| `src/app/admin/unidades/page.js:253` | `hover:bg-gray-750` — **essa cor não existe** no Tailwind. Classe morta |
| `src/app/admin/unidades/page.js:81-84` | `criadoEm: new Date().toISOString()` (string) enquanto o resto do app usa `serverTimestamp()`. Mistura tipos → ordenação por data fica impossível |
| `src/app/admin/unidades/page.js:44` | `orderBy('numero','asc')` em campo **string**: "10" vem antes de "2". A lista sai fora de ordem |
| `src/app/admin/unidades/page.js:128-143` | "Cadastrar 1 a 59" faz até **118 round-trips sequenciais** (um `getDocs` + um `addDoc` por número). Com ID determinístico e `writeBatch`, seriam 1-2 operações |
| `src/app/admin/unidades/page.js:121-150` | O número `59` (unidades do condomínio) está **hard-coded na UI** e o resultado do lote, se bem-sucedido, é sinalizado com `setErro('')` (linha 148) — sucesso comunicado pelo canal de erro |
| `src/app/layout.js:22-24` | `icons.icon: '/favicon.png'` aponta para arquivo **inexistente** em `public/`. O único favicon é `src/app/favicon.ico` |
| `src/components/RelatorioPDF.jsx:59` | `new Date(assembleia.criadoEm?.seconds * 1000)` — se `criadoEm` for `undefined`, resulta em `Invalid Date` exibido no relatório |

### 5.6 Padrões de React a corrigir

- **`key={idx}` como regra geral**: `admin/page.js:291`, `votacao/[id]/page.js:281`,
  `resultados/[id]/page.js:223`/`238`, `RelatorioPDF.jsx:24`/`34`. Em listas **mutáveis e
  reordenáveis** (as propostas no admin), o índice como chave faz o React reutilizar o
  nó errado ao remover um card do meio — o clássico "digitei no card 3 e apareceu no 4".
  Precisa de um `id` por proposta (que, de novo, é a correção de 3.3).
- **Mutação de estado in-place**: `admin/page.js:70-74`, `77-84`, `87-91` fazem
  `const novas = [...propostas]; novas[index][campo] = valor;` — o spread é raso e o
  objeto interno é o **mesmo** referenciado pelo state anterior. Funciona por sorte
  (porque o array externo é novo), mas é frágil e inconsistente com o `map` usado em
  `unidades/page.js:100-102`.
- **Lógica duplicada de formulário**: `admin/page.js:328-350` mantém um `<input>` não
  controlado e alcança o valor via `e.target.previousSibling` (linha 343) — acoplamento
  ao DOM que quebra ao reordenar o JSX. Um `useState` local por card resolve.
- **Duas fontes de verdade para os mesmos dados**: em `votacao/[id]/page.js`, o
  `getDocs` inicial (linha 40) e o `onSnapshot` (linha 116) buscam a mesma coleção. Os
  dois competem para fazer `setAssembleia`/`setPropostas`: a resposta atrasada do
  `getDocs` pode sobrescrever dados mais novos do listener. Escolha um.
- **`getDocs` + `snapshot.docs[0]`** repetido em 4 arquivos para resolver
  `where('id','==',id)` — quando o ideal é `idAssembleia` **ser** o ID do documento
  (`doc(db,'assembleias', asb_xxx)`), o que elimina a query, o índice, a ambiguidade e o
  round-trip extra. O `assembleiaDocId` em `resultados/[id]/page.js:23` é exatamente a
  gambiarra que esse design força.
- **`confirm()` e `alert()` nativos** (`historico/page.js:43`, `resultados:109`, `unidades:110`,
  `votacao:195`) ao lado de componentes Tailwind cuidados. Quebra de coerência visual e
  não funciona bem em iOS.

### 5.7 Acessibilidade

- Emojis como única affordance de vários botões (`📊`, `🔒`, `📱`) sem `aria-label` — leitor
  de tela anuncia "gráfico de barras crescentes, botão".
- Os `<label>` de opção de voto (`votacao/[id]/page.js:281-299`) embrulham o input
  (bom!), mas o `h2` da proposta não tem associação (`aria-labelledby`).
- Contraste: `text-gray-500` sobre `bg-gray-800`/`bg-gray-900` (`historico/page.js:101`,
  `unidades:268`) fica abaixo de 4.5:1.
- Modais (`historico/page.js:146-172`, admin QR) não são `role="dialog"`, não prendem
  foco, não fecham com `Esc`.
- Botões de opção de voto não têm estado `:focus-visible` visível.

---

## 6. Roadmap sugerido

### Fase 0 — Tornar o sistema confiável (bloqueia uso real)

1. **Criar `firestore.rules` e versioná-lo.**
   Ponto de partida: `votos` com `create` permitido mas `read` negado ao cliente (a
   apuração passa por uma função); `assembleias`/`catalogo_unidades` com escrita negada
   ao cliente; `read` de `assembleias` liberado para o fluxo de check-in.
2. **Remover `unidadeDocId` de `votos`** e mover a gravação do voto para uma Cloud
   Function (Admin SDK), que valida em transação: unidade existe, está ativa, não votou
   nessa proposta, assembleia ativa — e grava o voto **sem** o vínculo. Isso conserta
   2.1, 2.3 e 3.2 de uma vez.
3. **Trocar o PIN por Firebase Auth** com custom claim `admin` (ou, no mínimo, tirar o
   PIN do `NEXT_PUBLIC_*` e validá-lo no servidor). Proteger as operações de encerrar
   assembleia e gerenciar unidades por regra, não por `sessionStorage`.
4. **`propostaId` estável** (UUID) em vez do título — em voto, agregação, chave de
   `votosComputados` e PDF. Conserta 3.3 e a fragilidade de caminho de campo em 3.2.
5. **ID determinístico de sessão** `unidades/{assembleiaId}_{numero}` — conserta a
   corrida de 3.5 e elimina a query composta de 3.4.

### Fase 1 — Corrigir o que já está implementado

6. Corrigir o efeito de retomada em `votacao/[id]/page.js` (deps + fonte de dados) — 3.1.
7. `writeBatch`/transação ligando voto e `votosComputados` — 3.2.
8. Idempotência: `assembleiaId` com `crypto.randomUUID()`, `setDoc` com ID determinístico
   em vez de `addDoc`.
9. Guardas de `propostas?.length` e erro visível nos listeners — 3.8, 3.10.
10. Limpar sessão ao sair da votação; timeout mais curto com aviso — 3.7.
11. Corrigir progresso (3.9), mensagem de erro do check-in (3.6), `hover:bg-gray-750`,
    favicon, `criadoEm` string vs. timestamp, ordenação numérica de unidades.
12. Apagar `src/app/lib/firebase.js`; criar `.env.example`.

### Fase 2 — Fazer valer a pena em uma assembleia

13. **Painel de quórum**: votantes/aptos, quórum por proposta, base de cálculo explícita.
14. **Snapshot de apuração imutável** no encerramento (o PDF passa a ser gerado do
    snapshot, não do `state` da tela).
15. **Lista de presença** sem revelar o voto — o que a ata realmente pede.
16. **Cache offline persistente** + fila de escrita.
17. `error.js`, `not-found.js`, `loading.js` nas rotas.
18. Substituir `confirm`/`alert` por modais do design system; corrigir acessibilidade
    (foco, `Esc`, `aria`, contraste).
19. `dynamic import` do React-PDF e do pacote de QR.
20. README de verdade: env vars, coleções, regras, seed, deploy.

### Fase 3 — Sustentabilidade

21. **TypeScript** + schemas (`zod`) para as 4 coleções — a maioria dos bugs da seção 3
    é de forma de dados e seria pega em tempo de compilação.
22. Testes: unitários para agregação de votos e cálculo de percentual; de integração para
    o fluxo check-in → voto → retomada (o cenário de 3.1).
23. CI (lint + build + test) no GitHub Actions.
24. Revisar `@react-pdf/renderer` e `firebase` em busca de versões mais leves, ou avaliar
    renderização do PDF no servidor (Route Handler), onde o bundle deixa de importar.
25. Extrair os componentes repetidos: `Card`, `Botão`, `Modal`, `Barra de progresso`,
    `CampoDeTexto` — hoje cada tela reimplementa o mesmo Tailwind com pequenas variações
    (as três telas de admin têm três cabeçalhos diferentes).

---

## 7. Resumo executivo

O ipevox **funciona** no caminho feliz — o fluxo está completo e a UI é melhor que a média
de projetos nesse estágio. O problema não é a ausência de features: é que a aplicação
inteira roda onde o usuário tem controle. Não há servidor, não há regras, não há autenticação,
e o segredo que dá nome ao produto (o voto secreto) não existe no banco de dados.

Em ordem de retorno sobre esforço:

| # | Ação | Esforço | Impacto |
|---|---|---|---|
| 1 | `firestore.rules` mínimas | horas | 🔴 crítico |
| 2 | Tirar `unidadeDocId` de `votos` | horas | 🔴 crítico (é a promessa do produto) |
| 3 | `propostaId` UUID + `assembleiaId` UUID | 1 dia | 🔴 alto |
| 4 | ID determinístico de sessão de unidade | horas | 🟠 alto |
| 5 | PIN fora do `NEXT_PUBLIC_*` + Firebase Auth | 1-2 dias | 🟠 alto |
| 6 | Corrigir efeito de retomada na votação | horas | 🔴 alto |
| 7 | Quórum + snapshot de apuração | 2-3 dias | 🟠 alto (viabiliza a ata) |
| 8 | Lote único no cadastro de unidades | horas | 🟡 médio |
| 9 | Limpeza: arquivo duplicado, README, `.env.example`, acessibilidade | 1 dia | 🟡 médio |
| 10 | TypeScript + testes + CI | 1-2 semanas | 🟢 estrutural |

Os itens 1 a 6 são a diferença entre um protótipo bonito e um sistema que um síndico pode
defender em uma assembleia.
