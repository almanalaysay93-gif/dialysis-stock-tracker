import { getSessionById } from "./server/db";

const r = await getSessionById(30002);
console.log("RESULT:", JSON.stringify(r));
