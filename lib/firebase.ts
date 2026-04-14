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
