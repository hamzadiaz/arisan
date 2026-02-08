"use client";

import { Hero } from "@/components/sections/hero";
import { Footer } from "@/components/layout/footer";
import { PremiumButton } from "@/components/ui/premium-button";
import { PremiumCard, FeatureCard, TestimonialCard, StepCard } from "@/components/ui/premium-card";
import { GlassCard } from "@/components/ui/glass-card";
import { GradientText } from "@/components/ui/gradient-text";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Wallet,
  Users,
  Shield,
  Shuffle,
  Lock,
  Zap,
  Globe,
  MessageSquare,
  CircleDollarSign,
} from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Trustless & Secure",
    description:
      "Smart contracts enforce all rules. Funds are held in escrow, not by any central party. Fully audited code.",
  },
  {
    icon: Shuffle,
    title: "Verifiable Randomness",
    description:
      "Winner selection uses Solana's VRF for provably fair and transparent draws every round.",
  },
  {
    icon: Lock,
    title: "Stake Protection",
    description:
      "Members stake deposits upfront. Miss a payment? Automatic penalties protect the pool.",
  },
  {
    icon: Users,
    title: "Social Accountability",
    description:
      "Reputation scores, member voting, and transparent payment history keep everyone honest.",
  },
  {
    icon: Zap,
    title: "Instant Settlement",
    description:
      "Winners receive funds immediately via Solana's fast, low-cost transactions.",
  },
  {
    icon: Globe,
    title: "Global Access",
    description:
      "Join from anywhere. Just connect your Solana wallet to start saving with friends worldwide.",
  },
];

const howItWorks = [
  {
    step: 1,
    title: "Create or Join a Pool",
    description:
      "Start a new savings pool with friends or join an existing one via invite link. Set the monthly amount and duration.",
  },
  {
    step: 2,
    title: "Deposit Your Stake",
    description:
      "Lock your initial stake in the smart contract. This ensures commitment and protects against ghosting.",
  },
  {
    step: 3,
    title: "Monthly Contributions",
    description:
      "Everyone contributes the agreed amount each month. Payments are tracked on-chain for full transparency.",
  },
  {
    step: 4,
    title: "Fair Winner Selection",
    description:
      "Each round, a winner is randomly selected using verifiable randomness. Everyone wins exactly once.",
  },
  {
    step: 5,
    title: "Instant Payout",
    description:
      "Winners receive the entire pool amount instantly to their wallet. No waiting, no middlemen.",
  },
];

const faqs = [
  {
    question: "What is Arisan?",
    answer:
      "Arisan is a traditional rotating savings and credit association (ROSCA) brought to the blockchain. It's a peer-to-peer savings system where a group of people contribute a fixed amount regularly, and each period, one member receives the entire pot. This continues until everyone has won once.",
  },
  {
    question: "How does winner selection work?",
    answer:
      "Winners are selected using Solana's Verifiable Random Function (VRF), which generates provably fair random numbers on-chain. This means no one can manipulate who wins - it's completely transparent and verifiable by anyone.",
  },
  {
    question: "What happens if someone misses a payment?",
    answer:
      "If a member misses a payment, the smart contract automatically applies a penalty from their staked deposit. Repeated misses can result in removal from the pool through member voting. This protects committed members.",
  },
  {
    question: "Is my money safe?",
    answer:
      "Yes. All funds are held in audited smart contracts on Solana, not by any central party. The code is open-source and has been professionally audited. Only the pool rules, enforced by code, determine how funds move.",
  },
  {
    question: "What wallets are supported?",
    answer:
      "Arisan supports all major Solana wallets including Phantom, Solflare, Backpack, and any wallet compatible with the Solana Wallet Adapter standard.",
  },
  {
    question: "Are there any fees?",
    answer:
      "Arisan charges a small platform fee (1-2%) only when you win the pot. You also pay standard Solana network fees for transactions, which are typically fractions of a cent.",
  },
  {
    question: "Can I leave a pool early?",
    answer:
      "If you haven't won yet, you can request to leave and forfeit your stake deposit. If you've already won, you must complete your remaining payments. This ensures fairness to all members.",
  },
];

export default function Home() {
  return (
    <div className="h-screen overflow-y-auto flex flex-col bg-[#050505]">
      {/* Hero Section with 3D Effects */}
      <Hero />

      {/* Rest of the page content */}
      <div className="relative">
        {/* Background Effects */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="bg-grid opacity-20" />
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[128px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[100px]" />
          <div className="vignette" />
        </div>

        {/* How it Works Section */}
        <section id="how-it-works" className="py-24 md:py-32 relative bg-[#050505]">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center mb-20">
              <Badge variant="outline" className="glass mb-6 border-primary/30">
                Simple Process
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-white">
                How <GradientText variant="default">Arisan</GradientText> Works
              </h2>
              <p className="mt-6 text-lg text-slate-400">
                A simple, transparent process that brings traditional rotating
                savings to the blockchain.
              </p>
            </div>

            <div className="relative max-w-4xl mx-auto">
              {/* Connection line */}
              <div className="absolute left-8 md:left-1/2 top-0 h-full w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent hidden sm:block md:-translate-x-px" />

              <div className="space-y-8">
                {howItWorks.map((item, index) => (
                  <div
                    key={item.step}
                    className="relative"
                  >
                    <div className={`flex flex-col md:flex-row md:items-center gap-6 ${
                      index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                    }`}>
                      {/* Step card */}
                      <div className={`flex-shrink-0 ${index % 2 === 0 ? "md:text-right md:pr-8" : "md:text-left md:pl-8"} md:w-1/2`}>
                        <PremiumCard cornerAccents>
                          <div className="p-6">
                            <div className="flex items-center gap-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-black font-bold text-xl shadow-lg shadow-primary/30">
                                {item.step}
                              </div>
                              <div className="text-left">
                                <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                                <p className="mt-2 text-slate-400 text-sm">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        </PremiumCard>
                      </div>

                      {/* Center dot for desktop */}
                      <div className="absolute left-8 md:left-1/2 top-8 md:top-1/2 -translate-x-1/2 md:-translate-y-1/2 hidden sm:block">
                        <div className="h-4 w-4 rounded-full bg-primary shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                      </div>

                      {/* Empty space for alternating layout */}
                      <div className="hidden md:block md:w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 md:py-32 relative bg-[#050505] overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

          {/* Animated grid background */}
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: `linear-gradient(rgba(52, 211, 153, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }} />

          {/* Floating nodes effect with CSS */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 left-[10%] w-2 h-2 bg-primary/40 rounded-full animate-pulse" />
            <div className="absolute top-40 left-[25%] w-1.5 h-1.5 bg-primary/30 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
            <div className="absolute top-60 left-[15%] w-1 h-1 bg-emerald-400/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute top-32 right-[20%] w-2 h-2 bg-primary/30 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
            <div className="absolute top-52 right-[10%] w-1.5 h-1.5 bg-emerald-400/40 rounded-full animate-pulse" style={{ animationDelay: '0.7s' }} />
            <div className="absolute bottom-40 left-[20%] w-1.5 h-1.5 bg-primary/40 rounded-full animate-pulse" style={{ animationDelay: '1.2s' }} />
            <div className="absolute bottom-20 right-[25%] w-2 h-2 bg-emerald-400/30 rounded-full animate-pulse" style={{ animationDelay: '0.9s' }} />
            <div className="absolute bottom-60 right-[15%] w-1 h-1 bg-primary/40 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            {/* Connection lines */}
            <svg className="absolute inset-0 w-full h-full opacity-20">
              <line x1="10%" y1="15%" x2="25%" y2="30%" stroke="rgba(52, 211, 153, 0.3)" strokeWidth="1" />
              <line x1="25%" y1="30%" x2="15%" y2="45%" stroke="rgba(52, 211, 153, 0.2)" strokeWidth="1" />
              <line x1="80%" y1="20%" x2="90%" y2="35%" stroke="rgba(52, 211, 153, 0.3)" strokeWidth="1" />
              <line x1="80%" y1="70%" x2="75%" y2="85%" stroke="rgba(52, 211, 153, 0.2)" strokeWidth="1" />
              <line x1="20%" y1="75%" x2="25%" y2="90%" stroke="rgba(52, 211, 153, 0.3)" strokeWidth="1" />
            </svg>
          </div>

          <div className="container relative z-10">
            <div className="mx-auto max-w-2xl text-center mb-20">
              <Badge variant="outline" className="glass mb-6 border-primary/30">
                <Shield className="h-3.5 w-3.5 mr-2" />
                Why Arisan
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-white">
                Why Choose{" "}
                <GradientText variant="aurora" animate>Arisan</GradientText>?
              </h2>
              <p className="mt-6 text-lg text-slate-400">
                Built for security, transparency, and ease of use. Everything
                you need for trustless group savings.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <FeatureCard
                  key={feature.title}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  index={index}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="py-24 md:py-32 relative bg-[#050505]">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center mb-20">
              <Badge variant="outline" className="glass mb-6 border-primary/30">
                <Users className="h-3.5 w-3.5 mr-2" />
                Testimonials
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-white">
                Trusted by{" "}
                <GradientText variant="default">Communities</GradientText>
              </h2>
              <p className="mt-6 text-lg text-slate-400">
                Join thousands of members saving together on Arisan.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  quote:
                    "Arisan made it so easy to organize savings with my family abroad. The transparency is amazing - everyone can see exactly where the money is.",
                  author: "Maria S.",
                  role: "Pool Organizer",
                },
                {
                  quote:
                    "I've been part of traditional arisans for years. This blockchain version removes all the trust issues. The smart contract handles everything.",
                  author: "Ahmad K.",
                  role: "Member since 2024",
                },
                {
                  quote:
                    "The verifiable randomness is what sold me. No more arguments about who wins next - it's all provably fair on-chain.",
                  author: "Jessica L.",
                  role: "Community Leader",
                },
              ].map((testimonial, i) => (
                <TestimonialCard
                  key={i}
                  quote={testimonial.quote}
                  author={testimonial.author}
                  role={testimonial.role}
                  index={i}
                />
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 md:py-32 relative bg-[#050505]">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

          <div className="container relative z-10">
            <div className="mx-auto max-w-2xl text-center mb-20">
              <Badge variant="outline" className="glass mb-6 border-primary/30">
                <MessageSquare className="h-3.5 w-3.5 mr-2" />
                FAQ
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-white">
                Frequently Asked{" "}
                <GradientText variant="aurora" animate>Questions</GradientText>
              </h2>
              <p className="mt-6 text-lg text-slate-400">
                Everything you need to know about Arisan and rotating savings
                pools.
              </p>
            </div>

            <div className="mx-auto max-w-3xl">
              <PremiumCard>
                <div className="overflow-hidden rounded-2xl">
                  <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq, index) => (
                      <AccordionItem
                        key={index}
                        value={`item-${index}`}
                        className="border-white/[0.08] px-6"
                      >
                        <AccordionTrigger className="text-left text-white hover:text-primary py-6">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-slate-400 pb-6">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </PremiumCard>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 md:py-32 relative bg-[#050505]">
          <div className="container">
            <PremiumCard beamEffect cornerAccents className="overflow-hidden">
              <div className="relative p-12 md:p-20 text-center">
                {/* Background glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/20 blur-[100px] rounded-full" />

                <div className="relative z-10">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-primary mb-8 border border-primary/30">
                    <CircleDollarSign className="h-8 w-8 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  </div>

                  <h2 className="text-4xl font-bold tracking-tight sm:text-5xl text-white">
                    Ready to Start{" "}
                    <GradientText variant="aurora" animate>Saving</GradientText>?
                  </h2>

                  <p className="mt-6 text-xl text-slate-400 max-w-xl mx-auto">
                    Connect your wallet and join a pool in minutes. Start your
                    trustless savings journey today.
                  </p>

                  <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link href="/auth">
                      <PremiumButton size="lg">
                        <Wallet className="h-5 w-5" />
                        Connect Wallet
                      </PremiumButton>
                    </Link>
                    <Link href="#faq">
                      <PremiumButton size="lg" variant="outline">
                        <MessageSquare className="h-4 w-4" />
                        Have Questions?
                      </PremiumButton>
                    </Link>
                  </div>
                </div>
              </div>
            </PremiumCard>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  );
}
