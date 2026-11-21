import { useEffect, useState } from "react";

// Hash routing: the app is one page served by the dev server, and a hash
// route survives a reload and a Dock relaunch without any server routing.
//   #/                 home (the Path)
//   #/lesson/<id>      a lesson
//   #/review           today's review session: due concepts, one exercise each
//   #/placement        the placement check: skip the levels already known
//   #/moves            every move the curriculum teaches, with its mastery
//   #/level/<id>       the Path, opened and scrolled to one level
//   #/lab              explorers and every move with an example to run, nothing
//                      scored; #/lab/<tool> for one explorer; #/lab/famous/<id>
//                      for one of the Famous Proofs
//   #/playground       free Lean, nothing scored
//   #/notes            Field notes: the Tutor's research maps; #/notes/<id> for one
//   #/gallery          every widget and exercise kind in the registry;
//                      #/gallery/<widget> for one widget

export interface Route {
  name: string;
  arg?: string;
  sub?: string;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? "home", ...(parts[1] ? { arg: parts[1] } : {}), ...(parts[1] && parts[2] ? { sub: parts[2] } : {}) };
}

// A new route starts at the top: once, here, before any useRoute listener
// (listeners run in the order they were added, and this module loads before
// any component mounts). In each useRoute it would run once per component
// using it, and the second would undo a page that scrolls itself (#/level/<id>).
window.addEventListener("hashchange", () => window.scrollTo(0, 0));

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function href(name: string, arg?: string, sub?: string): string {
  return `#/${name === "home" ? "" : name}${arg ? `/${encodeURIComponent(arg)}${sub ? `/${encodeURIComponent(sub)}` : ""}` : ""}`;
}
