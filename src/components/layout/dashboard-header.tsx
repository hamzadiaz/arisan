"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardSidebar } from "./dashboard-sidebar";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/components/providers/auth-provider";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import { Bell, Menu, Search, User, Settings, LogOut, Wallet, Trophy, CreditCard, Users, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";

interface DashboardHeaderProps {
  title?: string;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "draw_winner":
      return <Trophy className="h-4 w-4 text-primary" />;
    case "payment_due":
    case "payment_received":
      return <CreditCard className="h-4 w-4 text-blue-400" />;
    case "member_joined":
      return <Users className="h-4 w-4 text-emerald-400" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
};

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Shorten wallet address
const shortenAddress = (address: string) =>
  `${address.slice(0, 4)}...${address.slice(-4)}`;

export function DashboardHeader({ title }: DashboardHeaderProps) {
  const { user, signOut } = useAuth();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const { hasWallet, walletAddress, walletPublicKey, isCustodial, isWeb3 } = useWalletMode();

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Use the active wallet public key (web3 or custodial)
  const activePublicKey = walletPublicKey || publicKey;

  // Notifications will come from on-chain events in the future
  // For now, showing empty state
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: Date;
  }>>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Fetch wallet balance
  const fetchBalance = useCallback(async () => {
    if (!activePublicKey) {
      setWalletBalance(null);
      return;
    }

    setLoadingBalance(true);
    try {
      const balance = await connection.getBalance(activePublicKey);
      setWalletBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      setWalletBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [connection, activePublicKey]);

  useEffect(() => {
    fetchBalance();

    // Subscribe to balance changes
    if (!activePublicKey) return;

    const subscriptionId = connection.onAccountChange(
      activePublicKey,
      (accountInfo) => {
        setWalletBalance(accountInfo.lamports / LAMPORTS_PER_SOL);
      },
      "confirmed"
    );

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [fetchBalance, connection, activePublicKey]);

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const handleDisconnect = async () => {
    await disconnect();
    signOut();
  };

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 glass border-b border-white/[0.08] px-4 md:px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden hover:bg-white/[0.05] rounded-xl">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72 border-r border-white/[0.08]">
          <DashboardSidebar />
        </SheetContent>
      </Sheet>

      {/* Page title */}
      {title && (
        <h1 className="hidden md:block text-lg font-semibold">{title}</h1>
      )}

      {/* Search */}
      <div className="flex-1 md:flex-initial md:w-64 lg:w-96">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search pools..."
            className="pl-9 bg-white/[0.03] border-white/[0.08] focus:border-primary/50 focus:bg-white/[0.05] rounded-xl transition-all"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Wallet balance / Connect button */}
        {hasWallet && walletAddress ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="hidden md:flex gap-2 glass border-white/10 hover:border-primary/50 hover:bg-primary/10 rounded-xl"
              >
                <div className="h-6 w-6 rounded-lg bg-primary/20 flex items-center justify-center">
                  {isCustodial ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                {loadingBalance ? (
                  <Skeleton className="h-4 w-16" />
                ) : (
                  <span className="font-semibold">
                    {walletBalance !== null ? `${walletBalance.toFixed(2)} SOL` : "-- SOL"}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-background border rounded-xl">
              <DropdownMenuLabel className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                    {isCustodial ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : (
                      <Wallet className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">
                      {walletBalance !== null ? `${walletBalance.toFixed(4)} SOL` : "Loading..."}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-normal text-muted-foreground font-mono">
                        {shortenAddress(walletAddress)}
                      </span>
                      {isCustodial && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/30 text-primary">
                          Custodial
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isCustodial && (
                <DropdownMenuItem asChild className="rounded-lg hover:bg-white/[0.05] cursor-pointer">
                  <Link href="/dashboard/wallet">
                    <CreditCard className="mr-2 h-4 w-4 text-primary" />
                    Fund Wallet
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="rounded-lg hover:bg-white/[0.05] cursor-pointer">
                <a
                  href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4 text-primary" />
                  View on Explorer
                </a>
              </DropdownMenuItem>
              {isWeb3 && (
                <DropdownMenuItem
                  className="text-destructive rounded-lg hover:bg-destructive/10 cursor-pointer"
                  onClick={handleDisconnect}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Disconnect Wallet
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="hidden md:flex gap-2">
            <Button
              variant="outline"
              className="gap-2 glass border-white/10 hover:border-primary/50 hover:bg-primary/10 rounded-xl"
              onClick={() => setVisible(true)}
            >
              <div className="h-6 w-6 rounded-lg bg-primary/20 flex items-center justify-center">
                <Wallet className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="font-semibold">Connect</span>
            </Button>
            <Button
              variant="ghost"
              className="glass border-white/10 hover:border-primary/50 rounded-xl"
              asChild
            >
              <Link href="/auth">Sign In</Link>
            </Button>
          </div>
        )}

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative hover:bg-white/[0.05] rounded-xl"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 bg-background border rounded-xl"
          >
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-primary hover:bg-transparent"
                  onClick={markAllAsRead}
                >
                  Mark all as read
                </Button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.map((notification) => (
                  <DropdownMenuItem
                    key={notification.id}
                    className={`flex items-start gap-3 p-3 cursor-pointer rounded-lg ${
                      !notification.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{notification.title}</p>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeAgo(notification.createdAt)}
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-primary cursor-pointer">
              <Link href="/notifications">View all notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-white/[0.05] rounded-xl">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30">
                <User className="h-4 w-4" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-background border rounded-xl"
          >
            <DropdownMenuLabel className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold">{user?.displayName || "User"}</span>
                  <span className="text-xs font-normal text-muted-foreground truncate max-w-[140px]">
                    {hasWallet && walletAddress
                      ? shortenAddress(walletAddress)
                      : user?.email || "Not connected"}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="rounded-lg hover:bg-white/[0.05] cursor-pointer">
              <Link href="/profile">
                <User className="mr-2 h-4 w-4 text-primary" />
                Profile
              </Link>
            </DropdownMenuItem>
            {isCustodial && (
              <DropdownMenuItem asChild className="rounded-lg hover:bg-white/[0.05] cursor-pointer">
                <Link href="/dashboard/wallet">
                  <Wallet className="mr-2 h-4 w-4 text-primary" />
                  Wallet
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="rounded-lg hover:bg-white/[0.05] cursor-pointer">
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4 text-primary" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isWeb3 ? (
              <DropdownMenuItem
                className="text-destructive rounded-lg hover:bg-destructive/10 cursor-pointer"
                onClick={handleDisconnect}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Disconnect & Sign Out
              </DropdownMenuItem>
            ) : user ? (
              <DropdownMenuItem
                className="text-destructive rounded-lg hover:bg-destructive/10 cursor-pointer"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="rounded-lg hover:bg-white/[0.05] cursor-pointer"
                onClick={() => setVisible(true)}
              >
                <Wallet className="mr-2 h-4 w-4 text-primary" />
                Connect Wallet
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
