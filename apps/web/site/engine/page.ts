// Per-page part of the experience. Runs on every route change and tears itself down on the next one.

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { $, $$, magnetic, type Runtime } from "./runtime";
import { tone } from "../nightfall";

export function initPage(rt: Runtime): () => void {
  const { reduced, finePointer } = rt;
  // Only the landing page performs; every other page shows its data without intros, reveals or tilt.
  const calm = reduced || location.pathname !== "/";
  const cleanups: (() => void)[] = [];
  const onClick = (el: Element | null, fn: () => void) => {
    if (!el) return;
    el.addEventListener("click", fn);
    cleanups.push(() => el.removeEventListener("click", fn));
  };

  const ctx = gsap.context(() => {
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

    // ------------------------------------------------------------ intro once the boot sequence is done
    rt.whenReady(() => {
      ScrollTrigger.refresh();
      if (calm) return;
      gsap.from(".hero__line > span", { yPercent: 110, rotate: 4, duration: 1.4, ease: "expo.out", stagger: 0.09 });
      gsap.from(".hero__eyebrow, .hero__aside > *, .hero .hud, .hero__scroll", {
        opacity: 0,
        y: 16,
        duration: 1,
        ease: "power2.out",
        stagger: 0.06,
        delay: 0.3,
      });
      $$("[data-scramble]").forEach((el, k) => gsap.delayedCall(0.4 + k * 0.15, () => rt.scramble(el)));
    });
    $$("[data-scramble]").forEach((el) => el.addEventListener("mouseenter", () => rt.scramble(el)));

    // ------------------------------------------------------------ dock stops
    const stops = $$("[data-dock]");
    const dock = $("#dock");
    // The section pager belongs to the long story pages; on reference pages it would sit on top of tables and code.
    dock?.classList.toggle("is-off", !["/", "/case-study"].includes(location.pathname));
    const dockNum = $("#dockNum");
    const dockName = $("#dockName");
    let dockIdx = -1;
    const setDock = (i: number) => {
      const el = stops[i];
      if (!el || i === dockIdx || !dockNum || !dockName) return;
      dockIdx = i;
      gsap.fromTo(
        [dockNum, dockName],
        { yPercent: 60, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.04 },
      );
      dockNum.textContent = String(i).padStart(2, "0");
      dockName.textContent = el.dataset.dock ?? "";
      dock?.style.setProperty("--c", tone(el.dataset.dockColor ?? "#2BFFB0"));
    };
    stops.forEach((el, i) =>
      ScrollTrigger.create({
        trigger: el,
        start: "top 50%",
        end: "bottom 50%",
        onToggle: (self) => self.isActive && setDock(i),
      }),
    );
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
    if (!calm) {
      if ($(".hero")) {
        // Scrolling out of the landing hero selects its title one character at a time; it completes while the whole title is
        // still on screen (hero bottom at 60% of the viewport, title clear of the navbar). Scrolling back unselects.
        const chs = $$(".hero__title--watchdog .ch");
        let selected = -1;
        if (chs.length)
          ScrollTrigger.create({
            trigger: ".hero",
            start: "top top",
            end: "bottom 60%",
            onUpdate: ({ progress }) => {
              const n = Math.round(progress * chs.length);
              if (n === selected) return;
              selected = n;
              chs.forEach((c, i) => c.classList.toggle("is-sel", i < n));
            },
          });
        gsap.to(".hero__aside, .hero .hud", {
          y: -80,
          opacity: 0,
          ease: "none",
          scrollTrigger: { trigger: ".hero", start: "20% top", end: "80% top", scrub: true },
        });
      }
      $$(".section-head, .cta__head, .block-head").forEach((el) =>
        gsap.from(el.children, {
          y: 40,
          opacity: 0,
          duration: 1.1,
          ease: "expo.out",
          stagger: 0.08,
          scrollTrigger: { trigger: el, start: "top 85%" },
        }),
      );
      $$(".steps, .paths, .cards, [data-reveal]").forEach((grid) =>
        gsap.from(grid.children, {
          y: 50,
          opacity: 0,
          duration: 1,
          ease: "expo.out",
          stagger: 0.06,
          scrollTrigger: { trigger: grid, start: "top 88%" },
        }),
      );
      $$(".chapter__name").forEach((el) =>
        gsap.from(el, {
          clipPath: "inset(0 100% 0 0)",
          duration: 1.6,
          ease: "expo.inOut",
          scrollTrigger: { trigger: el, start: "top 88%" },
        }),
      );
    }

    // ------------------------------------------------------------ pointer niceties
    if (finePointer && !calm) {
      $$("main .btn").forEach(magnetic);
      $$(".tile, .card, .path, .hl, [data-tilt]").forEach((el) => {
        const strength = el.classList.contains("hl") ? 3 : el.hasAttribute("data-tilt") ? 4 : 7;
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width,
            py = (e.clientY - r.top) / r.height;
          el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
          el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
          gsap.to(el, {
            rotateY: (px - 0.5) * strength,
            rotateX: -(py - 0.5) * strength,
            transformPerspective: 900,
            duration: 0.5,
            ease: "power2.out",
          });
        });
        el.addEventListener("pointerleave", () =>
          gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.8, ease: "elastic.out(1, 0.5)" }),
        );
      });
    }
  });

  // live visuals only animate while visible
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)),
    { rootMargin: "80px" },
  );
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
