import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Stage, type MorphOptions } from "./stage";
import type { ShapeName } from "./shapes";
import type { Capability, Chapter } from "../content";
import type { ProtoCard, ReplayStep } from "../data";
import { visual } from "../visuals";

interface Payload {
  capabilities: Capability[];
  chapters: Chapter[];
  protocols: ProtoCard[];
  drift: ReplayStep[];
  warningDays: number;
  live: boolean;
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T & Element>(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T & Element>(sel)) as T[];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const SECOND: Record<string, string> = {
  map: "#1d6bff",
  watch: "#3b4dff",
  score: "#ff4fd8",
  warn: "#ffb547",
  act: "#2BFFB0",
  build: "#8B7CFF",
};
const GRADE_WORD: Record<string, string> = { A: "Strong", B: "Good", C: "Caution", D: "Weak", F: "Dangerous" };
const DRAIN = Date.parse("2026-04-01T16:05:00Z");
const DAY = 86_400_000;

export function boot(): () => void {
  const data = JSON.parse($("#ow-data")?.textContent ?? "{}") as Payload;
  const capById = new Map(data.capabilities.map((c) => [c.id, c]));
  const chById = new Map(data.chapters.map((c) => [c.id, c]));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(t: Window, ev: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn, opts);
    cleanups.push(() => t.removeEventListener(ev, fn));
  };

  gsap.registerPlugin(ScrollTrigger);
  history.scrollRestoration = "manual";

  // ---------------------------------------------------------------- scroll
  const lenis = new Lenis({ duration: 1.15, smoothWheel: !reduced, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  const raf = (t: number) => lenis.raf(t * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);
  cleanups.push(() => {
    gsap.ticker.remove(raf);
    lenis.destroy();
  });
  const scrollTo = (target: string | HTMLElement | number, immediate = false) =>
    lenis.scrollTo(target, { offset: typeof target === "number" ? 0 : -70, immediate, duration: 1.6 });

  // ---------------------------------------------------------------- stage
  let stage: Stage | null = null;
  const canvas = $<HTMLCanvasElement>("#stage");
  try {
    if (canvas) {
      stage = new Stage(canvas, { reducedMotion: reduced });
      stage.start();
    }
  } catch {
    document.body.classList.add("no-webgl");
  }
  lenis.on("scroll", (l: Lenis) => stage?.setScrollVelocity(l.velocity));
  const morph = (shape: ShapeName, o: MorphOptions) => stage?.morph(shape, o);

  // ---------------------------------------------------------------- boot sequence
  const bootEl = $("#boot");
  const bootLog = $("#bootLog");
  const bootPct = $("#bootPct");
  const bootBar = $("#bootBar");
  const lines = [
    "establishing read-only link · solana mainnet-beta",
    `loading control snapshots · ${data.protocols.length} protocols`,
    "decoding upgrade authorities · squads v4 · durable nonces",
    `rules engine armed · ${data.capabilities.length} capabilities`,
    data.live ? "live data stream attached" : "mainnet snapshot loaded · oct 11 2026",
    "vigil online",
  ];
  const introDone = () => {
    document.body.classList.remove("is-loading");
    heroIntro();
  };
  if (reduced || !bootEl) {
    bootEl?.remove();
    introDone();
  } else {
    const prog = { v: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(bootEl, {
          clipPath: "inset(0 0 100% 0)",
          duration: 1.1,
          ease: "expo.inOut",
          onComplete: () => bootEl.remove(),
        });
        gsap.delayedCall(0.35, introDone);
      },
    });
    tl.to(prog, {
      v: 100,
      duration: 2.4,
      ease: "power2.inOut",
      onUpdate: () => {
        const v = Math.round(prog.v);
        if (bootPct) bootPct.textContent = String(v).padStart(3, "0");
        if (bootBar) bootBar.style.transform = `scaleX(${prog.v / 100})`;
        const n = Math.min(lines.length, Math.floor((prog.v / 100) * lines.length + 0.4));
        while (bootLog && bootLog.children.length < n) {
          const li = document.createElement("li");
          li.innerHTML = `<span>[${(performance.now() / 1000).toFixed(3)}]</span> ${esc(lines[bootLog.children.length] ?? "")}`;
          bootLog.appendChild(li);
        }
      },
    });
  }

  function heroIntro() {
    morph("orb", { colorA: "#2BFFB0", colorB: "#3a5cff", hud: true, y: 0.45, yNarrow: 0.9, duration: 2.6, opacity: 1, front: true, sway: 0.18 });
    stage?.pulseScan();
    if (reduced) return;
    gsap.from(".hero__line > span", { yPercent: 110, rotate: 4, duration: 1.4, ease: "expo.out", stagger: 0.09 });
    gsap.from(".hero__eyebrow, .hero__aside > *, .hud, .hero__scroll", { opacity: 0, y: 16, duration: 1, ease: "power2.out", stagger: 0.06, delay: 0.3 });
    gsap.from(".nav", { opacity: 0, y: -20, duration: 1, ease: "power2.out", delay: 0.2 });
    $$("[data-scramble]").forEach((el, i) => gsap.delayedCall(0.4 + i * 0.15, () => scramble(el)));
  }

  // ---------------------------------------------------------------- scramble text
  const GLYPHS = "!<>-_\\/[]{}—=+*^?#01ABCDEF";
  function scramble(el: HTMLElement) {
    const target = el.dataset.text ?? el.textContent ?? "";
    el.dataset.text = target;
    const t0 = performance.now();
    const dur = 700;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = target
        .split("")
        .map((ch, i) => (ch === " " || i < k * target.length ? ch : (GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "")))
        .join("");
      if (k < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    tick();
  }
  $$("[data-scramble]").forEach((el) => el.addEventListener("mouseenter", () => scramble(el)));

  // ---------------------------------------------------------------- slot + hud
  const slotEls = [$("#slot"), $("#slotFoot")].filter(Boolean) as HTMLElement[];
  let slot: number | null = null;
  const fmtSlot = () => slotEls.forEach((el) => (el.textContent = slot == null ? "offline" : slot.toLocaleString("en-US")));
  async function syncSlot() {
    try {
      const r = await fetch("/api/v1/status", { cache: "no-store" });
      const j = (await r.json()) as { data?: { slot?: number | null } };
      if (j.data?.slot) {
        slot = j.data.slot;
        return fmtSlot();
      }
    } catch {
      /* fall through */
    }
    try {
      const r = await fetch("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
      });
      const j = (await r.json()) as { result?: number };
      if (j.result) slot = j.result;
    } catch {
      /* offline */
    }
    fmtSlot();
  }
  void syncSlot();
  const slotTimer = window.setInterval(() => {
    if (slot != null) {
      slot += 1;
      fmtSlot();
    }
  }, 400);
  const slotSync = window.setInterval(() => void syncSlot(), 60_000);
  cleanups.push(() => {
    clearInterval(slotTimer);
    clearInterval(slotSync);
  });
  const tgt = $("#tgt");
  on(window, "pointermove", (e) => {
    if (!tgt) return;
    const x = (e.clientX / window.innerWidth) * 2 - 1, y = -(e.clientY / window.innerHeight) * 2 + 1;
    tgt.textContent = `${x >= 0 ? "+" : ""}${x.toFixed(3)} / ${y >= 0 ? "+" : ""}${y.toFixed(3)}`;
  });

  // ---------------------------------------------------------------- cursor
  const cursor = $("#cursor");
  const cursorLabel = $("#cursorLabel");
  if (cursor && finePointer && !reduced) {
    document.body.classList.add("has-cursor");
    cursor.classList.add("is-gone");
    const pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const xTo = gsap.quickTo(cursor, "x", { duration: 0.18, ease: "power3" });
    const yTo = gsap.quickTo(cursor, "y", { duration: 0.18, ease: "power3" });
    on(window, "pointermove", (e) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      cursor.classList.remove("is-gone");
      xTo(pos.x);
      yTo(pos.y);
      const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cursor], a, button, input, summary");
      cursor.classList.toggle("is-hover", !!t);
      cursor.classList.toggle("is-text", !!t && t.tagName === "INPUT");
      if (cursorLabel) cursorLabel.textContent = t?.dataset.cursor ?? "";
    });
    on(window, "pointerdown", () => cursor.classList.add("is-down"));
    on(window, "pointerup", () => cursor.classList.remove("is-down"));
    document.documentElement.addEventListener("pointerleave", () => cursor.classList.add("is-gone"));
    document.documentElement.addEventListener("pointerenter", () => cursor.classList.remove("is-gone"));
  }

  // magnetic buttons
  if (finePointer && !reduced) {
    $$(".btn, .nav__link, .dock__btn").forEach((el) => {
      const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.25);
        yTo((e.clientY - r.top - r.height / 2) * 0.35);
      });
      el.addEventListener("pointerleave", () => {
        xTo(0);
        yTo(0);
      });
    });
  }

  // 3D tilt for cards and tiles
  if (finePointer && !reduced) {
    $$(".tile, .card, .path, .hl").forEach((el) => {
      const strength = el.classList.contains("hl") ? 3 : 7;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
        gsap.to(el, { rotateY: (px - 0.5) * strength, rotateX: -(py - 0.5) * strength, transformPerspective: 900, duration: 0.5, ease: "power2.out" });
      });
      el.addEventListener("pointerleave", () => gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.8, ease: "elastic.out(1, 0.5)" }));
    });
  }

  // ---------------------------------------------------------------- nav + anchors
  const nav = $("#nav");
  lenis.on("scroll", (l: Lenis) => nav?.classList.toggle("is-scrolled", l.scroll > 40));
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#cap/") || href.startsWith("#protocol/")) return;
    e.preventDefault();
    closeMenu();
    if (modalOpen) closeModal();
    if (href === "#top" || href === "#") return scrollTo(0);
    const target = $(href);
    if (target) scrollTo(target);
  });

  // ---------------------------------------------------------------- menu
  const menu = $("#menu");
  const menuOpenBtn = $("#menuOpen");
  let menuIsOpen = false;
  let preMenuShape: { shape: ShapeName; opts: MorphOptions } | null = null;
  function openMenu() {
    if (!menu || menuIsOpen) return;
    menuIsOpen = true;
    preMenuShape = lastStage;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    menuOpenBtn?.setAttribute("aria-expanded", "true");
    lenis.stop();
    gsap.fromTo(".menu__list li", { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.9, ease: "expo.out", stagger: 0.04, delay: 0.15 });
  }
  function closeMenu() {
    if (!menu || !menuIsOpen) return;
    menuIsOpen = false;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    menuOpenBtn?.setAttribute("aria-expanded", "false");
    lenis.start();
    if (preMenuShape) morph(preMenuShape.shape, preMenuShape.opts);
  }
  menuOpenBtn?.addEventListener("click", () => (menuIsOpen ? closeMenu() : openMenu()));
  $("#menuClose")?.addEventListener("click", closeMenu);
  $$<HTMLAnchorElement>(".menu__list a, .tile").forEach((a) => {
    a.addEventListener("pointerenter", () => {
      const shape = a.dataset.shape as ShapeName | undefined;
      const color = a.dataset.color ?? "#2BFFB0";
      if (!shape) return;
      if (a.classList.contains("tile")) morph(shape, { colorA: color, colorB: "#1b2340", opacity: 0.55, scale: 1.25, duration: 1.4, autoRotate: 0.15 });
      else morph(shape, { colorA: color, colorB: "#7CF3FF", x: 2.9, scale: 1.05, opacity: 1, duration: 1.2, autoRotate: 0.15, arcs: shape === "globe" });
    });
  });
  $(".tiles__grid")?.addEventListener("pointerleave", () => lastStage && morph(lastStage.shape, lastStage.opts));

  // ---------------------------------------------------------------- headliners: horizontal pin
  const mm = gsap.matchMedia();
  mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
    const track = $("#hlTrack");
    const prog = $("#hlProg");
    if (!track) return;
    const dist = () => track.scrollWidth - window.innerWidth + 64;
    gsap.to(track, {
      x: () => -dist(),
      ease: "none",
      scrollTrigger: {
        trigger: ".headliners",
        start: "top top",
        end: () => `+=${dist()}`,
        pin: ".headliners__pin",
        scrub: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => prog && (prog.style.transform = `scaleX(${self.progress})`),
      },
    });
  });
  cleanups.push(() => mm.revert());

  // ---------------------------------------------------------------- stage per section
  let lastStage: { shape: ShapeName; opts: MorphOptions } | null = null;
  const stageFor = (key: string, el: HTMLElement): { shape: ShapeName; opts: MorphOptions } | null => {
    if (key === "hero") return { shape: "orb", opts: { colorA: "#2BFFB0", colorB: "#3a5cff", hud: true, y: 0.45, yNarrow: 0.9, front: true, sway: 0.18 } };
    if (key === "manifesto") return { shape: "scatter", opts: { colorA: "#7CF3FF", colorB: "#2a2f5a", opacity: 0.55, autoRotate: 0.03 } };
    if (key === "stats") return { shape: "lattice", opts: { colorA: "#7CF3FF", colorB: "#8B7CFF", opacity: 0.75, x: 3.2, y: 0.9, scale: 0.85, autoRotate: 0.14, tiltX: 0.2 } };
    if (key === "tiles") return { shape: "scatter", opts: { colorA: "#2BFFB0", colorB: "#1b2340", opacity: 0.5 } };
    if (key === "headliners") return { shape: "terrain", opts: { colorA: "#5AA8FF", colorB: "#2BFFB0", opacity: 0.45, y: -1.2, scale: 1.3, autoRotate: 0.02 } };
    if (key === "drift") return { shape: "knot", opts: { colorA: "#2BFFB0", colorB: "#1b2340", opacity: 0.55, x: 2.8, scale: 0.9, autoRotate: 0.1 } };
    if (key === "cmap") return { shape: "globe", opts: { colorA: "#2BFFB0", colorB: "#1d6bff", opacity: 1, x: 2.9, y: 1.05, scale: 0.78, arcs: true, autoRotate: 0.07, tiltX: 0.3 } };
    if (key === "index") return { shape: "scatter", opts: { colorA: "#8B7CFF", colorB: "#1b2340", opacity: 0.3 } };
    if (key === "cta") return { shape: "wordmark", opts: { colorA: "#2BFFB0", colorB: "#7CF3FF", y: 1.55, yNarrow: 1.9, scale: 0.95, narrowScale: 0.5, opacity: 1, front: true, sway: 0.12 } };
    const [kind, id] = key.split(":");
    const ch = id ? chById.get(id) : undefined;
    if (!ch) return null;
    const facing = ["graph", "shield", "lock"].includes(ch.shape);
    if (kind === "chapter")
      return { shape: ch.shape as ShapeName, opts: { colorA: ch.color, colorB: SECOND[ch.id] ?? "#1b2340", x: 2.5, y: 0, yNarrow: 1.2, opacity: 1, autoRotate: 0.12, front: facing, sway: facing ? 0.45 : 0 } };
    if (kind === "grid") return { shape: ch.shape as ShapeName, opts: { colorA: ch.color, colorB: SECOND[ch.id] ?? "#1b2340", x: 0, scale: 1.35, opacity: 0.26, autoRotate: 0.05 } };
    void el;
    return null;
  };
  $$("[data-stage]").forEach((el) => {
    const key = el.dataset.stage ?? "";
    ScrollTrigger.create({
      trigger: el,
      start: "top 55%",
      end: "bottom 55%",
      onToggle: (self) => {
        if (!self.isActive || menuIsOpen) return;
        const cfg = stageFor(key, el);
        if (!cfg) return;
        if (key === "drift") return applyDriftStage();
        lastStage = cfg;
        if (document.body.classList.contains("is-loading")) return;
        morph(cfg.shape, cfg.opts);
        if (key.startsWith("chapter:")) stage?.pulseScan();
      },
    });
  });

  // ---------------------------------------------------------------- dock
  const dockStops = [
    { id: "top", num: "00", name: "Intro" },
    { id: "numbers", num: "00", name: "The locks" },
    { id: "chapters", num: "00", name: "Chapters" },
    { id: "headliners", num: "00", name: "Headliners" },
    ...data.chapters.map((c) => ({ id: c.id, num: c.num, name: c.name })),
    { id: "drift", num: "07", name: "Drift" },
    { id: "control-map", num: "08", name: "Control map" },
    { id: "index", num: "09", name: "Index" },
    { id: "cta", num: "10", name: "Stand watch" },
  ];
  const dock = $("#dock");
  const dockNum = $("#dockNum");
  const dockName = $("#dockName");
  const dockProg = $<SVGCircleElement>("#dockProg");
  let dockIdx = 0;
  const setDock = (i: number) => {
    if (i === dockIdx && dockNum?.textContent === dockStops[i]?.num) return;
    dockIdx = i;
    const s = dockStops[i];
    if (!s || !dockNum || !dockName) return;
    gsap.fromTo([dockNum, dockName], { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.04 });
    dockNum.textContent = s.num;
    dockName.textContent = s.name;
    const c = chById.get(s.id);
    dock?.style.setProperty("--c", c?.color ?? (s.id === "drift" ? "#FF5A3D" : "#2BFFB0"));
  };
  dockStops.forEach((s, i) => {
    const el = document.getElementById(s.id);
    if (!el) return;
    ScrollTrigger.create({ trigger: el, start: "top 50%", end: "bottom 50%", onToggle: (self) => self.isActive && setDock(i) });
  });
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      if (dockProg) dockProg.style.strokeDashoffset = String(97.4 * (1 - self.progress));
      dock?.classList.toggle("is-on", self.scroll() > innerHeight * 0.7);
    },
  });
  $("#dockPrev")?.addEventListener("click", () => {
    const el = document.getElementById(dockStops[Math.max(0, dockIdx - 1)]?.id ?? "top");
    if (el) scrollTo(dockIdx - 1 <= 0 ? 0 : el);
  });
  $("#dockNext")?.addEventListener("click", () => {
    const el = document.getElementById(dockStops[Math.min(dockStops.length - 1, dockIdx + 1)]?.id ?? "cta");
    if (el) scrollTo(el);
  });

  // ---------------------------------------------------------------- reveals
  if (!reduced) {
    // hero parallax out
    gsap.to(".hero__title-wrap", { yPercent: -30, opacity: 0.1, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero__aside, .hero .hud", { y: -80, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "20% top", end: "80% top", scrub: true } });

    // manifesto word-by-word
    const words = $$(".manifesto__text .w");
    gsap.fromTo(
      words,
      { opacity: 0.12 },
      { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: ".manifesto", start: "top 70%", end: "bottom 70%", scrub: true } },
    );

    $$(".section-head, .chapter__copy, .cta__head").forEach((el) => {
      gsap.from(el.children, { y: 40, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, scrollTrigger: { trigger: el, start: "top 82%" } });
    });
    $$(".chapter__name").forEach((el) => {
      gsap.from(el, { clipPath: "inset(0 100% 0 0)", duration: 1.6, ease: "expo.inOut", scrollTrigger: { trigger: el, start: "top 85%" } });
    });
    $$(".cards").forEach((grid) => {
      gsap.from(grid.children, { y: 60, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.06, scrollTrigger: { trigger: grid, start: "top 85%" } });
    });
    $$(".tiles__grid, .paths, .stats__grid").forEach((grid) => {
      gsap.from(grid.children, { y: 50, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.07, scrollTrigger: { trigger: grid, start: "top 85%" } });
    });
    gsap.from(".proto", { x: -30, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.035, scrollTrigger: { trigger: ".protos", start: "top 85%" } });
    gsap.from(".footer__word", { yPercent: 60, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: ".footer", start: "top 90%" } });
  }

  // stats count-up
  $$("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count ?? 0);
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () =>
        gsap.to(o, {
          v: end,
          duration: reduced ? 0 : 1.6,
          ease: "power3.out",
          onUpdate: () => (el.textContent = String(Math.round(o.v))),
        }),
    });
  });

  // ---------------------------------------------------------------- live visuals only when visible
  const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)), { rootMargin: "80px" });
  $$(".vis").forEach((v) => io.observe(v));
  cleanups.push(() => io.disconnect());

  // ---------------------------------------------------------------- drift replay
  const steps = data.drift;
  let driftI = 0;
  let driftActive = false;
  let driftTimer: number | undefined;
  const firstAlert = steps.findIndex((s) => s.alerts.some((a) => a.severity !== "INFO"));
  const daysEl = $("#driftDays");
  const leftEl = $("#driftLeft");
  const gradeEl = $("#driftGrade");
  const scoreEl = $("#driftScore");
  const redEl = $("#driftRed");
  const detail = $("#driftDetail");
  const daysObj = { v: 0 };
  function renderDrift(i: number) {
    const s = steps[i];
    if (!s || !detail) return;
    driftI = i;
    $$(".drift__step").forEach((li, j) => {
      li.classList.toggle("is-on", j === i);
      li.classList.toggle("is-past", j < i);
    });
    const warning = firstAlert >= 0 && i >= firstAlert ? (DRAIN - Date.parse(steps[firstAlert]!.date)) / DAY : 0;
    gsap.to(daysObj, { v: warning, duration: reduced ? 0 : 1.2, ease: "power3.out", onUpdate: () => daysEl && (daysEl.textContent = daysObj.v.toFixed(1)) });
    const left = Math.max(0, (DRAIN - Date.parse(s.date)) / DAY);
    if (leftEl) leftEl.textContent = left > 0 ? `${left.toFixed(1)} days until the drain` : "drain in progress · ~$285M over ~12 minutes";
    if (gradeEl) {
      gradeEl.textContent = s.grade;
      gradeEl.dataset.grade = s.grade;
    }
    if (scoreEl) scoreEl.textContent = `${s.score}/100 · ${GRADE_WORD[s.grade] ?? ""}`;
    if (redEl) redEl.hidden = !s.red;
    detail.innerHTML = `
      <p class="mono drift__date">${esc(new Date(s.date).toUTCString().replace(":00 GMT", " UTC"))}</p>
      <h3>${esc(s.headline)}</h3>
      <p>${esc(s.detail)}</p>
      <div class="drift__alerts">${
        s.alerts.length
          ? s.alerts
              .map(
                (a) => `<div class="d-alert sev-${a.severity.toLowerCase()}">
                  <span class="mono">${esc(a.severity)}${a.labels.map((l) => ` · ${esc(l)}`).join("")}</span>
                  <b>${esc(a.title)}</b><p>${esc(a.explanation)}</p></div>`,
              )
              .join("")
          : `<div class="d-alert sev-none"><span class="mono">${i === 0 ? "BASELINE" : "NO NEW EVENTS"}</span><b>${s.red ? "Already graded red: two people can change everything instantly." : "Nothing new to report."}</b></div>`
      }</div>`;
    if (!reduced) gsap.from(detail.children, { y: 20, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.06 });
    if (driftActive) applyDriftStage();
  }
  function applyDriftStage() {
    driftActive = true;
    const s = steps[driftI];
    if (!s) return;
    const base = { colorB: "#1b2340", x: 3, y: 1.1, scale: 0.72, autoRotate: 0.1, opacity: 0.95, duration: 1.4 } satisfies MorphOptions;
    if (s.level === "dead") morph("burst", { ...base, colorA: "#FF5A3D", colorB: "#ff2a6d", jitter: 0.08, opacity: 0.9, autoRotate: 0.3 });
    else if (s.level === "bad") morph("knot", { ...base, colorA: "#FF5A3D", jitter: 0.05, autoRotate: 0.25 });
    else if (s.level === "warn") morph("knot", { ...base, colorA: "#FFB547", jitter: 0.02, autoRotate: 0.16 });
    else morph("knot", { ...base, colorA: "#2BFFB0" });
    lastStage = { shape: "knot", opts: { ...base, colorA: "#2BFFB0" } };
  }
  const driftSection = $("#drift");
  if (driftSection) {
    ScrollTrigger.create({ trigger: driftSection, start: "top 55%", end: "bottom 55%", onToggle: (self) => (driftActive = self.isActive) });
  }
  $$<HTMLButtonElement>("[data-step]").forEach((b) => b.addEventListener("click", () => renderDrift(Number(b.dataset.step))));
  $("#driftPrev")?.addEventListener("click", () => renderDrift(Math.max(0, driftI - 1)));
  $("#driftNext")?.addEventListener("click", () => renderDrift(Math.min(steps.length - 1, driftI + 1)));
  const playBtn = $("#driftPlay");
  const stopPlay = () => {
    window.clearInterval(driftTimer);
    driftTimer = undefined;
    if (playBtn) playBtn.textContent = "▶ autoplay";
  };
  playBtn?.addEventListener("click", () => {
    if (driftTimer) return stopPlay();
    if (driftI >= steps.length - 1) renderDrift(0);
    playBtn.textContent = "❚❚ pause";
    driftTimer = window.setInterval(() => {
      if (driftI >= steps.length - 1) return stopPlay();
      renderDrift(driftI + 1);
    }, 3200);
  });
  cleanups.push(stopPlay);
  renderDrift(0);

  // ---------------------------------------------------------------- control map filters
  $$<HTMLButtonElement>("#gradeChips .chip").forEach((b) =>
    b.addEventListener("click", () => {
      const g = b.dataset.grade ?? "All";
      $$<HTMLButtonElement>("#gradeChips .chip").forEach((x) => {
        x.classList.toggle("is-on", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      $$(".proto").forEach((p) => p.classList.toggle("is-hidden", g !== "All" && p.dataset.grade !== g));
      ScrollTrigger.refresh();
    }),
  );

  // ---------------------------------------------------------------- index filters
  const search = $<HTMLInputElement>("#search");
  const rows = $$(".row");
  const filt = { chapter: "all", tags: new Set<string>(), q: "" };
  const resultCount = $("#resultCount");
  const empty = $("#resultsEmpty");
  function applyFilter() {
    let n = 0;
    const q = filt.q.trim().toLowerCase();
    rows.forEach((r) => {
      const u = capById.get(r.dataset.open ?? "");
      const okCh = filt.chapter === "all" || r.dataset.chapter === filt.chapter;
      const okTag = !filt.tags.size || filt.tags.has(r.dataset.tag ?? "");
      const okQ = !q || (u && `${u.title} ${u.summary} ${u.detail} ${u.bullets.join(" ")} ${u.code} ${u.chapter}`.toLowerCase().includes(q));
      const show = okCh && okTag && !!okQ;
      r.classList.toggle("is-hidden", !show);
      if (show) n++;
    });
    if (resultCount) resultCount.textContent = `Showing ${n} of ${rows.length}`;
    if (empty) empty.hidden = n > 0;
    ScrollTrigger.refresh();
  }
  search?.addEventListener("input", () => {
    filt.q = search.value;
    applyFilter();
  });
  // pick up anything typed before this script attached
  if (search?.value) {
    filt.q = search.value;
    applyFilter();
  }
  $$<HTMLButtonElement>("#chapterChips .chip").forEach((b) =>
    b.addEventListener("click", () => {
      filt.chapter = b.dataset.chapter ?? "all";
      $$<HTMLButtonElement>("#chapterChips .chip").forEach((x) => {
        x.classList.toggle("is-on", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      applyFilter();
    }),
  );
  $$<HTMLButtonElement>("#tagChips .chip").forEach((b) =>
    b.addEventListener("click", () => {
      const t = b.dataset.tag ?? "";
      if (filt.tags.has(t)) filt.tags.delete(t);
      else filt.tags.add(t);
      b.classList.toggle("is-on", filt.tags.has(t));
      b.setAttribute("aria-pressed", String(filt.tags.has(t)));
      applyFilter();
    }),
  );
  $$<HTMLButtonElement>(".view-toggle button").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.view ?? "list";
      $("#results")?.setAttribute("data-view", v);
      $$<HTMLButtonElement>(".view-toggle button").forEach((x) => {
        x.classList.toggle("is-on", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      ScrollTrigger.refresh();
    }),
  );

  // ---------------------------------------------------------------- modal
  const modal = $("#modal");
  const modalBody = $("#modalBody");
  const panel = $(".modal__panel");
  let modalOpen = false;
  let modalList: string[] = [];
  let modalKind: "cap" | "protocol" = "cap";
  let modalId = "";
  let lastFocus: HTMLElement | null = null;

  function capHtml(u: Capability) {
    const c = chById.get(u.chapter);
    const color = c?.color ?? "#2BFFB0";
    const related = data.capabilities.filter((x) => x.chapter === u.chapter && x.id !== u.id).slice(0, 4);
    return `
      <div class="m-cap" style="--c:${color}">
        <div class="m-cap__vis">${visual(u, color)}</div>
        <div class="m-cap__copy">
          <p class="m-meta mono"><span class="dot" style="background:${color}"></span>${esc(c?.name ?? "")} · ${esc(u.code)} <span class="tag tag--${u.tag.toLowerCase()}">${u.tag}</span></p>
          <h2 id="modalTitle">${esc(u.title)}</h2>
          <p class="m-lead">${esc(u.summary)}</p>
          <p class="m-detail">${esc(u.detail)}</p>
          <ul class="m-bullets">${u.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
          <div class="m-related"><p class="mono label">More in ${esc(c?.name ?? "")}</p>
            ${related.map((r) => `<button data-open="${r.id}" data-cursor="Open"><span class="mono">${r.code}</span>${esc(r.title)}<i>→</i></button>`).join("")}
          </div>
        </div>
      </div>`;
  }

  function protoHtml(p: ProtoCard) {
    const facts: [string, string, boolean?][] = [
      ["Upgrade authority", p.authority, p.flags.includes("SINGLE_KEY")],
      ["Multisig", p.threshold],
      ["Timelock", p.timelock, p.timelock === "no delay"],
      ["Signers with durable nonces", String(p.nonceSigners), p.nonceSigners > 0],
      ["Control verified", p.verified ? "Yes" : "No", !p.verified],
      ["Deposits (DefiLlama)", p.tvl],
    ];
    return `
      <div class="m-proto g-${p.grade}">
        <div class="m-proto__grade">
          <b>${esc(p.grade)}</b>
          <span class="mono">${p.score ?? "—"}/100 · ${GRADE_WORD[p.grade] ?? "Unscored"}</span>
          ${p.red ? '<span class="mono m-red">RED · vaults should exit</span>' : ""}
        </div>
        <div class="m-proto__copy">
          <p class="m-meta mono">${esc(p.category)} · ${data.live ? "live from mainnet" : "mainnet snapshot · Oct 11 2026"}</p>
          <h2 id="modalTitle">${esc(p.name)}</h2>
          <p class="m-lead">Who can move the money in ${esc(p.name)}, read straight from the chain.</p>
          <dl class="m-facts">${facts.map(([k, v, bad]) => `<div class="${bad ? "bad" : ""}"><dt class="mono">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          <div class="m-flags mono">${p.flags.length ? p.flags.map((f) => `<span>${esc(f)}</span>`).join("") : '<span class="ok">NO FLAGS</span>'}</div>
          ${
            p.breakdown.length
              ? `<p class="mono label">Where the points went</p><ol class="m-break">${p.breakdown.map((d) => `<li><b class="mono">−${d.points}</b><span>${esc(d.reason)}</span></li>`).join("")}</ol>`
              : `<p class="m-note">The full deduction breakdown, programs and raw-account links are served live by the API at <a href="/api/v1/protocols/${esc(p.slug)}">/api/v1/protocols/${esc(p.slug)}</a>.</p>`
          }
          ${p.programs.length ? `<p class="mono label">Programs</p><ul class="m-progs mono">${p.programs.map((x) => `<li><span>${esc(x.label)}</span><a href="https://explorer.solana.com/address/${esc(x.id)}" target="_blank" rel="noreferrer">${esc(x.id.slice(0, 6))}…${esc(x.id.slice(-6))} ↗</a></li>`).join("")}</ul>` : ""}
          <p class="m-watch mono">Telegram: <b>/watch ${esc(p.slug)}</b></p>
        </div>
      </div>`;
  }

  function openModal(kind: "cap" | "protocol", id: string, push = true) {
    if (!modal || !modalBody || !panel) return;
    const item = kind === "cap" ? capById.get(id) : data.protocols.find((p) => p.slug === id);
    if (!item) return;
    modalKind = kind;
    modalId = id;
    modalList = kind === "cap" ? data.capabilities.map((c) => c.id) : data.protocols.map((p) => p.slug);
    modalBody.innerHTML = kind === "cap" ? capHtml(item as Capability) : protoHtml(item as ProtoCard);
    modalBody.querySelector(".vis")?.classList.add("is-live");
    const pos = modalList.indexOf(id);
    const posEl = $("#modalPos");
    if (posEl) posEl.textContent = `${String(pos + 1).padStart(2, "0")} / ${String(modalList.length).padStart(2, "0")}`;
    const crumb = $("#modalCrumb");
    if (crumb) crumb.textContent = kind === "cap" ? `Capabilities / ${chById.get((item as Capability).chapter)?.name ?? ""}` : "Control map";
    const hash = `#${kind}/${id}`;
    if (push && location.hash !== hash) history.pushState(null, "", hash);
    modalBody.scrollTop = 0;
    if (!modalOpen) {
      lastFocus = document.activeElement as HTMLElement | null;
      modalOpen = true;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      lenis.stop();
      if (!reduced) {
        gsap.fromTo(panel, { y: 60, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: "expo.out" });
      }
      panel.focus();
    } else if (!reduced) {
      gsap.fromTo(modalBody.children, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" });
    }
  }
  function closeModal(push = true) {
    if (!modal || !modalOpen) return;
    modalOpen = false;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    lenis.start();
    if (push && (location.hash.startsWith("#cap/") || location.hash.startsWith("#protocol/"))) history.pushState(null, "", location.pathname + location.search);
    lastFocus?.focus?.({ preventScroll: true });
  }
  const step = (d: number) => {
    const i = modalList.indexOf(modalId);
    const next = modalList[(i + d + modalList.length) % modalList.length];
    if (next) openModal(modalKind, next);
  };
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const opener = t.closest<HTMLElement>("[data-open]");
    if (opener && !t.closest("a[href]:not([data-open])")) {
      e.preventDefault();
      return openModal("cap", opener.dataset.open ?? "");
    }
    const proto = t.closest<HTMLElement>("[data-proto]");
    if (proto) return openModal("protocol", proto.dataset.proto ?? "");
    if (t.closest("[data-close]")) closeModal();
  });
  $("#modalPrev")?.addEventListener("click", () => step(-1));
  $("#modalNext")?.addEventListener("click", () => step(1));
  $("#modalShare")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied");
    } catch {
      toast(location.href);
    }
  });

  const routeHash = () => {
    const h = decodeURIComponent(location.hash);
    const m = /^#(cap|protocol)\/(.+)$/.exec(h);
    if (m) openModal(m[1] as "cap" | "protocol", m[2] ?? "", false);
    else closeModal(false);
  };
  on(window, "popstate", routeHash);
  on(window, "hashchange", routeHash);

  on(window, "keydown", (e) => {
    const typing = (e.target as HTMLElement).closest("input, textarea");
    if (e.key === "Escape") {
      if (modalOpen) closeModal();
      else closeMenu();
    }
    if (modalOpen && e.key === "ArrowRight") step(1);
    if (modalOpen && e.key === "ArrowLeft") step(-1);
    if (!modalOpen && driftActive && !typing && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      renderDrift(Math.max(0, Math.min(steps.length - 1, driftI + (e.key === "ArrowRight" ? 1 : -1))));
    }
    if (e.key === "/" && !typing && !modalOpen) {
      e.preventDefault();
      const idx = $("#index");
      if (idx) scrollTo(idx);
      window.setTimeout(() => search?.focus({ preventScroll: true }), 900);
    }
    if (modalOpen && e.key === "Tab" && panel) {
      const f = $$<HTMLElement>("button, a[href], input", panel).filter((x) => x.offsetParent !== null);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });

  // ---------------------------------------------------------------- toast
  const toastEl = $("#toast");
  let toastT: number | undefined;
  function toast(msg: string) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    window.clearTimeout(toastT);
    toastT = window.setTimeout(() => toastEl.classList.remove("is-on"), 2200);
  }

  // ---------------------------------------------------------------- go
  window.scrollTo(0, 0);
  routeHash();
  if (location.hash && !/^#(cap|protocol)\//.test(location.hash)) {
    const t = $(location.hash);
    if (t) window.setTimeout(() => scrollTo(t, true), 50);
  }
  window.setTimeout(() => ScrollTrigger.refresh(), 300);
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return () => {
    cleanups.forEach((f) => f());
    ScrollTrigger.getAll().forEach((t) => t.kill());
  };
}
