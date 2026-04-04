import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildServer } from "./app.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const app = await buildServer();

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
