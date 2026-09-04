/* ==========================================================================
   설비검수 (Equipment Acceptance) — app.js
   Vanilla JS, hash-routed SPA. No build step, no external dependencies —
   this keeps the service worker's offline cache simple and reliable.
   ========================================================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "eqi:inspections:v1";
  const MAX_PHOTOS_PER_ITEM = 4;
  const PHOTO_MAX_DIM = 900;
  const PHOTO_QUALITY = 0.62;

  /* ---------------------------------------------------------------------
     Checklist template — grouped by inspection category. Each category
     gets a token color so the item list reads like a color-coded panel
     rather than a flat form.
  --------------------------------------------------------------------- */
  /*
     FAT(공장검수)는 제작처에서 출하 전, 검수팀 위주로 "장비 자체"를 확인하고,
     SAT(현장검수)는 설치 후 실제 라인·유틸리티·상위시스템까지 물려 놓고
     생산 · 품질 · 설비보전 · 안전환경 · 정보시스템 등 여러 부서가 함께
     확인하므로 항목이 더 세분화되어 있고 담당 부서(dept)를 병기한다.
  */
  const CATEGORY_META = {
    safety:  { name: "안전",                  varColor: "--cat-safety" },
    mech:    { name: "기계 · 구조",            varColor: "--cat-mech" },
    utility: { name: "유틸리티 연결",          varColor: "--cat-utility" },
    elec:    { name: "전기 · 제어 (PLC/HMI)",  varColor: "--cat-elec" },
    process: { name: "공정 · 성능",            varColor: "--cat-process" },
    doc:     { name: "문서 · 인수인계",        varColor: "--cat-doc" },
  };

  // FAT — 항목은 문자열. 제작처 출하 전 검수.
  const FAT_TEMPLATE = [
    {
      cat: "safety",
      items: [
        "비상정지(E-STOP) 버튼 작동 및 위치 표시",
        "안전문 · 라이트커튼 인터록 동작",
        "안전펜스 및 진입 감지 센서",
        "경고등 · 경보음(부저) 동작",
        "잔류 에너지 차단(LOTO) 포인트 표시",
        "접지 및 누전 차단 상태",
      ],
    },
    {
      cat: "mech",
      items: [
        "프레임 및 지그 체결 · 수평 상태",
        "구동부(실린더 · 모터) 이상음 · 진동",
        "배관 · 배선 정리 및 라벨링",
        "도장 · 마감 · 방청 상태",
        "윤활 · 공압 유닛(FRL) 설정값",
        "안전커버 · 가드 장착 상태",
      ],
    },
    {
      cat: "elec",
      items: [
        "PLC I/O 신호 강제(포싱) 시험",
        "HMI 화면 표시 · 조작 반응 · 알람 이력",
        "센서(포토 · 근접) 감도 및 여유율",
        "비상 시 PLC 인터록 로직 검증",
        "전장반 배선과 회로도 일치 여부",
        "소프트웨어 · 펌웨어 버전 기록 및 백업",
      ],
    },
    {
      cat: "process",
      items: [
        "사이클타임 목표치 충족(시뮬레이션 조건)",
        "토크 · 압입 등 계측 정밀도(공차 이내)",
        "계측기 교정성적서 확인",
        "바코드 · 비전 인식률",
        "불량품 자동 배출 · 격리 기능",
        "공회전(드라이런) 연속가동 시험",
      ],
    },
    {
      cat: "doc",
      items: [
        "도면(기계 · 전기)과 실물 일치 여부",
        "부품 리스트(BOM) · 제조사 정보",
        "취급설명서 · 정비지침서 초안",
        "예비품(스페어) 리스트",
        "CE / 안전 인증 관련 자료",
        "FAT 펀치리스트(미결 항목) 작성 및 합의",
      ],
    },
  ];

  // SAT — 항목은 { name, dept }. 설치 후 현장검수, 부서 교차 확인.
  const SAT_TEMPLATE = [
    {
      cat: "safety",
      items: [
        { name: "운송 중 안전장치 손상 · 유실 여부", dept: "설비보전" },
        { name: "비상정지 · 인터록 재시험(설치 후)", dept: "설비보전" },
        { name: "현장 안전펜스 · 방책 배치 및 통로 확보", dept: "안전환경" },
        { name: "LOTO 절차 적용 및 표지 부착", dept: "안전환경" },
        { name: "소음 · 분진 · 유해가스 현장 측정", dept: "안전환경" },
        { name: "위험성평가 결과 반영 확인", dept: "안전환경" },
        { name: "접지저항 측정값 기준 이내", dept: "설비보전" },
      ],
    },
    {
      cat: "mech",
      items: [
        { name: "설치 위치 수평 · 레벨링 재조정", dept: "설비보전" },
        { name: "앵커 · 체결부 재체결(토크 확인)", dept: "설비보전" },
        { name: "반입 동선 · 양중 계획 실행 결과", dept: "생산기술" },
        { name: "주변 설비와 간섭 · 이격거리 확인", dept: "생산기술" },
        { name: "배관 · 덕트 현장 연결 및 누설 시험", dept: "설비보전" },
      ],
    },
    {
      cat: "utility",
      items: [
        { name: "전원 용량 · 전압 · 상 확인 및 결선", dept: "설비보전" },
        { name: "공압 공급 압력 · 유량 · 수분(드레인)", dept: "설비보전" },
        { name: "용수 · 냉각수 · 스팀 공급 규격", dept: "설비보전" },
        { name: "배기 · 집진 · 환기 연결", dept: "안전환경" },
        { name: "정전 · 단수 시 안전 정지 동작", dept: "설비보전" },
      ],
    },
    {
      cat: "elec",
      items: [
        { name: "현장 접지 · 서지 보호 확인", dept: "설비보전" },
        { name: "PLC/HMI 실입출력 동작(실센서 · 실액추에이터)", dept: "생산기술" },
        { name: "상위 시스템(MES/SCADA) 연동 및 데이터 수집", dept: "정보시스템" },
        { name: "설비 네트워크 IP · 보안정책 등록", dept: "정보시스템" },
        { name: "바코드 / RFID 현장 리더 통신", dept: "정보시스템" },
        { name: "소프트웨어 최종 버전 반영 및 백업 이관", dept: "설비보전" },
        { name: "알람 · 경보 모니터링 연계", dept: "정보시스템" },
      ],
    },
    {
      cat: "process",
      items: [
        { name: "실제 자재로 초기 양산 시운전", dept: "생산" },
        { name: "사이클타임 현장 실측(목표 대비)", dept: "생산기술" },
        { name: "공정능력(Cpk / Ppk) 측정", dept: "품질" },
        { name: "계측 정밀도 · Gage R&R", dept: "품질" },
        { name: "초 · 중 · 종물 검사 및 기준 합격", dept: "품질" },
        { name: "연속가동(내구) 테스트 — 실 근무 시프트 기준", dept: "생산" },
        { name: "OEE(가동률 · 성능 · 품질) 초기 측정", dept: "생산기술" },
        { name: "불량 유형별 검출 · 배출률 검증", dept: "품질" },
      ],
    },
    {
      cat: "doc",
      items: [
        { name: "도면 · 회로도 As-Built 최신본 반영", dept: "생산기술" },
        { name: "취급설명서 · 정비지침서 최종본", dept: "설비보전" },
        { name: "예비품(스페어) 입고 및 위치 지정", dept: "구매/자재" },
        { name: "정기점검(PM) 주기 · 체크시트 등록", dept: "설비보전" },
        { name: "작업자 · 보전요원 교육 완료 및 서명", dept: "생산" },
        { name: "PFMEA / Control Plan 현행화", dept: "품질" },
        { name: "FAT 펀치리스트 클로징 확인", dept: "생산기술" },
        { name: "최종 인수확인서 및 보증조건 합의", dept: "생산기술" },
      ],
    },
  ];

  const TEMPLATES = { FAT: FAT_TEMPLATE, SAT: SAT_TEMPLATE };

  function templateFor(type) {
    return TEMPLATES[type] || FAT_TEMPLATE;
  }

  // Ordered, de-duplicated category list actually present in an inspection,
  // resolved to display meta. Used by the checklist and the printable report
  // so a category with no items for this type never renders an empty group.
  function categoriesOf(insp) {
    const seen = [];
    insp.items.forEach((it) => {
      if (!seen.includes(it.catId)) seen.push(it.catId);
    });
    return seen.map((id) => ({ id, ...(CATEGORY_META[id] || { name: id, varColor: "--cat-doc" }) }));
  }

  function templateCount(type) {
    return templateFor(type).reduce((n, g) => n + g.items.length, 0);
  }

  /* ---------------------------------------------------------------------
     Storage
  --------------------------------------------------------------------- */
  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("load failed", e);
      return [];
    }
  }

  function saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error("save failed", e);
      toast("저장 공간이 부족합니다. 사진을 정리해 주세요.");
      return false;
    }
  }

  function getInspection(id) {
    return loadAll().find((i) => i.id === id);
  }

  function upsertInspection(insp) {
    const all = loadAll();
    const idx = all.findIndex((i) => i.id === insp.id);
    insp.updatedAt = Date.now();
    if (idx >= 0) all[idx] = insp;
    else all.unshift(insp);
    return saveAll(all);
  }

  function deleteInspection(id) {
    const all = loadAll().filter((i) => i.id !== id);
    saveAll(all);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function makeChecklist(type) {
    const cats = [];
    templateFor(type).forEach((group) => {
      group.items.forEach((entry, i) => {
        const name = typeof entry === "string" ? entry : entry.name;
        const dept = typeof entry === "string" ? "" : entry.dept || "";
        cats.push({
          id: `${group.cat}-${i}`,
          catId: group.cat,
          name,
          dept,
          result: null, // 'pass' | 'fail' | 'na' | null
          comment: "",
          photos: [],
        });
      });
    });
    return cats;
  }

  function newInspection({ equipmentName, type, inspector }) {
    return {
      id: uid(),
      equipmentName,
      type, // 'FAT' | 'SAT'
      inspector: inspector || "",
      date: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items: makeChecklist(type),
      signers: [
        { id: uid(), role: "장비 제작처", org: "", name: "", dataUrl: null },
        { id: uid(), role: "인수처(발주처)", org: "", name: "", dataUrl: null },
      ],
      completedAt: null,
    };
  }

  // Older saved records only have a single top-level `signature`/`inspector`.
  // Migrate them into the signers list the first time they're opened so
  // cross-verification (제작처/발주처 등 복수 서명) works for every record.
  function ensureSigners(insp) {
    if (!insp.signers) {
      insp.signers = [
        { id: uid(), role: "장비 제작처", org: "", name: "", dataUrl: insp.signature || null },
        { id: uid(), role: "인수처(발주처)", org: "", name: "", dataUrl: null },
      ];
    }
    return insp.signers;
  }

  function counts(items) {
    const c = { pass: 0, fail: 0, na: 0, pending: 0, total: items.length };
    items.forEach((it) => {
      if (it.result === "pass") c.pass++;
      else if (it.result === "fail") c.fail++;
      else if (it.result === "na") c.na++;
      else c.pending++;
    });
    return c;
  }

  // Shared status read used by the history list and the summary screen so
  // the two never disagree about what "완료 / 진행중 / 합격 / 불합격" means.
  function verdictOf(insp) {
    const c = counts(insp.items);
    if (!insp.completedAt) {
      return { key: "progress", label: "진행중", color: "var(--pending)", wash: "var(--pending-wash)" };
    }
    if (c.fail > 0) {
      return { key: "fail", label: "완료 · 불합격 있음", color: "var(--fail)", wash: "var(--fail-wash)" };
    }
    if (c.pending > 0) {
      return { key: "partial", label: "완료 · 미기록 항목 있음", color: "var(--pending)", wash: "var(--pending-wash)" };
    }
    return { key: "pass", label: "완료 · 합격", color: "var(--pass)", wash: "var(--pass-wash)" };
  }

  /* ---------------------------------------------------------------------
     Small DOM helpers
  --------------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function h(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  /* ---------------------------------------------------------------------
     Image capture + compression (keeps localStorage small)
  --------------------------------------------------------------------- */
  function fileToCompressedDataUrl(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > PHOTO_MAX_DIM) {
            height = Math.round((height * PHOTO_MAX_DIM) / width);
            width = PHOTO_MAX_DIM;
          } else if (height > PHOTO_MAX_DIM) {
            width = Math.round((width * PHOTO_MAX_DIM) / height);
            height = PHOTO_MAX_DIM;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------------
     Router
  --------------------------------------------------------------------- */
  const routes = [];
  function route(pattern, handler) {
    routes.push({ pattern, handler });
  }
  function parseHash() {
    const hash = location.hash.slice(1) || "/";
    return hash.split("/").filter(Boolean);
  }
  function navigate(path) {
    location.hash = path;
  }
  function render() {
    const parts = parseHash();
    if (parts.length === 0) return renderHome();
    if (parts[0] === "new") return renderNewForm();
    if (parts[0] === "i" && parts[1]) {
      if (parts[2] === "summary") return renderSummary(parts[1]);
      return renderInspection(parts[1]);
    }
    renderHome();
  }
  window.addEventListener("hashchange", render);

  /* ---------------------------------------------------------------------
     Topbar helpers
  --------------------------------------------------------------------- */
  function setTopbar({ eyebrow, title, showBack = false, action = null }) {
    $("#topbarEyebrow").textContent = eyebrow;
    $("#topbarTitle").textContent = title;
    $("#backBtn").classList.toggle("hidden", !showBack);
    const actionSlot = $("#topbarAction");
    actionSlot.innerHTML = "";
    if (action) actionSlot.appendChild(action);
  }

  $("#backBtn").addEventListener("click", () => history.back());

  /* ---------------------------------------------------------------------
     View: Home (검수 이력)
  --------------------------------------------------------------------- */
  const homeState = { tab: "all", query: "", selectedId: null }; // persists while the app stays open

  const isWide = () => window.matchMedia("(min-width: 900px)").matches;

  const TYPE_ORDER = [
    ["FAT", "공장검수"],
    ["SAT", "현장검수"],
  ];

  // Per-type roll-up for the home rail: how many records, how many done,
  // and the pass rate among the done ones.
  function typeStats(all) {
    const mk = (type) => {
      const items = all.filter((i) => (i.type || "FAT") === type);
      const done = items.filter((i) => i.completedAt);
      const pass = done.filter((i) => verdictOf(i).key === "pass").length;
      // 항목 단위 집계 — 이 구분의 모든 검수 항목을 합산
      const it = { pass: 0, fail: 0, na: 0, pending: 0 };
      items.forEach((i) => {
        const cc = counts(i.items);
        it.pass += cc.pass;
        it.fail += cc.fail;
        it.na += cc.na;
        it.pending += cc.pending;
      });
      return {
        total: items.length,
        done: done.length,
        pass,
        rate: done.length ? Math.round((pass / done.length) * 100) : null,
        items: it,
      };
    };
    const doneTotal = all.filter((i) => i.completedAt).length;
    return {
      FAT: mk("FAT"),
      SAT: mk("SAT"),
      doneTotal,
      progressTotal: all.length - doneTotal,
    };
  }

  function railHtml(s) {
    const block = (type, label) => {
      const t = s[type];
      if (!t.total) return "";
      return `
        <div class="rail-card">
          <div class="rail-card__title">
            <span class="session-group__badge session-group__badge--${type.toLowerCase()}">${type}</span>
            <span>${label}</span>
          </div>
          <div class="rail-card__row"><span>완료 / 전체</span><b>${t.done} / ${t.total}</b></div>
          <div class="rail-card__row"><span>합격률</span><b>${t.rate == null ? "–" : t.rate + "%"}</b></div>
          <div class="rail-card__row"><span>항목 합격 · 불합격</span><b>${t.items.pass} · ${t.items.fail}</b></div>
          <div class="rail-card__row"><span>해당없음 · 대기</span><b>${t.items.na} · ${t.items.pending}</b></div>
        </div>`;
    };
    return `
      <div class="rail-card rail-card--sum">
        <div class="rail-card__row"><span>완료</span><b>${s.doneTotal}</b></div>
        <div class="rail-card__row"><span>진행중</span><b>${s.progressTotal}</b></div>
      </div>
      ${block("FAT", "공장검수")}
      ${block("SAT", "현장검수")}
    `;
  }

  function renderHome() {
    const all = loadAll().sort((a, b) => b.updatedAt - a.updatedAt);

    const importBtn = h(`<button class="icon-btn" id="importBtn" aria-label="가져오기" title="JSON 가져오기">📥</button>`);
    setTopbar({ eyebrow: "EQUIPMENT ACCEPTANCE", title: "설비검수 이력", showBack: false, action: importBtn });
    importBtn.addEventListener("click", () => $("#importFile").click());

    const main = $("#main");
    main.innerHTML = "";

    if (all.length === 0) {
      main.appendChild(
        h(`
        <div class="empty-state">
          <div class="empty-state__mark">FAT / SAT</div>
          <div class="empty-state__title">등록된 검수가 없습니다</div>
          <div class="empty-state__body">장비 제작이 끝나면 검수를 새로 시작해 항목별로 합격 · 불합격을 기록하세요. 기록은 이 기기에 자동으로 저장되어 이력으로 남습니다.</div>
          <button class="btn btn--primary" id="emptyNewBtn">검수 시작하기</button>
        </div>
      `)
      );
      $("#emptyNewBtn").addEventListener("click", () => navigate("/new"));
    } else {
      const tabCounts = {
        all: all.length,
        progress: all.filter((i) => !i.completedAt).length,
        done: all.filter((i) => i.completedAt).length,
      };

      const layout = h(`<div class="home-layout"></div>`);
      const listCol = h(`<div class="home-list"></div>`);
      const detailCol = h(`<div class="home-detail"></div>`);
      main.appendChild(layout);
      layout.appendChild(listCol);
      layout.appendChild(detailCol);

      const toolbar = h(`
        <div class="home-toolbar">
          <div class="tabbar">
            <button type="button" class="tabbar__opt ${homeState.tab === "all" ? "is-selected" : ""}" data-tab="all">전체<span class="tabbar__count">${tabCounts.all}</span></button>
            <button type="button" class="tabbar__opt ${homeState.tab === "progress" ? "is-selected" : ""}" data-tab="progress">진행중<span class="tabbar__count">${tabCounts.progress}</span></button>
            <button type="button" class="tabbar__opt ${homeState.tab === "done" ? "is-selected" : ""}" data-tab="done">완료<span class="tabbar__count">${tabCounts.done}</span></button>
          </div>
          <input type="search" class="search-input" id="homeSearch" placeholder="장비명 · 검수자 검색" value="${esc(homeState.query)}" />
        </div>
      `);
      listCol.appendChild(toolbar);

      const listWrap = h(`<div id="sessionListWrap"></div>`);
      listCol.appendChild(listWrap);

      const stats = typeStats(all);

      // 우측(모바일에선 목록 위) 패널: 선택된 검수가 있으면 그 요약을,
      // 없으면 FAT/SAT 개요를 보여준다.
      function renderDetail() {
        const sel = homeState.selectedId
          ? all.find((i) => i.id === homeState.selectedId)
          : null;
        detailCol.innerHTML = "";
        detailCol.appendChild(sel ? homeDetailView(sel, backToList) : homeOverview(stats));
      }

      function selectInspection(id) {
        homeState.selectedId = id;
        renderDetail();
        $$(".session-card", listWrap).forEach((el) =>
          el.classList.toggle("is-active", el.dataset.id === id)
        );
        if (!isWide()) {
          layout.classList.add("is-detail");
          window.scrollTo(0, 0);
        }
      }

      function backToList() {
        homeState.selectedId = null;
        layout.classList.remove("is-detail");
        renderDetail();
        renderList();
        window.scrollTo(0, 0);
      }

      function applyFilter() {
        let list = all;
        if (homeState.tab === "progress") list = list.filter((i) => !i.completedAt);
        else if (homeState.tab === "done") list = list.filter((i) => i.completedAt);
        const q = homeState.query.trim().toLowerCase();
        if (q) {
          list = list.filter(
            (i) => i.equipmentName.toLowerCase().includes(q) || (i.inspector || "").toLowerCase().includes(q)
          );
        }
        return list;
      }

      function renderList() {
        const list = applyFilter();
        listWrap.innerHTML = "";
        if (list.length === 0) {
          listWrap.appendChild(
            h(`<div class="empty-state" style="padding:40px 16px;">
                <div class="empty-state__title">조건에 맞는 검수 이력이 없습니다</div>
               </div>`)
          );
          return;
        }
        // FAT / SAT 구분해서 섹션으로 나눠 보여준다.
        TYPE_ORDER.forEach(([type, label]) => {
          const group = list.filter((i) => (i.type || "FAT") === type);
          if (!group.length) return;
          const done = group.filter((i) => i.completedAt).length;
          const sec = h(`
            <section class="session-group">
              <div class="session-group__head">
                <span class="session-group__badge session-group__badge--${type.toLowerCase()}">${type}</span>
                <span class="session-group__label">${label}</span>
                <span class="session-group__count">${group.length}건${done && done !== group.length ? ` · 완료 ${done}` : ""}</span>
              </div>
              <div class="session-list"></div>
            </section>
          `);
          const listEl = $(".session-list", sec);
          group.forEach((insp) => listEl.appendChild(sessionCard(insp, selectInspection)));
          listWrap.appendChild(sec);
        });
      }
      renderList();
      renderDetail();
      // 이전에 보던 검수가 있으면(전체화면 다녀온 뒤 등) 모바일에서 요약을 유지
      if (!isWide() && homeState.selectedId && all.some((i) => i.id === homeState.selectedId)) {
        layout.classList.add("is-detail");
      }

      $$(".tabbar__opt", toolbar).forEach((btn) => {
        btn.addEventListener("click", () => {
          homeState.tab = btn.dataset.tab;
          $$(".tabbar__opt", toolbar).forEach((b) => b.classList.toggle("is-selected", b === btn));
          renderList();
        });
      });

      const searchInput = $("#homeSearch", toolbar);
      searchInput.addEventListener("input", () => {
        homeState.query = searchInput.value;
        renderList();
      });
    }

    const fab = h(`<button class="fab" aria-label="새 검수">+</button>`);
    fab.addEventListener("click", () => navigate("/new"));
    main.appendChild(fab);

    const importFile = h(`<input type="file" id="importFile" accept="application/json" class="hidden" />`);
    main.appendChild(importFile);
    importFile.addEventListener("change", handleImportFile);
  }

  function sessionCard(insp, onSelect) {
    const c = counts(insp.items);
    const pct = (n) => (c.total ? (n / c.total) * 100 : 0);
    const v = verdictOf(insp);
    const dateLine = insp.completedAt
      ? `${esc(insp.inspector || "검수자 미지정")} · ${esc(insp.date)} · 완료 ${fmtDate(insp.completedAt)}`
      : `${esc(insp.inspector || "검수자 미지정")} · ${esc(insp.date)}`;
    const active = homeState.selectedId === insp.id ? " is-active" : "";
    const card = h(`
      <button class="session-card${active}" data-id="${insp.id}">
        <span class="session-card__status" style="background:${v.wash};color:${v.color}">${v.label}</span>
        <div class="session-card__name">${esc(insp.equipmentName)}</div>
        <div class="session-card__meta">${dateLine}</div>
        <div class="gauge">
          <span class="gauge__seg gauge__seg--pass" style="width:${pct(c.pass)}%"></span>
          <span class="gauge__seg gauge__seg--fail" style="width:${pct(c.fail)}%"></span>
          <span class="gauge__seg gauge__seg--na" style="width:${pct(c.na)}%"></span>
        </div>
        <div class="gauge-legend">
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--pass)"></span>합격 ${c.pass}</span>
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--fail)"></span>불합격 ${c.fail}</span>
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--na)"></span>해당없음 ${c.na}</span>
          ${c.pending ? `<span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--text-faint)"></span>대기 ${c.pending}</span>` : ""}
        </div>
      </button>
    `);
    card.addEventListener("click", () => (onSelect ? onSelect(insp.id) : navigate(`/i/${insp.id}`)));
    return card;
  }

  // Right-hand overview shown when no inspection is selected.
  function homeOverview(stats) {
    return h(`
      <div class="home-pane home-pane--overview">
        <div class="home-pane__hint">FAT · SAT 구분별 검수 현황입니다. 목록에서 검수를 선택하면 상세 내용을 볼 수 있습니다.</div>
        <div class="home-rail">${railHtml(stats)}</div>
      </div>
    `);
  }

  // Right-hand preview of a single inspection: verdict, tallies, category
  // breakdown, failed items, and shortcuts into the full screens.
  function homeDetailView(insp, onBack) {
    const c = counts(insp.items);
    const v = verdictOf(insp);
    const pct = (n) => (c.total ? (n / c.total) * 100 : 0);
    const el = h(`
      <div class="home-pane">
        <button class="home-pane__back" data-act="back">← 이력 목록</button>
        <div class="home-pane__top">
          <span class="session-group__badge session-group__badge--${(insp.type || "FAT").toLowerCase()}">${esc(insp.type || "FAT")}</span>
          <span class="home-pane__status" style="background:${v.wash};color:${v.color}">${v.label}</span>
        </div>
        <div class="home-pane__name">${esc(insp.equipmentName)}</div>
        <div class="home-pane__meta">${esc(insp.inspector || "검수자 미지정")} · ${esc(insp.date)}${insp.completedAt ? ` · 완료 ${fmtDate(insp.completedAt)}` : ""}</div>

        <div class="gauge" style="margin-top:14px;">
          <span class="gauge__seg gauge__seg--pass" style="width:${pct(c.pass)}%"></span>
          <span class="gauge__seg gauge__seg--fail" style="width:${pct(c.fail)}%"></span>
          <span class="gauge__seg gauge__seg--na" style="width:${pct(c.na)}%"></span>
        </div>
        <div class="gauge-legend">
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--pass)"></span>합격 ${c.pass}</span>
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--fail)"></span>불합격 ${c.fail}</span>
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--na)"></span>해당없음 ${c.na}</span>
          ${c.pending ? `<span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--text-faint)"></span>대기 ${c.pending}</span>` : ""}
        </div>

        <div class="home-pane__cats"></div>
        <div class="home-pane__actions">
          <button class="btn btn--primary" data-act="open">전체 체크리스트 열기</button>
          <button class="btn" data-act="summary">요약 · 서명</button>
          <button class="btn" data-act="print">인쇄 / PDF</button>
        </div>
      </div>
    `);

    const catsWrap = $(".home-pane__cats", el);
    categoriesOf(insp).forEach((cat) => {
      const items = insp.items.filter((it) => it.catId === cat.id);
      const cc = counts(items);
      const recorded = cc.pass + cc.fail + cc.na;
      catsWrap.appendChild(
        h(`
          <div class="home-pane__cat">
            <span class="home-pane__cat-bar" style="background:var(${cat.varColor})"></span>
            <span class="home-pane__cat-name">${esc(cat.name)}</span>
            <span class="home-pane__cat-nums">
              <b style="color:var(--pass)">${cc.pass}</b> ·
              <b style="color:var(--fail)">${cc.fail}</b>
              <span class="home-pane__cat-total">${recorded}/${cc.total}</span>
            </span>
          </div>
        `)
      );
    });

    const fails = insp.items.filter((it) => it.result === "fail");
    if (fails.length) {
      const fb = h(`<div class="home-pane__fails"><div class="home-pane__fails-title">불합격 ${fails.length}건</div></div>`);
      fails.forEach((it) =>
        fb.appendChild(
          h(`<div class="home-pane__fail">${esc(it.name)}${it.comment ? ` <span>— ${esc(it.comment)}</span>` : ""}</div>`)
        )
      );
      catsWrap.after(fb);
    }

    $$("[data-act]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.act;
        if (a === "back") onBack && onBack();
        else if (a === "open") navigate(`/i/${insp.id}`);
        else if (a === "summary") navigate(`/i/${insp.id}/summary`);
        else if (a === "print") printInspection(insp);
      })
    );

    return el;
  }

  /* ---------------------------------------------------------------------
     View: New inspection form
  --------------------------------------------------------------------- */
  function renderNewForm() {
    setTopbar({ eyebrow: "NEW SESSION", title: "새 검수", showBack: true });
    const main = $("#main");
    main.innerHTML = "";

    const today = new Date().toISOString().slice(0, 10);
    const form = h(`
      <form id="newForm">
        <div class="form-field">
          <label class="form-field__label">장비명</label>
          <input class="form-field__input" id="fEquip" placeholder="예: 3공정 토크검사기" required />
        </div>
        <div class="form-field">
          <label class="form-field__label">검수 구분</label>
          <div class="segmented" id="fType">
            <button type="button" class="segmented__opt is-selected" data-val="FAT">FAT · 공장검수</button>
            <button type="button" class="segmented__opt" data-val="SAT">SAT · 현장검수</button>
          </div>
        </div>
        <div class="form-field">
          <label class="form-field__label">검수자</label>
          <input class="form-field__input" id="fInspector" placeholder="이름" />
        </div>
        <div class="form-field">
          <label class="form-field__label">검수일</label>
          <input class="form-field__input" id="fDate" type="date" value="${today}" />
          <div class="form-field__hint" id="tplHint"></div>
        </div>
        <button class="btn btn--primary btn--block" type="submit">검수 시작</button>
      </form>
    `);
    main.appendChild(form);

    let selectedType = "FAT";
    const hint = $("#tplHint", form);
    const updateHint = () => {
      hint.textContent =
        selectedType === "SAT"
          ? `현장검수용 체크리스트 총 ${templateCount("SAT")}개 항목이 생성됩니다. 항목별 확인 담당 부서(생산 · 품질 · 설비보전 · 안전환경 · 정보시스템 등)가 함께 표시됩니다.`
          : `공장검수용 체크리스트 총 ${templateCount("FAT")}개 항목이 생성됩니다.`;
    };
    updateHint();
    $$(".segmented__opt", form).forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".segmented__opt", form).forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        selectedType = btn.dataset.val;
        updateHint();
      });
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#fEquip", form).value.trim();
      if (!name) {
        toast("장비명을 입력해 주세요");
        return;
      }
      const insp = newInspection({
        equipmentName: name,
        type: selectedType,
        inspector: $("#fInspector", form).value.trim(),
      });
      insp.date = $("#fDate", form).value || insp.date;
      upsertInspection(insp);
      navigate(`/i/${insp.id}`);
    });
  }

  /* ---------------------------------------------------------------------
     View: Inspection checklist
  --------------------------------------------------------------------- */
  function renderInspection(id) {
    const insp = getInspection(id);
    if (!insp) {
      navigate("/");
      return;
    }

    const menuBtn = h(`<button class="icon-btn" aria-label="삭제" title="검수 삭제">🗑</button>`);
    menuBtn.addEventListener("click", () => {
      if (confirm(`"${insp.equipmentName}" 검수를 삭제할까요? 되돌릴 수 없습니다.`)) {
        deleteInspection(id);
        navigate("/");
      }
    });
    setTopbar({ eyebrow: `${insp.type} · ${insp.date}`, title: insp.equipmentName, showBack: true, action: menuBtn });

    const main = $("#main");
    main.innerHTML = "";

    const c = counts(insp.items);
    const summary = h(`
      <div class="summary-panel">
        <div class="summary-panel__row">
          <div class="summary-panel__count" style="color:var(--pass)">${c.pass}<small> 합격</small></div>
          <div class="summary-panel__count" style="color:var(--fail)">${c.fail}<small> 불합격</small></div>
          <div class="summary-panel__count" style="color:var(--text-dim)">${c.na}<small> 해당없음</small></div>
          <div class="summary-panel__count" style="color:var(--pending)">${c.pending}<small> 대기</small></div>
        </div>
        <div class="gauge">
          <span class="gauge__seg gauge__seg--pass" style="width:${(c.pass / c.total) * 100}%"></span>
          <span class="gauge__seg gauge__seg--fail" style="width:${(c.fail / c.total) * 100}%"></span>
          <span class="gauge__seg gauge__seg--na" style="width:${(c.na / c.total) * 100}%"></span>
        </div>
      </div>
    `);
    main.appendChild(summary);

    categoriesOf(insp).forEach((cat) => {
      const catItems = insp.items.filter((it) => it.catId === cat.id);
      const cc = counts(catItems);
      const group = h(`
        <section class="category-group">
          <div class="category-group__head">
            <span class="category-group__bar" style="background:var(${cat.varColor})"></span>
            <span class="category-group__name">${esc(cat.name)}</span>
            <span class="category-group__ratio">${cc.pass + cc.fail + cc.na}/${cc.total}</span>
          </div>
          <div class="category-group__items"></div>
        </section>
      `);
      const itemsWrap = $(".category-group__items", group);
      catItems.forEach((it, i) => itemsWrap.appendChild(itemRow(insp, it, i + 1)));
      main.appendChild(group);
    });

    const footer = h(`
      <div class="footer-actions" style="flex-wrap:wrap;">
        <button class="btn" id="printBtn">인쇄 / PDF 저장</button>
        <button class="btn" id="exportBtn">JSON 내보내기</button>
        <button class="btn btn--primary" id="toSummaryBtn" style="flex-basis:100%;">검수 마무리</button>
      </div>
    `);
    main.appendChild(footer);
    $("#printBtn", footer).addEventListener("click", () => printInspection(insp));
    $("#exportBtn", footer).addEventListener("click", () => exportInspection(insp));
    $("#toSummaryBtn", footer).addEventListener("click", () => navigate(`/i/${id}/summary`));
  }

  function itemRow(insp, item, num) {
    const row = h(`
      <div class="item ${item.result ? "result-" + item.result : ""}" data-item="${item.id}">
        <div class="item__top">
          <span class="item__num">${String(num).padStart(2, "0")}</span>
          <span class="item__name">${esc(item.name)}${item.dept ? `<span class="item__dept">${esc(item.dept)}</span>` : ""}</span>
        </div>
        <div class="item__controls">
          <button type="button" class="result-btn result-btn--pass ${item.result === "pass" ? "is-selected" : ""}" data-r="pass">합격</button>
          <button type="button" class="result-btn result-btn--fail ${item.result === "fail" ? "is-selected" : ""}" data-r="fail">불합격</button>
          <button type="button" class="result-btn result-btn--na ${item.result === "na" ? "is-selected" : ""}" data-r="na">해당없음</button>
          <span class="item__extra-toggle">
            <button type="button" class="icon-btn extra-toggle ${item.comment ? "is-active" : ""}" title="메모" style="width:32px;height:32px;">💬</button>
            <button type="button" class="icon-btn extra-toggle ${item.photos.length ? "is-active" : ""}" title="사진" style="width:32px;height:32px;">📷</button>
          </span>
        </div>
        <div class="item__extra hidden">
          <textarea class="item__comment" placeholder="비고 · 조치사항 입력">${esc(item.comment)}</textarea>
          <div class="item__photo-row"></div>
        </div>
      </div>
    `);

    // result buttons: click again to clear back to pending
    $$(".result-btn", row).forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.r;
        item.result = item.result === val ? null : val;
        upsertInspection(insp);
        row.className = `item ${item.result ? "result-" + item.result : ""}`;
        $$(".result-btn", row).forEach((b) => b.classList.toggle("is-selected", b.dataset.r === item.result));
      });
    });

    const extra = $(".item__extra", row);
    $$(".extra-toggle", row).forEach((btn) =>
      btn.addEventListener("click", () => extra.classList.toggle("hidden"))
    );

    const comment = $(".item__comment", row);
    comment.addEventListener("change", () => {
      item.comment = comment.value;
      upsertInspection(insp);
      $$(".extra-toggle", row)[0].classList.toggle("is-active", !!item.comment);
    });

    const photoRow = $(".item__photo-row", row);
    renderPhotoRow(insp, item, photoRow, row);

    return row;
  }

  function renderPhotoRow(insp, item, photoRow, row) {
    photoRow.innerHTML = "";
    item.photos.forEach((src, idx) => {
      const thumb = h(`
        <span class="item__photo-thumb">
          <img class="item__photo" src="${src}" />
          <button type="button" class="item__photo-remove" aria-label="사진 삭제">✕</button>
        </span>
      `);
      $(".item__photo-remove", thumb).addEventListener("click", () => {
        item.photos.splice(idx, 1);
        upsertInspection(insp);
        renderPhotoRow(insp, item, photoRow, row);
        $$(".extra-toggle", row)[1].classList.toggle("is-active", !!item.photos.length);
      });
      photoRow.appendChild(thumb);
    });
    if (item.photos.length < MAX_PHOTOS_PER_ITEM) {
      const addBtn = h(`
        <label class="item__photo-add">
          +
          <input type="file" accept="image/*" capture="environment" class="hidden" />
        </label>
      `);
      const input = $("input", addBtn);
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const dataUrl = await fileToCompressedDataUrl(file);
          item.photos.push(dataUrl);
          const ok = upsertInspection(insp);
          if (ok) {
            renderPhotoRow(insp, item, photoRow, row);
            $$(".extra-toggle", row)[1].classList.add("is-active");
          } else {
            item.photos.pop();
          }
        } catch (err) {
          console.error(err);
          toast("사진을 처리하지 못했습니다");
        }
      });
      photoRow.appendChild(addBtn);
    }
  }

  function exportInspection(insp) {
    const blob = new Blob([JSON.stringify(insp, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `검수_${insp.equipmentName}_${insp.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("JSON 파일로 내보냈습니다");
  }

  const RESULT_LABEL = { pass: "합격", fail: "불합격", na: "해당없음" };

  // Builds the full printable report — every category and every item,
  // not just the failed ones — plus the signer block. Used by both the
  // checklist screen and the summary screen's 인쇄/PDF 저장 button.
  function buildPrintDoc(insp) {
    const c = counts(insp.items);
    const v = verdictOf(insp);

    let rows = "";
    categoriesOf(insp).forEach((cat) => {
      rows += `<tr class="print-doc__cat-row"><td colspan="5">${esc(cat.name)}</td></tr>`;
      const catItems = insp.items.filter((it) => it.catId === cat.id);
      catItems.forEach((it, i) => {
        const label = it.result ? RESULT_LABEL[it.result] : "미기록";
        const resultClass = it.result ? `r-${it.result}` : "r-pending";
        const photos = (it.photos || []).map((src) => `<img src="${src}" class="print-doc__thumb" />`).join("");
        const dept = it.dept ? ` <span style="color:#888;font-size:11px;">[${esc(it.dept)}]</span>` : "";
        rows += `
          <tr>
            <td class="print-doc__num">${String(i + 1).padStart(2, "0")}</td>
            <td>${esc(it.name)}${dept}</td>
            <td class="print-doc__result ${resultClass}">${label}</td>
            <td>${esc(it.comment || "")}</td>
            <td>${photos}</td>
          </tr>`;
      });
    });

    const signers = insp.signers || [];
    const signerHtml = signers
      .map(
        (s) => `
        <div class="print-doc__signer">
          <div class="print-doc__signer-role">${esc(s.role || "서명")}</div>
          <div class="print-doc__signer-info">${esc(s.org || "-")} · ${esc(s.name || "-")}</div>
          <div class="print-doc__sig-box">${s.dataUrl ? `<img src="${s.dataUrl}" />` : ""}</div>
        </div>`
      )
      .join("");

    return `
      <div class="print-doc__header">
        <div class="print-doc__title">설비검수 결과보고서</div>
        <table class="print-doc__meta">
          <tr><th>장비명</th><td>${esc(insp.equipmentName)}</td><th>구분</th><td>${esc(insp.type)}</td></tr>
          <tr><th>검수일</th><td>${esc(insp.date)}</td><th>검수자</th><td>${esc(insp.inspector || "-")}</td></tr>
          <tr><th>결과</th><td colspan="3">${esc(v.label)} — 합격 ${c.pass} · 불합격 ${c.fail} · 해당없음 ${c.na} · 미기록 ${c.pending} (총 ${c.total}건)</td></tr>
        </table>
      </div>
      <table class="print-doc__table">
        <thead><tr><th>No</th><th>항목</th><th>결과</th><th>비고</th><th>사진</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="print-doc__signers">${signerHtml}</div>
    `;
  }

  function printInspection(insp) {
    $("#printArea").innerHTML = buildPrintDoc(insp);
    window.print();
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.id || !Array.isArray(data.items)) throw new Error("invalid");
        data.id = uid(); // avoid clobbering an existing record
        upsertInspection(data);
        toast("가져왔습니다");
        renderHome();
      } catch (err) {
        toast("올바른 검수 JSON 파일이 아닙니다");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  /* ---------------------------------------------------------------------
     View: Summary + signature
  --------------------------------------------------------------------- */
  function renderSummary(id) {
    const insp = getInspection(id);
    if (!insp) {
      navigate("/");
      return;
    }
    setTopbar({ eyebrow: `${insp.type} · ${insp.date}`, title: "검수 요약", showBack: true });

    const main = $("#main");
    main.innerHTML = "";

    const c = counts(insp.items);
    const verdict =
      c.fail > 0 ? { label: "불합격 항목 있음", color: "var(--fail)" } :
      c.pending > 0 ? { label: "검수 진행 중", color: "var(--pending)" } :
      { label: "전 항목 합격", color: "var(--pass)" };

    const panel = h(`
      <div class="summary-panel">
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-faint);margin-bottom:4px;">RESULT</div>
        <div style="font-size:19px;font-weight:700;color:${verdict.color};margin-bottom:14px;">${verdict.label}</div>
        <div class="gauge">
          <span class="gauge__seg gauge__seg--pass" style="width:${(c.pass / c.total) * 100}%"></span>
          <span class="gauge__seg gauge__seg--fail" style="width:${(c.fail / c.total) * 100}%"></span>
          <span class="gauge__seg gauge__seg--na" style="width:${(c.na / c.total) * 100}%"></span>
        </div>
        <div class="gauge-legend" style="margin-top:8px;">
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--pass)"></span>합격 ${c.pass}</span>
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--fail)"></span>불합격 ${c.fail}</span>
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--na)"></span>해당없음 ${c.na}</span>
          <span class="gauge-legend__item"><span class="gauge-legend__dot" style="background:var(--pending)"></span>대기 ${c.pending}</span>
        </div>
      </div>
    `);
    main.appendChild(panel);

    const failItems = insp.items.filter((it) => it.result === "fail");
    if (failItems.length) {
      const failBlock = h(`<section class="category-group"></section>`);
      failBlock.appendChild(
        h(`<div class="category-group__head"><span class="category-group__bar" style="background:var(--fail)"></span><span class="category-group__name">불합격 항목</span></div>`)
      );
      const wrap = h(`<div></div>`);
      failItems.forEach((it) => {
        wrap.appendChild(
          h(`<div class="item result-fail"><div class="item__top"><span class="item__name">${esc(it.name)}</span></div>${it.comment ? `<div style="font-size:12.5px;color:var(--text-dim);margin-top:4px;">${esc(it.comment)}</div>` : ""}</div>`)
        );
      });
      failBlock.appendChild(wrap);
      main.appendChild(failBlock);
    }

    // cross-verification: 제작처/발주처 등 여러 명이 소속·이름을 남기고 서명
    const signers = ensureSigners(insp);
    const sigHead = h(`
      <div class="form-field" style="margin-bottom:10px;">
        <label class="form-field__label">서명 · 교차 검증</label>
        <div class="form-field__hint">장비 제작처, 인수처(발주처) 등 검수에 참여한 담당자별로 소속과 이름을 남기고 서명하세요.</div>
      </div>
    `);
    main.appendChild(sigHead);

    const signerListEl = h(`<div id="signerList"></div>`);
    main.appendChild(signerListEl);

    const sigPads = new Map(); // signer.id -> pad controller

    function renderSigner(signer) {
      const block = h(`
        <div class="signer-block" data-signer="${signer.id}">
          <div class="signer-block__row">
            <input class="signer-block__role-input" type="text" placeholder="구분(예: 제작처)" value="${esc(signer.role)}" />
            <button type="button" class="icon-btn signer-remove" title="이 서명란 삭제" style="width:32px;height:32px;">✕</button>
          </div>
          <div class="signer-block__row">
            <input type="text" placeholder="소속" value="${esc(signer.org)}" data-f="org" />
            <input type="text" placeholder="성명" value="${esc(signer.name)}" data-f="name" />
          </div>
          <div class="sig-pad-wrap">
            <canvas></canvas>
            <div class="sig-pad-actions">
              <span>서명란</span>
              <button type="button" class="btn btn--ghost btn--sm sig-clear">지우기</button>
            </div>
          </div>
        </div>
      `);

      $(".signer-block__role-input", block).addEventListener("change", (e) => {
        signer.role = e.target.value.trim();
      });
      $('[data-f="org"]', block).addEventListener("change", (e) => {
        signer.org = e.target.value.trim();
      });
      $('[data-f="name"]', block).addEventListener("change", (e) => {
        signer.name = e.target.value.trim();
      });

      const canvas = $("canvas", block);
      const pad = setupSignaturePad(canvas, signer.dataUrl);
      sigPads.set(signer.id, pad);
      $(".sig-clear", block).addEventListener("click", () => pad.clear());

      $(".signer-remove", block).addEventListener("click", () => {
        if (signers.length <= 1) {
          toast("서명란은 최소 1개 필요합니다");
          return;
        }
        if ((signer.name || signer.dataUrl) && !confirm("이 서명란을 삭제할까요?")) return;
        const idx = signers.findIndex((s) => s.id === signer.id);
        if (idx >= 0) signers.splice(idx, 1);
        sigPads.delete(signer.id);
        block.remove();
      });

      return block;
    }

    signers.forEach((s) => signerListEl.appendChild(renderSigner(s)));

    const addSignerBtn = h(`<button type="button" class="btn btn--block" id="addSignerBtn">+ 서명란 추가</button>`);
    addSignerBtn.addEventListener("click", () => {
      const s = { id: uid(), role: "", org: "", name: "", dataUrl: null };
      signers.push(s);
      signerListEl.appendChild(renderSigner(s));
    });
    main.appendChild(addSignerBtn);

    const footer = h(`
      <div class="footer-actions" style="flex-wrap:wrap;">
        <button class="btn" id="printBtn">인쇄 / PDF 저장</button>
        <button class="btn" id="exportBtn2">JSON 내보내기</button>
        <button class="btn btn--primary" id="completeBtn" style="flex-basis:100%;">${insp.completedAt ? "완료됨 · 다시 저장" : "서명 저장 및 완료 처리"}</button>
      </div>
    `);
    main.appendChild(footer);

    function syncSignersFromPads() {
      signers.forEach((signer) => {
        const pad = sigPads.get(signer.id);
        if (pad && !pad.isEmpty()) signer.dataUrl = pad.toDataUrl();
      });
      insp.signers = signers;
    }

    $("#printBtn", footer).addEventListener("click", () => {
      syncSignersFromPads();
      upsertInspection(insp);
      printInspection(insp);
    });
    $("#exportBtn2", footer).addEventListener("click", () => exportInspection(insp));
    $("#completeBtn", footer).addEventListener("click", () => {
      syncSignersFromPads();
      insp.completedAt = Date.now();
      const ok = upsertInspection(insp);
      if (ok) {
        toast("검수 결과를 저장했습니다");
        navigate("/");
      }
    });
  }

  function setupSignaturePad(canvas, existingDataUrl) {
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let empty = true;
    let dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "#1b222b";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (existingDataUrl) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = existingDataUrl;
        empty = false;
      }
    }
    resize();

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    }
    function start(e) {
      drawing = true;
      empty = false;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    }
    function move(e) {
      if (!drawing) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      e.preventDefault();
    }
    function end() {
      drawing = false;
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    return {
      clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        empty = true;
      },
      isEmpty() {
        return empty;
      },
      toDataUrl() {
        return canvas.toDataURL("image/png");
      },
    };
  }

  /* ---------------------------------------------------------------------
     Offline / install / service worker
  --------------------------------------------------------------------- */
  function updateOfflineBanner() {
    $("#offlineBanner").classList.toggle("show", !navigator.onLine);
  }
  window.addEventListener("online", updateOfflineBanner);
  window.addEventListener("offline", updateOfflineBanner);

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!localStorage.getItem("eqi:installDismissed")) {
      $("#installStrip").classList.add("show");
    }
  });
  $("#installBtn").addEventListener("click", async () => {
    $("#installStrip").classList.remove("show");
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
  $("#installDismiss").addEventListener("click", () => {
    $("#installStrip").classList.remove("show");
    localStorage.setItem("eqi:installDismissed", "1");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((err) => {
        console.error("SW registration failed", err);
      });
    });
  }

  /* ---------------------------------------------------------------------
     Boot
  --------------------------------------------------------------------- */
  updateOfflineBanner();
  render();
})();
