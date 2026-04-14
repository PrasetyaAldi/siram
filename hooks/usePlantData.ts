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
