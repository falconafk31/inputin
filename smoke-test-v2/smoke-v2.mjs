import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = process.env.HOME + '/workspace/app-tambang-emas/smoke-test-v2';
const URL = 'file://' + process.env.HOME + '/workspace/app-tambang-emas/prototype-v2/index.html';
const results = [];
function check(name, ok, detail){ results.push({name, ok, detail}); console.log((ok?'PASS':'FAIL')+' | '+name+' | '+detail); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const browser = await puppeteer.launch({headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage();
await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true});
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(URL, {waitUntil:'networkidle0'});
await sleep(400);

// READ awal: Team 1 punya 3 catatan, Team 2 tidak bocor
let s = await page.evaluate(() => {
  // pergi ke riwayat lewat bottom nav
  [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Riwayat')).click();
  return new Promise(res=> setTimeout(()=> {
    res({entries: document.querySelectorAll('.entry').length, text: document.body.innerText.includes('85,500'), hero: document.querySelector('.hero .val').textContent});
  }, 350));
});
check('READ: Riwayat Team 1 tampil 3 catatan', s.entries===3, 'entries='+s.entries);
check('ISOLASI: Data Team 2 (85,5 gr) tidak bocor ke Team 1', s.text===false, 'mengandung 85,500 = '+s.text);
check('Dashboard hero: total bulan Team 1', s.hero.includes('192,500'), s.hero.trim());

// CREATE: input tanggal baru 2026-10-19, hasil 50, operator 6% 5 orang
await page.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Input')).click(); });
await sleep(350);
await page.evaluate(() => {
  const setV = (el, v) => { el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
  setV(document.getElementById('f-tgl'), '2026-10-19');
  setV(document.getElementById('f-hasil'), '50');
  document.getElementById('f-cat').value='Uji buat baru smoke test.';
  document.getElementById('f-cat').dispatchEvent(new Event('input',{bubbles:true}));
});
await page.click('#btnSimpan');
await sleep(500);
s = await page.evaluate(() => ({entries: document.querySelectorAll('.entry').length, hasNew: document.body.innerText.includes('50,000'), audit: document.body.innerText.includes('INPUT BARU')}));
check('CREATE: Catatan baru 50 gr tersimpan dan tampil di Riwayat', s.entries===4 && s.hasNew, JSON.stringify(s));
check('CREATE: Jejak audit INPUT BARU tercatat', s.audit===true, '');

// UPDATE: edit catatan 22 Okt (id 1) - ubah jumlah Operator 6 -> 3 orang, persen 6 -> 10, hasil tetap 100; per orang harus 3,333
await page.evaluate(() => { document.querySelector('[data-edit="1"]').click(); });
await sleep(400);
s = await page.evaluate(() => ({modeEdit: document.body.innerText.includes('MODE EDIT'), orang: document.querySelector('.orang-val').textContent}));
check('UPDATE: Mode Edit terbuka dengan data lama terisi', s.modeEdit && s.orang==='6', JSON.stringify(s));
await page.evaluate(() => {
  // tambah orang 3x klik minus? stepper: klik tombol minus 3 kali -> 6 ke 3
  const btns = document.querySelectorAll('.dist')[0].querySelectorAll('.stepper button');
  btns[0].click(); btns[0].click(); btns[0].click();
  const pct = document.querySelectorAll('.dist')[0].querySelector('.pct-in');
  pct.value='10'; pct.dispatchEvent(new Event('input',{bubbles:true}));
});
await sleep(250);
s = await page.evaluate(() => { const d=document.querySelectorAll('.dist')[0]; return {orang:d.querySelector('.orang-val').textContent, tot:d.querySelector('.tot-val').textContent, per:d.querySelector('.per-val').textContent}; });
check('UPDATE: Jumlah orang bisa diedit 6 menjadi 3', s.orang==='3', JSON.stringify(s));
check('UPDATE: Hitungan ulang otomatis 10% dari 100 = 10 total, 3,333 per orang', s.tot.includes('10,000') && s.per.includes('3,333'), JSON.stringify(s));
await page.click('#btnSimpan');
await sleep(500);
s = await page.evaluate(() => ({ringkas: document.body.innerText.includes('Operator 10% x 3 orang'), diubah: document.body.innerText.includes('Terakhir diubah'), auditEdit: document.body.innerText.includes('EDIT') && document.body.innerText.includes('Operator 6% x 6')}));
check('UPDATE: Perubahan tersimpan di Riwayat', s.ringkas, JSON.stringify(s));
check('UPDATE: Audit mencatat nilai lama ke nilai baru', s.auditEdit, '');
check('UPDATE: Cap Terakhir diubah tampil', s.diubah, '');

// DUPLIKAT: input tanggal yang sudah ada (2026-10-20) harus masuk Mode Edit, bukan duplikat
await page.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Input')).click(); });
await sleep(350);
await page.evaluate(() => {
  const setV = (el, v) => { el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
  setV(document.getElementById('f-tgl'), '2026-10-20');
  setV(document.getElementById('f-hasil'), '10');
});
await page.click('#btnSimpan');
await sleep(450);
s = await page.evaluate(() => ({modeEdit: document.body.innerText.includes('MODE EDIT'), toast:(document.getElementById('toast')||{}).textContent||''}));
check('DUPLIKAT dicegah: tanggal sama masuk Mode Edit', s.modeEdit, s.toast);
await page.evaluate(() => { const b=[...document.querySelectorAll('.modebar button')].find(x=>x.textContent.includes('Batal')); if(b) b.click(); });
await sleep(300);

// DELETE: hapus catatan uji 2026-10-19 (cari tombol hapus pada kartu yang memuat 50,000)
await page.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Riwayat')).click(); });
await sleep(350);
let delInfo = await page.evaluate(() => {
  const cards=[...document.querySelectorAll('.entry')];
  const target=cards.find(c=>c.innerText.includes('50,000'));
  if(!target) return {found:false};
  target.querySelector('[data-del]').click();
  return {found:true};
});
await sleep(350);
s = await page.evaluate(() => ({modal: !!document.querySelector('.modal'), teks: document.querySelector('.modal') ? document.querySelector('.modal').innerText.includes('Hapus catatan') : false}));
check('DELETE: Modal konfirmasi muncul dulu', delInfo.found && s.modal && s.teks, JSON.stringify(s));
await page.click('#btnKonfirmasiHapus');
await sleep(500);
s = await page.evaluate(() => ({entries: document.querySelectorAll('.entry').length, has50card: [...document.querySelectorAll('.entry')].some(c=>c.innerText.includes('50,000')), auditDel: document.body.innerText.includes('HAPUS'), auditMentions50: document.body.innerText.includes('50,000')}));
check('DELETE: Catatan terhapus dari daftar kartu (kembali 3)', s.entries===3 && !s.has50card, JSON.stringify(s));
check('DELETE: Angka hanya tersisa di jejak audit, bukan di data', s.auditMentions50===true, 'audit menyebut angka yang dihapus = '+s.auditMentions50);
check('DELETE: Jejak audit HAPUS tetap tersimpan', s.auditDel, '');

// PERSISTENSI: reload halaman, data edit tetap ada (localStorage simulasi API)
await page.reload({waitUntil:'networkidle0'});
await sleep(450);
await page.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Riwayat')).click(); });
await sleep(350);
s = await page.evaluate(() => ({entries: document.querySelectorAll('.entry').length, edited: document.body.innerText.includes('Operator 10% x 3 orang')}));
check('PERSISTENSI: Setelah reload, hasil edit tetap tersimpan', s.entries===3 && s.edited, JSON.stringify(s));

// LAYOUT v2
s = await page.evaluate(() => { const de=document.documentElement; const small=[]; document.querySelectorAll('button').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.height>0 && r.height<44) small.push(el.textContent.trim().slice(0,16)+':'+Math.round(r.height)); }); return {sw:de.scrollWidth, cw:de.clientWidth, small}; });
check('LAYOUT v2: Tanpa scroll horizontal', s.sw<=s.cw+1, 'sw='+s.sw);
check('LAYOUT v2: Target sentuh >=44px', s.small.length===0, s.small.join(', ')||'semua lolos');

await page.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Dashboard')).click(); });
await sleep(350);
await page.screenshot({path: OUT+'/vue-dashboard.png'});
await page.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Riwayat')).click(); });
await sleep(350);
await page.screenshot({path: OUT+'/vue-riwayat.png'});

check('Tidak ada error JavaScript', errors.length===0, errors.join(' | ').slice(0,200));

await browser.close();
const pass = results.filter(r=>r.ok).length;
console.log('\nSMOKE TEST V2 (Vue + CRUD): '+pass+'/'+results.length+' PASS');
fs.writeFileSync(OUT+'/hasil-smoke-test-v2.json', JSON.stringify({pass, total:results.length, results}, null, 2));
if(pass!==results.length) process.exit(1);
