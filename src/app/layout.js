import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'ipevox - Votação Condominial',
  description: 'Assembleias mais ágeis, com sigilo declarado e contagem publicada no encerramento.',
  // Extras para ficar bonito ao compartilhar no WhatsApp/Telegram:
  openGraph: {
    title: 'ipevox',
    description: 'Votação condominial com sigilo declarado: aberta ou restrita.',
  },
  // O `icons` apontava para `/favicon.png`, arquivo que não existe em /public —
  // o Next.js procurava em vão e servia o 404 no lugar do ícone. A convenção de
  // arquivo do App Router já resolve isto com `src/app/favicon.ico`, que existe
  // no projeto, então a declaração foi removida em vez de corrigida.
}

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
