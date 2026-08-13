s = open("prototype/EDIT.dc.html").read()
a = s.find("const BRANDS = [")
b = s.find("class Component extends DCLogic")

PREAMBLE = r'''/* ===== ÉDIT — real data preamble (real catalogue replaces the mock) ===== */
const RD = window.DATA;
const OCCLABEL = {casual:"Casual", datenight:"Date Night", events:"Events", athleisure:"Athleisure", jewelry:"Jewelry"};
const OCC = [["casual","Casual"],["datenight","Date Night"],["events","Events"],["athleisure","Athleisure"],["jewelry","Jewelry"]];
const SIZES = ["XS","S","M","L","XL"];
const SEASONS = ["Autumn/Winter 26","Spring/Summer 26","Autumn/Winter 25","Archive"];
const RATIOS = ["3/4","4/5","1/1","3/4","4/5","3/4"];
const DEFAULT_BOARDS = [{key:"september",name:"September"},{key:"silhouettes",name:"Silhouettes"},{key:"wedding",name:"Wedding guest"}];
const SECTIONS = [
  {key:"luxury",label:"Luxury Designer",no:"01",blurb:"Runway houses and couture ateliers.",range:"$800+",min:800,max:1000000},
  {key:"premium",label:"Affordable Luxury",no:"02",blurb:"Considered materials and atelier finish, without the house markup.",range:"$300 - $800",min:300,max:800},
  {key:"contemporary",label:"Contemporary",no:"03",blurb:"Independent studios and everyday staples worth owning.",range:"Under $300",min:0,max:300}
];
function _p(x){ return parseInt(String(x).replace(/[^0-9]/g,""),10)||0; }
function tierOf(n){ return n>=800?"luxury":(n>=300?"premium":"contemporary"); }

const SEED_META = {
  therow:["Mary-Kate & Ashley Olsen","2006","New York","Quiet, exacting American luxury - impeccable proportion and materials, no logos."],
  khaite:["Catherine Holstein","2016","New York","Sensual American ready-to-wear that reworks wardrobe staples with soft strength."],
  toteme:["Elin Kling & Karl Lindman","2014","Stockholm","Scandinavian minimalism - refined tailoring and the signature scarf."],
  proenzaschouler:["Jack McCollough & Lazaro Hernandez","2002","New York","Downtown New York sophistication with a craft-driven, experimental edge."],
  victoriabeckham:["Victoria Beckham","2008","London","Polished, body-conscious tailoring and fluid dresses, modern British."],
  schiaparelli:["Daniel Roseberry, creative director","1927","Paris","Surrealist Parisian couture - sculptural, gold-accented, boldly artistic."],
  studionicholson:["Nick Wakeman","2010","London","Modular, architecturally-cut essentials in muted, considered tones."],
  phoebephilo:["Phoebe Philo","2023","London","Pared-back luxury with intellectual, off-hand ease."],
  nililotan:["Nili Lotan","2003","New York","Effortless downtown staples with military and menswear influences."],
  anothertomorrow:["Vanessa Barboni Hallik","2018","New York","Traceable, sustainable luxury - timeless tailoring, radical transparency."],
  lideewoman:["Iuliia Ievdokymenko & Breeana Smith","2019","Melbourne","Engineered pleats and sculptural column dresses; European occasion wear."],
  dissh:["Maree Henry; led by Lucy Henry-Hicks","2001","Gold Coast","Elevated linen and day-to-night basics with relaxed Australian ease."]
};
const META = {};
Object.keys(SEED_META).forEach(k=>{ META[k]=SEED_META[k].slice(); });
if (window.EDIT_META){ Object.keys(window.EDIT_META).forEach(k=>{ const m=window.EDIT_META[k]||{}; const c=META[k]||[null,null,null,null];
  META[k]=[m.founder||c[0], m.founded||c[1], m.city||c[2], m.story||c[3]]; }); }

const _byBrand = {};
RD.items.forEach(it=>{ (_byBrand[it.brand]=_byBrand[it.brand]||[]).push(it); });
const BRANDS = Object.values(RD.brands).map(b=>{
  const its=_byBrand[b.key]||[];
  const ps=its.map(i=>_p(i.price)).sort((x,z)=>x-z);
  const med=ps.length?ps[Math.floor(ps.length/2)]:0;
  const m=META[b.key];
  return [b.key, b.name, (m&&m[2])?m[2]:"", tierOf(med), its.length];
}).sort((x,z)=>x[1].localeCompare(z[1]));

const _NOW = Date.parse(RD.now||"2026-08-12");
const _all = RD.items.map((it,idx)=>{
  const pn=_p(it.price), tk=tierOf(pn), pub=it.published?Date.parse(it.published):0;
  return { id:it.id, brand:it.brand, brandName:it.brandName, tierKey:tk,
    tier:(SECTIONS.find(s=>s.key===tk)||{}).label, title:it.title, color:it.color||"",
    priceNum:pn, price:it.price, occKey:it.occasion, occ:OCCLABEL[it.occasion]||it.occasion,
    ratio:RATIOS[idx%RATIOS.length], isNew: pub ? (_NOW-pub) < 2592000000 : false, drop:false,
    sizesOut:[idx%5], img:it.img, img2:it.img2, url:it.url, pub:pub };
});
const _feed = _all.slice().sort((x,z)=>(z.pub||0)-(x.pub||0));
const CAT = { feed:_feed.slice(0,60), all:_all, byId:_all.reduce((m,i)=>{m[i.id]=i;return m;},{}) };

const SEED_ADJ = [
  ["lemaire","Lemaire","Paris","luxury","fluid Parisian minimalism"],
  ["stagni","St. Agni","Byron Bay","premium","pared-back leather & tailoring"],
  ["matteau","Matteau","Sydney","premium","minimal swim & summer"],
  ["baserange","Baserange","Toulouse","contemporary","organic undyed basics"],
  ["leset","Leset","Los Angeles","contemporary","elevated knit staples"],
  ["eterne","Eterne","Los Angeles","contemporary","the perfect basics"]
];
const ADJACENT = (window.EDIT_ADJACENT && window.EDIT_ADJACENT.length) ? window.EDIT_ADJACENT : SEED_ADJ;

function brandLookTitle(name, no){
  const notes=["Opening look","Wool, doubled","The house slip","Tailoring, undone","Evening, early","Coat over nothing","Bias and weight","Second skin","Quiet finale"];
  return notes[(parseInt(no,10)-1) % notes.length];
}
const RAW_CLIPS = [
  {kind:"inspo",title:"Layering - slip over a tee",brandName:"@studio.noir",meta:"Instagram",ratio:"4/5"},
  {kind:"inspo",title:"Autumn palette board",brandName:"Pinterest / Quiet",meta:"Pinterest",ratio:"1/1"},
  {kind:"inspo",title:"Street - the belted coat",brandName:"@copenhagen.eye",meta:"Instagram",ratio:"3/4"},
  {kind:"inspo",title:"Shoe shapes for autumn",brandName:"Pinterest / Feet first",meta:"Pinterest",ratio:"4/5"},
  {kind:"inspo",title:"Grandpa knit, sharp trouser",brandName:"@archive.eye",meta:"Instagram",ratio:"3/4"}
];

'''

out = s[:a] + PREAMBLE + s[b:]
out = out.replace('<script src="./support.js"></script>',
                  '<script src="./data.js"></script>\n<script src="./support.js"></script>', 1)
open("prototype/edit.html","w").write(out)
print("wrote prototype/edit.html", len(out), "chars")
