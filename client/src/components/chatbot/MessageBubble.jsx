import { motion } from "framer-motion";
import BotAvatar from "./BotAvatar";

const inline = (t) =>
  t.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4
      ? <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
      : p
  );

// Tiny safe renderer: paragraphs, bullet/numbered lists, **bold** (no HTML injection)
function Rich({ text }) {
  const blocks = [];
  let list = null;
  text.split("\n").forEach((ln) => {
    const m = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!list) { list = []; blocks.push({ list }); }
      list.push(m[1]);
    } else {
      list = null;
      if (ln.trim()) blocks.push({ p: ln });
    }
  });
  return blocks.map((b, i) =>
    b.list ? (
      <ul key={i} className="my-1.5 list-disc space-y-1 pl-5">{b.list.map((li, j) => <li key={j}>{inline(li)}</li>)}</ul>
    ) : (
      <p key={i} className="my-1">{inline(b.p)}</p>
    )
  );
}

export default function MessageBubble({ m, typing }) {
  const user = m.role === "user";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2.5 ${user ? "justify-end" : ""}`}>
      {!user && <BotAvatar size={30} />}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        user
          ? "rounded-br-md bg-gradient-to-r from-ark-indigo to-ark-cyan text-white"
          : m.error
            ? "rounded-bl-md border border-ark-coral/40 bg-ark-coral/10 text-ark-coral"
            : "glass rounded-bl-md text-slate-200"
      }`}>
        {typing ? (
          <span className="flex gap-1.5 py-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ark-cyan" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        ) : (
          <Rich text={m.content} />
        )}
      </div>
    </motion.div>
  );
}