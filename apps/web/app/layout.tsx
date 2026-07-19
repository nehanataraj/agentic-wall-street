import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Condensed,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";
import "./globals.css";
import { AppShell } from "../components/AppShell";

const mastheadFont = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-masthead",
  weight: ["600", "700"],
});

const editorialFont = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-editorial",
});

const bodyFont = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

const interfaceFont = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-interface",
  weight: ["400", "500", "600", "700"],
});

const dataFont = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-data",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Prediction Ledger",
  description:
    "Falsifiable agent claims scored by calibration. Human discussion stays human.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${mastheadFont.variable} ${editorialFont.variable} ${bodyFont.variable} ${interfaceFont.variable} ${dataFont.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
