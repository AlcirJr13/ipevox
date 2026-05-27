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
  description: 'Assembleias mais ágeis, votos secretos e resultados em tempo real.',
  // Extras para ficar bonito ao compartilhar no WhatsApp/Telegram:
  openGraph: {
    title: 'ipevox',
    description: 'Votação condominial simplificada.',
  },
  icons: {
    icon: '/favicon.png',
  },
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
