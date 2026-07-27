import http from "http";

function toMetrics(health) {
  const lines = [];
  const streamers = health?.streamers || {};

  let online = 0;
  let probing = 0;
  let offline = 0;
  let errors = 0;

  for (const s of Object.values(streamers)) {
    if (s.status === "online") online += 1;
    else if (s.status === "probing") probing += 1;
    else if (s.status === "offline") offline += 1;
    else if (s.status === "error") errors += 1;
  }

  lines.push("# TYPE tiktok_monitor_streamers_online gauge");
  lines.push(`tiktok_monitor_streamers_online ${online}`);
  lines.push("# TYPE tiktok_monitor_streamers_probing gauge");
  lines.push(`tiktok_monitor_streamers_probing ${probing}`);
  lines.push("# TYPE tiktok_monitor_streamers_offline gauge");
  lines.push(`tiktok_monitor_streamers_offline ${offline}`);
  lines.push("# TYPE tiktok_monitor_streamers_error gauge");
  lines.push(`tiktok_monitor_streamers_error ${errors}`);
  lines.push("# TYPE tiktok_monitor_uptime_seconds gauge");
  lines.push(`tiktok_monitor_uptime_seconds ${Math.floor((health?.uptimeMs || 0) / 1000)}`);

  const metricMap = health?.metrics && typeof health.metrics === "object" ? health.metrics : {};
  for (const [name, value] of Object.entries(metricMap)) {
    const safeName = String(name).replace(/[^a-zA-Z0-9_:]/g, "_");
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    lines.push(`# TYPE tiktok_monitor_${safeName} counter`);
    lines.push(`tiktok_monitor_${safeName} ${n}`);
  }

  return lines.join("\n") + "\n";
}

export function createHealthServer({
  host = "0.0.0.0",
  port = 8787,
  getHealth
} = {}) {
  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    const health = typeof getHealth === "function" ? getHealth() : {};

    if (url === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(health, null, 2));
      return;
    }

    if (url === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      res.end(toMetrics(health));
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  return {
    start() {
      server.listen(port, host, () => {
        console.log(`🏥 Health server em http://${host}:${port}/health`);
      });
    },
    stop() {
      try { server.close(); } catch {}
    }
  };
}

