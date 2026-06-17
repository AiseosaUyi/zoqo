import type { Metadata } from "next";
import { Inter, Bebas_Neue } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZOQO — Trade the next 5 minutes of Bitcoin",
  description:
    "ZOQO is a real-time prediction market for short-term Bitcoin moves. Bet Up or Down on rolling 5-minute markets.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${bebas.variable} h-full`}>
      <head />
      <body className="min-h-full">{children}</body>
    </html>
  );
}
