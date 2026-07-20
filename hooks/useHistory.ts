"use client";
import { useEffect, useMemo, useState } from "react";
import {
  HistorySample, SiramSession,
  listenHistory, listenSiramSessions,
} from "@/lib/firebase";

// ── Grafik riwayat dari /history/sensor ─────────────────────────

export type ChartRange = "live" | "30m" | "3h" | "24h" | "7d";

export const RANGE_LABELS: Record<ChartRange, string> = {
  live: "LIVE",
  "30m": "30 MNT",
  "3h":  "3 JAM",
  "24h": "24 JAM",
  "7d":  "7 HARI",
};

const RANGE_MS: Record<Exclude<ChartRange, "live">, number> = {
  "30m": 30 * 60_000,
  "3h":  3 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d":  7 * 86_400_000,
};

// Ukuran bucket downsampling (menit) agar chart tetap ringan
const BUCKET_MIN: Record<Exclude<ChartRange, "live">, number> = {
  "30m": 1,
  "3h":  1,
  "24h": 10,
  "7d":  60,
};

export interface ChartPoint {
  time:  string;
  value: number;
}

function labelWaktu(ms: number, range: ChartRange): string {
  const d = new Date(ms);
  const jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") {
    const tgl = d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit" });
    return `${tgl} ${jam}`;
  }
  return jam;
}

export function useHistoryChart(range: ChartRange) {
  const [samples, setSamples] = useState<HistorySample[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (range === "live") { setSamples([]); return; }
    setLoading(true);
    setSamples([]);
    const unsub = listenHistory(Date.now() - RANGE_MS[range], (data) => {
      setSamples(data);
      setLoading(false);
    });
    return () => unsub();
  }, [range]);

  const points = useMemo<ChartPoint[]>(() => {
    if (range === "live") return [];
    const bucketMs = BUCKET_MIN[range] * 60_000;
    const buckets = new Map<number, { sum: number; n: number }>();
    for (const s of samples) {
      const b = Math.floor(s.t / bucketMs) * bucketMs;
      const cur = buckets.get(b) ?? { sum: 0, n: 0 };
      cur.sum += s.persen;
      cur.n   += 1;
      buckets.set(b, cur);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, v]) => ({
        time:  labelWaktu(b, range),
        value: +(v.sum / v.n).toFixed(1),
      }));
  }, [samples, range]);

  return { points, loading };
}

// ── Statistik penyiraman dari /history/siram + /history/sensor ──

export interface WateringStats {
  totalSesi:            number;        // seluruh sesi tercatat
  siramHariIni:         number;        // jumlah penyiraman hari ini
  totalDetikHariIni:    number;        // total durasi pompa menyala hari ini
  avgDurasiDetik:       number | null; // rata-rata durasi per penyiraman
  avgIntervalDetik:     number | null; // rata-rata jarak antar penyiraman
  avgKelembabanHariIni: number | null; // rata-rata kelembaban hari ini
}

export function useWateringStats(enabled = true): WateringStats {
  const [sessions,     setSessions]     = useState<SiramSession[]>([]);
  const [todaySamples, setTodaySamples] = useState<HistorySample[]>([]);

  // Saat panel statistik disembunyikan, jangan subscribe ke Firebase
  // supaya tidak membuang kuota download.
  useEffect(() => {
    if (!enabled) { setSessions([]); return; }
    return listenSiramSessions(setSessions);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setTodaySamples([]); return; }
    const awalHari = new Date();
    awalHari.setHours(0, 0, 0, 0);
    return listenHistory(awalHari.getTime(), setTodaySamples);
  }, [enabled]);

  return useMemo<WateringStats>(() => {
    const awalHari = new Date();
    awalHari.setHours(0, 0, 0, 0);
    const t0 = awalHari.getTime();

    const hariIni = sessions.filter((s) => s.selesai >= t0);

    // Interval antar siram: selesai sesi n-1 → mulai sesi n.
    // Jeda > 48 jam diabaikan (kemungkinan besar alat sedang mati).
    const intervals: number[] = [];
    for (let i = 1; i < sessions.length; i++) {
      const gap = (sessions[i].mulai - sessions[i - 1].selesai) / 1000;
      if (gap > 0 && gap < 48 * 3600) intervals.push(gap);
    }

    const rata = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return {
      totalSesi:            sessions.length,
      siramHariIni:         hariIni.length,
      totalDetikHariIni:    hariIni.reduce((a, s) => a + s.durasi_detik, 0),
      avgDurasiDetik:       rata(sessions.map((s) => s.durasi_detik)),
      avgIntervalDetik:     rata(intervals),
      avgKelembabanHariIni: rata(todaySamples.map((s) => s.persen)),
    };
  }, [sessions, todaySamples]);
}

// ── Format durasi untuk tampilan ────────────────────────────────

export function formatDurasi(detik: number | null): string {
  if (detik === null || !isFinite(detik)) return "—";
  const d = Math.round(detik);
  if (d < 60)    return `${d} dtk`;
  if (d < 3600)  return `${Math.floor(d / 60)} mnt ${d % 60} dtk`;
  const jam   = Math.floor(d / 3600);
  const menit = Math.round((d % 3600) / 60);
  return `${jam} jam ${menit} mnt`;
}
