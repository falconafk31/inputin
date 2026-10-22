import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT = process.env.HOME + '/workspace/app-tambang-emas/smoke-test';
const URL = 'file://' + process.env.HOME + '/workspace/app-tambang-emas/prototype/index.html';
const results = [];
function check(name, ok, detail){ results.push({name, ok, detail}); console.log((ok?'PASS':'FAIL')+' | '+name+' | '+detail); }

const browser = await puppeteer.launch({headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});

// ---------- STAFF MOBILE ----------
const page = await browser.newPage();
await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true});
await page.goto(URL, {waitUntil:'networkidle0'});

// 1. Default hitungan: 100 gr, Operator 6% x 6 orang = 6 total / 1 per orang; Helper 4% x 5 = 4 total / 0.8 per orang
let vals = await page.evaluate(() => {
  const rows=[...document.querySelectorAll('.dist-row')].map(r=>({tot:r.querySelector('.tot').textContent, per:r.querySelector('.per').textContent}));
  return {rows, sisa:document.getElementById('sisaTxt').textContent, used:document.getElementById('usedTxt').textContent,
          pdfCatatan:document.getElementById('pdfCatatan').textContent, summary:document.getElementById('summaryTable').innerText};
});
check('Hitungan default Operator', vals.rows[0].tot.includes('6,000') && vals.rows[0].per.includes('1,000'), JSON.stringify(vals.rows[0]));
check('Hitungan default Helper', vals.rows[1].tot.includes('4,000') && vals.rows[1].per.includes('0,800'), JSON.stringify(vals.rows[1]));
check('Pendapatan Usaha 90%', vals.sisa.includes('90') && vals.sisa.includes('90,000'), vals.sisa);

// 2. Contoh Hades: hasil 1 gr, operator saja 6%, 4 orang -> total 0.060, per orang 0.015
await page.evaluate(() => {
  document.querySelectorAll('.dist-row')[1].querySelector('.icon-btn').click();
  const row=document.querySelector('.dist-row');
  row.querySelector('.orang').textContent='4';
  document.getElementById('hasil').value='1';
  document.getElementById('hasil').dispatchEvent(new Event('input',{bubbles:true}));
});
vals = await page.evaluate(() => {
  const r=document.querySelector('.dist-row');
  return {tot:r.querySelector('.tot').textContent, per:r.querySelector('.per').textContent, sisa:document.getElementById('sisaTxt').textContent};
});
check('Contoh Hades 1gr 6% 4 orang', vals.tot.includes('0,060') && vals.per.includes('0,015'), JSON.stringify(vals));
check('Sisa contoh Hades 94%', vals.sisa.includes('94'), vals.sisa);

// 3. Desimal koma Indonesia: 12,5 gr
await page.evaluate(() => {
  const h=document.getElementById('hasil'); h.value='12,5'; h.dispatchEvent(new Event('input',{bubbles:true}));
});
vals = await page.evaluate(() => ({tot:document.querySelector('.dist-row .tot').textContent, pdf:document.getElementById('pdfHasil').textContent}));
check('Input koma desimal 12,5', vals.tot.includes('0,750') && vals.pdf.includes('12,500'), JSON.stringify(vals));

// 4. Validasi >100%: set persen 120 -> tombol simpan disabled + pesan error tampil
await page.evaluate(() => {
  const inp=document.querySelector('.dist-row .pct'); inp.value='120'; inp.dispatchEvent(new Event('input',{bubbles:true}));
});
vals = await page.evaluate(() => ({disabled:document.getElementById('btnSimpan').disabled, err:getComputedStyle(document.getElementById('errTxt')).display}));
check('Blokir total persen >100%', vals.disabled===true && vals.err!=='none', JSON.stringify(vals));
await page.evaluate(() => {
  const inp=document.querySelector('.dist-row .pct'); inp.value='6'; inp.dispatchEvent(new Event('input',{bubbles:true}));
  const h=document.getElementById('hasil'); h.value='100'; h.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('.dist-row .orang').textContent='6';
  window.tambahBaris && tambahBaris();
});
await page.evaluate(() => { const inp=document.querySelectorAll('.dist-row .pct')[1]; if(inp){inp.value='4'; inp.dispatchEvent(new Event('input',{bubbles:true}));} });
vals = await page.evaluate(() => ({rows:document.querySelectorAll('.dist-row').length, disabled:document.getElementById('btnSimpan').disabled}));
check('Tambah kelompok baru jalan', vals.rows===2 && vals.disabled===false, JSON.stringify(vals));

// 5. Catatan: posisi di bawah pembagian + sinkron ke PDF + chip cepat
let cat = await page.evaluate(() => {
  const formCards=[...document.querySelectorAll('.staff-wrap .card')];
  const idxDist=[...document.querySelectorAll('.staff-wrap .card')].findIndex(c=>c.textContent.includes('Pembagian'));
  const idxCat=formCards.findIndex(c=>c.textContent.includes('Catatan / Keterangan'));
  const ta=document.getElementById('catatan');
  return {idxDist, idxCat, pdf:document.getElementById('pdfCatatan').textContent, pdf2:document.getElementById('pdfCatatan2').textContent, taVal:ta.value};
});
check('Catatan di bawah Pembagian', cat.idxCat>cat.idxDist && cat.idxCat!==-1, 'urutan kartu catatan='+cat.idxCat+' pembagian='+cat.idxDist);
check('Catatan sinkron ke PDF harian + bulanan', cat.pdf===cat.taVal && cat.pdf2===cat.taVal, cat.pdf);
await page.evaluate(() => { document.getElementById('catatan').value=''; document.getElementById('catatan').dispatchEvent(new Event('input',{bubbles:true})); sisipCatatan('Alat rusak. '); });
cat = await page.evaluate(() => ({ta:document.getElementById('catatan').value, pdf:document.getElementById('pdfCatatan').textContent}));
check('Chip cepat catatan', cat.ta.includes('Alat rusak') && cat.pdf.includes('Alat rusak'), JSON.stringify(cat));

// 6. Hari Tanpa Hasil
await page.evaluate(() => { const c=document.getElementById('nol'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); });
vals = await page.evaluate(() => ({hasil:document.getElementById('hasil').value, pdf:document.getElementById('pdfHasil').textContent}));
check('Mode Hari Tanpa Hasil = 0 gr', vals.hasil==='0' && vals.pdf.includes('0,000'), JSON.stringify(vals));
await page.evaluate(() => { const c=document.getElementById('nol'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); const h=document.getElementById('hasil'); h.value='100'; h.dispatchEvent(new Event('input',{bubbles:true})); });

// 7. Layout HP: tidak ada scroll horizontal, target sentuh >=44px, simpan sticky terlihat
let layout = await page.evaluate(() => {
  const de=document.documentElement;
  const small=[];
  document.querySelectorAll('#view-staff button, #view-staff a, #view-staff input[type="date"]').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.height>0 && r.height<44) small.push(el.textContent.trim().slice(0,20)+':'+Math.round(r.height));
  });
  const save=document.getElementById('btnSimpan').getBoundingClientRect();
  return {scrollW:de.scrollWidth, clientW:de.clientWidth, small, saveH:Math.round(save.height)};
});
check('Tidak ada scroll horizontal di HP', layout.scrollW<=layout.clientW+1, 'scrollW='+layout.scrollW+' clientW='+layout.clientW);
check('Semua target sentuh >=44px', layout.small.length===0, layout.small.length? layout.small.join(', ') : 'semua lolos, tombol Simpan '+layout.saveH+'px');

await page.screenshot({path: OUT+'/staff-mobile.png', fullPage:true});

// 8. Kontras kasar: warna teks utama di atas latar (rasio dihitung)
let contrast = await page.evaluate(() => {
  function lum(hex){ const c=hex.replace('#',''); const rgb=[0,2,4].map(i=>parseInt(c.substr(i,2),16)/255).map(v=>v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)); return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2]; }
  function ratio(a,b){ const l1=lum(a), l2=lum(b); return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2); }
  return {inkOnBg: ratio('#0F172A','#F8FAFC'), mutedOnBg: ratio('#475569','#F8FAFC'), primaryOnWhite: ratio('#1E40AF','#FFFFFF'), goldOnWhite: ratio('#B45309','#FFFFFF')};
});
check('Kontras teks utama >=4.5', parseFloat(contrast.inkOnBg)>=4.5 && parseFloat(contrast.primaryOnWhite)>=4.5, JSON.stringify(contrast));

// ---------- ADMIN DESKTOP ----------
const page2 = await browser.newPage();
await page2.setViewport({width:1440, height:900});
await page2.goto(URL, {waitUntil:'networkidle0'});
await page2.evaluate(() => showView('admin'));
let adm = await page2.evaluate(() => {
  const de=document.documentElement;
  return {scrollW:de.scrollWidth, clientW:de.clientWidth, kpis:document.querySelectorAll('.kpi').length, rows:document.querySelectorAll('#view-admin table.data tbody tr').length};
});
check('Admin: 4 kartu KPI + 4 baris input terakhir', adm.kpis===4 && adm.rows===4, JSON.stringify(adm));
check('Admin: tidak ada scroll horizontal desktop', adm.scrollW<=adm.clientW+1, 'scrollW='+adm.scrollW);
await page2.screenshot({path: OUT+'/admin-desktop.png', fullPage:true});

// ---------- LAPORAN ----------
const page3 = await browser.newPage();
await page3.setViewport({width:1000, height:1300});
await page3.goto(URL, {waitUntil:'networkidle0'});
await page3.evaluate(() => showView('report'));
await page3.pdf({path: OUT+'/laporan-harian.pdf', format:'A4', printBackground:true});
let rep = await page3.evaluate(() => {
  const s=document.getElementById('sheet').innerText;
  return {hasCatatan:s.includes('Catatan / Keterangan'), hasSisa:s.includes('Pendapatan Usaha'), hasSign:s.includes('Mengetahui') && s.includes('Diinput oleh'), hasPerOrang:s.includes('Per Orang')};
});
check('PDF: ada catatan, Pendapatan Usaha, per orang', rep.hasCatatan && rep.hasSisa && rep.hasPerOrang, JSON.stringify(rep));
check('PDF: ada kolom tanda tangan', rep.hasSign, JSON.stringify(rep));
await page3.screenshot({path: OUT+'/laporan.png', fullPage:true});
const pdfSize = fs.statSync(OUT+'/laporan-harian.pdf').size;
check('File PDF ter-generate', pdfSize>5000, pdfSize+' bytes');

await browser.close();
const pass = results.filter(r=>r.ok).length;
console.log('\nSMOKE TEST: '+pass+'/'+results.length+' PASS');
fs.writeFileSync(OUT+'/hasil-smoke-test.json', JSON.stringify({pass, total:results.length, results}, null, 2));
if(pass!==results.length) process.exit(1);
