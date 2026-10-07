import assert from "node:assert/strict";
import { PAGE_META, SITE_ORIGIN } from "../public/js/seo.js";

// 로컬 Worker를 실행한 뒤 사용한다. 운영 검증: npm run check:seo -- https://www.julieenglish.co.kr
const origin = process.argv[2] || "http://127.0.0.1:8787";
const escape = (s) => String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const get = (path, method = "GET") => fetch(origin + path, { method, redirect: "manual" });
for (const [path, meta] of Object.entries(PAGE_META)) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("x-robots-tag"), "index, follow");
  const html = await response.text();
  assert.ok(html.includes(`<title>${escape(meta.title)}</title>`), `title: ${path}`);
  assert.ok(html.includes(`name="description" content="${escape(meta.description)}"`), `description: ${path}`);
  assert.ok(html.includes(`rel="canonical" href="${SITE_ORIGIN}${path}"`), `canonical: ${path}`);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `heading: ${path}`);
  for (const link of Object.keys(PAGE_META)) assert.ok(html.includes(`href="${link}"`));
  JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  if (path === "/") assert.ok(html.includes("용인 동백에서 시작하는 파닉스와 초등 영어"));
  if (path === "/reviews") {
    const data = await (await get("/api/reviews")).json();
    for (const r of data.reviews.slice(0, 30)) assert.ok(html.includes(escape(r.body).replace(/\r?\n/g, "<br>")), "후기 서버 렌더링");
  }
  if (path === "/about") {
    const data = await (await get("/api/public/media")).json();
    for (const m of data.media.slice(0, 30)) if (m.description) assert.ok(html.includes(escape(m.description)), "소식 서버 렌더링");
  }
  console.log(`PASS 공개 페이지 ${path}`);
}
for (const path of ["/login", "/signup", "/my", "/me", "/admin", "/admin/tuition"]) {
  const r = await get(path);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.ok((await r.text()).includes('name="robots" content="noindex, nofollow"'));
}
const missing = await get("/does-not-exist-seo-check");
assert.equal(missing.status, 404);
assert.equal(missing.headers.get("x-robots-tag"), "noindex, nofollow");
const question = await get("/contact/question");
assert.equal(question.status, 200);
assert.ok((await question.text()).includes(`rel="canonical" href="${SITE_ORIGIN}/contact"`));
const slash = await get("/about/");
assert.equal(slash.status, 301);
assert.ok(slash.headers.get("location").endsWith("/about"));
const head = await get("/reviews", "HEAD");
assert.equal(head.status, 200);
assert.equal(await head.text(), "");
const robots = await (await get("/robots.txt")).text();
assert.ok(!robots.includes("Disallow: /login"));
assert.ok(robots.includes("Allow: /api/media/file/"));
const sitemap = await (await get("/sitemap.xml")).text();
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(urls.sort(), Object.keys(PAGE_META).map((p) => SITE_ORIGIN + p).sort());
console.log("PASS 비공개 noindex, 404, 문의 탭, 리디렉션, HEAD, robots, 사이트맵");
