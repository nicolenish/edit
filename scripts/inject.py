import re
s = open("prototype/edit.html").read()
def IMG(var): return '<img src="{{ %s.img }}" alt="" style="position:absolute;inset:0;width:100%%;height:100%%;object-fit:cover" />' % var

# --- logic: give houses + featured an img (brand hero) ---
s2 = s.replace('count:b[4]+" pieces", onOpen: ()=>this.openBrand(b[0]),',
               'count:b[4]+" pieces", img:(RD.brands[b[0]]||{}).hero, onOpen: ()=>this.openBrand(b[0]),', 1)
assert s2!=s, "houses img logic not found"; s=s2
s2 = s.replace('const featured = { key:fb[0], name:fb[1], city:fb[2],',
               'const featured = { key:fb[0], name:fb[1], img:(RD.brands[fb[0]]||{}).hero, city:fb[2],', 1)
assert s2!=s, "featured img logic not found"; s=s2

# --- tiles: add position:relative where missing (drawer, houses, featured) ---
for uniq in [
  'aspect-ratio:3/4;background:repeating-linear-gradient(135deg,#efede8,#efede8 9px,#f6f4f0 9px,#f6f4f0 18px);display:flex;align-items:flex-end;padding:16px;margin-bottom:24px',
  'aspect-ratio:4/5;background:repeating-linear-gradient(135deg,#efede8,#efede8 9px,#f6f4f0 9px,#f6f4f0 18px);display:flex;align-items:flex-end;padding:14px',
  'aspect-ratio:4/5;background:repeating-linear-gradient(135deg,#efede8,#efede8 9px,#f6f4f0 9px,#f6f4f0 18px);display:flex;align-items:flex-end;padding:16px',
]:
    c = s.count(uniq); assert c==1, "expected 1 got %d for %s" % (c, uniq[:40])
    s = s.replace(uniq, 'position:relative;'+uniq, 1)

# --- replace monospace label spans with real <img> ---
def rep(var, expect):
    global s
    pat = re.compile(r'<span style="font-family:ui-monospace,[^"]*">[^<]*?\{\{ '+re.escape(var)+r' \}\}</span>')
    found = pat.findall(s)
    assert len(found)==expect, "for %s expected %d found %d" % (var, expect, len(found))
    owner = var.split('.')[0]
    s = pat.sub(IMG(owner), s)

rep('f.title', 2)
rep('it.title', 1)
rep('p.title', 1)
rep('selected.title', 1)
rep('h.name', 1)
rep('featured.name', 1)

open("prototype/edit.html","w").write(s)
print("image injection done OK")
