import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { appRouter } from "../routers";
import { assertSessionSecret } from "./auth";
import { createContext } from "./context";

// The API as an Express app with no listener. `index.ts` serves it on a port
// (dev and self-hosting); on Vercel it is bundled into a function by
// `vercel-build.mjs`.

// Refuse to run with a missing or weak secret: sessions would be forgeable.
assertSessionSecret();

const app = express();
// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// tRPC API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export default app;
