# Sistem Penyiram Tanaman Otomatis — IoT ESP32 + Next.js

## Konteks Proyek

Skripsi: **Rancang Bangun Prototype Penyiram Tanaman Otomatis Berbasis IoT pada Budidaya Cabai**
Mahasiswa: Ahmad Abdul Rohib — Teknik Elektro UNESA 2025

Sistem IoT penyiraman otomatis tanaman cabai rawit. ESP32 membaca sensor
kelembaban tanah, mengontrol pompa via relay, dan sinkronisasi dua arah
dengan Firebase Realtime Database. Website Next.js di Vercel gratis untuk
monitoring dan kontrol manual dari browser.

---

## Stack Teknologi

| Layer      | Teknologi                              |
|------------|----------------------------------------|
| Hardware   | NodeMCU ESP32, Capacitive Soil Moisture Sensor, Relay Module, Pompa DC, Step-Down LM2596 |
| Firmware   | Arduino C++ (Arduino IDE / PlatformIO) |
| Database   | Firebase Realtime Database (gratis)    |
| Frontend   | Next.js 16.2.3 + TypeScript + Recharts |
| Hosting    | Vercel free tier                       |
| Dev env    | Docker (tidak ada Node di local)       |

---

## Arsitektur Sistem

```
[Soil Moisture Sensor] ──analog──▶ [ESP32] ──HTTP PUT──▶ [Firebase RTDB]
                                      │                        │
                              [Relay + Pompa]          realtime listener
                                      │                        │
                              ◀──poll 5 detik──    [Next.js di Vercel]
                              /command/pump              (browser)
```

**Alur data:**
- ESP32 baca sensor tiap 5 detik → tulis ke `/sensor` di Firebase
- Browser subscribe realtime ke `/sensor` dan `/pompa` → update UI otomatis
- Tombol kontrol di browser → tulis ke `/command/pump` di Firebase
- ESP32 poll `/command/pump` tiap 5 detik → eksekusi perintah

**Kenapa Firebase, bukan WebSocket/MQTT:**
Vercel gratis = serverless, max eksekusi 10 detik per request. WebSocket
dan MQTT butuh koneksi persisten — tidak mungkin di Vercel gratis.
Firebase RTDB menangani koneksi persisten di sisi mereka, Vercel hanya
serve halaman Next.js statis.

---

## Struktur Direktori

```
plant-monitor/
├── app/
│   ├── layout.tsx
│   └── page.tsx              ← dashboard utama (gauge + chart + kontrol)
├── hooks/
│   └── usePlantData.ts       ← custom hooks Firebase realtime
├── lib/
│   └── firebase.ts           ← konfigurasi + helper Firebase
├── .env.local                ← TIDAK di-commit ke Git
├── .env.example              ← template env (di-commit)
├── .gitignore
├── docker-compose.yml        ← dev environment
├── Dockerfile.dev
├── package.json
├── tsconfig.json
├── next.config.js
└── CLAUDE.md                 ← file ini
```

---

## Setup Docker (karena tidak ada Node di local)

### `Dockerfile.dev`

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies dulu (layer cache)
COPY package.json package-lock.json* ./
RUN npm install

# Copy semua source
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### `docker-compose.yml`

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      # Mount source code agar hot-reload berjalan
      - .:/app
      # Jangan mount node_modules dari host (tidak ada)
      - /app/node_modules
    environment:
      - NEXT_TELEMETRY_DISABLED=1
    env_file:
      - .env.local
```

### Perintah dev sehari-hari

```bash
# Pertama kali / setelah ubah package.json
docker compose build

# Jalankan dev server
docker compose up

# Jalankan di background
docker compose up -d

# Lihat log
docker compose logs -f web

# Stop
docker compose down

# Masuk ke container (jika perlu install sesuatu)
docker compose exec web sh

# Install package baru dari dalam container
docker compose exec web npm install nama-package
```

---

## Environment Variables

Buat file `.env.local` di root project (JANGAN commit ke Git):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy-xxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=nama-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://nama-project-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=nama-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=nama-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**Cara dapat nilai ini:**
Firebase Console → Project Settings → General → scroll bawah →
klik ikon `</>` (web) → register app → salin `firebaseConfig` object.

---

## Firebase Setup

### 1. Buat project Firebase
- Buka [console.firebase.google.com](https://console.firebase.google.com)
- Klik "Add project" → beri nama → disable Google Analytics (tidak perlu)

### 2. Aktifkan Realtime Database
- Sidebar → Build → Realtime Database → Create Database
- Pilih region: `asia-southeast1 (Singapore)` untuk latensi rendah dari Indonesia
- Start in **test mode** dulu (semua bisa baca/tulis)

### 3. Rules database (mode development)
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
> Perketat rules ini sebelum presentasi/produksi.

### 4. Struktur data di Firebase (terbentuk otomatis saat ESP32 berjalan)
```
root/
├── sensor/
│   ├── kelembaban_persen   (float)  → contoh: 45.2
│   ├── kelembaban_raw      (int)    → contoh: 2100
│   └── timestamp           (int)    → detik sejak ESP32 boot
├── pompa/
│   ├── status              (bool)   → true = ON, false = OFF
│   └── mode                (string) → "otomatis" atau "manual"
└── command/
    └── pump                (string) → "on", "off", "auto", atau "none"
```

---

## Kode `package.json`

```json
{
  "name": "plant-monitor",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "firebase": "^10.12.0",
    "recharts": "^2.12.0",
    "date-fns": "^3.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.0.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3"
  }
}
```

---

## Kode `lib/firebase.ts`

```typescript
import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const db = getDatabase(app);

// Types
export interface SensorData {
  kelembaban_persen: number;
  kelembaban_raw:    number;
  timestamp:         number;
}

export interface PompaData {
  status: boolean;
  mode:   "otomatis" | "manual";
}

// Realtime listeners
export function listenSensor(callback: (data: SensorData) => void) {
  const sensorRef = ref(db, "/sensor");
  return onValue(sensorRef, (snapshot) => {
    if (snapshot.exists()) callback(snapshot.val() as SensorData);
  });
}

export function listenPompa(callback: (data: PompaData) => void) {
  const pompaRef = ref(db, "/pompa");
  return onValue(pompaRef, (snapshot) => {
    if (snapshot.exists()) callback(snapshot.val() as PompaData);
  });
}

// Kirim command ke ESP32
export async function sendCommand(cmd: "on" | "off" | "auto") {
  await set(ref(db, "/command/pump"), cmd);
}
```

---

## Kode `hooks/usePlantData.ts`

```typescript
"use client";
import { useEffect, useState } from "react";
import {
  listenSensor, listenPompa, sendCommand,
  SensorData, PompaData,
} from "@/lib/firebase";

export interface HistoryPoint {
  time:  string;
  value: number;
}

export function useSensorData() {
  const [sensor,  setSensor]  = useState<SensorData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [online,  setOnline]  = useState(false);

  useEffect(() => {
    const unsub = listenSensor((data) => {
      setSensor(data);
      setOnline(true);

      const label = new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      setHistory((prev) => {
        const next = [...prev, { time: label, value: data.kelembaban_persen }];
        return next.length > 20 ? next.slice(-20) : next;
      });
    });

    // Deteksi offline jika tidak ada data > 30 detik
    const timer = setInterval(() => {
      setSensor((prev) => {
        if (!prev) return prev;
        if (Math.floor(Date.now() / 1000) - prev.timestamp > 30) setOnline(false);
        return prev;
      });
    }, 5000);

    return () => { unsub(); clearInterval(timer); };
  }, []);

  return { sensor, history, online };
}

export function usePompaData() {
  const [pompa,   setPompa]   = useState<PompaData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = listenPompa((data) => { setPompa(data); setLoading(false); });
    return () => unsub();
  }, []);

  const kontrolPompa = async (cmd: "on" | "off" | "auto") => {
    setLoading(true);
    await sendCommand(cmd);
    setTimeout(() => setLoading(false), 5000);
  };

  return { pompa, loading, kontrolPompa };
}
```

---

## Kode `app/layout.tsx`

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "Monitoring Penyiram Tanaman — IoT ESP32",
  description: "Dashboard monitoring kelembaban tanah dan kontrol pompa berbasis IoT",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
```

---

## Kode `app/page.tsx`

```typescript
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
```

---

## Kode `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

## Kode `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## Kode `tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./hooks/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

## Kode `postcss.config.js`

```javascript
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

## Kode `.env.example`

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy-isi-dari-firebase-console
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=nama-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://nama-project-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=nama-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=nama-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

## Kode `.gitignore`

```gitignore
# dependencies
/node_modules
/.pnp
.pnp.js

# next.js
/.next/
/out/

# production
/build

# env — JANGAN commit ini!
.env.local
.env.*.local

# debug
npm-debug.log*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

---

## Kode ESP32 Arduino (referensi lengkap)

### Library yang diinstall di Arduino IDE
- `Firebase ESP32 Client` by Mobizt
- `ArduinoJson` by Benoit Blanchon

### Pin mapping
| Komponen              | Pin ESP32  | Keterangan              |
|-----------------------|------------|-------------------------|
| Soil Moisture AOUT    | GPIO34     | Input ADC (read-only)   |
| Soil Moisture VCC     | 3.3V       | Tegangan sensor         |
| Soil Moisture GND     | GND        | Ground                  |
| Relay IN              | GPIO14     | Output digital          |
| Relay VCC             | 5V (VIN)   | Dari step-down          |
| Relay GND             | GND        | Ground                  |
| Relay COM             | 12V adaptor| Sumber daya pompa       |
| Relay NO              | Pompa (+)  | Normally Open           |
| Pompa (-)             | GND        | Ground                  |

### Kode lengkap `penyiram_tanaman.ino`

```cpp
// ================================================================
//  SISTEM PENYIRAM TANAMAN OTOMATIS - ESP32
//  Hardware : ESP32, Capacitive Soil Moisture, Relay, Pompa DC
//  Platform : Firebase RTDB + Next.js di Vercel
//  Library  : Firebase ESP32 Client (Mobizt), ArduinoJson
// ================================================================

#include <WiFi.h>
#include <FirebaseESP32.h>
#include <ArduinoJson.h>

// ── Konfigurasi — UBAH BAGIAN INI ───────────────────────────────
#define WIFI_SSID     "NamaWiFimu"
#define WIFI_PASSWORD "PasswordWiFimu"

// Firebase Console → Project Settings → Service Accounts → Database Secrets
#define FIREBASE_HOST "nama-project-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "database-secret-key"

// ── Pin ─────────────────────────────────────────────────────────
#define PIN_SOIL   34   // ADC input — GPIO34 input-only, tidak bisa OUTPUT
#define PIN_RELAY  14   // Digital output ke relay (active-LOW)

// ── Kalibrasi sensor (ukur sendiri dengan Serial Monitor) ────────
// Tempel sensor di udara bebas → catat nilai raw → isi SOIL_KERING
// Celup sensor ke air → catat nilai raw → isi SOIL_BASAH
#define SOIL_KERING  3200
#define SOIL_BASAH   800

// ── Threshold: pompa ON jika kelembaban di bawah nilai ini ───────
#define THRESHOLD_PERSEN  60.0

// ── Interval (milliseconds) ──────────────────────────────────────
#define INTERVAL_SENSOR    5000
#define INTERVAL_FIREBASE 10000
#define INTERVAL_COMMAND   5000

// ── Firebase paths ───────────────────────────────────────────────
#define PATH_SENSOR_PERSEN    "/sensor/kelembaban_persen"
#define PATH_SENSOR_RAW       "/sensor/kelembaban_raw"
#define PATH_SENSOR_TS        "/sensor/timestamp"
#define PATH_POMPA_STATUS     "/pompa/status"
#define PATH_POMPA_MODE       "/pompa/mode"
#define PATH_COMMAND_PUMP     "/command/pump"

// ── Global state ─────────────────────────────────────────────────
FirebaseData   fbData;
FirebaseAuth   fbAuth;
FirebaseConfig fbConfig;

bool  pumpState  = false;
bool  modeManual = false;
float soilPersen = 0.0;
int   soilRaw    = 0;

unsigned long lastSensor   = 0;
unsigned long lastFirebase = 0;
unsigned long lastCommand  = 0;

// ── Baca sensor (rata-rata 10 sampel) ────────────────────────────
float bacaSensor() {
  long total = 0;
  for (int i = 0; i < 10; i++) { total += analogRead(PIN_SOIL); delay(5); }
  soilRaw = constrain((int)(total / 10), SOIL_BASAH, SOIL_KERING);
  return constrain((float)map(soilRaw, SOIL_KERING, SOIL_BASAH, 0, 100), 0.0, 100.0);
}

// ── Kontrol pompa ────────────────────────────────────────────────
void setPompa(bool nyala, String mode) {
  pumpState  = nyala;
  modeManual = (mode == "manual");
  digitalWrite(PIN_RELAY, nyala ? LOW : HIGH); // active-LOW relay
  Serial.printf("[POMPA] %s | Mode: %s\n", nyala ? "ON" : "OFF", mode.c_str());
}

// ── Kirim data ke Firebase ───────────────────────────────────────
void kirimFirebase() {
  if (!Firebase.ready()) return;
  Firebase.setFloat(fbData,  PATH_SENSOR_PERSEN, soilPersen);
  Firebase.setInt(fbData,    PATH_SENSOR_RAW,    soilRaw);
  Firebase.setInt(fbData,    PATH_SENSOR_TS,     (int)(millis() / 1000));
  Firebase.setBool(fbData,   PATH_POMPA_STATUS,  pumpState);
  Firebase.setString(fbData, PATH_POMPA_MODE,    modeManual ? "manual" : "otomatis");
  Serial.printf("[FB] Kirim: %.1f%% | Pompa: %s\n", soilPersen, pumpState ? "ON" : "OFF");
}

// ── Cek command dari website ─────────────────────────────────────
void cekCommand() {
  if (!Firebase.ready()) return;
  if (!Firebase.getString(fbData, PATH_COMMAND_PUMP)) return;

  String cmd = fbData.stringData();
  if (cmd == "on")   { setPompa(true,  "manual");   Firebase.setString(fbData, PATH_COMMAND_PUMP, "none"); }
  if (cmd == "off")  { setPompa(false, "manual");   Firebase.setString(fbData, PATH_COMMAND_PUMP, "none"); }
  if (cmd == "auto") { modeManual = false;           Firebase.setString(fbData, PATH_COMMAND_PUMP, "none"); }
}

// ── Logika otomatis ──────────────────────────────────────────────
void logikaPenyiraman() {
  if (modeManual) return;
  if (soilPersen < THRESHOLD_PERSEN && !pumpState) setPompa(true,  "otomatis");
  if (soilPersen >= THRESHOLD_PERSEN && pumpState) setPompa(false, "otomatis");
}

// ── Koneksi WiFi ─────────────────────────────────────────────────
void konekWiFi() {
  Serial.printf("[WiFi] Konek ke %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int n = 0;
  while (WiFi.status() != WL_CONNECTED && n++ < 30) { delay(500); Serial.print("."); }
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("\n[WiFi] OK — IP: %s\n", WiFi.localIP().toString().c_str());
  else { Serial.println("\n[WiFi] Gagal, restart..."); ESP.restart(); }
}

// ── Setup ────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Sistem Penyiram Tanaman IoT ===\n");

  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, HIGH); // pompa MATI saat boot

  konekWiFi();

  fbConfig.host = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);
  fbData.setResponseSize(1024);

  // Reset command lama saat boot
  Firebase.setString(fbData, PATH_COMMAND_PUMP, "none");

  soilPersen = bacaSensor();
  Serial.printf("[Sensor] Awal: %.1f%% (raw: %d)\n", soilPersen, soilRaw);
  Serial.println("[Siap] Loop dimulai...\n");
}

// ── Loop ─────────────────────────────────────────────────────────
void loop() {
  if (WiFi.status() != WL_CONNECTED) konekWiFi();

  unsigned long now = millis();

  if (now - lastSensor >= INTERVAL_SENSOR) {
    lastSensor = now;
    soilPersen = bacaSensor();
    Serial.printf("[Sensor] %.1f%% (raw: %d)\n", soilPersen, soilRaw);
    logikaPenyiraman();
  }

  if (now - lastCommand >= INTERVAL_COMMAND) {
    lastCommand = now;
    cekCommand();
  }

  if (now - lastFirebase >= INTERVAL_FIREBASE) {
    lastFirebase = now;
    kirimFirebase();
  }
}
```

---

## Deploy ke Vercel

```bash
# Install Vercel CLI di dalam container
docker compose exec web npm i -g vercel

# Login Vercel
docker compose exec web vercel login

# Deploy (dari dalam container)
docker compose exec web vercel

# Atau: push ke GitHub, lalu connect repo di vercel.com (lebih mudah)
```

**Tambahkan env variables di Vercel:**
Vercel Dashboard → Project → Settings → Environment Variables →
salin semua isi `.env.local` satu per satu.

---

## Urutan Pengerjaan yang Disarankan

1. **Setup Firebase** — buat project, aktifkan RTDB, salin config
2. **Buat `.env.local`** — isi dari Firebase config
3. **Buat semua file** sesuai struktur di atas
4. **Jalankan Docker** — `docker compose up`
5. **Upload kode ESP32** via Arduino IDE, buka Serial Monitor
6. **Kalibrasi sensor** — catat nilai raw kering dan basah, update define
7. **Verifikasi data** di Firebase Console (realtime database viewer)
8. **Cek dashboard** di `localhost:3000` — data harus muncul realtime
9. **Deploy ke Vercel** — connect GitHub repo atau via CLI
10. **Test kontrol** — tombol di website harus mengontrol pompa fisik

---

## Troubleshooting Umum

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Firebase tidak konek | Auth key salah | Cek `FIREBASE_AUTH` di kode ESP32 |
| Nilai sensor tidak masuk akal | Belum kalibrasi | Ukur SOIL_KERING dan SOIL_BASAH ulang |
| Pompa tidak bereaksi | Relay wiring salah | Cek apakah relay active-LOW, cek pin GPIO14 |
| Website tidak update | Env var Vercel kosong | Tambahkan env var di Vercel dashboard |
| Docker: port 3000 sudah dipakai | Port conflict | Ganti ke `"3001:3000"` di docker-compose.yml |
| `npm install` gagal di Docker | Network issue | Coba `docker compose build --no-cache` |