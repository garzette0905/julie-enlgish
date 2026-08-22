/**
 * 공통 도구 — DOM 만들기, 서버 호출, 로그인 상태, 토스트, 모달.
 * 화면 파일들(public-pages / account / admin)이 모두 여기서 가져다 쓴다.
 */

/* ---------- DOM ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * HTML 문자열을 실제 요소로 바꾼다. 템플릿 리터럴로 화면을 짤 때 쓴다.
 * 최상위 요소가 하나면 그 요소를, 여럿이면 조각(DocumentFragment)을 돌려준다.
 * 조각을 그대로 append 하면 안에 든 요소가 전부 들어간다 —
 * 예전처럼 firstElementChild 만 돌려주면 두 번째 이후가 조용히 사라진다.
 */
export function html(strings, ...values) {
  const src = typeof strings === "string" ? strings : strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
  const t = document.createElement("template");
  t.innerHTML = src.trim();
  return t.content.children.length === 1 ? t.content.firstElementChild : t.content;
}

/** 사용자 입력을 화면에 그대로 넣을 때는 반드시 이걸 거친다. */
export function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- 서버 호출 ---------- */

/**
 * /api/* 를 부르는 공통 함수. 실패하면 서버가 보낸 한국어 메시지로 예외를 던진다.
 * body 가 FormData 면 content-type 을 브라우저에 맡긴다(경계 문자열 때문에).
 */
export async function api(path, options = {}) {
  const opts = { credentials: "same-origin", ...options };
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    opts.headers = { "content-type": "application/json", ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(`/api/${path.replace(/^\//, "")}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 본문이 비어 있을 수 있다 */
  }

  if (!res.ok) {
    // 쿠키가 만료됐는데 화면은 아직 로그인한 줄 아는 상태를 여기서 정리한다.
    // (이게 없으면 상단 메뉴에 이름이 남고, 화면마다 401 오류 문구가 뜬다)
    if (res.status === 401) setUser(null);
    const err = new Error((data && data.error) || `요청에 실패했습니다. (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const apiGet = (p) => api(p);
export const apiPost = (p, body) => api(p, { method: "POST", body });
export const apiPatch = (p, body) => api(p, { method: "PATCH", body });
export const apiPut = (p, body) => api(p, { method: "PUT", body });
export const apiDelete = (p) => api(p, { method: "DELETE" });

/* ---------- 로그인 상태 ---------- */

export const session = {
  user: null,
  get isLoggedIn() {
    return !!this.user;
  },
  get isAdmin() {
    return !!this.user && this.user.role === "admin";
  },
};

const sessionListeners = [];
export function onSessionChange(fn) {
  sessionListeners.push(fn);
}
export function setUser(user) {
  session.user = user || null;
  for (const fn of sessionListeners) fn(session.user);
}

export async function refreshSession() {
  try {
    const { user } = await apiGet("auth/me");
    setUser(user);
  } catch {
    setUser(null);
  }
  return session.user;
}

/* ---------- 화면 이동 ---------- */

/**
 * 화면을 옮긴다. 주소는 /reviews 처럼 진짜 경로를 쓴다.
 * 실제 이동은 app.js 가 맡고(주소 변경 + 다시 그리기), 여기서는 그걸 부르기만 한다.
 * 목적지가 지금 주소와 같아도 다시 그린다
 * ("나의 수업"에서 로그인 폼이 뜬 뒤 로그인에 성공한 경우가 그렇다).
 */
export function navigate(path) {
  const go = window.__navigate;
  if (typeof go === "function") go(path);
  else location.assign(path);
}

/* ---------- 토스트 ---------- */

let toastTimer = null;
export function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("err", !!isError);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), isError ? 4200 : 2600);
}

/* ---------- 모달 ---------- */

/**
 * 모달을 띄운다. { title, body(Element), footer(Element), wide }
 * 닫는 방법: 바깥 클릭 · X 버튼 · ESC.
 * 반환값의 close() 로 코드에서도 닫을 수 있다.
 */
export function openModal({ title, body, footer, wide = false }) {
  const bg = html(`<div class="modal-bg"><div class="modal ${wide ? "wide" : ""}">
      <div class="modal-head"><h3>${esc(title)}</h3><button type="button" aria-label="닫기">&times;</button></div>
      <div class="modal-body"></div>
    </div></div>`);

  $(".modal-body", bg).append(body);
  if (footer) $(".modal", bg).append(footer);

  const close = () => {
    bg.remove();
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = "";
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };

  bg.addEventListener("mousedown", (e) => {
    if (e.target === bg) close();
  });
  $(".modal-head button", bg).addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
  document.body.append(bg);

  // 첫 입력칸에 자동으로 커서를 둔다 (모바일은 키보드가 튀어나와 불편해서 제외).
  if (window.matchMedia("(min-width: 901px)").matches) {
    const first = bg.querySelector("input:not([type=checkbox]):not([readonly]), textarea, select");
    if (first) first.focus();
  }

  return { el: bg, close };
}

/** 모달 아래쪽 버튼 줄을 만든다. */
export function modalFooter(buttons) {
  const foot = html(`<div class="modal-foot"></div>`);
  for (const b of buttons) {
    const btn = html(`<button type="button" class="btn ${b.cls || "ghost"}">${esc(b.label)}</button>`);
    btn.addEventListener("click", () => b.onClick(btn));
    foot.append(btn);
  }
  return foot;
}

/** window.confirm 대신 쓰는 확인창 (모바일에서 모양이 일정하다). */
export function confirmBox(message, { okLabel = "삭제", danger = true } = {}) {
  return new Promise((resolve) => {
    const body = html(`<p style="margin:0;font-size:15px;line-height:1.7">${esc(message)}</p>`);
    const m = openModal({
      title: "확인",
      body,
      footer: modalFooter([
        { label: "취소", cls: "ghost", onClick: () => { m.close(); resolve(false); } },
        { label: okLabel, cls: danger ? "danger" : "red", onClick: () => { m.close(); resolve(true); } },
      ]),
    });
  });
}

/* ---------- 날짜 · 시간 ---------- */

export const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const DAY_KR = { MON: "월", TUE: "화", WED: "수", THU: "목", FRI: "금", SAT: "토", SUN: "일" };
// Date.getDay() (0=일) 를 요일 코드로 바꾸는 표
export const JS_DAY_TO_CODE = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function daysToKr(days) {
  return String(days || "")
    .split(",")
    .filter(Boolean)
    .map((d) => DAY_KR[d] || d)
    .join("·");
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "14:00" + 90분 => "15:30" */
export function addMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  const total = h * 60 + m + (Number(minutes) || 0);
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function timeRange(startTime, durationMin) {
  return `${startTime} ~ ${addMinutes(startTime, durationMin)}`;
}

export function formatDateKr(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

/* ---------- 값 읽기 도우미 ---------- */

/** 폼 안의 name 이 붙은 입력칸을 한 번에 객체로 모은다. */
export function readForm(root) {
  const out = {};
  for (const el of $$("[name]", root)) {
    if (el.type === "checkbox") {
      if (el.dataset.multi) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else {
        out[el.name] = el.checked;
      }
    } else {
      out[el.name] = el.value;
    }
  }
  return out;
}

export const STATUS_KR = { pending: "승인대기", active: "사용중", inactive: "중지" };
export const STATUS_BADGE = { pending: "amber", active: "green", inactive: "gray" };

export const EVENT_KIND_KR = {
  holiday: "휴강",
  makeup: "보강",
  exam: "시험",
  event: "행사",
  notice: "안내",
};
