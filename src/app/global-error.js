"use client";

/**
 * ipevox — erro no layout raiz
 * =============================================================================
 * O `app/error.js` cobre as páginas, mas não o layout raiz: se a falha acontecer
 * ao montar o `<html>`/`<body>`, só esta fronteira captura.
 *
 * Ela substitui o layout inteiro, então NÃO pode depender de nada do app — nem
 * do `globals.css`, que também é montado pelo layout. Por isso o estilo aqui é
 * inline, e o texto é neutro: se chegamos neste arquivo, não é seguro presumir
 * que qualquer outra parte da aplicação está funcionando.
 */

export default function ErroGlobal({ error, reset }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111827',
          color: '#f3f4f6',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Não foi possível carregar o ipevox
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Se este é um ambiente novo, verifique se o arquivo{' '}
            <code>.env.local</code> existe e está preenchido com as chaves do
            Firebase. Em produção, as mesmas variáveis precisam estar cadastradas
            no painel do provedor.
          </p>
          <p
            style={{
              color: '#6b7280',
              fontSize: '0.75rem',
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              marginBottom: '1.5rem',
              wordBreak: 'break-word',
            }}
          >
            {error?.message ?? 'Erro inesperado.'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
