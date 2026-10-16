/**
 * ipevox — schema (reexportação)
 * =============================================================================
 * A definição canônica vive em `shared/schema.mjs`, na raiz do projeto, porque é
 * usada tanto pelo app Next.js quanto pelos scripts da raiz. Manter duas cópias
 * foi exatamente o que produziu a duplicação de `firebase.js` que existia antes.
 *
 * Este arquivo existe apenas para que o app continue importando `@/lib/schema`.
 */

export * from '../../shared/schema.mjs';
