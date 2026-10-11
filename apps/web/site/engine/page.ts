// Per-page part of the experience. Runs on every route change and tears itself down on the next one.
// Sections declare their particle shape in markup: data-stage="<shape>" data-stage-opts='{...}'.

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MorphOptions } from "./stage";
import type { ShapeName } from "./shapes";
import { $, $$, esc, magnetic, type Runtime, type StageCfg } from "./runtime";

interface ReplayStep {
  date: string;
  headline: string;
  detail: string;
  level: "ok" | "warn" | "bad" | "dead";
  alerts: { severity: string; title: string; explanation: string; labels: string[] }[];
  score: number;
  grade: string;
  red: boolean;
}

const GRADE_WORD: Record<string, string> = { A: "Strong", B: "Good", C: "Caution", D: "Weak", F: "Dangerous" };
const DRAIN = Date.parse("2026-04-01T16:05:00Z");
const DAY = 86_400_000;

export function initPage(rt: Runtime): () => void {
  const { reduced, finePointer, morph } = rt;
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof WindowEventMap>(ev: K, fn: (e: WindowEventMap[K]) => void) => {
    window.addEventListener(ev, fn);
    cleanups.push(() => window.removeEventListener(ev, fn));
  };
  const onClick = (el: Element | null, fn: () => void) => {
    if (!el) return;
    el.addEventListener("click", fn);
    cleanups.push(() => el.removeEventListener("click", fn));
  };

  let driftActive = false;
  let applyDriftStage: () => void = () => {};

  const ctx = gsap.context(() => {
    // ------------------------------------------------------------ stage per section
    const sections: { el: HTMLElement; cfg: StageCfg | "drift" }[] = $$("[data-stage]").map((el) => {
      const shape = el.dataset.stage ?? "scatter";
      if (shape === "drift") return { el, cfg: "drift" as const };
      let opts: MorphOptions = {};
      try {
        opts = JSON.parse(el.dataset.stageOpts ?? "{}") as MorphOptions;
      } catch {
        /* keep defaults */
      }
      return { el, cfg: { shape: shape as ShapeName, opts } };
    });
    const apply = (cfg: StageCfg | "drift", pulse = false) => {
      if (cfg === "drift") return applyDriftStage();
      rt.lastStage = cfg;
      if (!rt.isReady() || rt.menuOpen()) return;
      morph(cfg.shape, cfg.opts);
      if (pulse) rt.stage?.pulseScan();
    };

    // ------------------------------------------------------------ horizontal pin (create before other triggers so offsets include it)
    gsap.matchMedia().add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
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

    const triggers = sections.map(({ el, cfg }) =>
      ScrollTrigger.create({
        trigger: el,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (self) => {
          if (cfg === "drift") driftActive = self.isActive;
          if (self.isActive) apply(cfg, el.dataset.stagePulse === "1");
        },
      }),
    );

    // ------------------------------------------------------------ intro once the boot sequence is done
    rt.whenReady(() => {
      ScrollTrigger.refresh();
      const i = triggers.findIndex((t) => t.isActive);
      const first = sections[i >= 0 ? i : 0];
      if (first) apply(first.cfg, true);
      if (reduced) return;
      gsap.from(".hero__line > span", { yPercent: 110, rotate: 4, duration: 1.4, ease: "expo.out", stagger: 0.09 });
      gsap.from(".hero__eyebrow, .hero__aside > *, .hero .hud, .hero__scroll", { opacity: 0, y: 16, duration: 1, ease: "power2.out", stagger: 0.06, delay: 0.3 });
      $$("[data-scramble]").forEach((el, k) => gsap.delayedCall(0.4 + k * 0.15, () => rt.scramble(el)));
    });
    $$("[data-scramble]").forEach((el) => el.addEventListener("mouseenter", () => rt.scramble(el)));

    // ------------------------------------------------------------ dock stops
    const stops = $$("[data-dock]");
    const dock = $("#dock");
    const dockNum = $("#dockNum");
    const dockName = $("#dockName");
    let dockIdx = -1;
    const setDock = (i: number) => {
      const el = stops[i];
      if (!el || i === dockIdx || !dockNum || !dockName) return;
      dockIdx = i;
      gsap.fromTo([dockNum, dockName], { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.04 });
      dockNum.textContent = String(i).padStart(2, "0");
      dockName.textContent = el.dataset.dock ?? "";
      dock?.style.setProperty("--c", el.dataset.dockColor ?? "#2BFFB0");
    };
    stops.forEach((el, i) => ScrollTrigger.create({ trigger: el, start: "top 50%", end: "bottom 50%", onToggle: (self) => self.isActive && setDock(i) }));
    setDock(0);
    onClick($("#dockPrev"), () => {
      const i = Math.max(0, dockIdx - 1);
      const el = stops[i];
      if (el) rt.scrollTo(i === 0 ? 0 : el);
    });
    onClick($("#dockNext"), () => {
      const el = stops[Math.min(stops.length - 1, dockIdx + 1)];
      if (el) rt.scrollTo(el);
    });

    // ------------------------------------------------------------ reveals
    if (!reduced) {
      if ($(".hero")) {
        gsap.to(".hero__title-wrap", { yPercent: -30, opacity: 0.1, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
        gsap.to(".hero__aside, .hero .hud", { y: -80, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "20% top", end: "80% top", scrub: true } });
      }
      const words = $$(".manifesto__text .w");
      if (words.length)
        gsap.fromTo(words, { opacity: 0.12 }, { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: ".manifesto", start: "top 70%", end: "bottom 70%", scrub: true } });
      $$(".section-head, .cta__head, .block-head").forEach((el) =>
        gsap.from(el.children, { y: 40, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, scrollTrigger: { trigger: el, start: "top 85%" } }),
      );
      $$(".tiles__grid, .paths, .stats__grid, .cards, [data-reveal]").forEach((grid) =>
        gsap.from(grid.children, { y: 50, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.06, scrollTrigger: { trigger: grid, start: "top 88%" } }),
      );
      $$(".protos").forEach((list) =>
        gsap.from(list.children, { x: -30, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.035, scrollTrigger: { trigger: list, start: "top 88%" } }),
      );
      $$(".chapter__name").forEach((el) => gsap.from(el, { clipPath: "inset(0 100% 0 0)", duration: 1.6, ease: "expo.inOut", scrollTrigger: { trigger: el, start: "top 88%" } }));
      gsap.from(".footer__word", { yPercent: 60, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: ".footer", start: "top 90%" } });
    }

    // count-ups
    $$("[data-count]").forEach((el) => {
      const end = Number(el.dataset.count ?? 0);
      const o = { v: 0 };
      ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => gsap.to(o, { v: end, duration: reduced ? 0 : 1.6, ease: "power3.out", onUpdate: () => (el.textContent = String(Math.round(o.v))) }),
      });
    });

    // ------------------------------------------------------------ pointer niceties
    if (finePointer && !reduced) {
      $$("main .btn").forEach(magnetic);
      $$(".tile, .card, .path, .hl, [data-tilt]").forEach((el) => {
        const strength = el.classList.contains("hl") ? 3 : el.hasAttribute("data-tilt") ? 4 : 7;
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
    $$<HTMLElement>(".tile[data-shape]").forEach((t) =>
      t.addEventListener("pointerenter", () => {
        const shape = t.dataset.shape as ShapeName | undefined;
        if (shape) morph(shape, { colorA: t.dataset.color ?? "#2BFFB0", colorB: "#1b2340", opacity: 0.55, scale: 1.25, duration: 1.4, autoRotate: 0.15 });
      }),
    );
    $(".tiles__grid")?.addEventListener("pointerleave", () => rt.lastStage && morph(rt.lastStage.shape, rt.lastStage.opts));

    // ------------------------------------------------------------ drift replay
    const detail = $("#driftDetail");
    const steps = JSON.parse($("#ow-drift")?.textContent ?? "[]") as ReplayStep[];
    if (detail && steps.length) {
      let driftI = 0;
      let timer: number | undefined;
      const firstAlert = steps.findIndex((s) => s.alerts.some((a) => a.severity !== "INFO"));
      const daysObj = { v: 0 };
      applyDriftStage = () => {
        const s = steps[driftI];
        if (!s) return;
        const base = { colorB: "#1b2340", x: 3, y: 1.1, scale: 0.72, autoRotate: 0.1, opacity: 0.95, duration: 1.4 } satisfies MorphOptions;
        rt.lastStage = { shape: "knot", opts: { ...base, colorA: "#2BFFB0" } };
        if (!rt.isReady() || rt.menuOpen()) return;
        if (s.level === "dead") morph("burst", { ...base, colorA: "#FF5A3D", colorB: "#ff2a6d", jitter: 0.08, opacity: 0.9, autoRotate: 0.3 });
        else if (s.level === "bad") morph("knot", { ...base, colorA: "#FF5A3D", jitter: 0.05, autoRotate: 0.25 });
        else if (s.level === "warn") morph("knot", { ...base, colorA: "#FFB547", jitter: 0.02, autoRotate: 0.16 });
        else morph("knot", { ...base, colorA: "#2BFFB0" });
      };
      const render = (i: number) => {
        const s = steps[i];
        if (!s) return;
        driftI = i;
        $$(".drift__step").forEach((li, j) => {
          li.classList.toggle("is-on", j === i);
          li.classList.toggle("is-past", j < i);
        });
        const daysEl = $("#driftDays");
        const warning = firstAlert >= 0 && i >= firstAlert ? (DRAIN - Date.parse(steps[firstAlert]?.date ?? "")) / DAY : 0;
        gsap.to(daysObj, { v: warning, duration: reduced ? 0 : 1.2, ease: "power3.out", onUpdate: () => daysEl && (daysEl.textContent = daysObj.v.toFixed(1)) });
        const left = Math.max(0, (DRAIN - Date.parse(s.date)) / DAY);
        const leftEl = $("#driftLeft");
        if (leftEl) leftEl.textContent = left > 0 ? `${left.toFixed(1)} days until the drain` : "drain in progress · ~$285M over ~12 minutes";
        const gradeEl = $("#driftGrade");
        if (gradeEl) {
          gradeEl.textContent = s.grade;
          gradeEl.dataset.grade = s.grade;
        }
        const scoreEl = $("#driftScore");
        if (scoreEl) scoreEl.textContent = `${s.score}/100 · ${GRADE_WORD[s.grade] ?? ""}`;
        const redEl = $("#driftRed");
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
      };
      $$<HTMLButtonElement>("[data-step]").forEach((b) => onClick(b, () => render(Number(b.dataset.step))));
      onClick($("#driftPrev"), () => render(Math.max(0, driftI - 1)));
      onClick($("#driftNext"), () => render(Math.min(steps.length - 1, driftI + 1)));
      const playBtn = $("#driftPlay");
      const stop = () => {
        window.clearInterval(timer);
        timer = undefined;
        if (playBtn) playBtn.textContent = "▶ autoplay";
      };
      onClick(playBtn, () => {
        if (timer) return stop();
        if (driftI >= steps.length - 1) render(0);
        if (playBtn) playBtn.textContent = "❚❚ pause";
        timer = window.setInterval(() => (driftI >= steps.length - 1 ? stop() : render(driftI + 1)), 3200);
      });
      cleanups.push(stop);
      listen("keydown", (e) => {
        if ((e.target as HTMLElement).closest("input, textarea, select")) return;
        if (driftActive && (e.key === "ArrowRight" || e.key === "ArrowLeft")) render(Math.max(0, Math.min(steps.length - 1, driftI + (e.key === "ArrowRight" ? 1 : -1))));
      });
      render(0);
    }
  });

  // live visuals only animate while visible
  const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)), { rootMargin: "80px" });
  $$(".vis").forEach((v) => io.observe(v));
  cleanups.push(() => io.disconnect());

  // in-page hash on arrival
  if (location.hash) {
    let t: HTMLElement | null = null;
    try {
      t = $(decodeURIComponent(location.hash));
    } catch {
      /* not a valid selector */
    }
    if (t) window.setTimeout(() => t && rt.scrollTo(t, true), 60);
  }
  const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 300);
  cleanups.push(() => window.clearTimeout(refresh));

  return () => {
    cleanups.forEach((f) => f());
    ctx.revert();
  };
}
