import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import type { StaffRole } from "@kummie/contracts";
import { sql } from "drizzle-orm";
import { hashPassword, passwordProblems } from "../auth/crypto";
import { loadConfig } from "../config";
import { createDatabase, type Database } from "../db/client";
import { staffUsers } from "../db/schema";
import { audit } from "./context";

/**
 * Creates a staff account. 2FA is set up on the first sign-in in the admin panel.
 *   pnpm --filter api staff:create --email owner@kummie.eu --name "Svetoslav" --role admin
 * The password is typed in the terminal (hidden) and never passed on the command line.
 */
export async function createStaff(
  db: Database,
  input: { email: string; name: string; role: StaffRole; password: string },
): Promise<string> {
  const problems = passwordProblems(input.password);
  if (problems.length > 0) throw new Error(`Password needs: ${problems.join(", ")}`);
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(sql`lower(${staffUsers.email}) = ${email}`);
  if (existing) throw new Error(`A staff account for ${email} already exists`);
  const [row] = await db
    .insert(staffUsers)
    .values({
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning({ id: staffUsers.id });
  if (!row) throw new Error("Could not create the account");
  await audit(db, null, "staff.created", "staff", row.id, { email, role: input.role, via: "cli" });
  return row.id;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    // readline has no public hook for hiding typed input; muting its private writer is the usual way.
    // oxlint-disable-next-line no-underscore-dangle
    const writeOriginal = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    let prompted = false;
    // oxlint-disable-next-line no-underscore-dangle
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!prompted) {
        prompted = true;
        writeOriginal.call(rl, s);
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const email = arg("email");
    const name = arg("name");
    const role = (arg("role") ?? "admin") as StaffRole;
    if (!email || !name || !["admin", "hub", "content"].includes(role)) {
      console.error(
        'Usage: pnpm --filter api staff:create --email you@kummie.eu --name "Your Name" --role admin|hub|content',
      );
      process.exit(1);
    }
    const config = loadConfig();
    if (!config.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const password = await askHidden("Password (min. 12 characters, letters + digits/symbols): ");
    const again = await askHidden("Repeat the password: ");
    if (password !== again) throw new Error("The passwords do not match");
    const handle = createDatabase(config.DATABASE_URL, 1);
    try {
      await createStaff(handle.db, { email, name, role, password });
      console.log(`Created ${role} account for ${email}. Sign in to the admin panel to set up 2FA.`);
    } finally {
      await handle.close();
    }
  })().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
