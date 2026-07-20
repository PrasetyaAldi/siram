"use client";
import { useEffect, useRef, useState } from "react";
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

  // sensor.timestamp = detik sejak ESP32 boot (bukan epoch), jadi
  // kesegaran data dilacak pakai jam browser: timestamp berubah = data baru.
  const lastArrivalRef = useRef(0);
  const lastEspTsRef   = useRef<number | null>(null);

  useEffect(() => {
    const unsub = listenSensor((data) => {
      setSensor(data);

      if (lastEspTsRef.current !== data.timestamp) {
        lastEspTsRef.current   = data.timestamp;
        lastArrivalRef.current = Date.now();
        setOnline(true);
      }

      const label = new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      setHistory((prev) => {
        const next = [...prev, { time: label, value: data.kelembaban_persen }];
        return next.length > 20 ? next.slice(-20) : next;
      });
    });

    // Deteksi offline jika tidak ada data baru > 30 detik
    const timer = setInterval(() => {
      if (lastArrivalRef.current && Date.now() - lastArrivalRef.current > 30_000) {
        setOnline(false);
      }
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
