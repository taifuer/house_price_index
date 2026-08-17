import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

export function ScrollJump() {
  const [direction, setDirection] = useState<"up" | "down">("down");
  const [bottom, setBottom] = useState(20);

  useEffect(() => {
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setDirection(scrollable > 0 && window.scrollY > scrollable * 0.42 ? "up" : "down");
      const footer = document.getElementById("app-footer");
      if (!footer) return;
      const footerTop = footer.getBoundingClientRect().top;
      setBottom(Math.max(20, footerTop < window.innerHeight ? window.innerHeight - footerTop + 16 : 20));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const jump = () => {
    window.scrollTo({ top: direction === "up" ? 0 : document.documentElement.scrollHeight, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      className="scroll-jump"
      style={{ bottom }}
      onClick={jump}
      title={direction === "up" ? "回到顶部" : "前往底部"}
      aria-label={direction === "up" ? "回到顶部" : "前往底部"}
    >
      {direction === "up" ? <ArrowUp size={19} /> : <ArrowDown size={19} />}
    </button>
  );
}
