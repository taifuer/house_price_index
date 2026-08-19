import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollJump() {
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(20);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight > window.innerHeight * 2;
      setVisible(scrollable && window.scrollY > window.innerHeight * 0.6);
      const footer = document.getElementById("app-footer");
      if (!footer) return;
      const footerTop = footer.getBoundingClientRect().top;
      setBottom(Math.max(20, footerTop < window.innerHeight ? window.innerHeight - footerTop + 16 : 20));
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(document.body);
    const footer = document.getElementById("app-footer");
    if (footer) resizeObserver.observe(footer);
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return (
    <button
      type="button"
      className={`scroll-jump${visible ? " is-visible" : ""}`}
      style={{ bottom }}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="回到顶部"
      aria-label="回到顶部"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={19} />
    </button>
  );
}
