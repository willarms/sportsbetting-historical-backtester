import { Link } from "react-router-dom";

// ── Inline icons (kept here so the landing page is self-contained) ──────────

const Icon = ({ children }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS = {
  search: (
    <Icon><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
  ),
  database: (
    <Icon>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </Icon>
  ),
  chart: (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-5" />
    </Icon>
  ),
  bookmark: (
    <Icon><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Icon>
  ),
};

// ── Public-facing header (logo + auth CTAs) ─────────────────────────────────

export function LandingHeader() {
  return (
    <header className="landing-header">
      <Link to="/" className="brand-mark" aria-label="BetWise home">
        <img src="/transparent-logo.svg" alt="BetWise" className="brand-logo" />
      </Link>
      <nav className="landing-nav-actions">
        <Link to="/login" className="btn btn-ghost">Log in</Link>
        <Link to="/register" className="btn btn-primary">Sign up</Link>
      </nav>
    </header>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="hero">
      <h1>
        <span className="hero-text">Measure your strategy's </span>
        <span className="hero-accent">real performance.</span>
      </h1>
      <p className="hero-sub">
        BetWise allows you to backtest sports-betting strategies against years of real NBA
        closing odds, so you can see how you'd actually perform before risking a single dollar.
      </p>
      <div className="hero-ctas">
        <Link to="/register" className="btn btn-primary btn-lg">Get started</Link>
        <Link to="/login"    className="btn btn-ghost   btn-lg">I have an account</Link>
      </div>
    </section>
  );
}

// ── Problem statement ───────────────────────────────────────────────────────

function Problem() {
  const points = [
    {
      title: "The odds are stacked against you.",
      body:  "The odds you see are set so the book always wins long-term. Beating them requires a real strategy.",
    },
    {
      title: "Promotions don't remove the house edge.",
      body:  "Free bets, profit boosts, and “risk-free” offers are engineered to keep you betting, not to make you better at it.",
    },
    {
      title: "Vibes aren't a strategy.",
      body:  "Hunches and hot streaks feel like edges - yet they almost never are. Backtesting against real data tells you the truth.",
    },
  ];
  return (
    <section className="landing-section">
      <p className="section-eyebrow">Why BetWise</p>
      <h2 className="section-title">Profitable betting is hard. Let's solve that with data.</h2>
      <p className="section-sub">
        96% of bettors lose money long-term. The 4% who don't have one thing in common:
        they measure every bet. BetWise gives you the tools to do so.
      </p>
      <div className="problem-grid">
        {points.map((p, i) => (
          <div key={i} className="problem-card">
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Features ────────────────────────────────────────────────────────────────

function Features() {
  const features = [
    {
      icon:  ICONS.search,
      title: "Backtest any strategy",
      body:  "Choose a market (moneyline, spread, total), side, book, stake, and any filters like team or season. Run it in seconds across thousands of historical NBA games.",
    },
    {
      icon:  ICONS.database,
      title: "Real closing-line odds",
      body:  "Odds from DraftKings, FanDuel, BetMGM, Caesars, and others. The actual lines you would have faced.",
    },
    {
      icon:  ICONS.chart,
      title: "Helpful metrics",
      body:  "Reports net profit, ROI, win rate, expected value, max drawdown, volatility so you can judge a strategy on returns and risk together.",
    },
    {
      icon:  ICONS.bookmark,
      title: "Save what works",
      body:  "Keep promising strategies, revisit as new data arrives, and iterate on the ones that hold up.",
    },
  ];
  return (
    <section className="landing-section">
      <p className="section-eyebrow">What you get</p>
      <h2 className="section-title">Built for bettors who want answers</h2>
      <div className="feature-grid">
        {features.map((f, i) => (
          <div key={i} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Coming soon (leagues marquee) ───────────────────────────────────────────

// Order leagues alphabetically by display name. NBA is omitted because it's
// already supported - this section previews leagues we're adding next.
const UPCOMING_LEAGUES = [
  { src: "/afl.png",      alt: "AFL" },
  { src: "/f1.png",       alt: "Formula 1" },
  { src: "/mlb.png",      alt: "MLB" },
  { src: "/mls.svg.png",  alt: "MLS" },
  { src: "/nfl.svg.png",  alt: "NFL" },
  { src: "/nhl.svg.png",  alt: "NHL" },
  { src: "/pga.svg",      alt: "PGA Tour" },
  { src: "/premier.png",  alt: "Premier League" },
  { src: "/ufc.png.webp", alt: "UFC" },
];

function ComingSoon() {
  // Duplicate the list so the marquee loops seamlessly when translated -50%.
  const loop = [...UPCOMING_LEAGUES, ...UPCOMING_LEAGUES];
  return (
    <section className="landing-section">
      <p className="section-eyebrow">Coming soon</p>
      <h2 className="section-title">More leagues, more markets</h2>
      <p className="section-sub">
        We're working to bring in more leagues, more bookmakers, 
        and even player props, so you can backtest strategies
        across every sport and market you care about.
      </p>
      <div className="leagues-marquee" aria-label="Upcoming sports leagues">
        <div className="leagues-track">
          {loop.map((lg, i) => (
            <div className="league-logo" key={`${lg.alt}-${i}`}>
              <img src={lg.src} alt={lg.alt} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <img src="/transparent-logo.svg" alt="BetWise" className="brand-logo footer-logo" />
      <p>© 2026 BetWise. Historical analysis only. Not betting advice.</p>
    </footer>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="landing">
      <LandingHeader />
      <Hero />
      <Problem />
      <Features />
      <ComingSoon />
      <LandingFooter />
    </div>
  );
}

