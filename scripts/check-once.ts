import "dotenv/config";
import { checkVacancies } from "../src/check";
import { loadEnv } from "../src/loadEnv";

const dryRun = process.argv.includes("--dry");
const env = loadEnv();

const result = await checkVacancies(env, { dryRun });
console.log(JSON.stringify({ success: true, ...result }, null, 2));
