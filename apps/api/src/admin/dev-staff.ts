import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDatabase } from "../db/client";
import { auditLog, settings, staffUsers } from "../db/schema";
import { createStaff } from "./staff-cli";

/**
 * Local development only: creates or removes a throw-away test staff account.
 *   tsx src/admin/dev-staff.ts create <email> <passwordFile>
 *   tsx src/admin/dev-staff.ts remove <email>
 * Refuses to run with NODE_ENV=production.
 */
const [command, email, passwordFile] = process.argv.slice(2);
const config = loadConfig();
if (config.NODE_ENV === "production") throw new Error("dev-staff is for local development only");
if (!config.DATABASE_URL || !email) throw new Error("usage: dev-staff create|remove <email> [passwordFile]");
const handle = createDatabase(config.DATABASE_URL, 1);
try {
  if (command === "create") {
    const password = readFileSync(passwordFile as string, "utf8").trim();
    await createStaff(handle.db, { email, name: "Test Admin", role: "admin", password });
    console.log(`created ${email}`);
  } else if (command === "remove") {
    const [row] = await handle.db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(eq(staffUsers.email, email));
    if (row) {
      await handle.db.update(auditLog).set({ staffId: null }).where(eq(auditLog.staffId, row.id));
      await handle.db.update(settings).set({ updatedBy: null }).where(eq(settings.updatedBy, row.id));
      await handle.db.delete(staffUsers).where(eq(staffUsers.id, row.id));
    }
    console.log(row ? `removed ${email}` : `no account ${email}`);
  }
} finally {
  await handle.close();
}
