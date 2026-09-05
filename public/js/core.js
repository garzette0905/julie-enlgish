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

/* ---------- 방문 기록 ----------
   화면을 하나 열 때마다 서버에 조용히 알린다. 관리자 화면의 "방문 통계"가 이걸로 만들어진다.
   쿠키를 새로 심거나 브라우저에 무언가를 저장하지 않고, 서버도 IP 원본을 남기지 않는다
   (그날치 소금을 섞은 해시만 남는다). 그래서 방문자에게 동의를 받지 않아도 된다.
   실패해도 화면에는 아무 일이 없어야 하므로 오류는 전부 삼킨다. */

let sentReferrer = false;

export function trackVisit(path) {
  const body = { path };

  // "어디를 거쳐 왔나"는 페이지를 처음 연 순간에만 뜻이 있다.
  // 메뉴를 눌러 화면만 바꾸는 동안에도 document.referrer 는 그대로 남아 있어서,
  // 매번 같이 보내면 한 번 들어온 방문이 유입 여러 건으로 부풀려진다.
  if (!sentReferrer) {
    sentReferrer = true;
    if (document.referrer) body.ref = document.referrer;
  }

  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 통계는 없어도 그만이다 */
  }
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

/* ---------- 한국시간으로 보여주기 ----------
   DB(D1)는 시각을 UTC 로 남긴다. 'YYYY-MM-DD HH:MM:SS' 형태에 시간대 표시가 없어서
   그대로 화면에 뿌리면 한국시간보다 9시간 뒤처져 보이고, 밤 9시 이후에는 날짜까지
   하루 어긋난다. 화면에 낼 때는 반드시 아래 함수를 거친다.

   저장은 계속 UTC 로 둔다 — 세션 만료·중복 접수 검사처럼 DB 안에서 시각끼리
   비교하는 곳이 여럿이라, 그쪽이 어긋나지 않으려면 기준이 하나여야 한다. */

const KST = "Asia/Seoul";

/** D1 이 준 UTC 문자열을 Date 로 바꾼다. 못 읽으면 null. */
function parseSqlUtc(sqlDateTime) {
  if (!sqlDateTime) return null;
  const t = Date.parse(String(sqlDateTime).replace(" ", "T") + "Z");
  return Number.isNaN(t) ? null : new Date(t);
}

function kstParts(date) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
  // 자정을 24 로 주는 환경이 있어 00 으로 맞춘다.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { y: get("year"), m: get("month"), d: get("day"), hh: hour, mm: get("minute") };
}

/** "2026-08-23" — 보는 사람이 어느 나라에 있든 한국 날짜로 나온다. */
export function kstDate(sqlDateTime) {
  const date = parseSqlUtc(sqlDateTime);
  if (!date) return "";
  const { y, m, d } = kstParts(date);
  return `${y}-${m}-${d}`;
}

/** "2026-08-23 00:01" */
export function kstDateTime(sqlDateTime) {
  const date = parseSqlUtc(sqlDateTime);
  if (!date) return "";
  const { y, m, d, hh, mm } = kstParts(date);
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/** 오늘 날짜(한국 기준) "2026-08-23" — 입력칸 기본값에 쓴다. */
export function todayKst() {
  const { y, m, d } = kstParts(new Date());
  return `${y}-${m}-${d}`;
}

/* ---------- 값 읽기 도우미 ---------- */

/** 폼 안의 name 이 붙은 입력칸을 한 번에 객체로 모은다. */
/* ============================================================
   끌어서 순서 바꾸기

   HTML5 drag&drop 은 휴대폰·태블릿에서 아예 동작하지 않아서, 마우스와 손가락을
   같이 다루는 pointer 이벤트로 직접 옮긴다. 손잡이를 잡았을 때만 움직이므로
   카드 안의 수정·삭제 버튼은 그대로 눌린다.

   놓는 순간 화면은 이미 바뀐 순서이므로 다시 그리지 않고, 새 순서만 넘겨준다.

   axis  "x" 격자로 늘어선 카드(사진·동영상) — 지나는 카드의 좌우 가운데로 판단
         "y" 위아래로 쌓인 카드(후기)     — 지나는 카드의 위아래 가운데로 판단
   ============================================================ */
export function enableDragSort(container, { item, grip, axis = "y", onOrder }) {
  if (!container) return;

  const ids = () => $$(item, container).map((el) => Number(el.dataset.id));
  let card = null;
  let before = null; // 끌기 전 순서 — 제자리에 놓으면 저장하지 않는다

  container.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(grip);
    if (!handle || !container.contains(handle)) return;
    card = handle.closest(item);
    if (!card) return;
    before = ids().join(",");
    // 손잡이가 아니라 바깥 상자를 붙잡는다. 카드는 끌리는 동안 자리를 옮겨 다니는데,
    // 움직이는 element 에 붙은 붙잡기는 브라우저마다 도중에 풀려 버린다.
    // 붙잡기에 실패해도 상자에 걸어 둔 pointermove 는 그대로 들어오므로 계속 간다.
    try {
      container.setPointerCapture(e.pointerId);
    } catch {
      /* 붙잡을 수 없는 포인터면 그냥 둔다 */
    }
    card.classList.add("dragging");
    e.preventDefault();
  });

  container.addEventListener("pointermove", (e) => {
    if (!card) return;
    e.preventDefault();
    // 끌고 있는 카드는 pointer-events 를 껐으므로, 아래에 깔린 카드가 잡힌다.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const over = under && under.closest ? under.closest(item) : null;
    if (!over || over === card || !container.contains(over)) return;
    const r = over.getBoundingClientRect();
    const past =
      axis === "x" ? e.clientX - r.left > r.width / 2 : e.clientY - r.top > r.height / 2;
    over.insertAdjacentElement(past ? "afterend" : "beforebegin", card);
  });

  const drop = async (e) => {
    if (!card) return;
    card.classList.remove("dragging");
    card = null;
    try {
      container.releasePointerCapture(e.pointerId);
    } catch {
      /* 이미 풀렸으면 그대로 둔다 */
    }
    const next = ids();
    if (next.join(",") === before) return; // 제자리에 놓았다
    await onOrder(next);
  };
  container.addEventListener("pointerup", drop);
  container.addEventListener("pointercancel", drop);
}

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
