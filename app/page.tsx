"use client";

import { useSensorData, usePompaData } from "@/hooks/usePlantData";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Status Badge ────────────────────────────────────────────────
function StatusBadge({ online }: { online: boolean }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      padding: "4px 12px", borderRadius: "20px",
      background: online ? "#d4edda" : "#f8d7da",
      color: online ? "#155724" : "#721c24",
      fontSize: "12px", fontWeight: 600,
      fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em",
    }}>
      <span style={{
        width: "7px", height: "7px", borderRadius: "50%",
        background: online ? "#28a745" : "#dc3545",
        animation: online ? "pulse 1.5s infinite" : "none",
        display: "inline-block",
      }} />
      {online ? "DEVICE ONLINE" : "DEVICE OFFLINE"}
    </div>
  );
}

// ── Gauge Kelembaban ─────────────────────────────────────────────
function MoistureGauge({ value }: { value: number }) {
  const radius = 70, stroke = 10;
  const norm   = radius - stroke / 2;
  const circ   = 2 * Math.PI * norm;
  const pct    = Math.min(Math.max(value, 0), 100);
  const offset = circ - (pct / 100) * circ;
  const color  = pct >= 60 ? "#2d6a4f" : pct >= 40 ? "#f4a261" : "#e63946";
  const label  = pct >= 60 ? "Cukup Lembab" : pct >= 40 ? "Mulai Kering" : "Kering";

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={radius * 2 + 20} height={radius * 2 + 20}>
        <circle cx={radius+10} cy={radius+10} r={norm}
          fill="none" stroke="#e8e0d5" strokeWidth={stroke} />
        <circle cx={radius+10} cy={radius+10} r={norm}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${radius+10} ${radius+10})`}
          style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.5s ease" }} />
        <text x={radius+10} y={radius+6} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: "'DM Mono',monospace", fontSize:"28px", fontWeight:700, fill:color }}>
          {pct.toFixed(1)}%
        </text>
        <text x={radius+10} y={radius+30} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily: "'Lora',serif", fontSize:"12px", fill:"#7a7265" }}>
          {label}
        </text>
      </svg>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"11px", color:"#9a8f85" }}>
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
    <div style={{ textAlign:"center", color:"#7a7265", fontFamily:"'Lora',serif", fontSize:"14px" }}>
      Menunggu data pompa...
    </div>
  );

  const btnBase: React.CSSProperties = {
    padding: "12px", borderRadius: "10px", border: "none",
    fontFamily: "'DM Mono',monospace", fontSize: "13px",
    fontWeight: 600, cursor: loading ? "wait" : "pointer",
    transition: "all 0.2s ease", letterSpacing: "0.05em",
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
      {/* Status bar */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"14px 18px", borderRadius:"12px",
        background: pompa.status ? "#d4edda" : "#f8f5f0",
        border: `1px solid ${pompa.status ? "#b8dfc3" : "#e8e0d5"}`,
      }}>
        <div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"11px", color:"#7a7265", letterSpacing:"0.08em" }}>
            STATUS POMPA
          </div>
          <div style={{ fontFamily:"'Lora',serif", fontSize:"20px", fontWeight:700,
            color: pompa.status ? "#155724" : "#495057", marginTop:"2px" }}>
            {pompa.status ? "MENYALA" : "MATI"}
          </div>
        </div>
        <div style={{
          width:"20px", height:"20px", borderRadius:"50%",
          background: pompa.status ? "#28a745" : "#ced4da",
          boxShadow:  pompa.status ? "0 0 12px #28a74580" : "none",
          transition: "all 0.4s ease",
        }} />
      </div>

      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"11px",
        color:"#7a7265", letterSpacing:"0.08em", textAlign:"center" }}>
        MODE: {pompa.mode.toUpperCase()}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
        <button onClick={() => onKontrol("on")} disabled={loading}
          style={{ ...btnBase, background: loading ? "#c3e6cb" : "#2d6a4f", color:"#fff" }}>
          {loading ? "..." : "NYALAKAN"}
        </button>
        <button onClick={() => onKontrol("off")} disabled={loading}
          style={{ ...btnBase, border:"1px solid #c5b9ae", background:"#fff", color:"#3d3530" }}>
          MATIKAN
        </button>
      </div>

      {pompa.mode === "manual" && (
        <button onClick={() => onKontrol("auto")} disabled={loading}
          style={{ ...btnBase, border:"1px dashed #2d6a4f", background:"transparent", color:"#2d6a4f" }}>
          ↺ KEMBALI KE MODE OTOMATIS
        </button>
      )}
    </div>
  );
}

// ── Info Card ────────────────────────────────────────────────────
function InfoCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div style={{ padding:"16px 18px", borderRadius:"12px", background:"#f8f5f0", border:"1px solid #e8e0d5" }}>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px", color:"#9a8f85",
        letterSpacing:"0.1em", marginBottom:"6px" }}>{label}</div>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"22px", fontWeight:700, color:"#2d2925" }}>
        {value}
        {unit && <span style={{ fontSize:"13px", marginLeft:"4px", color:"#9a8f85" }}>{unit}</span>}
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
      <div>{payload[0].value.toFixed(1)}<span style={{ color:"#9a8f85", marginLeft:"4px" }}>%</span></div>
    </div>
  );
}

// ── HALAMAN UTAMA ────────────────────────────────────────────────
export default function Dashboard() {
  const { sensor, history, online } = useSensorData();
  const { pompa, loading, kontrolPompa } = usePompaData();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #f0ece4; min-height: 100vh; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .card { background:#fffdf9; border-radius:16px; border:1px solid #e8e0d5;
                padding:24px; animation:fadeIn 0.4s ease both; }
        .card-label { font-family:'DM Mono',monospace; font-size:10px;
                      letter-spacing:0.12em; color:#9a8f85; margin-bottom:12px; }
        button:hover:not(:disabled) { filter:brightness(0.92); }
      `}</style>

      <div style={{ maxWidth:"960px", margin:"0 auto", padding:"32px 20px 60px", fontFamily:"'Lora',serif" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
          marginBottom:"32px", flexWrap:"wrap", gap:"12px" }}>
          <div>
            <h1 style={{ fontFamily:"'Lora',serif", fontSize:"28px", fontWeight:700, color:"#1a1814" }}>
              Monitoring Penyiram
            </h1>
            <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"12px", color:"#9a8f85",
              marginTop:"4px", letterSpacing:"0.05em" }}>
              Tanaman Cabai Rawit — ESP32 IoT
            </p>
          </div>
          <StatusBadge online={online} />
        </div>

        {/* Grid atas: gauge + kontrol */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px", marginBottom:"16px" }}>
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
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px", marginBottom:"16px" }}>
          <InfoCard label="KELEMBABAN SAAT INI"
            value={sensor ? sensor.kelembaban_persen.toFixed(1) : "—"} unit="%" />
          <InfoCard label="THRESHOLD PENYIRAMAN" value="< 60" unit="%" />
          <InfoCard label="STATUS MODE" value={pompa?.mode?.toUpperCase() ?? "—"} />
        </div>

        {/* Grafik history */}
        <div className="card">
          <div className="card-label">RIWAYAT KELEMBABAN (20 PEMBACAAN TERAKHIR)</div>
          {history.length === 0 ? (
            <div style={{ height:"200px", display:"flex", alignItems:"center", justifyContent:"center",
              color:"#9a8f85", fontFamily:"'DM Mono',monospace", fontSize:"13px" }}>
              Menunggu data dari ESP32...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top:8, right:8, left:-20, bottom:0 }}>
                <CartesianGrid stroke="#f0ece4" strokeDasharray="4 4" />
                <XAxis dataKey="time"
                  tick={{ fontFamily:"'DM Mono',monospace", fontSize:10, fill:"#9a8f85" }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0,100]}
                  tick={{ fontFamily:"'DM Mono',monospace", fontSize:10, fill:"#9a8f85" }}
                  tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={60} stroke="#f4a261" strokeDasharray="5 4"
                  label={{ value:"60% batas siram", position:"insideTopRight",
                    fontFamily:"'DM Mono',monospace", fontSize:10, fill:"#f4a261" }} />
                <Line type="monotone" dataKey="value" stroke="#2d6a4f" strokeWidth={2.5}
                  dot={{ r:3, fill:"#2d6a4f", strokeWidth:0 }}
                  activeDot={{ r:5, fill:"#2d6a4f" }} animationDuration={400} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:"28px", fontFamily:"'DM Mono',monospace",
          fontSize:"11px", color:"#b5aba0", letterSpacing:"0.05em" }}>
          ESP32 polling Firebase setiap 5 detik · Data diperbarui realtime
        </div>
      </div>
    </>
  );
}
