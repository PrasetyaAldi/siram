"use client";
import { useEffect, useRef } from "react";
import {
  SensorData, PompaData,
  logSensorSample, logSiramSession,
} from "@/lib/firebase";

// Pencatat riwayat sisi browser: menyalin data realtime dari ESP32
// ke /history di Firebase selama dashboard terbuka.
// ESP32 tidak perlu diubah sama sekali.
export function useHistoryLogger(sensor: SensorData | null, pompa: PompaData | null) {
  const pompaRef = useRef(pompa);
  pompaRef.current = pompa;

  // ── Sampel sensor (satu entri per menit) ──
  const lastEspTsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!sensor) return;
    // Snapshot pertama dari Firebase bisa berupa data lama (cache) saat
    // ESP32 mati — mulai mencatat setelah timestamp ESP32 terbukti berubah.
    if (lastEspTsRef.current === null) {
      lastEspTsRef.current = sensor.timestamp;
      return;
    }
    if (sensor.timestamp === lastEspTsRef.current) return;
    lastEspTsRef.current = sensor.timestamp;

    logSensorSample(sensor, pompaRef.current).catch(() => {});
  }, [sensor]);

  // ── Sesi penyiraman (deteksi transisi pompa ON → OFF) ──
  const prevStatusRef = useRef<boolean | null>(null);
  const mulaiRef      = useRef(0);
  useEffect(() => {
    if (!pompa) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = pompa.status;
    if (prev === null) return; // snapshot awal, bukan transisi

    if (!prev && pompa.status) {
      mulaiRef.current = Date.now();
    } else if (prev && !pompa.status && mulaiRef.current) {
      const selesai = Date.now();
      logSiramSession({
        mulai:        mulaiRef.current,
        selesai,
        durasi_detik: Math.max(1, Math.round((selesai - mulaiRef.current) / 1000)),
        mode:         pompa.mode,
        sumber:       "web",
      }).catch(() => {});
      mulaiRef.current = 0;
    }
  }, [pompa]);
}
