"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/providers/auth-provider";
import { useWalletMode } from "@/hooks/use-wallet-mode";
import {
  User,
  Wallet,
  Trophy,
  Star,
  Calendar,
  CheckCircle2,
  Copy,
  ExternalLink,
  Edit,
  ShieldCheck,
} from "lucide-react";

// Placeholder achievements until we have real data
const achievements = [
  { name: "First Pool", description: "Joined your first savings pool", earned: false },
  { name: "Perfect Record", description: "10 on-time payments in a row", earned: false },
  { name: "Pool Creator", description: "Created your first pool", earned: false },
  { name: "Winner", description: "Won your first draw", earned: false },
  { name: "Veteran", description: "Complete 10 pools", earned: false },
  { name: "Community Leader", description: "Have 5 pools with 10+ members", earned: false },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const { walletAddress, isCustodial } = useWalletMode();

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "No wallet connected";
  const reputationScore = user?.reputationScore || 100;
  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Recently";

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
    }
  };

  const openExplorer = () => {
    if (walletAddress) {
      const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
      window.open(`https://explorer.solana.com/address/${walletAddress}?cluster=${network}`, "_blank");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-muted-foreground">
            Manage your profile and view your savings history.
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Edit className="h-4 w-4" />
          Edit Profile
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="text-2xl">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="mt-4 flex items-center gap-2">
                  <h2 className="text-xl font-semibold">{displayName}</h2>
                  {isCustodial && (
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  )}
                </div>
                {email && (
                  <p className="text-sm text-muted-foreground">{email}</p>
                )}

                {/* Wallet Address */}
                <div className="mt-4 w-full">
                  <div className="flex items-center justify-center gap-2 px-3 py-2 bg-muted rounded-lg">
                    {isCustodial ? (
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                    )}
                    <code className="text-sm">{shortAddress}</code>
                    {walletAddress && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyAddress}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openExplorer}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <p className="mt-4 text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Member since {joinedDate}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Reputation Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" />
                Reputation Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">
                  {reputationScore}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Out of 100</p>
                <Progress value={reputationScore} className="h-2 mt-4" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">On-time payments</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pools completed</span>
                  <span className="font-medium">--</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats and Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold">--</div>
                <p className="text-sm text-muted-foreground">Total Pools</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold text-primary">--</div>
                <p className="text-sm text-muted-foreground">Active</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold">-- SOL</div>
                <p className="text-sm text-muted-foreground">Contributed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold text-primary">-- SOL</div>
                <p className="text-sm text-muted-foreground">Won</p>
              </CardContent>
            </Card>
          </div>

          {/* Achievements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Achievements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.name}
                    className={`p-3 rounded-lg border text-center ${
                      achievement.earned
                        ? "bg-primary/5 border-primary/20"
                        : "bg-muted/50 opacity-50"
                    }`}
                  >
                    <div
                      className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                        achievement.earned
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {achievement.earned ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Trophy className="h-4 w-4" />
                      )}
                    </div>
                    <p className="font-medium text-sm">{achievement.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {achievement.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No recent activity</p>
                <p className="text-sm mt-1">Your pool activity will appear here</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
