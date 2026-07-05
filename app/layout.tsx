import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const nunito = localFont({
  src: "./fonts/nunito-latin.woff2",
  weight: "400 800",
  variable: "--font-nunito",
  display: "swap",
});

const notoSansTamil = localFont({
  src: "./fonts/noto-sans-tamil.woff2",
  weight: "400 700",
  variable: "--font-tamil",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Serpent Alphabet",
  description:
    "Learn the Tamil alphabet letter by letter with a friendly snake guide. Trace, pronounce, and master each sound.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Serpent Alphabet",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2E5B3E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${notoSansTamil.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
