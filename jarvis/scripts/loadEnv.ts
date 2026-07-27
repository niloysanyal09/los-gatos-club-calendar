// Minimal .env loader for headless scripts (Next.js loads .env itself, tsx
// does not). Import this first in any script that needs API keys.
import { readFileSync } from "fs";
import { join } from "path";

try {
  const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // no .env — rely on ambient environment
}
