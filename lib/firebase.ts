import { initializeApp, getApps } from "firebase/app";
import {
  getDatabase, ref, onValue, set, get, update,
  query, orderByKey, startAt, endAt, limitToFirst, limitToLast,
} from "firebase/database";

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

// Satu sampel riwayat per menit di /history/sensor/{epochDetik}
export interface HistorySample {
  t:      number;  // epoch ms saat dicatat (jam browser/server, bukan jam ESP32)
  persen: number;
  raw:    number;
  pompa:  boolean;
  mode:   string;
}

// Satu sesi penyiraman (pompa ON → OFF) di /history/siram/{epochDetik mulai}
export interface SiramSession {
  mulai:        number;  // epoch ms
  selesai:      number;  // epoch ms
  durasi_detik: number;
  mode:         string;
  sumber:       "web" | "cron";
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

// ── Pencatatan riwayat (dijalankan browser saat dashboard terbuka) ──

// Key = epoch detik dibulatkan ke menit → idempoten: dua tab yang
// terbuka bersamaan menulis key yang sama, tidak ada data dobel.
let lastLoggedBucket = 0;

export async function logSensorSample(sensor: SensorData, pompa: PompaData | null) {
  const bucket = Math.floor(Date.now() / 60_000) * 60;
  if (bucket === lastLoggedBucket) return;
  lastLoggedBucket = bucket;

  const sample: HistorySample = {
    t:      Date.now(),
    persen: sensor.kelembaban_persen,
    raw:    sensor.kelembaban_raw,
    pompa:  pompa?.status ?? false,
    mode:   pompa?.mode ?? "otomatis",
  };
  await Promise.all([
    set(ref(db, `/history/sensor/${bucket}`), sample),
    // Heartbeat: memberi tahu cron logger bahwa browser sedang aktif mencatat
    set(ref(db, "/logger/heartbeat"), Date.now()),
  ]);
}

export async function logSiramSession(session: SiramSession) {
  // Key deterministik (epoch detik mulai, bucket 5 dtk) agar dua tab
  // yang mendeteksi transisi yang sama tidak membuat entri ganda.
  const key = Math.floor(session.mulai / 5_000) * 5;
  await set(ref(db, `/history/siram/${key}`), session);
}

// ── Pembacaan riwayat ──

export function listenHistory(fromMs: number, callback: (samples: HistorySample[]) => void) {
  const fromKey = String(Math.floor(fromMs / 60_000) * 60);
  const q = query(ref(db, "/history/sensor"), orderByKey(), startAt(fromKey));
  return onValue(q, (snapshot) => {
    const samples: HistorySample[] = [];
    snapshot.forEach((child) => { samples.push(child.val() as HistorySample); });
    callback(samples);
  });
}

export function listenSiramSessions(callback: (sessions: SiramSession[]) => void, max = 500) {
  const q = query(ref(db, "/history/siram"), orderByKey(), limitToLast(max));
  return onValue(q, (snapshot) => {
    const sessions: SiramSession[] = [];
    snapshot.forEach((child) => { sessions.push(child.val() as SiramSession); });
    sessions.sort((a, b) => a.mulai - b.mulai);
    callback(sessions);
  });
}

// ── Retensi: hapus sampel lebih tua dari N hari (dipanggil saat dashboard dibuka) ──

export async function cleanupOldHistory(days = 30): Promise<number> {
  const cutoffKey = String(Math.floor((Date.now() - days * 86_400_000) / 1000));
  const q = query(ref(db, "/history/sensor"), orderByKey(), endAt(cutoffKey), limitToFirst(2000));
  const snapshot = await get(q);
  if (!snapshot.exists()) return 0;

  const updates: Record<string, null> = {};
  snapshot.forEach((child) => { if (child.key) updates[child.key] = null; });
  await update(ref(db, "/history/sensor"), updates);
  return Object.keys(updates).length;
}
