# ipevox

Sistema de votação para assembleias de condomínio. Votação por QR Code, dois
modos de sigilo (**aberto** e **restrito**) e apuração publicada no encerramento.

Roda **inteiramente no plano gratuito do Firebase**: apenas Firestore,
Authentication e hospedagem do front. Não usa Cloud Functions.

---

## O que este sistema é, e o que ele não é

Esta seção existe porque o projeto já passou por duas mudanças de rumo, e é fácil
encontrar documentação antiga descrevendo recursos que não existem mais.

**O que ele faz:**

- Cadastro de unidades por síndico, com QR Code por assembleia.
- Um voto por unidade por proposta, garantido pelo ID determinístico do documento
  — o próprio banco é a trava, não o código do site.
- Dois modos por assembleia: **aberto** (voto atribuível, qualquer participante
  confere quem votou o quê) e **restrito** (o voto não é exibido ao síndico nem
  aos moradores).
- **Sem placar durante a votação.** Enquanto a assembleia está aberta, só aparece
  quantas unidades já votaram. A contagem por opção existe apenas depois de
  publicada, no encerramento, e é imutável.
- Apuração com quórum e percentual sobre as unidades aptas, mais relatório em PDF.

**O que ele NÃO faz — e é importante saber:**

| Limitação | Por quê |
|---|---|
| **O voto não é cifrado** | Sem servidor, não há onde guardar a chave. O voto fica em texto claro no banco; a proteção é a regra de leitura |
| **O dono do projeto lê os votos pelo console** | O console do Firebase usa credencial de administrador e ignora as regras. Para o síndico e para os moradores, o bloqueio é efetivo |
| **Não há trilha de auditoria** | Sem servidor, nada obriga o cliente a registrar eventos |
| **O total publicado não é conferido pelo banco** | Regra de segurança não consegue contar documentos. A garantia é que o resultado é gravado **uma vez** e nunca muda |
| **A conta de login é criada no console** | Criar usuário exige o SDK de administrador, que só roda em servidor |

Se em algum momento o sigilo criptográfico for indispensável, o caminho é migrar
a lógica de escrita para um servidor confiável (Cloud Functions no plano Blaze,
Google Apps Script ou um VPS). A estrutura de dados atual foi desenhada para essa
migração: bastaria trocar a camada de escrita.

---

## Papéis

| Papel | Como é definido | O que pode |
|---|---|---|
| **Morador** | sessão anônima | votar pelo QR Code |
| **Síndico** | documento em `/admins/{uid}` | criar e encerrar assembleias, unidades, apurar e publicar |
| **Administrador do sistema** | **e-mail na lista dentro de `firestore.rules`** | tudo do síndico + ler os votos individualmente |

### Por que o administrador do sistema é definido por e-mail no arquivo de regras

Sem servidor, um documento de "super admin" no banco seria escrito pelo próprio
cliente — qualquer pessoa poderia gravar `admins_sistema/{seu-uid}` e se
promover. Um e-mail fixado no `firestore.rules` não é editável pelo cliente: só
por quem publica as regras.

**Para trocar o administrador**, edite a lista em `firestore.rules`:

```javascript
function emailsAdminSistema() {
  return [
    'alcirjr11@gmail.com'
  ];
}
```

E publique de novo (`npm run deploy`). A mesma lista existe em `src/lib/auth.js`
(`EMAILS_ADMIN_SISTEMA`) e serve **apenas** para a interface decidir o que
mostrar — quem garante o acesso é a regra. **As duas listas precisam ficar
iguais**, senão a tela vai oferecer o que o banco recusa.

Existem exatamente dois lugares. Está dito aqui porque essa duplicação é uma
armadilha real de manutenção.

---

## Coleções

| Coleção | Conteúdo | Quem lê |
|---|---|---|
| `assembleias/{id}` | dados da assembleia | qualquer autenticado |
| `assembleias/{id}/propostas/{propostaId}` | pauta e opções | qualquer autenticado |
| `catalogo_unidades/{numero}` | unidades (ID = número) | qualquer autenticado |
| `admins/{uid}` | síndicos autorizados | o próprio síndico e o administrador do sistema |
| `controle/sindicos_criados` | marcador que fecha o bootstrap | qualquer autenticado |
| `comprovantes/{asb}~{numero}` | que a unidade participou e quais propostas votou | qualquer autenticado |
| **`votos/{asb}~{proposta}~{numero}`** | **o voto, com unidade e autor** | **só o administrador do sistema** |
| `votos_contagem/{mesmo id}` | só proposta e opção — sem unidade, sem autor, sem horário | operadores (para apurar) |
| `resultados/{asb}` | contagem por opção, publicada uma vez | qualquer autenticado |

O par `votos` / `votos_contagem` é o que resolve uma contradição do projeto: o
síndico precisa **apurar**, mas não pode **ler votos**. O espelho anônimo permite
somar as opções sem saber de quem são. A regra exige que os dois documentos
existam com a mesma opção, então eles não podem divergir sem a escrita ser
recusada.

Limitação honesta desse arranjo: o `tag` no ID é o número da unidade. Quem pode
ler `votos_contagem` descobre **quem participou** (não em que votou), e consegue
perceber a mesma unidade em assembleias diferentes. Para a ata, isso é
exatamente o que se quer registrar.

---

## Configuração

### 1. Dependências

```bash
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local      # Windows: Copy-Item .env.example .env.local
```

Preencha as seis variáveis do Firebase (Console → Configurações do projeto →
Seus apps → Config). Elas são **públicas por definição** — vão no bundle do site.
Quem protege o sistema são as regras do Firestore.

O Next.js lê o `.env.local` apenas na partida: depois de alterá-lo, reinicie o
`npm run dev`.

### 3. Authentication

No Console do Firebase → **Authentication** → *Sign-in method*, ative **dois**
provedores:

- **E-mail/senha** — para o síndico e para o administrador do sistema.
- **Anônimo** — é a sessão do morador. Sem ele, o check-in falha com *"missing or
  insufficient permissions"*.

Depois crie a sua conta em **Authentication → Users → Add user**. Criar usuário
exige o console, porque o SDK de administrador só roda em servidor.

### 4. Publicar as regras

```bash
npm i -g firebase-tools
firebase login
npm run deploy
```

Isso publica apenas `firestore.rules` e os índices — **nada de funções**. É
gratuito em qualquer plano do Firebase.

### 5. Cadastrar as unidades

```bash
npm run seed:unidades            # 1 a 59
npm run seed:unidades -- 1 120   # intervalo explícito
```

Exige uma service account (`GOOGLE_APPLICATION_CREDENTIALS`). Alternativa sem
service account: cadastre pelo painel `/admin/unidades`, que usa o SDK do cliente.

---

## Como usar

1. **Entre** em `/admin/login` com o e-mail que está na lista das regras. Você é
   reconhecido como administrador do sistema.
2. **Cadastre o síndico** (se for usar um) em `/admin/sindicos`: informe o UID
   dele — que aparece em Authentication → Users depois que a conta de login é
   criada no console — mais nome, condomínio e telefone.
3. **Cadastre as unidades** em `/admin/unidades`.
4. **Crie a assembleia** em `/admin`, escolhendo o modo e as propostas.
5. **Exiba o QR Code** no telão. Os moradores entram por ele.
6. **Acompanhe a participação** em `/resultados/{id}` — só a contagem de quantas
   unidades votaram, sem placar.
7. **Encerre e publique** a apuração no mesmo lugar. A partir daí, todos veem a
   contagem por opção e o resultado.

---

## Operação

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run lint` | análise estática |
| `npm test` | testes do schema e da apuração |
| `npm run deploy` | publica as regras do Firestore |
| `npm run emuladores` | emuladores de Firestore e Auth |

### Testes

```bash
npm test
```

Cobrem as decisões que não podem regredir em silêncio: o ID determinístico que
garante um voto por unidade, a normalização do número da unidade (que impedia
votar duas vezes digitando `"016"`), o percentual com base de cálculo explícita
(3 votos de 59 unidades não é "100%"), a ordenação numérica das unidades, e a
separação entre o voto e o espelho de contagem — que é o que sustenta o sigilo
perante o síndico.

---

## Limitações conhecidas e o que fazer a respeito

- **Verificação das regras.** As regras do Firestore nunca foram testadas no
  emulador (exige Java instalado). Elas foram revisadas por leitura e as
  invariantes das quais dependem têm teste unitário, mas regra de segurança só se
  prova executando:

  ```bash
  npm run emuladores
  ```

  Com o SDK do cliente, tente: criar um voto direto, ler `/votos` sem ser o
  administrador do sistema, e alterar o catálogo sem ser operador. Os três devem
  ser negados.

- **A tela de auditoria** ainda mostra a trilha de eventos, que não existe neste
  modelo. A aba de votos individuais funciona; a de trilha explica a ausência.

- **Voto por procuração** (representação) não é suportado: hoje é um voto por
  unidade, sem exceção.

- **Cache offline** não está habilitado. Salão de festas com Wi-Fi ruim é o
  cenário real de uma assembleia, e depende de conexão.

- **TypeScript** não foi adotado. A maior parte dos defeitos corrigidos neste
  projeto era de forma de dados, e tipos os pegariam em tempo de compilação.
