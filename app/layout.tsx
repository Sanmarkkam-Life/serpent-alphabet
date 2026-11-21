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
  title: "TamiLearn",
  description:
    "Learn the Tamil alphabet with the Serpent Alphabet: a friendly snake for every letter. Free, offered by Sanmarkkam Life.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TamiLearn",
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
