import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const sourceDir = join(root, 'functions');
const targetDir = join(root, 'supabase', 'functions');

const entries = await readdir(sourceDir, { withFileTypes: true });

await mkdir(targetDir, { recursive: true });

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const source = join(sourceDir, entry.name);
  const target = join(targetDir, entry.name);

  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

console.log(`Prepared ${entries.filter((entry) => entry.isDirectory()).length} Supabase Edge Function folders.`);
