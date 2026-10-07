import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";
import { pageMetaFor, syncPageMeta, SITE_ORIGIN } from "../public/js/seo.js";

test("이전 도메인과 슬래시 주소를 한 번에 표준 주소로 보낸다", async () => {
  for (const origin of ["http://julieenglish.co.kr", "https://julieenglish.co.kr", "http://www.julieenglish.co.kr", "https://julie-enlgish.wepiclab.workers.dev"]) {
    const r = await worker.fetch(new Request(`${origin}/about/?ref=search`), {}, {});
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), `${SITE_ORIGIN}/about?ref=search`);
  }
  const r = await worker.fetch(new Request(`${SITE_ORIGIN}/index.html`), {}, {});
  assert.equal(r.headers.get("location"), `${SITE_ORIGIN}/`);
});

test("문의 탭은 공개 상담 페이지, 비공개 화면과 없는 주소는 구별한다", () => {
  assert.equal(pageMetaFor("/contact/question").path, "/contact");
  assert.equal(pageMetaFor("/contact/question").index, true);
  assert.equal(pageMetaFor("/admin/tuition").index, false);
  assert.equal(pageMetaFor("/login").index, false);
  assert.equal(pageMetaFor("/missing"), null);
  assert.equal(pageMetaFor("/my/missing"), null);
});

test("비공개 화면에서 공개 메뉴로 이동하면 모든 검색 정보가 갱신된다", () => {
  const elements = new Map();
  const previous = globalThis.document;
  globalThis.document = {
    title: "",
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { setAttribute(key, value) { this[key] = value; } });
      return elements.get(selector);
    },
  };
  try {
    syncPageMeta("/login");
    assert.equal(elements.get('meta[name="robots"]').content, "noindex, nofollow");
    syncPageMeta("/reviews");
    assert.equal(elements.get('meta[name="robots"]').content, "index, follow");
    assert.equal(elements.get('meta[name="description"]').content, pageMetaFor("/reviews").description);
    assert.equal(elements.get('meta[property="og:title"]').content, document.title);
    assert.equal(elements.get('meta[property="og:url"]').content, `${SITE_ORIGIN}/reviews`);
    syncPageMeta("/contact/question");
    assert.equal(elements.get('link[rel="canonical"]').href, `${SITE_ORIGIN}/contact`);
  } finally {
    globalThis.document = previous;
  }
});
