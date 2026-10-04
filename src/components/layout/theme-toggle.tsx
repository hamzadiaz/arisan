"use client";

import { useTheme } from "next-themes";
import { Icon } from "@/components/bezel/icons";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  // Read what is on screen, not React state: `theme` is "system" or undefined until
  // mounted, which made the first tap depend on page state.
  const toggle = () => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
    >
      <Icon name="sun" className="size-[19px] rotate-0 scale-100 transition-transform duration-300 dark:-rotate-90 dark:scale-0" />
      <Icon name="moon" className="absolute size-[19px] rotate-90 scale-0 transition-transform duration-300 dark:rotate-0 dark:scale-100" />
    </button>
  );
}
