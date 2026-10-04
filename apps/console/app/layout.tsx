import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import { StoreHydrator } from "@/components/store-hydrator";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });
const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["500"], variable: "--font-serif-face" });

export const metadata: Metadata = {
  title: "Reorder Console",
  description: "Restock email system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${serif.variable}`}>
      <body className="font-sans">
        <StoreHydrator />
        {children}
      </body>
    </html>
  );
}
