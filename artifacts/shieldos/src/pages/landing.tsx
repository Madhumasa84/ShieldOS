import { Link } from "wouter";
import { Shield, Zap, BarChart2, Github, ArrowRight, CheckCircle2, Lock, Globe, MonitorSmartphone } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e2e8f0] font-mono relative overflow-hidden">
      {/* Background grid + glow */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#00e5ff 1px, transparent 1px), linear-gradient(90deg, #00e5ff 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-purple-500/8 rounded-full blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-4 border-b border-[#30363d]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="text-sm font-bold tracking-[0.2em] text-[#e2e8f0]">SHIELD<span className="text-cyan-400">OS</span></span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            GitHub
          </a>
          <Link href="/dashboard">
            <span className="px-4 py-1.5 text-xs bg-cyan-500 text-[#0d1117] font-bold rounded-md hover:bg-cyan-400 transition-colors tracking-wider cursor-pointer">
              OPEN DASHBOARD →
            </span>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-[10px] font-bold tracking-widest text-cyan-400 border border-cyan-400/30 bg-cyan-400/5 rounded-full mb-8 uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          DNS-Level Privacy Protection
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-[#e2e8f0] leading-tight max-w-3xl mb-6">
          Block Every Tracker.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-300">
            Own Your Privacy.
          </span>
        </h1>

        <p className="text-base md:text-lg text-[#94a3b8] max-w-xl mb-10 leading-relaxed">
          ShieldOS protects your Android device from ads, trackers, and malware at the DNS level.
          No VPN slowdowns. No data sold. Full control.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/dashboard">
            <span className="flex items-center gap-2 px-6 py-3 text-sm font-bold bg-cyan-500 text-[#0d1117] rounded-lg hover:bg-cyan-400 transition-colors tracking-wider cursor-pointer">
              Open Dashboard
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 text-sm font-bold border border-[#30363d] text-[#94a3b8] rounded-lg hover:border-[#4b5563] hover:text-[#e2e8f0] transition-colors tracking-wider"
          >
            <Github className="w-4 h-4" />
            View Source
          </a>
        </div>

        {/* Live badge */}
        <div className="flex items-center gap-6 mt-12 text-xs text-[#4b5563]">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Open Source</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Self-Hosted</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> No Data Collection</span>
        </div>
      </section>

      {/* Feature cards */}
      <section className="relative z-10 px-6 md:px-12 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Shield,
              color: "text-cyan-400",
              bg: "bg-cyan-400/10 border-cyan-400/20",
              stat: "80,000+",
              label: "Domains Blocked",
              desc: "Continuously updated blocklists from StevenBlack, AdAway, and curated threat feeds. Updated every 24 hours.",
            },
            {
              icon: Zap,
              color: "text-yellow-400",
              bg: "bg-yellow-400/10 border-yellow-400/20",
              stat: "<1ms",
              label: "Real-Time DNS Protection",
              desc: "Sub-millisecond DNS filtering with in-memory cache. Zero latency impact on your browsing experience.",
            },
            {
              icon: BarChart2,
              color: "text-purple-400",
              bg: "bg-purple-400/10 border-purple-400/20",
              stat: "6 Charts",
              label: "Full Analytics Dashboard",
              desc: "Visual breakdowns by domain, category, device, and time. Export reports as PDF, CSV, or JSON.",
            },
          ].map(({ icon: Icon, color, bg, stat, label, desc }) => (
            <div key={label} className="p-6 rounded-xl border border-[#30363d] bg-[#161b22]/60 hover:border-[#4b5563] transition-colors group">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border ${bg} mb-4`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className={`text-2xl font-bold mb-1 ${color}`}>{stat}</div>
              <div className="text-sm font-bold text-[#e2e8f0] mb-2">{label}</div>
              <p className="text-xs text-[#94a3b8] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 md:px-12 pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs font-bold tracking-[0.3em] text-cyan-400/60 uppercase text-center mb-10">How It Works</h2>
          <div className="flex flex-col md:flex-row items-start gap-4">
            {[
              { step: "01", icon: Globe, title: "Deploy ShieldOS", desc: "One-click deploy on Replit or self-host on any server. PostgreSQL database auto-configured." },
              { step: "02", icon: MonitorSmartphone, title: "Connect Android App", desc: "Install the ShieldOS Android app, enter your server URL. Private DNS profile applied automatically." },
              { step: "03", icon: Lock, title: "Every Tracker Blocked", desc: "All DNS queries routed through ShieldOS. Ads, trackers, and malware blocked before they load." },
            ].map(({ step, icon: Icon, title, desc }, i) => (
              <div key={step} className="flex-1 flex flex-col items-center text-center relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-6 left-[calc(50%+2rem)] right-[calc(-50%+2rem)] h-px bg-gradient-to-r from-[#30363d] to-transparent" />
                )}
                <div className="w-12 h-12 rounded-full border border-cyan-400/30 bg-cyan-400/5 flex items-center justify-center mb-4 relative z-10">
                  <Icon className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="text-[10px] font-bold tracking-widest text-cyan-400/50 mb-1">{step}</div>
                <div className="text-sm font-bold text-[#e2e8f0] mb-2">{title}</div>
                <p className="text-xs text-[#94a3b8] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 md:px-12 pb-20">
        <div className="max-w-2xl mx-auto text-center p-10 rounded-2xl border border-cyan-400/20 bg-gradient-to-b from-cyan-400/5 to-transparent">
          <h2 className="text-2xl font-bold text-[#e2e8f0] mb-3">Start Protecting Your Privacy</h2>
          <p className="text-sm text-[#94a3b8] mb-8">Open the dashboard, add your devices, and block every tracker — in minutes.</p>
          <Link href="/dashboard">
            <span className="inline-flex items-center gap-2 px-8 py-3 text-sm font-bold bg-cyan-500 text-[#0d1117] rounded-lg hover:bg-cyan-400 transition-colors tracking-wider cursor-pointer">
              Open Dashboard
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#30363d]/60 px-6 md:px-12 py-6 flex items-center justify-between text-xs text-[#4b5563]">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-cyan-400/40" />
          <span>ShieldOS — MIT License</span>
        </div>
        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-[#94a3b8] transition-colors">
          <Github className="w-3.5 h-3.5" />
          GitHub
        </a>
      </footer>
    </div>
  );
}
