import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Ayarlar ve tarayıcı profili kullanıcının ev klasöründe tutulur (depo klasöründe değil):
 *   Windows: C:\Users\<ad>\.hfo-runner   Mac: /Users/<ad>/.hfo-runner
 * LinkedIn şifresi hiçbir yerde saklanmaz; oturum yalnızca bu klasördeki Chrome profilindedir.
 */
export const HOME = join(homedir(), ".hfo-runner");
export const PROFILE_DIR = join(HOME, "chrome-profili");
export const LOG_DIR = join(HOME, "kayitlar");
const CONFIG_FILE = join(HOME, "ayarlar.json");

export interface Config {
  panelUrl: string;
  token: string;
}

export async function loadConfig(): Promise<Config> {
  await mkdir(HOME, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });
  try {
    const c = JSON.parse(await readFile(CONFIG_FILE, "utf8")) as Partial<Config>;
    if (c.panelUrl && c.token) return { panelUrl: c.panelUrl, token: c.token };
  } catch {
    /* ilk çalıştırma */
  }
  const rl = createInterface({ input: stdin, output: stdout });
  console.log("\nİlk kurulum. Panelde LinkedIn hesapları sayfasından bağlantı anahtarı oluşturun.\n");
  // Hazır pakette panel adresi gömülüdür; yalnızca anahtar sorulur
  let panelUrl = (process.env.HFO_DEFAULT_PANEL ?? "").replace(/\/+$/, "");
  if (panelUrl) console.log(`Panel: ${panelUrl}`);
  while (!/^https?:\/\/\S+$/.test(panelUrl)) panelUrl = (await rl.question("Panel adresi (ör. https://outreach-ornek.vercel.app): ")).trim().replace(/\/+$/, "");
  let token = "";
  while (!/^hfo_[A-Za-z0-9_-]{20,}$/.test(token)) token = (await rl.question("Bağlantı anahtarını yapıştırın (sağ tık ya da Ctrl+V, sonra Enter): ")).trim();
  rl.close();
  const c = { panelUrl, token };
  await writeFile(CONFIG_FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
  return c;
}

/** Anahtarı ve panel adresini siler (yeni anahtar girmek için). Tarayıcı profili korunur. */
export async function resetConfig() {
  await rm(CONFIG_FILE, { force: true });
}
