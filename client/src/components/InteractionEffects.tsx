import { useEffect } from "react";

/** One delegated listener, bounded effects, no animation library or React rerenders. */
export default function InteractionEffects() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const effects = new Set<HTMLElement>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const onClick = (event: MouseEvent) => {
      if (reducedMotion.matches || event.button !== 0 || event.detail === 0) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[disabled], [aria-disabled='true']")) return;

      // Cap simultaneous bursts even during rapid clicking.
      if (effects.size >= 6) {
        const oldest = effects.values().next().value;
        if (oldest) { oldest.remove(); effects.delete(oldest); }
      }
      const burst = document.createElement("div");
      burst.className = "interaction-burst";
      burst.setAttribute("aria-hidden", "true");
      burst.style.left = `${event.clientX}px`;
      burst.style.top = `${event.clientY}px`;
      const ring = document.createElement("span");
      ring.className = "interaction-ring";
      burst.appendChild(ring);
      for (let i = 0; i < 8; i++) {
        const spark = document.createElement("span");
        spark.className = "interaction-spark";
        const angle = (i * Math.PI) / 4;
        spark.style.setProperty("--spark-x", `${Math.cos(angle) * 44}px`);
        spark.style.setProperty("--spark-y", `${Math.sin(angle) * 44}px`);
        burst.appendChild(spark);
      }
      effects.add(burst);
      document.body.appendChild(burst);
      const timer = setTimeout(() => {
        burst.remove();
        effects.delete(burst);
        timers.delete(timer);
      }, 650);
      timers.add(timer);
    };

    document.addEventListener("click", onClick, { passive: true });
    return () => {
      document.removeEventListener("click", onClick);
      timers.forEach(clearTimeout);
      effects.forEach(effect => effect.remove());
    };
  }, []);

  return null;
}
