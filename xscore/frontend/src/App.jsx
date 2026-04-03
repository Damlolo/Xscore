import { useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const GRADE_CONFIG = {
  S: { color: "#c084fc", label: "Superstar" },
  A: { color: "#34d399", label: "Elite" },
  B: { color: "#60a5fa", label: "Rising" },
  C: { color: "#fbbf24", label: "Average" },
  D: { color: "#f87171", label: "Needs Work" },
};

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card" style={{ "--accent": accent }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function InsightBadge({ type }) {
  const map = { positive: ["✦", "#34d399"], warning: ["▲", "#fbbf24"], neutral: ["◆", "#60a5fa"] };
  const [icon, color] = map[type] || map.neutral;
  return <span style={{ color, marginRight: 8, fontSize: 11 }}>{icon}</span>;
}

function PostCard({ post, username }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="post-card"
    >
      <div className="post-text">{post.text.length > 200 ? post.text.slice(0, 200) + "…" : post.text}</div>
      <div className="post-meta">
        <span>♥ {fmtNum(post.likes)}</span>
        <span>↺ {fmtNum(post.retweets)}</span>
        <span>↩ {fmtNum(post.replies)}</span>
        <span className="post-date">{timeAgo(post.created_at)}</span>
        <span className="post-engagement">{fmtNum(post.engagement)} total</span>
      </div>
    </a>
  );
}

function CustomTooltip({ active, payload }) {
  if (active && payload?.length) {
    return (
      <div className="chart-tooltip">
        <div>{payload[0].payload.hour}:00</div>
        <div style={{ color: "#c084fc" }}>{payload[0].value} avg eng</div>
      </div>
    );
  }
  return null;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analyze = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const username = query.trim().replace(/^@/, "");
      const res = await fetch(`${API_BASE}/analyze/${username}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to analyze");
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const grade = data ? GRADE_CONFIG[data.grade] || GRADE_CONFIG.D : null;

  const radarData = data
    ? [
        { axis: "Virality", val: Math.min((data.banger_rate * 100) * 3, 100) },
        { axis: "Consistency", val: Math.min((data.total_analyzed / 100) * 100, 100) },
        { axis: "Reach", val: Math.min(Math.log10(Math.max(data.followers, 10)) / 8 * 100, 100) },
        { axis: "Engagement", val: Math.min((data.avg_engagement / 500) * 100, 100) },
        { axis: "Output", val: Math.min((data.tweet_count / 5000) * 100, 100) },
      ]
    : [];

  const bestHours = data
    ? [...data.posting_hours]
        .sort((a, b) => b.avg_engagement - a.avg_engagement)
        .slice(0, 3)
        .map((h) => `${h.hour}:00`)
        .join(", ")
    : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Syne', sans-serif;
          background: #080810;
          color: #e2e0f0;
          min-height: 100vh;
        }

        .grain {
          position: fixed; inset: 0; pointer-events: none; z-index: 999;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          opacity: 0.4;
        }

        .glow {
          position: fixed; width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(192,132,252,0.08) 0%, transparent 70%);
          pointer-events: none;
          top: -200px; left: 50%; transform: translateX(-50%);
        }

        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 60px 24px 100px;
          position: relative;
        }

        header {
          text-align: center;
          margin-bottom: 56px;
        }

        .logo-mark {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 13px; font-family: 'JetBrains Mono', monospace;
          color: #c084fc; letter-spacing: 0.2em; text-transform: uppercase;
          margin-bottom: 24px;
        }

        .logo-dot { width: 6px; height: 6px; border-radius: 50%; background: #c084fc; }

        h1 {
          font-size: clamp(42px, 8vw, 80px);
          font-weight: 800;
          line-height: 0.95;
          letter-spacing: -0.03em;
          color: #fff;
          margin-bottom: 16px;
        }

        h1 span { color: #c084fc; }

        .tagline {
          font-size: 16px;
          color: #6b6980;
          font-family: 'JetBrains Mono', monospace;
        }

        .search-wrap {
          display: flex;
          gap: 12px;
          margin-bottom: 48px;
          max-width: 560px;
          margin-left: auto;
          margin-right: auto;
        }

        .search-input {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 16px;
          font-family: 'JetBrains Mono', monospace;
          color: #e2e0f0;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }

        .search-input::placeholder { color: #3d3b50; }
        .search-input:focus { border-color: #c084fc; background: rgba(192,132,252,0.05); }

        .btn {
          background: #c084fc;
          border: none;
          border-radius: 12px;
          padding: 16px 28px;
          font-size: 15px;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          color: #1a0030;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
          white-space: nowrap;
        }

        .btn:hover { opacity: 0.9; }
        .btn:active { transform: scale(0.97); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .error {
          text-align: center; color: #f87171;
          font-family: 'JetBrains Mono', monospace; font-size: 13px;
          margin-bottom: 24px;
        }

        .loading-wrap {
          text-align: center; padding: 80px 0;
          font-family: 'JetBrains Mono', monospace;
          color: #6b6980; font-size: 13px;
        }

        .spinner {
          width: 40px; height: 40px;
          border: 2px solid rgba(192,132,252,0.2);
          border-top-color: #c084fc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 20px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .profile-row {
          display: flex; align-items: center; gap: 20px;
          margin-bottom: 36px;
        }

        .avatar {
          width: 64px; height: 64px; border-radius: 50%;
          border: 2px solid rgba(192,132,252,0.3);
        }

        .profile-name { font-size: 24px; font-weight: 800; color: #fff; }
        .profile-handle {
          font-size: 13px; color: #6b6980;
          font-family: 'JetBrains Mono', monospace;
        }
        .profile-bio { font-size: 14px; color: #8b8aa0; margin-top: 4px; }

        .grade-badge {
          margin-left: auto; text-align: center;
          display: flex; flex-direction: column; align-items: center;
          gap: 4px;
        }

        .grade-letter {
          width: 72px; height: 72px;
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          font-size: 36px; font-weight: 800;
          border: 2px solid;
        }

        .grade-label {
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: #6b6980;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 36px;
        }

        .stat-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          padding: 18px 16px;
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0;
          height: 2px; background: var(--accent, #c084fc);
          opacity: 0.6;
        }

        .stat-label {
          font-size: 11px; font-family: 'JetBrains Mono', monospace;
          color: #4d4b60; text-transform: uppercase; letter-spacing: 0.1em;
          margin-bottom: 8px;
        }

        .stat-value {
          font-size: 28px; font-weight: 800; color: #fff;
          line-height: 1;
        }

        .stat-sub {
          font-size: 12px; color: #4d4b60; margin-top: 4px;
          font-family: 'JetBrains Mono', monospace;
        }

        .section { margin-bottom: 36px; }

        .section-title {
          font-size: 12px; font-family: 'JetBrains Mono', monospace;
          color: #4d4b60; text-transform: uppercase; letter-spacing: 0.15em;
          margin-bottom: 16px;
          display: flex; align-items: center; gap: 10px;
        }

        .section-title::after {
          content: ''; flex: 1; height: 1px;
          background: rgba(255,255,255,0.05);
        }

        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        @media (max-width: 600px) {
          .two-col { grid-template-columns: 1fr; }
          .profile-row { flex-wrap: wrap; }
        }

        .panel {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 20px;
        }

        .post-card {
          display: block;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 10px;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.2s, background 0.2s;
        }

        .post-card:hover {
          border-color: rgba(192,132,252,0.3);
          background: rgba(192,132,252,0.04);
        }

        .post-text {
          font-size: 14px; line-height: 1.6; color: #c4c2d4; margin-bottom: 10px;
        }

        .post-meta {
          display: flex; gap: 14px; align-items: center;
          font-size: 12px; font-family: 'JetBrains Mono', monospace;
          color: #4d4b60; flex-wrap: wrap;
        }

        .post-date { margin-left: auto; }

        .post-engagement {
          color: #c084fc;
          font-weight: 500;
        }

        .insight-item {
          display: flex; align-items: flex-start;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 14px; color: #8b8aa0; line-height: 1.5;
        }

        .insight-item:last-child { border-bottom: none; }

        .chart-tooltip {
          background: #1a1828;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 8px 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #c4c2d4;
        }

        .score-display {
          text-align: center; padding: 24px 0 16px;
        }

        .score-number {
          font-size: 64px; font-weight: 800; color: #fff;
          line-height: 1; letter-spacing: -0.04em;
        }

        .score-number span { color: #c084fc; }
        .score-max { font-size: 13px; color: #4d4b60; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }

        .best-time-chip {
          display: inline-block;
          background: rgba(192,132,252,0.1);
          border: 1px solid rgba(192,132,252,0.2);
          border-radius: 8px;
          padding: 4px 10px;
          font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          color: #c084fc;
          margin-right: 6px; margin-top: 8px;
        }
      `}</style>

      <div className="grain" />
      <div className="glow" />

      <div className="container">
        <header>
          <div className="logo-mark">
            <div className="logo-dot" />
            XScore
            <div className="logo-dot" />
          </div>
          <h1>Analyze your<br /><span>X influence</span></h1>
          <p className="tagline">// reputation scoring for creators</p>
        </header>

        <div className="search-wrap">
          <input
            className="search-input"
            placeholder="@username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze()}
          />
          <button className="btn" onClick={analyze} disabled={loading}>
            {loading ? "Analyzing…" : "Analyze →"}
          </button>
        </div>

        {error && <div className="error">⚠ {error}</div>}

        {loading && (
          <div className="loading-wrap">
            <div className="spinner" />
            Fetching tweets & computing score…
          </div>
        )}

        {data && (
          <div>
            {/* Profile Row */}
            <div className="profile-row">
              {data.profile_image_url && (
                <img
                  className="avatar"
                  src={data.profile_image_url.replace("_normal", "_200x200")}
                  alt={data.name}
                />
              )}
              <div>
                <div className="profile-name">{data.name}</div>
                <div className="profile-handle">@{data.username}</div>
                {data.description && (
                  <div className="profile-bio">
                    {data.description.length > 120 ? data.description.slice(0, 120) + "…" : data.description}
                  </div>
                )}
              </div>
              {grade && (
                <div className="grade-badge">
                  <div
                    className="grade-letter"
                    style={{
                      color: grade.color,
                      borderColor: grade.color,
                      background: grade.color + "15",
                    }}
                  >
                    {data.grade}
                  </div>
                  <div className="grade-label">{grade.label}</div>
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
              <StatCard label="Social Score" value={data.social_score} sub="out of 1000" accent="#c084fc" />
              <StatCard label="Followers" value={fmtNum(data.followers)} sub={`${fmtNum(data.following)} following`} accent="#60a5fa" />
              <StatCard label="Bangers 🔥" value={data.bangers} sub={`${(data.banger_rate * 100).toFixed(1)}% banger rate`} accent="#f59e0b" />
              <StatCard label="Avg Engagement" value={fmtNum(Math.round(data.avg_engagement))} sub={`${data.total_analyzed} tweets analyzed`} accent="#34d399" />
            </div>

            {/* Charts Row */}
            <div className="two-col section">
              <div className="panel">
                <div className="section-title">Creator Radar</div>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.07)" />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={{ fill: "#4d4b60", fontSize: 11, fontFamily: "JetBrains Mono" }}
                    />
                    <Radar dataKey="val" stroke="#c084fc" fill="#c084fc" fillOpacity={0.15} strokeWidth={1.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="panel">
                <div className="section-title">Best Posting Hours</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.posting_hours} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="hour"
                      tick={{ fill: "#4d4b60", fontSize: 10, fontFamily: "JetBrains Mono" }}
                      tickFormatter={(h) => h % 6 === 0 ? `${h}h` : ""}
                    />
                    <YAxis tick={{ fill: "#4d4b60", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="avg_engagement" radius={[3, 3, 0, 0]}>
                      {data.posting_hours.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.avg_engagement > data.avg_engagement ? "#c084fc" : "rgba(255,255,255,0.08)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {bestHours && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#4d4b60", fontFamily: "JetBrains Mono", marginBottom: 4 }}>
                      TOP HOURS
                    </div>
                    {bestHours.split(", ").map((h) => (
                      <span key={h} className="best-time-chip">{h}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Insights */}
            {data.insights.length > 0 && (
              <div className="section panel">
                <div className="section-title">AI Insights</div>
                {data.insights.map((ins, i) => (
                  <div key={i} className="insight-item">
                    <InsightBadge type={ins.type} />
                    {ins.text}
                  </div>
                ))}
              </div>
            )}

            {/* Top Posts */}
            {data.top_posts.length > 0 && (
              <div className="section">
                <div className="section-title">Top Posts</div>
                {data.top_posts.map((post) => (
                  <PostCard key={post.id} post={post} username={data.username} />
                ))}
              </div>
            )}

            <div style={{ textAlign: "center", fontSize: 12, color: "#2d2b3d", fontFamily: "JetBrains Mono", marginTop: 40 }}>
              Based on last {data.total_analyzed} tweets — XScore v1.0
            </div>
          </div>
        )}
      </div>
    </>
  );
}
