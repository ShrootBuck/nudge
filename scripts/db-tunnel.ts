export {};

// Optional administrative access for Prisma Studio or schema changes.
// Local generation uses Nudge's authenticated HTTPS API and needs no tunnel.
const host = process.env.NUDGE_SSH_HOST || "zayd@pickleballs";
const container =
  process.env.NUDGE_DATABASE_CONTAINER || "apiijmbdlkucfbp3nw7mybuv";
const port = process.env.NUDGE_DATABASE_LOCAL_PORT || "54329";
if (!/^[a-zA-Z0-9_-]+$/.test(container) || !/^\d{1,5}$/.test(port)) {
  throw new Error("Invalid tunnel configuration");
}
const inspect = Bun.spawn(
  [
    "ssh",
    "-o",
    "BatchMode=yes",
    host,
    `sudo -n docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${container}`,
  ],
  { stdout: "pipe", stderr: "inherit" },
);
const address = (await new Response(inspect.stdout).text()).trim();
if ((await inspect.exited) || !/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
  throw new Error("Cannot resolve the private database container through SSH");
}
console.log(
  `Opening private database tunnel on 127.0.0.1:${port}. Keep this process running.`,
);
const tunnel = Bun.spawn(
  [
    "ssh",
    "-N",
    "-o",
    "BatchMode=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-L",
    `127.0.0.1:${port}:${address}:5432`,
    host,
  ],
  { stdout: "inherit", stderr: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => tunnel.kill(signal));
process.exitCode = await tunnel.exited;
