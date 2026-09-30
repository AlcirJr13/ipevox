"use client";

/**
 * ipevox — ícones
 * =============================================================================
 * A versão anterior repetia <svg> inline em cada tela (o mesmo ícone de seta
 * aparecia em dois arquivos, com path copiado) e usava emoji como única
 * affordance em vários botões — o que um leitor de tela anuncia como "gráfico
 * de barras crescentes, botão".
 *
 * Aqui cada ícone é um componente, herda `currentColor` e recebe tamanho. Ícones
 * puramente decorativos ficam com `aria-hidden`; quando o ícone é a única
 * informação do botão, o rótulo acessível vem do `aria-label` do próprio botão.
 */

const BASE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  viewBox: '0 0 24 24',
};

function Svg({ children, tamanho = 20, className = '', ...resto }) {
  return (
    <svg
      {...BASE}
      width={tamanho}
      height={tamanho}
      className={className}
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  );
}

export function IconeCadeado(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconeCadeadoAberto(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.9-.9" />
    </Svg>
  );
}

export function IconeOlho(props) {
  return (
    <Svg {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconeEscudo(props) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3Z" />
    </Svg>
  );
}

export function IconeSeta(props) {
  return (
    <Svg {...props}>
      <path d="M13 7l5 5-5 5M6 12h12" />
    </Svg>
  );
}

export function IconeSetaEsquerda(props) {
  return (
    <Svg {...props}>
      <path d="M11 7l-5 5 5 5M18 12H6" />
    </Svg>
  );
}

export function IconeCheck(props) {
  return (
    <Svg {...props}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Svg>
  );
}

export function IconeX(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconeMais(props) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconeCasa(props) {
  return (
    <Svg {...props}>
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </Svg>
  );
}

export function IconeGrafico(props) {
  return (
    <Svg {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  );
}

export function IconeDocumento(props) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </Svg>
  );
}

export function IconeQrCode(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h7" />
    </Svg>
  );
}

export function IconeAlerta(props) {
  return (
    <Svg {...props}>
      <path d="M12 3l9.5 17H2.5L12 3Z" />
      <path d="M12 9v5M12 17.5v.01" />
    </Svg>
  );
}

export function IconeArvore(props) {
  return (
    <Svg {...props}>
      <path d="M12 3l5 6h-3l4 5h-4l3 4H7l3-4H6l4-5H7l5-6Z" />
      <path d="M12 18v3" />
    </Svg>
  );
}

export function IconeSair(props) {
  return (
    <Svg {...props}>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </Svg>
  );
}

export function IconeRecarregar(props) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </Svg>
  );
}

export function IconeLupa(props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

export function IconeLixeira(props) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

