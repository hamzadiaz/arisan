"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/components/providers/auth-provider";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import {
  CircleDollarSign,
  LayoutDashboard,
  Users,
  PlusCircle,
  User,
  Settings,
  LogOut,
  ShieldCheck,
} from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "My Pools",
    href: "/pools",
    icon: Users,
  },
  {
    name: "Create Pool",
    href: "/pools/create",
    icon: PlusCircle,
  },
];

const secondaryNavigation = [
  {
    name: "Profile",
    href: "/profile",
    icon: User,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { walletAddress, isCustodial, hasWallet } = useWalletMode();

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : "No wallet";

  return (
    <div className="flex h-full flex-col glass border-r border-white/[0.08]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-white/[0.08] px-6">
        <div className="relative">
          <CircleDollarSign className="h-8 w-8 text-primary" />
          <div className="absolute inset-0 bg-primary/30 blur-xl" />
        </div>
        <span className="text-xl font-bold text-gradient">Arisan</span>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                  isActive
                    ? "bg-primary/20 text-primary border border-primary/30 shadow-lg shadow-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300",
                  isActive ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : "bg-white/[0.05]"
                )}>
                  <item.icon className="h-4 w-4" />
                </div>
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="mt-8">
          <p className="px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
            Account
          </p>
          <div className="space-y-1">
            {secondaryNavigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                  )}
                >
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300",
                    isActive ? "bg-primary text-primary-foreground" : "bg-white/[0.05]"
                  )}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      {/* Bottom section */}
      <div className="border-t border-white/[0.08] p-4">
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
            {isCustodial ? <ShieldCheck className="h-5 w-5" /> : <User className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {shortAddress}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
