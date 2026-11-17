import { useEffect, useState } from "react";

// Hash routing: the app is one page served by the dev server, and a hash
// route survives a reload and a Dock relaunch without any server routing.
//   #/                 home (the Path)
//   #/lesson/<id>      a lesson
//   #/playground       free Lean, nothing scored
//   #/gallery          every widget and exercise kind in the registry;
//                      #/gallery/<widget> for one widget

export interface Route {
  name: string;
  arg?: string;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? "home", ...(parts[1] ? { arg: parts[1] } : {}) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function href(name: string, arg?: string): string {
  return `#/${name === "home" ? "" : name}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
}
