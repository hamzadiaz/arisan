import type { Metadata, Viewport } from "next";
import { Chivo, Chivo_Mono, Michroma } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SolanaProvider } from "@/components/providers/solana-provider";
import { MobileWalletRegistration } from "@/components/providers/mobile-wallet-registration";
import { Toaster } from "@/components/ui/sonner";
import { Walkthrough } from "@/components/onboarding/walkthrough";
import { BezelDefs } from "@/components/bezel/seal";
import "./globals.css";

// Bezel type: Chivo for the interface, Chivo Mono for figures and addresses,
// Michroma for the small caps labels printed on the dial.
const chivo = Chivo({
  variable: "--font-chivo",
  subsets: ["latin"],
});

const chivoMono = Chivo_Mono({
  variable: "--font-chivo-mono",
  subsets: ["latin"],
});

const michroma = Michroma({
  variable: "--font-michroma",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Arisan - Savings circles on Solana",
  description:
    "Save together with people you trust. Everyone pays in each round, one member takes the pot. Zero interest. You sign from your own wallet.",
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
    { media: "(prefers-color-scheme: light)", color: "#f3f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0d" },
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
      className={`${chivo.variable} ${chivoMono.variable} ${michroma.variable}`}
    >
      <body className="font-sans antialiased">
        <BezelDefs />
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
            <Walkthrough />
          </SolanaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
