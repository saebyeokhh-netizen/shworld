import { defineConfig } from "vite";
import { readdirSync, readFileSync, existsSync, renameSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const PARTIALS = path.join(SRC, "generated", "partials.json");

/** wrangler dev 기본 포트 — `npm run dev` 에서 /api 프록시 대상 */
const WORKER_PORT = Number(process.env.WORKER_PORT ?? 8787);

/**
 * src 하위의 모든 *.html 을 MPA 엔트리로 모은다.
 * templates/ 는 빌드 대상이 아니다 (build-content.mjs 가 읽는 소스일 뿐).
 */
function collectEntries(dir = SRC, entries = {}) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "templates" || item.name === "node_modules") continue;
      collectEntries(full, entries);
      continue;
    }
    if (!item.name.endsWith(".html")) continue;
    // 엔트리 이름: src 기준 상대경로에서 확장자 제거 ("generated/projects/foo")
    const name = path.relative(SRC, full).replace(/\\/g, "/").replace(/\.html$/, "");
    entries[name] = full;
  }
  return entries;
}

/**
 * 공통 페이지에 콘텐츠 조각을 주입한다.
 *
 * HTML 안의 `<!--@profile.name-->` 같은 주석을 build-content.mjs 가 만든
 * src/generated/partials.json 의 값으로 치환한다. dev/build 모두 동작하므로
 * 프로필과 작품 목록의 단일 원천은 항상 content/ 다 (HTML 을 손으로 고칠 필요 없음).
 */
function contentInjection() {
  let cache = null;
  const load = () => {
    if (cache) return cache;
    if (!existsSync(PARTIALS)) {
      throw new Error(
        "src/generated/partials.json 이 없습니다. `npm run content` 를 먼저 실행하세요 " +
          "(predev/prebuild 스크립트가 자동으로 실행합니다)."
      );
    }
    cache = JSON.parse(readFileSync(PARTIALS, "utf8"));
    return cache;
  };

  return {
    name: "shworld-content-injection",
    enforce: "pre",
    configureServer(server) {
      // 콘텐츠를 다시 빌드하면 dev 서버가 즉시 반영하도록 캐시를 버린다.
      server.watcher.add(PARTIALS);
      server.watcher.on("change", (file) => {
        if (path.resolve(file) === PARTIALS) {
          cache = null;
          server.ws.send({ type: "full-reload" });
        }
      });
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const partials = load();
        const missing = new Set();
        const out = html.replace(/<!--@([\w.]+)-->/g, (match, key) => {
          if (!(key in partials)) {
            missing.add(key);
            return match;
          }
          return partials[key];
        });
        if (missing.size > 0) {
          throw new Error(
            `${ctx.filename}: 알 수 없는 콘텐츠 조각 ${[...missing].map((k) => `<!--@${k}-->`).join(", ")}`
          );
        }
        return out;
      },
    },
  };
}

/**
 * 상세 페이지 출력 경로를 dist/generated/projects/*.html → dist/projects/*.html 로 옮긴다.
 * 소스는 계획대로 src/generated/ 에 두면서 URL 은 /projects/<slug>.html 로 깔끔하게 유지한다.
 * (자산 경로는 base "/" 기준 절대경로라 이동해도 깨지지 않는다.)
 */
function flattenGeneratedOutput() {
  return {
    name: "shworld-flatten-generated",
    closeBundle() {
      const outDir = path.join(ROOT, "dist");
      const from = path.join(outDir, "generated", "projects");
      const to = path.join(outDir, "projects");
      if (!existsSync(from)) return;

      mkdirSync(to, { recursive: true });
      for (const file of readdirSync(from)) {
        renameSync(path.join(from, file), path.join(to, file));
      }
      rmSync(path.join(outDir, "generated"), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  root: "src",
  publicDir: path.join(ROOT, "public"),
  appType: "mpa",

  plugins: [contentInjection(), flattenGeneratedOutput()],

  build: {
    outDir: path.join(ROOT, "dist"),
    emptyOutDir: true,
    // 소스맵은 배포 용량만 늘리므로 끈다.
    sourcemap: false,
    rollupOptions: {
      input: collectEntries(),
    },
  },

  server: {
    port: 5173,
    strictPort: false,
    // `npm run dev` 는 UI 작업용이다. /api 는 별도로 띄운 wrangler dev 로 넘긴다.
    // 풀스택(정적 + API)을 한 번에 보려면 `npm run cf:dev` 를 쓸 것.
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${WORKER_PORT}`,
        changeOrigin: true,
        // wrangler 가 안 떠 있어도 dev 서버가 죽지 않게 한다.
        configure(proxy) {
          proxy.on("error", () => {
            /* 무시: 클라이언트가 offline 으로 처리한다 */
          });
        },
      },
    },
  },

  preview: {
    port: 4173,
  },
});
