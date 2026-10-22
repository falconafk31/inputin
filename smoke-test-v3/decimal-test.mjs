import puppeteer from 'puppeteer';
import fs from 'fs';
const OUT = process.env.HOME + '/workspace/app-tambang-emas/smoke-test-v3';
const URL = 'file://' + process.env.HOME + '/workspace/app-tambang-emas/prototype-v3/index.html';
const results = [];
function check(name, ok, detail){ results.push({name, ok}); console.log((ok?'PASS':'FAIL')+' | '+name+' | '+detail); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage();
await page.setViewport({width:390, height:844, isMobile:true});
await page.goto(URL, {waitUntil:'networkidle0'});
await page.evaluate(() => { localStorage.removeItem('catatemas-v3'); localStorage.removeItem('catatemas-v3-audit'); });
await page.reload({waitUntil:'networkidle0'}); await sleep(400);
await page.evaluate(() => { [...document.querySelectorAll('.bottomnav button')].find(b=>b.textContent.includes('Input')).click(); });
await sleep(350);
async function setHasil(v){
  await page.evaluate(val => { const h=document.getElementById('f-hasil'); h.value=val; h.dispatchEvent(new Event('input',{bubbles:true})); }, v);
  await sleep(200);
  return page.evaluate(() => document.querySelector('.summary').innerText.replace(/\n/g,' | '));
}
let s = await setHasil('12,5');
check('DESIMAL: "12,5" terbaca 12,500 gr', s.includes('12,500'), s.slice(-90));
s = await setHasil('12.5');
check('DESIMAL: "12.5" (titik) terbaca sama 12,500 gr', s.includes('12,500'), s.slice(-90));
s = await setHasil('1.250,5');
check('DESIMAL: "1.250,5" terbaca 1.250,500 gr', s.includes('1.250,500'), s.slice(-90));
s = await setHasil('0,015');
check('DESIMAL: "0,015" terbaca 0,015 gr (bukan 15)', s.includes('0,015') && !s.includes('15,000 gr'), s.slice(-90));
s = await setHasil('1.500');
check('DESIMAL: "1.500" terbaca ribuan = 1.500,000 gr', s.includes('1.500,000'), s.slice(-90));
// Persen titik: set baris pertama 2.5 -> ringkasan menampilkan 2,5%
await setHasil('100');
await page.evaluate(() => { const p=document.querySelector('.dist .pct-in'); p.value='2.5'; p.dispatchEvent(new Event('input',{bubbles:true})); });
await sleep(200);
s = await page.evaluate(() => document.querySelector('.summary').innerText.replace(/\n/g,' | '));
check('PERSEN: "2.5" terbaca 2,5% dan totalnya 2,500 gr', s.includes('2,5%') && s.includes('2,500'), s.slice(0,140));
await browser.close();
const pass = results.filter(r=>r.ok).length;
console.log('\nUJI DESIMAL: '+pass+'/'+results.length+' PASS');
fs.writeFileSync(OUT+'/hasil-uji-desimal.json', JSON.stringify({pass, total:results.length, results}, null, 2));
if(pass!==results.length) process.exit(1);
