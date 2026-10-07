// 서버 응답과 메뉴 이동에서 같은 검색 정보를 사용한다.
export const SITE_ORIGIN = "https://www.julieenglish.co.kr";
export const PAGE_META = {
  "/": {
    title: "쥴리 잉글리쉬 · 용인 동백 영어학원 (초등·중등 영어교습소)",
    description: "용인 동백 초당마을 쥴리 잉글리쉬 영어교습소. 2007년부터 원장 직강으로 파닉스, 초등 듣기·말하기·읽기·쓰기, 중등·고등 내신 선행을 지도합니다. 상담 031-8005-9439.",
  },
  "/about": {
    title: "학원 소식·사진과 오시는 길 · 쥴리 잉글리쉬 용인 동백",
    description: "용인 동백 쥴리 잉글리쉬의 수업 모습과 학원 공간을 사진·영상으로 만나보세요. 초당마을 삼부르네상스아파트 상가동 204호 위치와 상담 연락처를 안내합니다.",
  },
  "/reviews": {
    title: "재원생 · 졸업생 · 학부모 후기 · 쥴리 잉글리쉬 용인 동백",
    description: "용인 동백 쥴리 잉글리쉬 재원생, 졸업생과 학부모가 직접 남긴 영어 수업 후기입니다. 파닉스부터 초등 영어와 내신 선행까지 함께한 경험을 읽고 수업 상담을 신청하세요.",
  },
  "/contact": {
    title: "파닉스·초등·중등 영어 상담신청 · 쥴리 잉글리쉬 용인 동백",
    description: "용인 동백 초당마을 쥴리 잉글리쉬 영어 수업 상담과 문의. 학생의 학년, 영어 학습 경험과 궁금한 점을 남기면 원장이 직접 연락드립니다. 전화 031-8005-9439.",
  },
};
const PRIVATE_TITLES = {
  "/login": "로그인", "/signup": "회원가입", "/my": "나의 수업",
  "/me": "내 정보", "/admin": "관리자",
};

export function pageMetaFor(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  // 문의 탭은 상담 페이지와 같은 창구이며 별도 색인 주소를 만들지 않는다.
  const canonicalPath = path === "/contact/question" ? "/contact" : path;
  const meta = PAGE_META[canonicalPath];
  if (meta) return { ...meta, path: canonicalPath, index: true };
  for (const [prefix, title] of Object.entries(PRIVATE_TITLES)) {
    if (path === prefix || (prefix === "/admin" && path.startsWith("/admin/"))) {
      return { path, title: `${title} · 쥴리 잉글리쉬`, description: "", index: false };
    }
  }
  return null;
}

export function syncPageMeta(pathname) {
  const meta = pageMetaFor(pathname) || {
    path: pathname, title: "찾을 수 없는 페이지 · 쥴리 잉글리쉬", description: "", index: false,
  };
  document.title = meta.title;
  const canonical = `${SITE_ORIGIN}${meta.path}`;
  const values = {
    'meta[name="description"]': meta.description,
    'meta[name="robots"]': meta.index ? "index, follow" : "noindex, nofollow",
    'meta[property="og:title"]': meta.title,
    'meta[property="og:description"]': meta.description,
    'meta[property="og:url"]': canonical,
  };
  for (const [selector, content] of Object.entries(values)) {
    document.querySelector(selector)?.setAttribute("content", content);
  }
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);
}
