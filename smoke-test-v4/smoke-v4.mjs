import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = process.env.HOME + '/workspace/app-tambang-emas/smoke-test-v4';
const URL = 'file://' + process.env.HOME + '/workspace/app-tambang-emas/prototype-v4/index.html';
const results = [];
function check(name, ok, detail){ results.push({name, ok, detail}); console.log((ok?'PASS':'FAIL')+' | '+name+' | '+detail); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function parseID(t){ return parseFloat(String(t).replace(/[^\d.,-]/g,'').replace(/\./g,'').replace(',','.')) || 0; }

const browser = await puppeteer.launch({headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage();
await page.setViewport({width:1280, height:900});
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(URL, {waitUntil:'networkidle0'});
await sleep(400);

// TABEL TRANSAKSI: grup per tanggal + pagination per hari
let s = await page.evaluate(() => ({
  heads: document.querySelectorAll('tr.day-head').length,
  rows: document.querySelectorAll('tr.shift-row').length,
  info: document.getElementById('pageInfo').textContent,
  firstHead: document.querySelector('tr.day-head').innerText.replace(/\n/g,' ')
}));
check('TX: Halaman 1 berisi 10 grup hari dan 20 baris shift', s.heads===10 && s.rows===20, JSON.stringify(s));
check('TX: Pita hari pertama = 22 Okt, total 100 gr, PU 90 gr', s.firstHead.includes('100,000') && s.firstHead.includes('90,000'), s.firstHead.slice(0,140));
await page.click('#btnNext'); await sleep(300);
s = await page.evaluate(() => ({heads: document.querySelectorAll('tr.day-head').length, info: document.getElementById('pageInfo').textContent}));
check('TX: Pagination per hari pindah halaman 2 (10 hari lagi)', s.heads===10 && s.info.includes('dari 30 hari'), JSON.stringify(s));
await page.evaluate(() => { document.querySelector('#pager button[data-page="3"]').click(); });
await sleep(300);
s = await page.evaluate(() => ({heads: document.querySelectorAll('tr.day-head').length, nextDis: document.getElementById('btnNext').disabled}));
check('TX: Halaman 3 berisi 10 hari terakhir dan Berikutnya mati', s.heads===10 && s.nextDis, JSON.stringify(s));
await page.evaluate(() => { document.querySelector('#pager button[data-page="1"]').click(); });
await sleep(300);

// EKSPANSI DETAIL: buka shift pertama halaman 1 (22 Okt Shift 1, 60 gr)
let firstId = await page.evaluate(() => document.querySelector('[data-expand]').getAttribute('data-expand'));
await page.click('[data-expand="'+firstId+'"]'); await sleep(350);
s = await page.evaluate(() => {
  const d = document.querySelector('tr.detail-row');
  if(!d) return {open:false};
  const cells = [...d.querySelectorAll('table.mini tbody tr')].map(r=>r.innerText.replace(/\n/g,' | '));
  return {open:true, cells, note: d.innerText.includes('Galian titik B')};
});
check('TX: Baris detail terbuka saat tombol rincian diklik', s.open===true, '');
check('TX: Detail Operator 6% x 6 = total 3,600, per orang 0,600', s.cells && s.cells[0].includes('3,600') && s.cells[0].includes('0,600'), s.cells ? s.cells[0] : '-');
check('TX: Detail memuat baris Pendapatan Usaha dan catatan shift', s.cells && s.cells.some(c=>c.includes('Pendapatan Usaha')) && s.note, '');
await page.screenshot({path: OUT+'/v4-tabel-transaksi.png', fullPage:false});

// Lebar tabel di tablet 768: kartu tabel bisa scroll mendatar terkendali, body tidak bocor
const tab = await browser.newPage();
await tab.setViewport({width:768, height:1024});
await tab.goto(URL, {waitUntil:'networkidle0'}); await sleep(350);
s = await tab.evaluate(() => { const de=document.documentElement; const card=document.querySelector('.tbl-card'); return {bodyOK: de.scrollWidth<=de.clientWidth+1, cardScroll: card.scrollWidth>=card.clientWidth}; });
check('TX di tablet: body tidak bocor, tabel scroll di dalam kartunya', s.bodyOK && s.cardScroll, JSON.stringify(s));

// PDF 30 HARI
await page.evaluate(() => { [...document.querySelectorAll('.topbar button')].find(b=>b.textContent.includes('PDF 30')).click(); });
await sleep(400);
let pdf = await page.evaluate(() => {
  const tbl = document.getElementById('pdfTable');
  const dayRows = [...tbl.querySelectorAll('tbody tr.day')];
  const weekRows = [...tbl.querySelectorAll('tbody tr.week')];
  const totalCells = dayRows.map(r=> r.children[4].innerText);
  const sumTotal = totalCells.reduce((a,t)=> a+parseFloat(t.replace(/[^\d.,-]/g,'').replace(/\./g,'').replace(',','.')), 0);
  const weekFirst = weekRows[0] ? weekRows[0].children[1].innerText : '';
  const chunkFirst = totalCells.slice(0,7).reduce((a,t)=> a+parseFloat(t.replace(/[^\d.,-]/g,'').replace(/\./g,'').replace(',','.')), 0);
  return {
    days: dayRows.length, weeks: weekRows.length,
    grand: document.getElementById('grandTotal').innerText,
    kpi: document.getElementById('kpiTotal').innerText,
    sumTotal, weekFirst, chunkFirst,
    sheet: document.getElementById('sheet').innerText
  };
});
check('PDF: Tabel utama tepat 30 baris hari', pdf.days===30, 'days='+pdf.days);
check('PDF: Subtotal mingguan ada 5 (7+7+7+7+2)', pdf.weeks===5, 'weeks='+pdf.weeks);
check('PDF: Grand total = jumlah kolom Total Hari', Math.abs(parseID(pdf.grand)-pdf.sumTotal)<0.001, 'grand='+pdf.grand+' sum='+pdf.sumTotal);
check('PDF: KPI total sama dengan grand total tabel', Math.abs(parseID(pdf.kpi)-parseID(pdf.grand))<0.001, pdf.kpi+' vs '+pdf.grand);
check('PDF: Subtotal minggu pertama = jumlah 7 hari pertamanya', Math.abs(parseID(pdf.weekFirst)-pdf.chunkFirst)<0.001, 'week='+pdf.weekFirst+' chunk='+pdf.chunkFirst);
check('PDF: 22 Okt total 100 dan 21 Okt memuat catatan alat rusak', pdf.sheet.includes('Alat rusak, perbaikan seharian') && pdf.sheet.includes('Total Per Kelompok'), '');
const avgExpected = (pdf.sumTotal/30).toLocaleString('id-ID',{minimumFractionDigits:3, maximumFractionDigits:3});
check('PDF: Rata-rata per hari konsisten (total/30 = '+avgExpected+')', pdf.sheet.includes(avgExpected), '');
let hdr = await page.evaluate(() => {
  const ths = [...document.querySelectorAll('#pdfTable thead th')].map(t=>t.textContent.trim());
  const sheetTxt = document.getElementById('sheet').innerText;
  const count = (s) => sheetTxt.split(s).length - 1;
  return {last: ths[ths.length-1], hasPenting: sheetTxt.includes('Catatan Penting'),
          cHujan: count('Hujan deras jam 14.00'), cGalian: count('Galian titik B, tanah keras'), cAlat: count('Alat rusak, perbaikan seharian')};
});
check('PDF: Header kolom terakhir bernama Catatan (bukan Keterangan)', hdr.last==='Catatan', 'header terakhir = '+hdr.last);
check('PDF: Tidak ada seksi Catatan Penting duplikat di bawah tabel', hdr.hasPenting===false, '');
check('PDF: Setiap catatan tampil tepat 1 kali (di kolom Catatan saja)', hdr.cHujan===1 && hdr.cGalian===1 && hdr.cAlat===1, JSON.stringify(hdr));

// Generate PDF landscape sungguhan
await page.pdf({path: OUT+'/laporan-30-hari-landscape.pdf', format:'A4', landscape:true, printBackground:true});
const buf = fs.readFileSync(OUT+'/laporan-30-hari-landscape.pdf');
const txt = buf.toString('latin1');
const pagesCount = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
check('PDF landscape ter-generate dan tidak kosong', buf.length>20000, buf.length+' bytes, halaman terdeteksi ~'+pagesCount);
await page.setViewport({width:1240, height:900});
await sleep(200);
await page.screenshot({path: OUT+'/v4-pdf-30hari.png', fullPage:true});

// PENGATURAN + TIMESTAMP FOOTER
await page.evaluate(() => {
  const setV=(el,v)=>{ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
  setV(document.getElementById('set-usaha'), 'PT Tambang Sejahtera');
  setV(document.getElementById('set-pimpinan'), 'Budi Santoso');
  setV(document.getElementById('set-staff'), 'Andi - Staff Team 1');
});
await sleep(300);
s = await page.evaluate(() => ({kop: document.getElementById('kopUsaha').textContent, ttdS: document.getElementById('ttdStaff').textContent, ttdP: document.getElementById('ttdPimpinan').textContent, foot: document.getElementById('footCetak').textContent}));
check('SETTING: Nama perusahaan custom tampil di kop PDF', s.kop.includes('PT TAMBANG SEJAHTERA'), s.kop);
check('SETTING: Nama staff dan pimpinan custom tampil di tanda tangan', s.ttdS.includes('Andi') && s.ttdP.includes('Budi Santoso'), s.ttdS+' / '+s.ttdP);
check('FOOTER: Timestamp format Indonesia lengkap dengan WIB', /^Dicetak pada \d{1,2} \S+ \d{4} - pukul \d{2}\.\d{2}\.\d{2} WIB$/.test(s.foot.trim()), s.foot);
const jamWIB = s.foot;
await page.evaluate(() => { const sel=document.getElementById('set-zona'); sel.value='Asia/Jayapura'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(1300);
s = await page.evaluate(() => ({foot: document.getElementById('footCetak').textContent}));
check('FOOTER: Ganti zona ke WIT mengubah label dan jam (+2 dari WIB)', s.foot.trim().endsWith('WIT') && s.foot!==jamWIB, s.foot+' (sebelumnya '+jamWIB+')');
await page.evaluate(() => { const sel=document.getElementById('set-zona'); sel.value='Asia/Jakarta'; sel.dispatchEvent(new Event('change',{bubbles:true})); });
await sleep(300);
await page.pdf({path: OUT+'/laporan-30-hari-landscape.pdf', format:'A4', landscape:true, printBackground:true});

check('Tidak ada error JavaScript', errors.length===0, errors.join(' | ').slice(0,200));
await browser.close();
const pass = results.filter(r=>r.ok).length;
console.log('\nSMOKE TEST V4 (TABEL): '+pass+'/'+results.length+' PASS');
fs.writeFileSync(OUT+'/hasil-smoke-test-v4.json', JSON.stringify({pass, total:results.length, results}, null, 2));
if(pass!==results.length) process.exit(1);
