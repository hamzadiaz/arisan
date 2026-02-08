"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "@/components/providers/auth-provider";
import { PremiumButton } from "@/components/ui/premium-button";
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/ui/glass-card";
import { GradientText } from "@/components/ui/gradient-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { CircleDollarSign, Wallet, Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const router = useRouter();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { isAuthenticated, isLoading: authLoading, signInWithEmail, signUpWithEmail } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign in form state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Sign up form state
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [createCustodialWallet, setCreateCustodialWallet] = useState(true); // Default to true for web2 users

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleWalletConnect = () => {
    setError(null);
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await signInWithEmail(signInEmail, signInPassword);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (err: any) {
      const errorMessage = getFirebaseErrorMessage(err.code);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (signUpPassword.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    try {
      // Create custodial wallet if checkbox is checked and no web3 wallet connected
      const shouldCreateWallet = createCustodialWallet && !connected;
      await signUpWithEmail(signUpEmail, signUpPassword, signUpName, shouldCreateWallet);
      toast.success(shouldCreateWallet
        ? "Account created with wallet!"
        : "Account created successfully!"
      );
      router.push("/dashboard");
    } catch (err: any) {
      const errorMessage = getFirebaseErrorMessage(err.code);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get user-friendly error messages
  const getFirebaseErrorMessage = (code: string): string => {
    switch (code) {
      case "auth/email-already-in-use":
        return "This email is already registered. Please sign in.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/operation-not-allowed":
        return "Email/password sign-in is not enabled.";
      case "auth/weak-password":
        return "Password is too weak. Please use a stronger password.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/user-not-found":
        return "No account found with this email.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/invalid-credential":
        return "Invalid email or password.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      default:
        return "An error occurred. Please try again.";
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10">
        <div className="bg-grid opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[128px] animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-emerald-500/15 rounded-full blur-[100px]" />
        <div className="vignette" />
      </div>

      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
        Back to Home
      </Link>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10 animate-fade-in-up">
          <div className="relative">
            <CircleDollarSign className="h-12 w-12 text-primary" />
            <div className="absolute inset-0 bg-primary/30 blur-xl" />
          </div>
          <span className="text-3xl font-bold text-gradient">Arisan</span>
        </div>

        <GlassCard variant="premium" className="animate-fade-in-up [animation-delay:100ms]">
          <GlassCardHeader className="text-center pb-6">
            <GlassCardTitle className="text-2xl">
              Welcome to <GradientText variant="aurora" animate>Arisan</GradientText>
            </GlassCardTitle>
            <p className="text-muted-foreground mt-2">
              Connect your wallet or sign in with email to get started
            </p>
          </GlassCardHeader>
          <GlassCardContent>
            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="mb-6 border-destructive/30 bg-destructive/10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Wallet Connect */}
            <div className="space-y-6">
              <PremiumButton
                variant={connected ? "default" : "outline"}
                className="w-full"
                size="lg"
                onClick={handleWalletConnect}
                disabled={isLoading}
              >
                {connected ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Connected: {publicKey?.toBase58().slice(0, 4)}...
                    {publicKey?.toBase58().slice(-4)}
                  </>
                ) : (
                  <>
                    <Wallet className="h-5 w-5" />
                    Connect Solana Wallet
                  </>
                )}
              </PremiumButton>

              {connected && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm text-primary">
                    Wallet connected! Create an account below to save your profile.
                  </p>
                </div>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="bg-white/[0.08]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent px-4 text-muted-foreground backdrop-blur-sm">
                    {connected ? "Create account to continue" : "Or continue with"}
                  </span>
                </div>
              </div>

              {/* Email Auth */}
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 glass border border-white/[0.08] p-1 rounded-xl">
                  <TabsTrigger
                    value="signin"
                    className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Sign Up
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="space-y-4 mt-6">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email" className="text-sm font-medium">
                        Email
                      </Label>
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-primary/50 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password" className="text-sm font-medium">
                        Password
                      </Label>
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="Enter your password"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-primary/50 rounded-xl"
                      />
                    </div>
                    <PremiumButton type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <Mail className="h-5 w-5" />
                          Sign In
                        </>
                      )}
                    </PremiumButton>
                  </form>
                  <div className="text-center">
                    <Link
                      href="/auth/forgot-password"
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Forgot your password?
                    </Link>
                  </div>
                </TabsContent>

                <TabsContent value="signup" className="space-y-4 mt-6">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name" className="text-sm font-medium">
                        Display Name
                      </Label>
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Your name"
                        value={signUpName}
                        onChange={(e) => setSignUpName(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-primary/50 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email" className="text-sm font-medium">
                        Email
                      </Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-primary/50 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password" className="text-sm font-medium">
                        Password
                      </Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Create a password (min 6 characters)"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={isLoading}
                        className="h-12 bg-white/[0.03] border-white/[0.08] focus:border-primary/50 rounded-xl"
                      />
                    </div>

                    {/* Custodial Wallet Option - only show if no web3 wallet connected */}
                    {!connected && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                        <Checkbox
                          id="custodial-wallet"
                          checked={createCustodialWallet}
                          onCheckedChange={(checked) => setCreateCustodialWallet(checked === true)}
                          disabled={isLoading}
                          className="mt-0.5"
                        />
                        <div className="space-y-1">
                          <Label
                            htmlFor="custodial-wallet"
                            className="text-sm font-medium cursor-pointer flex items-center gap-2"
                          >
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Create a wallet for me
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            No crypto wallet? We&apos;ll create a secure wallet for you.
                            You can fund it with a credit card and start participating immediately.
                          </p>
                        </div>
                      </div>
                    )}

                    <PremiumButton type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <Mail className="h-5 w-5" />
                          Create Account
                        </>
                      )}
                    </PremiumButton>
                  </form>
                </TabsContent>
              </Tabs>
            </div>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </p>
          </GlassCardContent>
        </GlassCard>

        {/* Wallet info */}
        <div className="mt-8 text-center text-sm text-muted-foreground animate-fade-in-up [animation-delay:200ms]">
          <p className="mb-2">Supported wallets:</p>
          <div className="flex items-center justify-center gap-4">
            <span className="px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs">
              Phantom
            </span>
            <span className="px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs">
              Solflare
            </span>
            <span className="px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs">
              Torus
            </span>
            <span className="px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs">
              Ledger
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
