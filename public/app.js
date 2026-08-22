/**
 * 진입점 — 주소를 보고 알맞은 화면을 그리고, 상단 메뉴 상태를 맞춘다.
 *
 * 주소는 /reviews 처럼 진짜 경로를 쓴다(예전에는 #/reviews 였다).
 * 검색엔진이 # 뒤쪽을 별개 페이지로 보지 않아서, 그 방식으로는 홈 하나만 색인됐다.
 * 화면을 옮길 때는 history.pushState 로 주소만 바꾸고, 서버에는 다시 묻지 않는다.
 * 주소창에 /reviews 를 직접 쳐서 들어와도 Worker 가 같은 index.html 을 돌려준다.
 */
import { $, $$, esc, refreshSession, onSessionChange, session } from "./js/core.js";
import { renderHome, renderAbout, fillFooter } from "./js/public-pages.js";
import { renderLogin, renderMy, renderMe } from "./js/account.js";
import { renderContact } from "./js/contact.js";
import { renderReviews } from "./js/reviews.js";
import { renderAdmin } from "./js/admin.js";

const view = $("#view");

/* ---------- 상단 메뉴 ---------- */

const menuEl = $("#main-menu");
const toggleEl = $("#menu-toggle");

toggleEl.addEventListener("click", () => {
  const open = menuEl.classList.toggle("open");
  toggleEl.setAttribute("aria-expanded", String(open));
});

function syncMenu(path) {
  for (const a of $$(".menu-item", menuEl)) {
    const target = a.getAttribute("href") || "";
    const isHome = target === "/";
    a.classList.toggle("active", isHome ? path === "/" : path.startsWith(target));
  }
}

/* 로그인 상태가 바뀌면 메뉴 구성을 갈아 끼운다. */
onSessionChange((user) => {
  const loginLink = $("#menu-login");
  const meLink = $("#menu-me");
  const adminLink = $(".menu-admin", menuEl);

  if (user) {
    loginLink.classList.add("hidden");
    meLink.classList.remove("hidden");
    meLink.textContent = user.name;
    adminLink.classList.toggle("hidden", user.role !== "admin");
  } else {
    loginLink.classList.remove("hidden");
    meLink.classList.add("hidden");
    adminLink.classList.add("hidden");
  }
});

/* ---------- 링크 가로채기 ----------
   사이트 안의 <a href="/reviews"> 를 누르면 새로 고치지 않고 화면만 바꾼다.
   검색엔진에게는 평범한 링크로 보이므로 색인·크롤링에 그대로 도움이 된다. */
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;

  // 새 창, 파일 내려받기, 외부 주소, 특수키 조합은 브라우저에 맡긴다.
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

  const href = a.getAttribute("href") || "";
  if (!href.startsWith("/") || href.startsWith("//")) return;
  // /api/... 같은 실제 파일 요청은 그대로 둔다.
  if (href.startsWith("/api/") || href.startsWith("/assets/")) return;

  e.preventDefault();
  navigateTo(href);

  // 모바일 드롭다운은 닫는다.
  menuEl.classList.remove("open");
  toggleEl.setAttribute("aria-expanded", "false");
});

export function navigateTo(path) {
  if (location.pathname === path) {
    render();
    return;
  }
  history.pushState({}, "", path);
  render();
}
// 다른 파일에서도 쓸 수 있게 열어 둔다 (로그인 성공 후 이동 등).
window.__navigate = navigateTo;

window.addEventListener("popstate", render);

/* ---------- 주소별 제목 ----------
   서버(src/index.js)도 같은 값을 심어 주지만, 그건 주소창에 직접 치고 들어올 때 얘기다.
   메뉴를 눌러 화면만 바꾸는 경우에는 여기서 제목을 맞춰 줘야
   브라우저 탭·즐겨찾기·방문 기록에 엉뚱한 이름이 남지 않는다.
   서버 쪽 PAGES 와 내용이 같아야 하므로, 한쪽을 고치면 다른 쪽도 같이 고칠 것. */
const PAGE_TITLES = {
  "/": "쥴리 잉글리쉬 · 용인 동백 영어학원 (초등·중등 영어교습소)",
  "/about": "학원 소식 · 쥴리 잉글리쉬 (용인 동백 영어학원)",
  "/reviews": "졸업생 · 학부모 후기 · 쥴리 잉글리쉬 (용인 동백 영어학원)",
  "/contact": "상담신청 · 문의 · 쥴리 잉글리쉬 (용인 동백 영어학원)",
  "/login": "로그인 · 쥴리 잉글리쉬",
  "/signup": "회원가입 · 쥴리 잉글리쉬",
  "/my": "나의 수업 · 쥴리 잉글리쉬",
  "/me": "내 정보 · 쥴리 잉글리쉬",
  "/admin": "관리자 · 쥴리 잉글리쉬",
};

function syncTitle(path) {
  const key = path.startsWith("/admin") ? "/admin" : path;
  document.title = PAGE_TITLES[key] || "찾을 수 없는 페이지 · 쥴리 잉글리쉬";

  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", `https://www.julieenglish.co.kr${path === "/" ? "/" : path}`);
}

/* ---------- 라우터 ---------- */

/* 화면을 그릴 때마다 번호를 하나씩 올린다.
   메뉴를 빠르게 연달아 누르면 앞 화면이 아직 서버 응답을 기다리는 중일 수 있는데,
   그 사이 화면이 바뀌면 앞 화면의 뒷정리(요소 찾기·이벤트 연결)가 실패한다.
   번호가 달라졌으면 이미 지나간 화면이므로 결과를 화면에 쓰지 않는다. */
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  syncMenu(path);
  syncTitle(path);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  try {
    if (path === "/") return await renderHome(view);
    if (path === "/about") return await renderAbout(view);
    if (path === "/reviews") return await renderReviews(view);
    if (path === "/contact") return renderContact(view);
    if (path === "/contact/question") return renderContact(view, { kind: "question" });
    if (path === "/login") return renderLogin(view);
    if (path === "/signup") return renderLogin(view, { mode: "signup" });
    if (path === "/my") return await renderMy(view);
    if (path === "/me") return await renderMe(view);
    if (path.startsWith("/admin")) {
      const tab = path.split("/")[2] || "inquiries";
      return await renderAdmin(view, tab);
    }

    view.innerHTML = `<div class="section"><div class="wrap">
      <div class="empty">찾을 수 없는 페이지입니다. <a href="/" style="color:var(--navy);font-weight:600">홈으로</a></div>
    </div></div>`;
  } catch (e) {
    console.error(e);
    // 이미 다른 화면으로 넘어간 뒤라면, 지나간 화면의 오류로 새 화면을 덮지 않는다.
    if (token !== renderToken) return;
    view.innerHTML = `<div class="section"><div class="wrap">
      <div class="empty">${esc(e.message || "화면을 여는 중 문제가 생겼습니다.")}</div>
    </div></div>`;
  }
}

/* ---------- 시작 ---------- */

(async () => {
  // 예전에 공유된 #/reviews 형태의 주소로 들어오면 새 주소로 옮겨 준다.
  const legacy = location.hash.replace(/^#/, "");
  if (legacy.startsWith("/")) {
    history.replaceState({}, "", legacy);
  }

  // 로그인 상태를 먼저 확인해야 메뉴와 "나의 수업"이 한 번에 제대로 그려진다.
  await refreshSession();
  await render();
  fillFooter();
})();
