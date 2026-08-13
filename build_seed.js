const fs = require('fs');
global.window = {};
for (const f of ['prototype/data.js','prototype/edit-meta.js','prototype/editorial.js','prototype/editorial-majors.js']) {
  eval(fs.readFileSync(f, 'utf8'));
}
const D = window.DATA, META = window.EDIT_META || {}, EDI = window.EDIT_EDITORIAL || [];
const num = s => parseInt(String(s).replace(/[^0-9]/g,''),10) || 0;
const tierOf = n => n>=800 ? 'luxury' : (n>=300 ? 'premium' : 'contemporary');
const median = a => { if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };

const itemsByBrand = {};
D.items.forEach(i => (itemsByBrand[i.brand] = itemsByBrand[i.brand] || []).push(i));

const brands = Object.values(D.brands).map(b => {
  const its = itemsByBrand[b.key] || [];
  const m = META[b.key] || {};  // {founder, founded, city, story}
  return {
    key: b.key, name: b.name, kind: 'shoppable', domain: b.domain || '', url: b.url || '',
    hero_image_url: b.hero || '', tier: tierOf(median(its.map(i => num(i.price)))),
    founder: m.founder || '', founded: m.founded || '', city: m.city || '', story: m.story || '',
    designer: '', season: '', source: 'shopify',
  };
});

const products = D.items.map(i => {
  const p = num(i.price);
  return {
    brand_key: i.brand, external_id: i.id, title: i.title, color: i.color || '',
    price: p, price_display: i.price, occasion: i.occasion, tier: tierOf(p),
    image_url: i.img, image2_url: i.img2 || i.img, url: i.url || '',
    available: !!i.avail, published_at: i.published || null,
  };
});

const editorial = EDI.map(e => ({
  key: e.key, name: e.name, kind: 'editorial', designer: e.designer || '', city: e.city || '',
  founded: e.founded || '', story: e.story || '', tier: e.tier || 'luxury', season: e.season || '',
  source: (e.looks && e.looks.length) ? 'site' : 'blocked',
  looks: (e.looks && e.looks.length) ? e.looks : [null,null,null,null,null,null],
}));

const seed = { brands, products, editorial };
fs.writeFileSync('seed/seed.json', JSON.stringify(seed, null, 1));
console.log(`seed.json — ${brands.length} shoppable brands, ${products.length} products, ${editorial.length} editorial houses`);
