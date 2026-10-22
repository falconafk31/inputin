import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = process.env.HOME + '/workspace/app-tambang-emas/smoke-test-v3';
const URL = 'file://' + process.env.HOME + '/workspace/app-tambang-emas/prototype-v3/index.html';
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
const nav = name => page.evaluate(n => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes(n)).click(); }, name).then(()=>sleep(350));

// SHIFT: hero gabungan hari ini 100 gr, status kedua shift sudah input
let s = await page.evaluate(() => ({hero: document.querySelector('.hero .val').textContent, stat: document.querySelector('.shiftstat').innerText}));
check('SHIFT: Total hari ini gabungan Shift 1 (60) + Shift 2 (40) = 100 gr', s.hero.includes('100,000'), s.hero.trim());
check('SHIFT: Status kedua shift hari ini sudah input', s.stat.includes('Shift 1 sudah input') && s.stat.includes('Shift 2 sudah input'), s.stat.replace(/\n/g,' / '));

// PAGINATION: Team 1 total 17 catatan, per halaman 5 -> 4 halaman, info benar
await nav('Riwayat');
s = await page.evaluate(() => ({cards: document.querySelectorAll('.cards-only .entry').length, info: document.getElementById('pageInfo').textContent, pages: document.querySelectorAll('#pager button[data-page]').length, nextDisabled: document.getElementById('btnNext').disabled}));
check('PAGINATION: Halaman 1 menampilkan 5 dari 17', s.cards===5 && s.info.includes('1-5') && s.info.includes('17'), JSON.stringify(s));
check('PAGINATION: Total 4 halaman untuk 17 catatan @5', s.pages===4, 'pages='+s.pages);
await page.click('#btnNext'); await sleep(300);
s = await page.evaluate(() => ({cards: document.querySelectorAll('.cards-only .entry').length, info: document.getElementById('pageInfo').textContent}));
check('PAGINATION: Berikutnya pindah ke 6-10', s.cards===5 && s.info.includes('6-10'), JSON.stringify(s));
await page.evaluate(() => { document.querySelector('#pager button[data-page="4"]').click(); });
await sleep(300);
s = await page.evaluate(() => ({cards: document.querySelectorAll('.cards-only .entry').length, info: document.getElementById('pageInfo').textContent, nextDisabled: document.getElementById('btnNext').disabled}));
check('PAGINATION: Halaman terakhir berisi sisa 2 dan Berikutnya mati', s.cards===2 && s.info.includes('16-17') && s.nextDisabled, JSON.stringify(s));

// Ganti ukuran per halaman 10 -> 2 halaman
await page.evaluate(() => { const sel=document.getElementById('perPage'); sel.value='10'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(300);
s = await page.evaluate(() => ({cards: document.querySelectorAll('.cards-only .entry').length, info: document.getElementById('pageInfo').textContent, pages: document.querySelectorAll('#pager button[data-page]').length}));
check('PAGINATION: Ubah ke 10 per halaman menjadi 2 halaman', s.cards===10 && s.pages===2, JSON.stringify(s));
await page.evaluate(() => { const sel=document.getElementById('perPage'); sel.value='5'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(250);

// FILTER SHIFT: Shift 1 saja -> 9 catatan (8 hari? hitung: 22,21,20,19,18,17,16 Sep30 Sep10 = 9)
await page.evaluate(() => { const sel=document.getElementById('fShift'); sel.value='1'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(300);
s = await page.evaluate(() => ({info: document.getElementById('pageInfo').textContent, semuaShift1: [...document.querySelectorAll('.cards-only .entry')].every(c=>c.innerText.includes('Shift 1'))}));
check('FILTER: Shift 1 saja menyisakan 9 catatan dan reset ke halaman 1', s.info.includes('dari 9') && s.semuaShift1, JSON.stringify(s));
await page.evaluate(() => { const sel=document.getElementById('fShift'); sel.value='0'; sel.dispatchEvent(new Event('change',{bubbles:true})); const q=document.getElementById('q'); q.value='alat rusak'; q.dispatchEvent(new Event('input',{bubbles:true})); });
await sleep(300);
s = await page.evaluate(() => ({cards: document.querySelectorAll('.cards-only .entry').length, info: document.getElementById('pageInfo').textContent}));
check('FILTER: Pencarian "alat rusak" menemukan 1 catatan', s.cards===1 && s.info.includes('dari 1'), JSON.stringify(s));
await page.evaluate(() => { const q=document.getElementById('q'); q.value=''; q.dispatchEvent(new Event('input',{bubbles:true})); });
await sleep(250);

// CREATE SHIFT BARU: tanggal 2026-10-15 belum ada, buat Shift 2 hasil 25 -> boleh; total riwayat 18
await nav('Input');
await page.evaluate(() => {
  const setV = (el,v) => { el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
  setV(document.getElementById('f-tgl'), '2026-10-15');
  [...document.querySelectorAll('#segShift button')].find(b=>b.textContent.includes('Shift 2')).click();
  setV(document.getElementById('f-hasil'), '25');
});
await sleep(300);
s = await page.evaluate(() => ({info: document.getElementById('shiftInfo').textContent}));
check('SHIFT: Tanggal + shift yang belum ada dinyatakan belum ada catatan', s.info.includes('belum ada catatan'), s.info);
await page.click('#btnSimpan'); await sleep(500);
await page.evaluate(() => { const sel=document.getElementById('perPage'); sel.value='20'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(300);
s = await page.evaluate(() => ({info: document.getElementById('pageInfo') ? document.getElementById('pageInfo').textContent : '', has25: [...document.querySelectorAll('.entry')].some(c=>c.innerText.includes('25,000') && c.innerText.includes('Shift 2'))}));
check('CREATE SHIFT: Shift 2 tanggal baru tersimpan (total 18)', s.info.includes('dari 18') && s.has25, JSON.stringify(s));
await page.evaluate(() => { const sel=document.getElementById('perPage'); sel.value='5'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(250);

// DUPLIKAT SHIFT: input lagi 2026-10-22 Shift 1 -> masuk Mode Edit, bukan duplikat
await nav('Input');
await page.evaluate(() => {
  const setV = (el,v) => { el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
  setV(document.getElementById('f-tgl'), '2026-10-22');
  [...document.querySelectorAll('#segShift button')].find(b=>b.textContent.includes('Shift 1')).click();
});
await sleep(300);
s = await page.evaluate(() => ({info: document.getElementById('shiftInfo').textContent}));
check('SHIFT: Info memperingatkan Shift 1 tanggal ini sudah ada', s.info.includes('SUDAH ada'), s.info);
await page.evaluate(() => { const setV=(el,v)=>{el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));}; setV(document.getElementById('f-hasil'),'60'); });
await page.click('#btnSimpan'); await sleep(450);
s = await page.evaluate(() => ({modeEdit: document.body.innerText.includes('MODE EDIT'), toast:(document.getElementById('toast')||{}).textContent||''}));
check('DUPLIKAT SHIFT dicegah: masuk Mode Edit, bukan duplikat baru', s.modeEdit, JSON.stringify(s));
await page.evaluate(() => { const b=[...document.querySelectorAll('.modebar button')].find(x=>x.textContent.includes('Batal')); if(b) b.click(); });
await sleep(300);
s = await page.evaluate(() => ({info: document.getElementById('pageInfo') ? document.getElementById('pageInfo').textContent : ''}));
check('DUPLIKAT SHIFT: jumlah catatan tetap 18 setelah dicegah', s.info.includes('dari 18'), JSON.stringify(s));

// HAPUS shift uji 15 Okt agar angka laporan kembali murni, verifikasi total kembali 17
await page.evaluate(() => { const sel=document.getElementById('perPage'); sel.value='20'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(300);
await page.evaluate(() => {
  const cards=[...document.querySelectorAll('.entry')];
  const t=cards.find(c=>c.innerText.includes('25,000') && c.innerText.includes('Shift 2'));
  if(t) t.querySelector('[data-del]').click();
});
await sleep(350);
await page.click('#btnKonfirmasiHapus'); await sleep(450);
s = await page.evaluate(() => ({info: document.getElementById('pageInfo').textContent}));
check('DELETE SHIFT: Catatan uji terhapus, total kembali 17', s.info.includes('dari 17'), s.info);
// reload untuk reset localStorage pengaruh urutan? Data uji create sudah dihapus dan edit batal, persistensi harus tetap 17
await page.evaluate(() => { localStorage.removeItem('catatemas-v3'); localStorage.removeItem('catatemas-v3-audit'); });
await page.reload({waitUntil:'networkidle0'}); await sleep(400);

// LAPORAN 1 HARI: total 100, rincian per shift tampil
await nav('Laporan');
s = await page.evaluate(() => ({judul: document.querySelector('#sheet h2').textContent, total: document.getElementById('lapTotal').textContent, jumlah: document.getElementById('lapJumlah').textContent, sheet: document.getElementById('sheet').innerText}));
check('LAPORAN 1 HARI: Judul harian dan total 100 gr', s.judul.includes('Harian') && s.total.includes('100,000'), s.judul+' / '+s.total);
check('LAPORAN 1 HARI: Rincian Shift 1 dan Shift 2 tampil', s.sheet.includes('Shift 1') && s.sheet.includes('Shift 2') && s.jumlah.includes('2 shift'), s.jumlah);
check('LAPORAN 1 HARI: Catatan per shift tampil', s.sheet.includes('Hujan deras') && s.sheet.includes('Galian titik B'), '');

// LAPORAN 7 HARI: 16-22 Okt = 607,500
await page.click('[data-preset="7"]'); await sleep(350);
s = await page.evaluate(() => ({total: document.getElementById('lapTotal').textContent, jumlah: document.getElementById('lapJumlah').textContent, sheet: document.getElementById('sheet').innerText, hari: document.querySelectorAll('#sheet tbody tr').length}));
check('LAPORAN 7 HARI: Total 607,500 gr dari 14 shift', s.total.includes('607,500') && s.jumlah.includes('14 shift'), s.total+' / '+s.jumlah);
check('LAPORAN 7 HARI: Ada total per kelompok dan daftar catatan', s.sheet.includes('Total Per Kelompok') && s.sheet.includes('Daftar Catatan'), '');

// LAPORAN 30 HARI: tambah 30 Sep 80 = 687,500 (10 Sep di luar rentang)
await page.click('[data-preset="30"]'); await sleep(350);
s = await page.evaluate(() => ({total: document.getElementById('lapTotal').textContent, jumlah: document.getElementById('lapJumlah').textContent}));
check('LAPORAN 30 HARI: Total 687,500 gr dari 16 shift (10 Sep tidak ikut)', s.total.includes('687,500') && s.jumlah.includes('16 shift'), s.total+' / '+s.jumlah);

// LAPORAN BULAN INI (Oktober) = 607,500 ; CUSTOM September = 150,000
await page.click('[data-preset="bulan"]'); await sleep(350);
s = await page.evaluate(() => ({judul: document.querySelector('#sheet h2').textContent, total: document.getElementById('lapTotal').textContent}));
check('LAPORAN BULANAN: Oktober total 607,500 gr', s.judul.includes('Bulanan') && s.total.includes('607,500'), s.judul+' / '+s.total);
await page.click('[data-preset="custom"]'); await sleep(300);
await page.evaluate(() => {
  const setV=(el,v)=>{el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));};
  setV(document.getElementById('c-dari'),'2026-09-01'); setV(document.getElementById('c-sampai'),'2026-09-30');
});
await sleep(350);
s = await page.evaluate(() => ({total: document.getElementById('lapTotal').textContent, jumlah: document.getElementById('lapJumlah').textContent}));
check('LAPORAN CUSTOM: September total 150,000 gr dari 3 shift', s.total.includes('150,000') && s.jumlah.includes('3 shift'), s.total+' / '+s.jumlah);
await page.pdf({path: OUT+'/laporan-7hari.pdf', format:'A4', printBackground:true});
const pdfSize = fs.statSync(OUT+'/laporan-7hari.pdf').size;
check('PDF rentang ter-generate', pdfSize>4000, pdfSize+' bytes');
await page.screenshot({path: OUT+'/v3-mobile-laporan.png', fullPage:false});

// TABLET 768: grid 2 kolom, tanpa scroll horizontal
const tab = await browser.newPage();
await tab.setViewport({width:768, height:1024});
await tab.goto(URL, {waitUntil:'networkidle0'}); await sleep(400);
await tab.evaluate(() => { localStorage.removeItem('catatemas-v3'); });
await tab.reload({waitUntil:'networkidle0'}); await sleep(400);
await tab.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Riwayat')).click(); });
await sleep(350);
s = await tab.evaluate(() => { const de=document.documentElement; const grid=getComputedStyle(document.querySelector('.entries-grid')).gridTemplateColumns.split(' ').length; return {sw:de.scrollWidth, cw:de.clientWidth, cols:grid}; });
check('TABLET 768: Riwayat grid 2 kolom, tanpa scroll horizontal', s.cols===2 && s.sw<=s.cw+1, JSON.stringify(s));
await tab.screenshot({path: OUT+'/v3-tablet-riwayat.png'});

// PC 1280: riwayat berubah tabel, kartu HP sembunyi
const pc = await browser.newPage();
await pc.setViewport({width:1280, height:860});
await pc.goto(URL, {waitUntil:'networkidle0'}); await sleep(400);
await pc.evaluate(() => { localStorage.removeItem('catatemas-v3'); });
await pc.reload({waitUntil:'networkidle0'}); await sleep(400);
await pc.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Riwayat')).click(); });
await sleep(350);
s = await pc.evaluate(() => { const de=document.documentElement; const tbl=getComputedStyle(document.querySelector('.pc-table')).display; const cards=getComputedStyle(document.querySelector('.cards-only')).display; const rows=document.querySelectorAll('.pc-table tbody tr').length; return {sw:de.scrollWidth, cw:de.clientWidth, tbl, cards, rows}; });
check('PC 1280: Riwayat tampil sebagai tabel data (5 baris halaman 1)', s.tbl!=='none' && s.cards==='none' && s.rows===5, JSON.stringify(s));
check('PC 1280: Tanpa scroll horizontal body', s.sw<=s.cw+1, 'sw='+s.sw);
await pc.screenshot({path: OUT+'/v3-pc-riwayat.png', fullPage:true});
await pc.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Input')).click(); });
await sleep(350);
s = await pc.evaluate(() => { const g=document.querySelector('.form-grid'); const cols=getComputedStyle(g).gridTemplateColumns.split(' ').length; return {cols}; });
check('PC 1280: Form input 2 kolom dengan ringkasan di kanan', s.cols===2, JSON.stringify(s));
await pc.screenshot({path: OUT+'/v3-pc-input.png', fullPage:true});

check('Tidak ada error JavaScript', errors.length===0, errors.join(' | ').slice(0,200));
await browser.close();
const pass = results.filter(r=>r.ok).length;
console.log('\nSMOKE TEST V3: '+pass+'/'+results.length+' PASS');
fs.writeFileSync(OUT+'/hasil-smoke-test-v3.json', JSON.stringify({pass, total:results.length, results}, null, 2));
if(pass!==results.length) process.exit(1);
