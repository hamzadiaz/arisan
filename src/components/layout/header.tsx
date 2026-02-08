"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShinyButton } from "@/components/ui/shiny-button";
import { ThemeToggle } from "./theme-toggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Wallet, CircleDollarSign } from "lucide-react";
import { useState, useEffect } from "react";

const navigation = [
  { name: "How it Works", href: "#how-it-works" },
  { name: "Features", href: "#features" },
  { name: "FAQ", href: "#faq" },
];

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "glass border-b border-white/[0.08] shadow-lg shadow-black/10"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative">
            <CircleDollarSign className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
            <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
          <span className="text-xl font-bold text-gradient">Arisan</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="relative px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-300 hover:text-foreground group"
            >
              <span className="relative z-10">{item.name}</span>
              <span className="absolute inset-0 rounded-lg bg-white/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Button
            variant="ghost"
            asChild
            className="text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
          >
            <Link href="/auth">Sign In</Link>
          </Button>
          <Link href="/auth">
            <ShinyButton size="sm" className="gap-2">
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </ShinyButton>
          </Link>
        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-white/[0.05]"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[300px] glass border-l border-white/[0.08]"
            >
              <div className="flex items-center gap-2 mb-8">
                <CircleDollarSign className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold text-gradient">Arisan</span>
              </div>
              <nav className="flex flex-col gap-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 text-lg font-medium text-muted-foreground transition-all duration-300 hover:text-foreground hover:bg-white/[0.05] rounded-lg"
                  >
                    {item.name}
                  </Link>
                ))}
                <div className="flex flex-col gap-3 mt-6 pt-6 border-t border-white/[0.08]">
                  <Button
                    variant="outline"
                    asChild
                    className="w-full glass border-white/10 hover:border-primary/50"
                  >
                    <Link href="/auth">Sign In</Link>
                  </Button>
                  <Link href="/auth" className="w-full">
                    <ShinyButton className="w-full gap-2">
                      <Wallet className="h-4 w-4" />
                      Connect Wallet
                    </ShinyButton>
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
