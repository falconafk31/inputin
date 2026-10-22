// Rakit frontend satu file: app/template.html + vendor Vue + app/app.js
// Output: public/index.html (untuk dibuka langsung) dan src/frontend.js (diimpor Worker).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = fs.readFileSync(path.join(root, "app/template.html"), "utf8");
const vue = fs.readFileSync(path.join(root, "app/vendor/vue.global.prod.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app/app.js"), "utf8");

const html = template
  .replace("/*__VUE__*/", () => vue)
  .replace("/*__APP__*/", () => app);

if (html.includes("/*__VUE__*/") || html.includes("/*__APP__*/")) {
  throw new Error("Marker template tidak terganti semua");
}
fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(path.join(root, "public/index.html"), html);
fs.writeFileSync(path.join(root, "src/frontend.js"), "export default " + JSON.stringify(html) + ";\n");
console.log("Build OK:", (html.length / 1024).toFixed(0), "KB -> public/index.html + src/frontend.js");
