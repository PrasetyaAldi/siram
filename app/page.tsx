"use client";

import { useEffect, useState } from "react";
import { useSensorData, usePompaData } from "@/hooks/usePlantData";
import { useHistoryLogger } from "@/hooks/useHistoryLogger";
import {
  useHistoryChart, useWateringStats, formatDurasi,
  ChartRange, RANGE_LABELS,
} from "@/hooks/useHistory";
import { cleanupOldHistory } from "@/lib/firebase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const CHART_RANGES: ChartRange[] = ["live", "30m", "3h", "24h", "7d"];

// ── Status Badge ────────────────────────────────────────────────
function StatusBadge({ online }: { online: boolean }) {
  return (
    <div className={`status-badge ${online ? "badge-online" : "badge-offline"}`}>
      <span className={`status-dot ${online ? "dot-online" : "dot-offline"}`} />
      {online ? "DEVICE ONLINE" : "DEVICE OFFLINE"}
    </div>
  );
}

// ── Gauge Kelembaban ─────────────────────────────────────────────
function MoistureGauge({ value }: { value: number }) {
  const radius = 80, stroke = 12;
  const norm   = radius - stroke / 2;
  const circ   = 2 * Math.PI * norm;
  const pct    = Math.min(Math.max(value, 0), 100);
  const offset = circ - (pct / 100) * circ;
  const color  = pct >= 60 ? "#2d6a4f" : pct >= 40 ? "#f4a261" : "#e63946";
  const label  = pct >= 60 ? "Cukup Lembab" : pct >= 40 ? "Mulai Kering" : "Kering";
  const size   = radius * 2 + 20;

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} style={{ overflow: "visible" }}>
        <circle cx={radius+10} cy={radius+10} r={norm}
          fill="none" stroke="#e8e0d5" strokeWidth={stroke} />
        <circle cx={radius+10} cy={radius+10} r={norm}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${radius+10} ${radius+10})`}
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.5s ease" }} />
        <text x={radius+10} y={radius+4} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily:"'DM Mono',monospace", fontSize:"32px", fontWeight:700, fill:color }}>
          {pct.toFixed(1)}%
        </text>
        <text x={radius+10} y={radius+30} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily:"'Lora',serif", fontSize:"13px", fill:"#7a7265" }}>
          {label}
        </text>
      </svg>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"11px",
        color:"#9a8f85", marginTop:"6px" }}>
        RAW ADC: {value > 0 ? Math.round(value) : "—"}
      </div>
    </div>
  );
}

// ── Kontrol Pompa ────────────────────────────────────────────────
function PompaControl({ pompa, loading, onKontrol }: {
  pompa:     { status: boolean; mode: string } | null;
  loading:   boolean;
  onKontrol: (cmd: "on" | "off" | "auto") => void;
}) {
  if (!pompa) return (
    <div style={{ textAlign:"center", color:"#7a7265", fontFamily:"'Lora',serif",
      fontSize:"14px", padding:"20px 0" }}>
      Menunggu data pompa...
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
      {/* Status pompa */}
      <div className={`pompa-status ${pompa.status ? "pompa-on" : "pompa-off"}`}>
        <div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px",
            color:"#7a7265", letterSpacing:"0.1em" }}>STATUS POMPA</div>
          <div style={{ fontFamily:"'Lora',serif", fontSize:"26px", fontWeight:700,
            color: pompa.status ? "#155724" : "#495057", marginTop:"4px" }}>
            {pompa.status ? "MENYALA" : "MATI"}
          </div>
        </div>
        <div className={`pompa-led ${pompa.status ? "led-on" : "led-off"}`} />
      </div>

      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"11px",
        color:"#9a8f85", letterSpacing:"0.08em", textAlign:"center" }}>
        MODE: {pompa.mode.toUpperCase()}
      </div>

      {/* Tombol ON / OFF */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
        <button onClick={() => onKontrol("on")} disabled={loading} className="btn btn-on">
          {loading ? "..." : "NYALAKAN"}
        </button>
        <button onClick={() => onKontrol("off")} disabled={loading} className="btn btn-off">
          MATIKAN
        </button>
      </div>

      {pompa.mode === "manual" && (
        <button onClick={() => onKontrol("auto")} disabled={loading} className="btn btn-auto">
          ↺ KEMBALI KE MODE OTOMATIS
        </button>
      )}
    </div>
  );
}

// ── Info Card ────────────────────────────────────────────────────
function InfoCard({ label, value, unit }: {
  label: string; value: string | number; unit?: string;
}) {
  return (
    <div className="info-card">
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px", color:"#9a8f85",
        letterSpacing:"0.1em", marginBottom:"8px" }}>{label}</div>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"22px",
        fontWeight:700, color:"#2d2925", lineHeight:1 }}>
        {value}
        {unit && <span style={{ fontSize:"12px", marginLeft:"3px", color:"#9a8f85" }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── Stat Card (statistik penyiraman) ─────────────────────────────
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-card stat-card">
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px", color:"#9a8f85",
        letterSpacing:"0.1em", marginBottom:"8px" }}>{label}</div>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"18px",
        fontWeight:700, color:"#2d2925", lineHeight:1.2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Custom Tooltip Chart ─────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#2d2925", borderRadius:"8px", padding:"10px 14px",
      color:"#f8f5f0", fontFamily:"'DM Mono',monospace", fontSize:"12px" }}>
      <div style={{ color:"#9a8f85", marginBottom:"4px" }}>{label}</div>
      <div>
        {payload[0].value.toFixed(1)}
        <span style={{ color:"#9a8f85", marginLeft:"4px" }}>%</span>
      </div>
    </div>
  );
}

// ── HALAMAN UTAMA ────────────────────────────────────────────────
export default function Dashboard() {
  const { sensor, history, online } = useSensorData();
  const { pompa, loading, kontrolPompa } = usePompaData();

  // Catat riwayat ke Firebase selama dashboard terbuka
  useHistoryLogger(sensor, pompa);

  const [range, setRange] = useState<ChartRange>("live");
  const { points: historyPoints, loading: chartLoading } = useHistoryChart(range);
  const stats = useWateringStats();

  // Bersihkan riwayat > 30 hari, sekali tiap dashboard dibuka
  useEffect(() => { cleanupOldHistory(30).catch(() => {}); }, []);

  const chartData  = range === "live" ? history : historyPoints;
  const denseChart = range === "24h" || range === "7d";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f0ece4; min-height: 100vh; -webkit-text-size-adjust: 100%; }

        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        /* ── Wrapper ── */
        .page {
          max-width: 960px;
          margin: 0 auto;
          padding: 20px 16px 52px;
          font-family: 'Lora', serif;
        }

        /* ── Header ── */
        .header {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }
        .header h1 {
          font-family: 'Lora', serif;
          font-size: 26px;
          font-weight: 700;
          color: #1a1814;
          line-height: 1.2;
        }
        .header p {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          color: #9a8f85;
          margin-top: 4px;
          letter-spacing: 0.05em;
        }

        /* ── Card ── */
        .card {
          background: #fffdf9;
          border-radius: 16px;
          border: 1px solid #e8e0d5;
          padding: 20px;
          animation: fadeIn 0.4s ease both;
        }
        .card-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: #9a8f85;
          margin-bottom: 16px;
        }

        /* ── Grid atas: gauge + kontrol — mobile: 1 kolom ── */
        .main-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }

        /* ── Info cards — mobile: 3 kartu dalam 2 kolom ── */
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
        }
        .info-card {
          padding: 14px;
          border-radius: 12px;
          background: #f8f5f0;
          border: 1px solid #e8e0d5;
        }
        /* Kartu ketiga span 2 kolom di mobile */
        .info-grid .info-card:nth-child(3) {
          grid-column: 1 / -1;
        }

        /* ── Statistik penyiraman ── */
        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .stat-card:nth-child(5) { grid-column: 1 / -1; }

        /* ── Tombol rentang chart ── */
        .range-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 14px;
        }
        .range-btn {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          padding: 6px 12px;
          border-radius: 14px;
          border: 1px solid #e8e0d5;
          background: #f8f5f0;
          color: #7a7265;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .range-btn:hover  { border-color: #c5b9ae; }
        .range-btn.active { background: #2d6a4f; border-color: #2d6a4f; color: #fff; }

        /* ── Status badge ── */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          font-family: 'DM Mono', monospace;
          letter-spacing: 0.05em;
          align-self: flex-start;
        }
        .badge-online  { background: #d4edda; color: #155724; }
        .badge-offline { background: #f8d7da; color: #721c24; }
        .status-dot    { width:7px; height:7px; border-radius:50%; display:inline-block; }
        .dot-online    { background:#28a745; animation: pulse 1.5s infinite; }
        .dot-offline   { background:#dc3545; }

        /* ── Pompa status box ── */
        .pompa-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-radius: 12px;
        }
        .pompa-on  { background:#d4edda; border:1px solid #b8dfc3; }
        .pompa-off { background:#f8f5f0; border:1px solid #e8e0d5; }
        .pompa-led {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          transition: all 0.4s ease;
        }
        .led-on  { background:#28a745; box-shadow:0 0 14px #28a74560; }
        .led-off { background:#ced4da; }

        /* ── Tombol — min 48px touch target ── */
        .btn {
          padding: 14px 10px;
          border-radius: 10px;
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.05em;
          transition: all 0.2s ease;
          cursor: pointer;
          min-height: 48px;
          width: 100%;
        }
        .btn:disabled { opacity: 0.55; cursor: wait; }
        .btn-on   { background:#2d6a4f; color:#fff; border:none; }
        .btn-off  { background:#fff; color:#3d3530; border:1px solid #c5b9ae; }
        .btn-auto { background:transparent; color:#2d6a4f; border:1px dashed #2d6a4f; }
        .btn-on:hover:not(:disabled)   { background:#245a42; }
        .btn-off:hover:not(:disabled)  { background:#f8f5f0; }
        .btn-auto:hover:not(:disabled) { background:#f0f7f4; }

        /* ── Footer ── */
        .footer {
          text-align: center;
          margin-top: 24px;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: #b5aba0;
          letter-spacing: 0.04em;
          line-height: 1.6;
        }

        /* ════════════════════════════════════════
           Tablet ke atas (≥ 600px)
           ════════════════════════════════════════ */
        @media (min-width: 600px) {
          .page   { padding: 32px 28px 60px; }
          .header { flex-direction: row; justify-content: space-between;
                    align-items: flex-start; margin-bottom: 28px; }
          .header h1    { font-size: 28px; }
          .status-badge { align-self: center; }

          .main-grid { grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }

          .info-grid { grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
          .info-grid .info-card:nth-child(3) { grid-column: auto; }

          .stats-grid { grid-template-columns: repeat(5, 1fr); gap: 12px; }
          .stat-card:nth-child(5) { grid-column: auto; }

          .card { padding: 24px; }
        }
      `}</style>

      <div className="page">

        {/* Header */}
        <div className="header">
          <div>
            <h1>Monitoring Penyiram</h1>
            <p>Tanaman Cabai Rawit — ESP32 IoT</p>
          </div>
          <StatusBadge online={online} />
        </div>

        {/* Gauge + Kontrol */}
        <div className="main-grid">
          <div className="card" style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div className="card-label">KELEMBABAN TANAH</div>
            <MoistureGauge value={sensor?.kelembaban_persen ?? 0} />
          </div>
          <div className="card">
            <div className="card-label">KONTROL POMPA</div>
            <PompaControl pompa={pompa} loading={loading} onKontrol={kontrolPompa} />
          </div>
        </div>

        {/* Info cards */}
        <div className="info-grid">
          <InfoCard
            label="KELEMBABAN SAAT INI"
            value={sensor ? sensor.kelembaban_persen.toFixed(1) : "—"}
            unit="%" />
          <InfoCard label="THRESHOLD SIRAM" value="< 50" unit="%" />
          <InfoCard label="STATUS MODE" value={pompa?.mode?.toUpperCase() ?? "—"} />
        </div>

        {/* Statistik penyiraman */}
        <div className="card" style={{ marginBottom:"12px" }}>
          <div className="card-label">STATISTIK PENYIRAMAN</div>
          <div className="stats-grid">
            <StatCard label="SIRAM HARI INI"
              value={`${stats.siramHariIni}×`} />
            <StatCard label="POMPA MENYALA HARI INI"
              value={formatDurasi(stats.totalDetikHariIni)} />
            <StatCard label="RATA-RATA DURASI SIRAM"
              value={formatDurasi(stats.avgDurasiDetik)} />
            <StatCard label="RATA-RATA JARAK ANTAR SIRAM"
              value={formatDurasi(stats.avgIntervalDetik)} />
            <StatCard label="RATA-RATA KELEMBABAN HARI INI"
              value={stats.avgKelembabanHariIni !== null
                ? `${stats.avgKelembabanHariIni.toFixed(1)} %` : "—"} />
          </div>
          {stats.totalSesi === 0 && (
            <div style={{ marginTop:"12px", fontFamily:"'DM Mono',monospace",
              fontSize:"10px", color:"#9a8f85", letterSpacing:"0.04em" }}>
              Belum ada sesi penyiraman tercatat — statistik terisi otomatis
              setelah pompa menyala &amp; mati minimal satu kali.
            </div>
          )}
        </div>

        {/* Grafik */}
        <div className="card">
          <div className="card-label">RIWAYAT KELEMBABAN</div>
          <div className="range-row">
            {CHART_RANGES.map((r) => (
              <button key={r}
                className={`range-btn ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}>
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {chartData.length === 0 ? (
            <div style={{ height:"180px", display:"flex", alignItems:"center",
              justifyContent:"center", color:"#9a8f85",
              fontFamily:"'DM Mono',monospace", fontSize:"13px", textAlign:"center" }}>
              {range === "live"
                ? "Menunggu data dari ESP32..."
                : chartLoading
                  ? "Memuat riwayat..."
                  : "Belum ada data riwayat untuk rentang ini"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top:8, right:4, left:-28, bottom:0 }}>
                <CartesianGrid stroke="#f0ece4" strokeDasharray="4 4" />
                <XAxis dataKey="time"
                  tick={{ fontFamily:"'DM Mono',monospace", fontSize:9, fill:"#9a8f85" }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd"
                  minTickGap={24} />
                <YAxis domain={[0,100]}
                  tick={{ fontFamily:"'DM Mono',monospace", fontSize:9, fill:"#9a8f85" }}
                  tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={50} stroke="#f4a261" strokeDasharray="5 4"
                  label={{ value:"50% batas siram", position:"insideTopRight",
                    fontFamily:"'DM Mono',monospace", fontSize:9, fill:"#f4a261" }} />
                <Line type="monotone" dataKey="value" stroke="#2d6a4f" strokeWidth={2.5}
                  dot={denseChart ? false : { r:3, fill:"#2d6a4f", strokeWidth:0 }}
                  activeDot={{ r:5, fill:"#2d6a4f" }} animationDuration={400} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div style={{ marginTop:"10px", fontFamily:"'DM Mono',monospace",
            fontSize:"10px", color:"#b5aba0", letterSpacing:"0.04em" }}>
            {range === "live"
              ? "Data langsung dari ESP32 (tiap 3 detik, 20 titik terakhir)"
              : "Data riwayat tersimpan di Firebase (resolusi per menit)"}
          </div>
        </div>

        <p className="footer">
          ESP32 update Firebase setiap 3 detik<br />
          Command realtime &lt; 1 detik
        </p>

      </div>
    </>
  );
}
