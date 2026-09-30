#!/usr/bin/env node
/**
 * ipevox — seed do catálogo de unidades
 * =============================================================================
 * Cadastra as unidades do condomínio em `catalogo_unidades`.
 *
 * Por que usa o Admin SDK, e não o SDK Web:
 *   As regras do Firestore NEGAM escrita no catálogo pelo cliente — é assim que
 *   o sistema impede alguém de desativar ou apagar as unidades por conta própria.
 *   Um script rodando com SDK Web pararia em "permission-denied" no dia em que as
 *   regras fossem publicadas. Com Admin SDK, o script é privilegiado e funciona
 *   antes e depois do deploy das regras.
 *
 * Mudanças em relação à versão anterior:
 *   - O ID do documento é o PRÓPRIO número normalizado. Antes era aleatório e o
 *     número ficava só em um campo, obrigando uma consulta `where('numero','==')`
 *     em cada check-in — consulta que exigia índice e falhava silenciosamente.
 *   - O intervalo é configurável (o 59 estava fixo no código).
 *   - Uma leitura da coleção + um batch, em vez de até 118 idas ao servidor.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-unidades.mjs          # 1 a 59
 *   node --env-file=.env.local scripts/seed-unidades.mjs 1 120
 *
 * Observação: para o uso do dia a dia, prefira /admin/unidades — que passa pela
 * Cloud Function e deixa registro na trilha de auditoria. Este script é para o
 * provisionamento inicial.
 */

import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { COLECOES, idUnidadeCatalogo, normalizarNumeroUnidade } from '../shared/schema.mjs';

const de = Number(process.argv[2] ?? 1);
const ate = Number(process.argv[3] ?? 59);

if (!Number.isFinite(de) || !Number.isFinite(ate) || ate < de) {
  console.error('Intervalo inválido. Uso: scripts/seed-unidades.mjs <de> <ate>');
  process.exit(1);
}
if (ate - de > 5000) {
  console.error('Intervalo muito grande. Cadastre no máximo 5000 por execução.');
  process.exit(1);
}

const credencialJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
const credencialArquivo = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const usandoEmulador = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!usandoEmulador && !credencialArquivo && !credencialJson) {
  console.error('');
  console.error('Nenhuma credencial encontrada.');
  console.error('Defina GOOGLE_APPLICATION_CREDENTIALS (caminho do service account)');
  console.error('ou aponte para o emulador com FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.');
  console.error('');
  process.exit(1);
}

const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp({
      credential: credencialJson
        ? cert(JSON.parse(credencialJson))
        : credencialArquivo
          ? cert(JSON.parse(readFileSync(credencialArquivo, 'utf8')))
          : undefined,
    });

const db = getFirestore(app);

async function principal() {
  const catalogo = db.collection(COLECOES.CATALOGO_UNIDADES);

  // Uma leitura da coleção inteira (o Admin SDK pagina automaticamente até 1 MiB
  // por resposta, mas para algumas centenas de unidades resolve em uma ida).
  const existentes = await catalogo.get();
  const jaTem = new Set(existentes.docs.map((d) => d.id));

  console.log(`Catálogo atual: ${jaTem.size} unidade(s).`);
  console.log(`Cadastrando ${de} a ${ate}…`);

  let lote = db.batch();
  let noLote = 0;
  let criadas = 0;
  let ignoradas = 0;

  for (let i = de; i <= ate; i += 1) {
    const numero = normalizarNumeroUnidade(String(i));
    if (!numero) continue;

    if (jaTem.has(numero)) {
      ignoradas += 1;
      continue;
    }

    // `create` em vez de `set`: se o número passar a existir entre a leitura e o
    // commit, o batch falha em vez de sobrescrever em silêncio.
    lote.create(catalogo.doc(idUnidadeCatalogo(numero)), {
      numero,
      ativo: true,
      criadoEm: FieldValue.serverTimestamp(),
      criadoPor: 'script:seed-unidades',
    });
    noLote += 1;
    criadas += 1;

    if (noLote === 500) {
      await lote.commit();
      lote = db.batch();
      noLote = 0;
    }
  }

  if (noLote > 0) await lote.commit();

  console.log(`\n${criadas} unidade(s) criada(s), ${ignoradas} já existia(m).`);
}

principal()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('Falha no seed:', erro?.message ?? erro);
    process.exit(1);
  });
