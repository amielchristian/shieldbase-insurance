import Fastify from "fastify";
import { echoBodySchema } from "./schemas/echo.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

app.post("/echo", async (request, reply) => {
  const parsed = echoBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "Invalid body",
      details: parsed.error.flatten(),
    });
  }
  return { echo: parsed.data.message };
});

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
