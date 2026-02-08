import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SolanaProvider } from "@/components/providers/solana-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
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
  title: "Arisan - Trustless Rotating Savings on Solana",
  description:
    "Join peer-to-peer rotating savings pools on Solana. Contribute monthly, win the pot fairly via blockchain. Zero-interest, transparent, trustless.",
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
    title: "Arisan - Trustless Rotating Savings on Solana",
    description:
      "Join peer-to-peer rotating savings pools on Solana. Contribute monthly, win the pot fairly via blockchain.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen overflow-hidden`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SolanaProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </SolanaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
