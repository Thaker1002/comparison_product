import { useState, useEffect } from "react";
import { ShoppingBag, Moon, Sun, Github, Zap, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const [isDark, setIsDark] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.classList.toggle("light", !next);
      return next;
    });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "glass-strong border-b border-white/8 shadow-xl shadow-black/20"
          : "bg-transparent",
        className,
      )}
    >
      {/* Gradient top accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-x bg-[length:200%_100%]" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* ── Logo ──────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 select-none">
            {/* Icon */}
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-500/30">
              <ShoppingBag className="h-5 w-5 text-white" />
              {/* Pulse ring */}
              <span className="absolute inset-0 rounded-xl animate-ping bg-indigo-400/30 pointer-events-none" />
            </div>

            {/* Wordmark */}
            <div className="flex flex-col leading-none">
              <span className="text-lg font-extrabold tracking-tight gradient-text">
                Thaker's Quest
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
                Smart Price Finder 🔍
              </span>
            </div>
          </div>

          {/* ── Center tagline (hidden on mobile) ─────────────────────────── */}
          <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/40 bg-secondary/40 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              Compare prices across Thai marketplaces instantly
            </span>
          </div>

          {/* ── Marketplace pills (hidden on small screens) ──────────────── */}
          <div className="hidden lg:flex items-center gap-1.5">
            {[
              {
                label: "Shopee",
                color: "bg-orange-500/15 text-orange-400 border-orange-500/20",
              },
              {
                label: "Lazada",
                color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
              },
              {
                label: "JD",
                color: "bg-red-500/15    text-red-400    border-red-500/20",
              },
              {
                label: "Big C",
                color: "bg-amber-500/15  text-amber-400  border-amber-500/20",
              },
              {
                label: "Makro",
                color: "bg-blue-500/15   text-blue-400   border-blue-500/20",
              },
            ].map(({ label, color }) => (
              <span
                key={label}
                className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                  color,
                )}
              >
                {label}
              </span>
            ))}
          </div>

          {/* ── Right actions ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Thailand flag + domain badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/40 text-xs text-muted-foreground font-medium">
              <Globe className="h-3 w-3" />
              <span>.co.th</span>
            </div>

            {/* GitHub link */}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                "border border-border/50 bg-secondary/40",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-secondary hover:border-border",
                "transition-all duration-200",
              )}
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                "border border-border/50 bg-secondary/40",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-secondary hover:border-border",
                "transition-all duration-200",
                "relative overflow-hidden",
              )}
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              <span
                className={cn(
                  "absolute transition-all duration-300",
                  isDark ? "opacity-100 rotate-0" : "opacity-0 -rotate-90",
                )}
              >
                <Moon className="h-4 w-4" />
              </span>
              <span
                className={cn(
                  "absolute transition-all duration-300",
                  !isDark ? "opacity-100 rotate-0" : "opacity-0 rotate-90",
                )}
              >
                <Sun className="h-4 w-4 text-yellow-400" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Subtle bottom gradient glow when scrolled */}
      {scrolled && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"
        />
      )}
    </header>
  );
}
