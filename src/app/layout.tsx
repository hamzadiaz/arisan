import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SolanaProvider } from "@/components/providers/solana-provider";
import { MobileWalletRegistration } from "@/components/providers/mobile-wallet-registration";
import { Toaster } from "@/components/ui/sonner";
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
  title: "Arisan - Savings circles on Solana",
  description:
    "Save together with people you trust. Everyone pays in each round, one member takes the pot. Zero interest. Your keys stay in your wallet.",
  keywords: [
    "arisan",
    "rotating savings",
    "solana",
    "crypto",
    "savings pool",
    "defi",
    "blockchain",
  ],
  authors: [{ name: "Arisan" }],
  openGraph: {
    title: "Arisan - Savings circles on Solana",
    description:
      "Save together with people you trust. Everyone pays in each round, one member takes the pot.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#030706" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Font variables live on <html> because Tailwind's --font-sans resolves there.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MobileWalletRegistration />
          <SolanaProvider>
            {children}
            <Toaster position="top-center" />
          </SolanaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
