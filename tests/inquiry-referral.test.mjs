import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

async function submit(extra = {}) {
  let inserted;
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return null; },
            async run() {
              if (sql.startsWith("INSERT INTO inquiries")) inserted = values;
              return { meta: { last_row_id: 1 } };
            },
          };
        },
      };
    },
  };
  const response = await worker.fetch(new Request("https://example.com/api/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ student_name: "테스트", parent_phone: "01000000000", ...extra }),
  }), { DB }, {});
  return { response, inserted };
}

test("유입 경로는 선택하지 않아도 접수된다", async () => {
  for (const extra of [{}, { referral_source: "" }, { referral_source: "기타" }]) {
    const { response, inserted } = await submit(extra);
    assert.equal(response.status, 200);
    assert.deepEqual(inserted.slice(9), [extra.referral_source || "", ""]);
  }
});

test("6개 경로가 저장되고 기타만 직접 입력을 저장한다", async () => {
  for (const source of ["네이버·구글 등 검색", "지인 추천", "근처를 지나가다 알게 됨", "블로그·SNS", "지역 커뮤니티·맘카페", "기타"]) {
    const { response, inserted } = await submit({ referral_source: source, referral_detail: "  현수막  " });
    assert.equal(response.status, 200);
    assert.deepEqual(inserted.slice(9), [source, source === "기타" ? "현수막" : ""]);
  }
});

test("잘못된 경로와 200자를 넘는 기타 입력은 저장하지 않는다", async () => {
  for (const extra of [{ referral_source: "invalid" }, { referral_source: "기타", referral_detail: "가".repeat(201) }]) {
    const { response, inserted } = await submit(extra);
    assert.equal(response.status, 400);
    assert.equal(inserted, undefined);
  }
});

test("문의 접수는 상담 유입 경로를 저장하지 않는다", async () => {
  const { response, inserted } = await submit({ kind: "question", referral_source: "기타", referral_detail: "현수막" });
  assert.equal(response.status, 200);
  assert.deepEqual(inserted.slice(9), ["", ""]);
});
