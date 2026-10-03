// Assembles the Vercel deployment from the Vite build (`pnpm build:vercel`).
// Follows the Build Output API: https://vercel.com/docs/build-output-api
//   .vercel/output/static            the client, served by the CDN
//   .vercel/output/functions/api.func  the Express API as one Node function
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const out = ".vercel/output";
const fn = `${out}/functions/api.func`;

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });
cpSync("dist/public", `${out}/static`, { recursive: true });

// One self-contained CommonJS file: every dependency is bundled in, so the
// function needs no node_modules at runtime.
await build({
  entryPoints: ["server/_core/app.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: `${fn}/index.js`,
  logLevel: "warning",
});
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: "commonjs" }));
writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.js", launcherType: "Nodejs", shouldAddHelpers: false }, null, 2)
);

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Hashed build assets never change under the same name.
        { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "/api/(.*)", dest: "/api" },
        { handle: "filesystem" },
        // Client-side routes (/items, /reports, ...) all load the app shell.
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2
  )
);
console.log(`Vercel output written to ${out}`);
