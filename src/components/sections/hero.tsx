"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from "framer-motion";
import {
  ArrowRight,
  Play,
  Globe,
  Activity,
  Shield,
  Layers,
  Zap,
  TrendingUp,
  Hexagon,
  Wallet,
  CreditCard,
} from "lucide-react";

export function Hero() {
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mouse tracking for 3D parallax effects
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Mouse tracking for grid glow (pixel values)
  const mousePixelX = useMotionValue(0);
  const mousePixelY = useMotionValue(0);

  // Smooth springs for fluid movement
  const springConfig = { damping: 20, stiffness: 100, mass: 0.5 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  // Map mouse position to rotation values for the 3D card
  const rotateX = useTransform(springY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-10, 10]);

  // Parallax layers for background elements
  const layer1X = useTransform(springX, [-0.5, 0.5], [-20, 20]);
  const layer1Y = useTransform(springY, [-0.5, 0.5], [-20, 20]);

  const layer2X = useTransform(springX, [-0.5, 0.5], [-40, 40]);
  const layer2Y = useTransform(springY, [-0.5, 0.5], [-40, 40]);

  // Grid Glow Gradient
  const gridMaskImage = useMotionTemplate`radial-gradient(400px circle at ${mousePixelX}px ${mousePixelY}px, white, transparent)`;

  // Handle mouse movement over the container
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
    
    // Set pixel values relative to the container
    mousePixelX.set(e.clientX - rect.left);
    mousePixelY.set(e.clientY - rect.top);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setHovered(false);
  };

  // Canvas Particle System for "Interconnected Nodes"
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const particles: Particle[] = [];
    const mouse = { x: -1000, y: -1000 };

    let canvasWidth = window.innerWidth;
    let canvasHeight = window.innerHeight;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvasWidth = canvas.width;
      canvasHeight = canvas.height;
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    
    // Track mouse on window for canvas (smoother than react event for canvas loop)
    const updateMouse = (e: MouseEvent) => {
        if(containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
        }
    }
    window.addEventListener("mousemove", updateMouse);

    const particleCount = 80;
    const connectionDistance = 150;

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle(canvasWidth, canvasHeight));
    }

    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Update and draw particles
      particles.forEach((particle, index) => {
        particle.update(canvasWidth, canvasHeight, mouse);
        particle.draw(ctx);

        // Draw connections
        for (let j = index + 1; j < particles.length; j++) {
          const dx = particle.x - particles[j].x;
          const dy = particle.y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.15 * (1 - distance / connectionDistance)})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
        
        // Connect to mouse
        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < connectionDistance) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.2 * (1 - dist / connectionDistance)})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
        }

      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", updateMouse);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative min-h-screen w-full bg-[#050505] text-white overflow-hidden flex items-center justify-center selection:bg-primary selection:text-black font-sans"
    >
      {/* BACKGROUND LAYERS */}

      {/* 1. Canvas Nodes Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-50 pointer-events-none z-0"
      />

      {/* 2. Abstract Gradient Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          style={{ x: layer2X, y: layer2Y }}
          className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] bg-emerald-900/20 rounded-full blur-[120px]"
        />
        <motion.div
          style={{ x: layer1X, y: layer1Y }}
          className="absolute top-[20%] -right-[10%] w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-[100px]"
        />
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#050505] to-transparent z-10" />
      </div>

      {/* 3. Base Grid */}
      <div
        className="absolute inset-0 z-0 opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(rgba(52, 211, 153, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 0.5) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
      
      {/* 4. Glowing Grid Overlay (Revealed by mask) */}
      <motion.div
        className="absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(rgba(52, 211, 153, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 1) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          maskImage: gridMaskImage,
          WebkitMaskImage: gridMaskImage,
        }}
      />

      {/* MAIN CONTENT CONTAINER */}
      <div className="relative z-10 container mx-auto px-6 py-20 lg:py-0 grid lg:grid-cols-2 gap-12 items-center min-h-screen">
        {/* LEFT COLUMN: TEXT CONTENT */}
        <div className="space-y-8 relative">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 text-sm font-medium backdrop-blur-sm shadow-[0_0_15px_-3px_rgba(52,211,153,0.3)]"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Built on Solana
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          >
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              Save Together, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-200 to-emerald-500">
                Win Fairly
              </span>{" "}
              <br />
              On-Chain.
            </h1>
          </motion.div>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-lg text-slate-400 max-w-lg leading-relaxed"
          >
            Join trustless rotating savings pools on Solana. Contribute monthly
            with friends, and let smart contracts handle the rest. Zero
            interest, fully transparent, provably fair.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="flex flex-wrap gap-4"
          >
            <Link href="/auth">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group relative px-8 py-4 bg-emerald-500 text-black font-bold rounded-xl overflow-hidden shadow-[0_0_40px_-10px_rgba(52,211,153,0.5)]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                <span className="relative flex items-center gap-2">
                  Get Started <ArrowRight className="w-4 h-4" />
                </span>
              </motion.button>
            </Link>

            <Link href="#how-it-works">
              <motion.button
                whileHover={{
                  scale: 1.05,
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-white/5 border border-white/10 text-white font-medium rounded-xl backdrop-blur-md flex items-center gap-2 hover:border-emerald-500/50 transition-colors"
              >
                <Play className="w-4 h-4 fill-current" /> Learn More
              </motion.button>
            </Link>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="flex gap-8 pt-8 border-t border-white/10"
          >
            {[
              { label: "Active Pools", value: "500+", icon: Globe },
              { label: "Total Volume", value: "$2M+", icon: Activity },
              { label: "Security", value: "Audited", icon: Shield },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  <stat.icon className="w-4 h-4" /> {stat.label}
                </div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* RIGHT COLUMN: 3D HOLOGRAPHIC VISUAL */}
        <div className="relative h-[600px] hidden lg:flex items-center justify-center perspective-1000">
          {/* Glow Behind */}
          <motion.div
            style={{ x: layer2X, y: layer2Y }}
            className="absolute inset-0 bg-emerald-500/20 blur-[100px] rounded-full z-0"
          />

          {/* 3D Container */}
          <motion.div
            style={{
              rotateX,
              rotateY,
              transformStyle: "preserve-3d",
            }}
            className="relative w-full max-w-md aspect-[4/5] z-10"
          >
            {/* FLOATING ELEMENTS */}

            {/* Element 1: Back Card (Transaction List) */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.2 }}
              style={{ transform: "translateZ(-50px)" }}
              className="absolute top-10 -right-10 w-64 h-80 bg-[#0a0f0a]/90 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-xl flex flex-col gap-4"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-xs text-slate-400 font-mono">
                  RECENT ACTIVITY
                </span>
                <Layers className="w-4 h-4 text-emerald-500" />
              </div>
              {[1, 2, 3, 4].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">
                        Payment
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {i + 1} min ago
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-emerald-400">
                    +{(i + 1) * 0.5} SOL
                  </span>
                </div>
              ))}
            </motion.div>

            {/* Element 2: Main Card (Pool Balance) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1 }}
              style={{ transform: "translateZ(0px)" }}
              className="absolute inset-x-4 top-20 bottom-20 bg-gradient-to-br from-[#1a1f1a] to-[#050505] border border-emerald-500/20 rounded-3xl p-6 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden group"
            >
              {/* Card Shine Effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-transparent" />

              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="text-slate-400 text-sm mb-1">Pool Balance</div>
                  <div className="text-4xl font-bold text-white tracking-tight">
                    45.5 SOL
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 text-sm mt-1">
                    <TrendingUp className="w-4 h-4" /> Round 4 of 10
                  </div>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <Hexagon className="w-6 h-6 text-emerald-400" />
                </div>
              </div>

              {/* Fake Chart */}
              <div className="h-32 w-full mt-4 relative">
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient
                      id="chartGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                      <stop
                        offset="100%"
                        stopColor="#34d399"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                    d="M0,35 Q10,30 20,32 T40,20 T60,25 T80,10 T100,5"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2"
                    strokeLinecap="round"
                    filter="drop-shadow(0 0 4px rgba(52, 211, 153, 0.5))"
                  />
                  <path
                    d="M0,35 Q10,30 20,32 T40,20 T60,25 T80,10 T100,5 V40 H0 Z"
                    fill="url(#chartGradient)"
                    className="opacity-50"
                  />
                </svg>

                {/* Floating data points */}
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-[10%] left-[80%] px-2 py-1 bg-emerald-500 text-black text-xs font-bold rounded shadow-lg"
                >
                  5 days
                </motion.div>
              </div>

              <div className="mt-6 flex gap-3">
                <button className="flex-1 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500 hover:text-black transition-colors">
                  Pay Now
                </button>
                <button className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                  View Pool
                </button>
              </div>
            </motion.div>

            {/* Element 3: Front Floating Card (Member Card) */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.4 }}
              style={{ transform: "translateZ(80px)" }}
              className="absolute -bottom-6 -left-10 w-72 h-44 rounded-2xl p-5 shadow-2xl backdrop-blur-md border border-white/20 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 z-0" />
              <div
                className="absolute inset-0 opacity-20 z-0"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
              />

              <div className="relative z-10 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white tracking-widest">
                    ARISAN
                  </span>
                  <Wallet className="text-white/80 w-5 h-5" />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-8 h-5 bg-emerald-500/80 rounded" />
                  <CreditCard className="w-5 h-5 text-white/50" />
                </div>
                <div>
                  <div className="text-white/60 text-xs font-mono mb-1">
                    MEMBER SINCE 2024
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-white text-sm">SAVINGS MEMBER</span>
                    <span className="text-emerald-400 text-xs font-bold">
                      ACTIVE
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Holographic Beam Effect */}
            <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-40 h-20 bg-emerald-500/30 blur-[40px] rounded-[100%] transform scale-x-150 pointer-events-none" />
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 10, 0] }}
        transition={{ duration: 2, delay: 2, repeat: Infinity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500 text-xs tracking-widest uppercase"
      >
        Scroll to explore
        <div className="w-[1px] h-8 bg-gradient-to-b from-emerald-500 to-transparent" />
      </motion.div>
    </div>
  );
}

// Helper Class for Particles
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  baseSpeed = 0.5;
  mouseInfluenceRadius = 250;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;
    this.vx = (Math.random() - 0.5) * this.baseSpeed;
    this.vy = (Math.random() - 0.5) * this.baseSpeed;
    this.size = Math.random() * 2 + 1;
    this.color = `rgba(52, 211, 153, ${Math.random() * 0.5 + 0.2})`;
  }

  update(
    canvasWidth: number,
    canvasHeight: number,
    mouse: { x: number; y: number }
  ) {
    // Normal movement
    this.x += this.vx;
    this.y += this.vy;

    // Bounce off edges
    if (this.x < 0 || this.x > canvasWidth) this.vx *= -1;
    if (this.y < 0 || this.y > canvasHeight) this.vy *= -1;

    // Mouse interaction (Attraction)
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.mouseInfluenceRadius) {
      const forceDirectionX = dx / distance;
      const forceDirectionY = dy / distance;
      const force =
        (this.mouseInfluenceRadius - distance) / this.mouseInfluenceRadius;
      const directionX = forceDirectionX * force * 0.5; // Strength
      const directionY = forceDirectionY * force * 0.5;

      this.vx += directionX;
      this.vy += directionY;
    }

    // Friction to stabilize speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > 2) {
      this.vx *= 0.95;
      this.vy *= 0.95;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}