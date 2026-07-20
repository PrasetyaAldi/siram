import { NextResponse } from "next/server";

// Endpoint logging 24/7 — dipanggil cron-job.org tiap 1 menit.
// Membaca /sensor + /pompa via Firebase REST lalu menulis riwayat,
// sehingga pencatatan tetap jalan walau tidak ada browser terbuka.

export const dynamic = "force-dynamic";

const DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
const AUTH   = process.env.FIREBASE_DATABASE_SECRET
  ? `?auth=${process.env.FIREBASE_DATABASE_SECRET}`
  : "";

// Browser dianggap masih aktif mencatat jika heartbeat < 3 menit
// (browser memperbarui heartbeat sekali per menit).
const HEARTBEAT_STALE_MS = 3 * 60 * 1000;

async function fbGet(path: string) {
  const res = await fetch(`${DB_URL}${path}.json${AUTH}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Firebase GET ${path} gagal: ${res.status}`);
  return res.json();
}

async function fbSet(path: string, value: unknown) {
  const res = await fetch(`${DB_URL}${path}.json${AUTH}`, {
    method: "PUT",
    body:   JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Firebase PUT ${path} gagal: ${res.status}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (process.env.CRON_SECRET && url.searchParams.get("key") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!DB_URL) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_FIREBASE_DATABASE_URL belum diset" },
      { status: 500 },
    );
  }

  try {
    const [sensor, pompa, logger] = await Promise.all([
      fbGet("/sensor"), fbGet("/pompa"), fbGet("/logger"),
    ]);
    if (!sensor) {
      return NextResponse.json({ ok: true, online: false, note: "belum ada data sensor" });
    }

    const now   = Date.now();
    const state = logger?.cron ?? {};

    // sensor.timestamp = detik sejak ESP32 boot. Kalau nilainya tidak
    // berubah sejak run cron sebelumnya (1 menit lalu), berarti ESP32
    // tidak menulis apa-apa → device offline, jangan catat data basi.
    const online =
      state.lastBootTs === undefined || sensor.timestamp !== state.lastBootTs;

    let logged = false;
    if (online) {
      const bucket = Math.floor(now / 60_000) * 60;
      await fbSet(`/history/sensor/${bucket}`, {
        t:      now,
        persen: sensor.kelembaban_persen ?? 0,
        raw:    sensor.kelembaban_raw ?? 0,
        pompa:  !!pompa?.status,
        mode:   pompa?.mode ?? "otomatis",
      });
      logged = true;
    }

    // Deteksi sesi penyiraman — hanya saat tidak ada browser aktif,
    // supaya tidak dobel dengan pencatatan realtime di browser.
    const browserActive = now - (logger?.heartbeat ?? 0) < HEARTBEAT_STALE_MS;
    let pumpSince      = state.pumpSince ?? 0;
    let sessionWritten = false;

    if (browserActive) {
      pumpSince = 0; // browser yang mencatat; buang state parsial cron
    } else if (online && pompa) {
      if (!state.lastPump && pompa.status) {
        pumpSince = now;
      } else if (state.lastPump && !pompa.status && pumpSince) {
        await fbSet(`/history/siram/${Math.floor(pumpSince / 5_000) * 5}`, {
          mulai:        pumpSince,
          selesai:      now,
          durasi_detik: Math.max(1, Math.round((now - pumpSince) / 1000)),
          mode:         pompa.mode ?? "otomatis",
          sumber:       "cron",
        });
        pumpSince = 0;
        sessionWritten = true;
      }
    }

    await fbSet("/logger/cron", {
      lastBootTs: sensor.timestamp ?? 0,
      lastPump:   !!pompa?.status,
      pumpSince,
    });

    return NextResponse.json({ ok: true, online, logged, sessionWritten, browserActive });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 502 },
    );
  }
}
