// Persistent part of the experience: lives across client-side navigations.
// WebGL stage, smooth scroll, boot sequence, cursor, nav, menu, dock shell, HUD slot counter.

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Stage, type MorphOptions } from "./stage";
import type { ShapeName } from "./shapes";

export interface StageCfg {
  shape: ShapeName;
  opts: MorphOptions;
}

export interface Runtime {
  lenis: Lenis;
  stage: Stage | null;
  reduced: boolean;
  finePointer: boolean;
  morph: (shape: ShapeName, o: MorphOptions) => void;
  scrollTo: (target: string | HTMLElement | number, immediate?: boolean) => void;
  whenReady: (fn: () => void) => void;
  isReady: () => boolean;
  menuOpen: () => boolean;
  closeMenu: () => void;
  lastStage: StageCfg | null;
  toast: (msg: string) => void;
  scramble: (el: HTMLElement) => void;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));
export const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

let runtime: Runtime | null = null;

export function getRuntime(): Runtime {
  if (runtime) return runtime;
  runtime = createRuntime();
  return runtime;
}

function createRuntime(): Runtime {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  gsap.registerPlugin(ScrollTrigger);
  history.scrollRestoration = "manual";

  // ---------------------------------------------------------------- scroll
  const lenis = new Lenis({ duration: 1.15, smoothWheel: !reduced, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
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

  // ---------------------------------------------------------------- ready queue (after the boot sequence)
  let ready = false;
  const queue: (() => void)[] = [];
  const whenReady = (fn: () => void) => (ready ? fn() : queue.push(fn));
  const markReady = () => {
    ready = true;
    document.body.classList.remove("is-loading");
    queue.splice(0).forEach((f) => f());
  };

  // ---------------------------------------------------------------- boot sequence (once per session)
  const bootEl = $("#boot");
  let seen = false;
  try {
    seen = sessionStorage.getItem("ow-booted") === "1";
    sessionStorage.setItem("ow-booted", "1");
  } catch {
    /* storage unavailable: show the boot every time */
  }
  // The boot sequence belongs to the landing page; deep links to data pages are usable at once.
  if (reduced || !bootEl || seen || location.pathname !== "/") {
    bootEl?.remove();
    markReady();
    if (!reduced) gsap.from(".nav", { opacity: 0, y: -20, duration: 1, ease: "power2.out" });
  } else {
    const bootLog = $("#bootLog");
    const bootPct = $("#bootPct");
    const bootBar = $("#bootBar");
    // Boot copy only states what the page itself does; it never claims live infrastructure.
    const lines = ["overwatch · control-plane monitor for solana defi", "loading control map", "ready"];
    const prog = { v: 0 };
    gsap
      .timeline({
        onComplete: () => {
          gsap.to(bootEl, {
            clipPath: "inset(0 0 100% 0)",
            duration: 1.1,
            ease: "expo.inOut",
            onComplete: () => bootEl.remove(),
          });
          gsap.delayedCall(0.35, markReady);
          gsap.from(".nav", { opacity: 0, y: -20, duration: 1, ease: "power2.out", delay: 0.55 });
        },
      })
      .to(prog, {
        v: 100,
        duration: 1.2,
        ease: "power2.inOut",
        onUpdate: () => {
          if (bootPct) bootPct.textContent = String(Math.round(prog.v)).padStart(3, "0");
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

  // ---------------------------------------------------------------- scramble text
  const GLYPHS = "!<>-_\\/[]{}—=+*^?#01ABCDEF";
  const scramble = (el: HTMLElement) => {
    const target = el.dataset.text ?? el.textContent ?? "";
    el.dataset.text = target;
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 700);
      el.textContent = target
        .split("")
        .map((ch, i) =>
          ch === " " || i < k * target.length ? ch : (GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? ""),
        )
        .join("");
      if (k < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    tick();
  };

  // ---------------------------------------------------------------- slot counter + pointer readout
  let slot: number | null = null;
  const fmtSlot = () =>
    $$("[data-slot]").forEach((el) => (el.textContent = slot == null ? "offline" : slot.toLocaleString("en-US")));
  async function syncSlot() {
    try {
      const r = await fetch("/api/v1/status", { cache: "no-store" });
      const j = (await r.json()) as { data?: { slot?: number | null } };
      if (j.data?.slot) {
        slot = j.data.slot;
        return fmtSlot();
      }
    } catch {
      /* fall through to the public RPC */
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
  window.setInterval(() => {
    if (slot == null) return;
    slot += 1;
    fmtSlot();
  }, 400);
  window.setInterval(() => void syncSlot(), 60_000);
  window.addEventListener("pointermove", (e) => {
    const tgt = $("#tgt");
    if (!tgt) return;
    const x = (e.clientX / window.innerWidth) * 2 - 1,
      y = -(e.clientY / window.innerHeight) * 2 + 1;
    tgt.textContent = `${x >= 0 ? "+" : ""}${x.toFixed(3)} / ${y >= 0 ? "+" : ""}${y.toFixed(3)}`;
  });

  // ---------------------------------------------------------------- cursor
  const cursor = $("#cursor");
  const cursorLabel = $("#cursorLabel");
  if (cursor && finePointer && !reduced) {
    document.body.classList.add("has-cursor");
    cursor.classList.add("is-gone");
    const xTo = gsap.quickTo(cursor, "x", { duration: 0.18, ease: "power3" });
    const yTo = gsap.quickTo(cursor, "y", { duration: 0.18, ease: "power3" });
    window.addEventListener("pointermove", (e) => {
      cursor.classList.remove("is-gone");
      xTo(e.clientX);
      yTo(e.clientY);
      const t = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-cursor], a, button, input, select, summary, textarea",
      );
      cursor.classList.toggle("is-hover", !!t);
      cursor.classList.toggle("is-text", !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"));
      if (cursorLabel) cursorLabel.textContent = t?.dataset.cursor ?? "";
    });
    window.addEventListener("pointerdown", () => cursor.classList.add("is-down"));
    window.addEventListener("pointerup", () => cursor.classList.remove("is-down"));
    document.documentElement.addEventListener("pointerleave", () => cursor.classList.add("is-gone"));
    document.documentElement.addEventListener("pointerenter", () => cursor.classList.remove("is-gone"));
  }

  // magnetic chrome buttons (page buttons are wired per page)
  if (finePointer && !reduced) $$(".nav .btn, .nav__link, .dock__btn").forEach(magnetic);

  // ---------------------------------------------------------------- nav + in-page anchors
  const nav = $("#nav");
  lenis.on("scroll", (l: Lenis) => nav?.classList.toggle("is-scrolled", l.scroll > 40));
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    e.preventDefault();
    closeMenu();
    if (href === "#top" || href === "#") return scrollTo(0);
    const target = $(href);
    if (target) scrollTo(target);
  });

  // ---------------------------------------------------------------- menu
  const menu = $("#menu");
  const menuBtn = $("#menuOpen");
  let menuIsOpen = false;
  function openMenu() {
    if (!menu || menuIsOpen) return;
    menuIsOpen = true;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    menuBtn?.setAttribute("aria-expanded", "true");
    lenis.stop();
    gsap.fromTo(
      ".menu__list li",
      { yPercent: 60, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.9, ease: "expo.out", stagger: 0.04, delay: 0.15 },
    );
  }
  function closeMenu() {
    if (!menu || !menuIsOpen) return;
    menuIsOpen = false;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    menuBtn?.setAttribute("aria-expanded", "false");
    lenis.start();
    if (rt.lastStage) morph(rt.lastStage.shape, rt.lastStage.opts);
  }
  menuBtn?.addEventListener("click", () => (menuIsOpen ? closeMenu() : openMenu()));
  $("#menuClose")?.addEventListener("click", closeMenu);
  $$<HTMLAnchorElement>(".menu__list a").forEach((a) => {
    a.addEventListener("pointerenter", () => {
      const shape = a.dataset.shape as ShapeName | undefined;
      if (shape)
        morph(shape, {
          colorA: a.dataset.color ?? "#2BFFB0",
          colorB: "#7CF3FF",
          x: 2.9,
          scale: 1.05,
          opacity: 1,
          duration: 1.2,
          autoRotate: 0.15,
          arcs: shape === "globe",
        });
    });
    a.addEventListener("click", () => closeMenu());
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // ---------------------------------------------------------------- dock progress (stops are set per page)
  const dock = $("#dock");
  const dockProg = $<SVGCircleElement>("#dockProg");
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      if (dockProg) dockProg.style.strokeDashoffset = String(97.4 * (1 - self.progress));
      dock?.classList.toggle("is-on", self.scroll() > innerHeight * 0.7);
    },
  });

  // ---------------------------------------------------------------- toast
  const toastEl = $("#toast");
  let toastT: number | undefined;
  const toast = (msg: string) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    window.clearTimeout(toastT);
    toastT = window.setTimeout(() => toastEl.classList.remove("is-on"), 2200);
  };

  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  const rt: Runtime = {
    lenis,
    stage,
    reduced,
    finePointer,
    morph,
    scrollTo,
    whenReady,
    isReady: () => ready,
    menuOpen: () => menuIsOpen,
    closeMenu,
    lastStage: null,
    toast,
    scramble,
  };
  return rt;
}

export function magnetic(el: HTMLElement) {
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
}
