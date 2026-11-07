// Development launcher: starts Vite, waits for it to respond, then opens Electron against it.
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");
const clientDir = path.join(projectRoot, "client");
const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
let clientProcess = null;

function isViteRunning() {
  return new Promise((resolve) => {
    const request = http.get("http://localhost:5173", (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(1_000, () => request.destroy());
    request.once("error", () => resolve(false));
  });
}

async function waitForVite(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isViteRunning()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not start on http://localhost:5173 within 30 seconds.");
}

function stopClient() {
  if (clientProcess && !clientProcess.killed) {
    clientProcess.kill();
  }
}

async function main() {
  if (!(await isViteRunning())) {
    clientProcess = spawn(process.execPath, [npmCli, "run", "dev", "--prefix", clientDir], {
      cwd: projectRoot,
      stdio: "inherit"
    });
    await waitForVite();
  }

  const electronProcess = spawn(require("electron"), [path.join(projectRoot, "desktop")], {
    cwd: path.join(projectRoot, "desktop"),
    stdio: "inherit"
  });

  electronProcess.once("exit", (code) => {
    stopClient();
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", () => {
  stopClient();
  process.exit();
});

main().catch((error) => {
  console.error(error.message);
  stopClient();
  process.exit(1);
});
