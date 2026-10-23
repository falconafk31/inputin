// Rakit frontend: app/template.html + vendor Vue + app/app.js -> satu file HTML.
// Bundle PDF (jsPDF + font PDF) dipisah sebagai aset lazy bernama hash isi,
// dilayani Worker lewat rute /assets/ dan dicatat di src/pdfassets.js.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = fs.readFileSync(path.join(root, "app/template.html"), "utf8");
const vue = fs.readFileSync(path.join(root, "app/vendor/vue.global.prod.js"), "utf8");
const jspdf = fs.readFileSync(path.join(root, "app/vendor/jspdf.bundle.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app/app.js"), "utf8");
const fonts = fs.readFileSync(path.join(root, "app/fonts.css"), "utf8");

const pdfFonts = {};
for (const f of fs.readdirSync(path.join(root, "app/fonts-pdf"))) {
  if (!f.endsWith(".b64")) continue;
  pdfFonts[f.replace(/\.b64$/, "")] = fs.readFileSync(path.join(root, "app/fonts-pdf", f), "utf8").trim();
}
const pdfFontsJs = "window.__PDF_FONTS__=" + JSON.stringify(pdfFonts) + ";";

const hash8 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
const sri = (s) => "sha256-" + crypto.createHash("sha256").update(s).digest("base64");
const vendorName = "pdf-vendor." + hash8(jspdf) + ".js";
const fontsName = "pdf-fonts." + hash8(pdfFontsJs) + ".js";
const totalKb = Math.round((jspdf.length + pdfFontsJs.length) / 1024);
const pdfCfg = "window.__PDF_CFG__=" + JSON.stringify({ vendor: "/assets/" + vendorName, fonts: "/assets/" + fontsName, vi: sri(jspdf), fi: sri(pdfFontsJs), kb: totalKb }) + ";";

const html = template
  .replace("/*__FONT_FACE__*/", () => fonts)
  .replace("/*__PDFCFG__*/", () => pdfCfg)
  .replace("/*__VUE__*/", () => vue)
  .replace("/*__APP__*/", () => app);

for (const m of ["/*__VUE__*/", "/*__APP__*/", "/*__FONT_FACE__*/", "/*__PDFCFG__*/"]) {
  if (html.includes(m)) throw new Error("Marker template tidak terganti: " + m);
}
fs.mkdirSync(path.join(root, "public/assets"), { recursive: true });
fs.writeFileSync(path.join(root, "public/index.html"), html);
fs.writeFileSync(path.join(root, "public/assets", vendorName), jspdf);
fs.writeFileSync(path.join(root, "public/assets", fontsName), pdfFontsJs);
fs.writeFileSync(path.join(root, "src/frontend.js"), "export default " + JSON.stringify(html) + ";\n");
const assetsMap = { [vendorName]: jspdf, [fontsName]: pdfFontsJs };
fs.writeFileSync(path.join(root, "src/pdfassets.js"), "export default " + JSON.stringify(assetsMap) + ";\n");
console.log("Build OK:", (html.length / 1024).toFixed(0), "KB html | aset PDF:", vendorName, "+", fontsName, "(" + totalKb + " KB, lazy)");
