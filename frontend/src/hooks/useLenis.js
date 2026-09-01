import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Smooth scrolling for the homepage. A module-level singleton so scrollToSection
 * can reach the active instance from anywhere (nav, footer, hero).
 */
let instance;

export function useLenis() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    instance = new Lenis({ lerp: 0.09 });
    let frame;
    const loop = (time) => {
      instance.raf(time);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      instance.destroy();
      instance = undefined;
    };
  }, []);
}

export function scrollToSection(id) {
  const element = document.getElementById(id);
  if (!element) return;
  if (instance) {
    instance.scrollTo(element, { offset: -72, duration: 1.4 });
  } else {
    element.scrollIntoView({ behavior: "smooth" });
  }
}
