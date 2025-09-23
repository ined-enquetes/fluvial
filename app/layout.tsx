import type { Metadata } from "next";
import { Geist, Geist_Mono, Maven_Pro } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Metadata Froms",
  description: "Survey for getting metdata forms",
};

const mavenPro = Maven_Pro({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${mavenPro.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
