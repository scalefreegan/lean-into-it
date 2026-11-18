// Write docs/CONTENT-REFERENCE.md from the registry and the move table.
//   npm run gen:reference              write the file
//   npm run gen:reference -- --check   exit 1 if the file is not what would be written
import fs from "node:fs";
import path from "node:path";
import { reference } from "../web/shared/reference.ts";

const file = path.resolve(import.meta.dirname, "../docs/CONTENT-REFERENCE.md");
const text = reference();
if (process.argv.includes("--check")) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current !== text) {
    console.error("docs/CONTENT-REFERENCE.md is not what the registry says. Run `npm run gen:reference` and commit the result.");
    process.exit(1);
  }
  console.log("docs/CONTENT-REFERENCE.md is up to date.");
} else {
  fs.writeFileSync(file, text);
  console.log(`wrote ${file}`);
}
