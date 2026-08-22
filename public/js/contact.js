/**
 * 상담신청 · 문의 화면
 *
 * 두 가지를 한 화면에서 받는다.
 *   상담신청 — 학생이름 / 학교 / 학년 / 영어 학습 수준 / 부모님 연락처 / 기타 의견
 *   문의     — 학생이름 / 학생 연락처 / 부모님 연락처 / 문의 내용
 * 둘 다 학생 이름과 부모님 연락처는 반드시 받는다.
 *
 * 접수되면 원장님에게 바로 알림이 가지만, 그 방식은 방문자에게 드러내지 않는다.
 */
import { $, $$, html, esc, apiPost, toast, readForm } from "./core.js";

const ENGLISH_LEVELS = ["없음", "1~2년", "3~4년", "5년 이상"];

export function renderContact(view, { kind = "consult" } = {}) {
  view.innerHTML = "";
  view.append(html(`
    <div class="page-head"><div class="wrap">
      <h1>상담신청 · 문의</h1>
      <p>남겨주신 연락처로 원장님이 직접 연락드립니다. 편하게 남겨 주세요.</p>
    </div></div>
    <section class="section"><div class="wrap">
      <div class="panel-card">
        <div class="seg" role="tablist">
          <button type="button" class="seg-btn" data-kind="consult" role="tab">상담신청</button>
          <button type="button" class="seg-btn" data-kind="question" role="tab">문의</button>
        </div>
        <div id="contact-form-root"></div>
      </div>
    </div></section>
  `));

  const root = $("#contact-form-root", view);
  const segs = $$(".seg-btn", view);

  const draw = (k) => {
    for (const b of segs) b.classList.toggle("on", b.dataset.kind === k);
    (k === "question" ? drawQuestion : drawConsult)(root);
  };

  for (const b of segs) b.addEventListener("click", () => draw(b.dataset.kind));
  draw(kind === "question" ? "question" : "consult");
}

/* ---------- 상담신청 ---------- */

function drawConsult(root) {
  root.innerHTML = "";
  const form = html(`<form class="contact-form" novalidate>
    <p class="form-lead">수업 상담을 원하시면 아래 내용을 남겨 주세요.</p>

    <div class="field">
      <label for="c-name">학생 이름 <span class="req">*</span></label>
      <input id="c-name" name="student_name" type="text" placeholder="홍길동" autocomplete="off">
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="c-school">학교</label>
        <input id="c-school" name="school" type="text" placeholder="초당초">
      </div>
      <div class="field">
        <label for="c-grade">학년</label>
        <input id="c-grade" name="grade" type="text" placeholder="4학년">
      </div>
    </div>

    <div class="field">
      <label for="c-level">영어 공부 학습 수준</label>
      <select id="c-level" name="english_level">
        <option value="">선택해 주세요</option>
        ${ENGLISH_LEVELS.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
      </select>
    </div>

    <div class="field">
      <label for="c-parent">부모님 연락처 <span class="req">*</span></label>
      <input id="c-parent" name="parent_phone" type="tel" inputmode="tel" placeholder="010-0000-0000" autocomplete="tel">
    </div>

    <div class="field">
      <label for="c-msg">기타 의견</label>
      <textarea id="c-msg" name="message" placeholder="상담 가능한 시간대, 궁금한 점 등을 편하게 적어 주세요."></textarea>
    </div>

    <button class="btn red block" type="submit">상담신청 보내기</button>
  </form>`);

  root.append(form);
  bindSubmit(form, root, "consult");
}

/* ---------- 문의 ---------- */

function drawQuestion(root) {
  root.innerHTML = "";
  const form = html(`<form class="contact-form" novalidate>
    <p class="form-lead">궁금한 점을 남겨 주시면 확인 후 연락드립니다.</p>

    <div class="field">
      <label for="q-name">학생 이름 <span class="req">*</span></label>
      <input id="q-name" name="student_name" type="text" placeholder="홍길동" autocomplete="off">
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="q-sphone">학생 연락처</label>
        <input id="q-sphone" name="student_phone" type="tel" inputmode="tel" placeholder="010-0000-0000">
      </div>
      <div class="field">
        <label for="q-pphone">부모님 연락처 <span class="req">*</span></label>
        <input id="q-pphone" name="parent_phone" type="tel" inputmode="tel" placeholder="010-0000-0000" autocomplete="tel">
      </div>
    </div>

    <div class="field">
      <label for="q-msg">문의 내용</label>
      <textarea id="q-msg" name="message" placeholder="궁금한 점을 적어 주세요."></textarea>
    </div>

    <button class="btn red block" type="submit">문의 보내기</button>
  </form>`);

  root.append(form);
  bindSubmit(form, root, "question");
}

/* ---------- 보내기 ---------- */

function bindSubmit(form, root, kind) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = readForm(form);
    const btn = $("button[type=submit]", form);

    // 필수 두 개는 화면에서 먼저 잡아 준다 (서버에서도 다시 검사한다).
    if (!String(d.student_name || "").trim()) {
      toast("학생 이름을 입력해 주세요.", true);
      $("[name=student_name]", form).focus();
      return;
    }
    if (!String(d.parent_phone || "").trim()) {
      toast("부모님 연락처를 입력해 주세요.", true);
      $("[name=parent_phone]", form).focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = "보내는 중…";
    try {
      const r = await apiPost("inquiries", { kind, ...d });
      root.innerHTML = `<div class="sent-box">
        <div class="sent-mark">&#10003;</div>
        <h2>${kind === "consult" ? "상담신청이 접수되었습니다" : "문의가 접수되었습니다"}</h2>
        <p>${esc(r.message)}</p>
        <a class="btn ghost" href="/">홈으로</a>
      </div>`;
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = kind === "consult" ? "상담신청 보내기" : "문의 보내기";
    }
  });
}
