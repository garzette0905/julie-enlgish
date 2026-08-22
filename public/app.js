/**
 * 진입점 — 주소(#/…)를 보고 알맞은 화면을 그리고, 상단 메뉴 상태를 맞춘다.
 */
import { $, $$, esc, refreshSession, onSessionChange, session, toast } from "./js/core.js";
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

// 메뉴를 고르면 모바일 드롭다운은 닫는다.
menuEl.addEventListener("click", (e) => {
  if (e.target.closest("a")) {
    menuEl.classList.remove("open");
    toggleEl.setAttribute("aria-expanded", "false");
  }
});

function syncMenu(path) {
  for (const a of $$(".menu-item", menuEl)) {
    const href = a.getAttribute("href") || "";
    const target = href.replace(/^#/, "");
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

/* ---------- 라우터 ---------- */

function currentPath() {
  const raw = location.hash.replace(/^#/, "");
  return raw && raw.startsWith("/") ? raw : "/";
}

/* 화면을 그릴 때마다 번호를 하나씩 올린다.
   메뉴를 빠르게 연달아 누르면 앞 화면이 아직 서버 응답을 기다리는 중일 수 있는데,
   그 사이 화면이 바뀌면 앞 화면의 뒷정리(요소 찾기·이벤트 연결)가 실패한다.
   번호가 달라졌으면 이미 지나간 화면이므로 결과를 화면에 쓰지 않는다. */
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const path = currentPath();
  syncMenu(path);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  try {
    if (path === "/") return await renderHome(view);
    if (path === "/reviews") return await renderReviews(view);
    if (path === "/about") return await renderAbout(view);
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
      <div class="empty">찾을 수 없는 페이지입니다. <a href="#/" style="color:var(--navy);font-weight:600">홈으로</a></div>
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

window.addEventListener("hashchange", render);

/* ---------- 시작 ---------- */

(async () => {
  // 로그인 상태를 먼저 확인해야 메뉴와 "나의 수업"이 한 번에 제대로 그려진다.
  await refreshSession();
  await render();
  fillFooter();
})();
