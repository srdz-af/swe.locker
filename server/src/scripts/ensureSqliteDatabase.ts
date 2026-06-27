import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

if (!databaseUrl.startsWith("file:")) {
  process.exit(0);
}

const databasePath = databasePathFromUrl(databaseUrl);
const databaseDirectory = path.dirname(databasePath);

fs.mkdirSync(databaseDirectory, { recursive: true });

if (!fs.existsSync(databasePath)) {
  fs.closeSync(fs.openSync(databasePath, "w"));
  console.log(`Created SQLite database file at ${databasePath}`);
}

function databasePathFromUrl(url: string) {
  const filePath = url.slice("file:".length);
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}
