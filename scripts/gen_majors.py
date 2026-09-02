import json
DATA = json.loads(r'''
{
  "prada": {"name":"Prada","designer":"Miuccia Prada & Raf Simons","city":"Milan","founded":"1913","story":"Intellectual Italian minimalism mixing nylon, restraint and subversive 'ugly-chic' with industrial refinement.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "miumiu": {"name":"Miu Miu","designer":"Miuccia Prada","city":"Milan","founded":"1993","story":"Prada's playful younger sister: subversive, girlish, ironic takes on preppy and vintage codes.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "gucci": {"name":"Gucci","designer":"Demna","city":"Florence","founded":"1921","story":"Eclectic Italian luxury; under Demna, body-conscious tailoring and provocative, streetwear-inflected glamour.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "louisvuitton": {"name":"Louis Vuitton","designer":"Nicolas Ghesquiere (women's); Pharrell Williams (men's)","city":"Paris","founded":"1854","story":"French leather-goods house pairing monogram heritage with futuristic, architectural ready-to-wear.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "hermes": {"name":"Hermes","designer":"Nadege Vanhee (women's)","city":"Paris","founded":"1837","story":"Understated French luxury built on equestrian heritage and supreme leather craftsmanship.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "celine": {"name":"Celine","designer":"Michael Rider","city":"Paris","founded":"1945","story":"Pared-back Parisian chic: sharp tailoring, quiet luxury and elevated everyday wardrobe staples.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "loewe": {"name":"Loewe","designer":"Jack McCollough & Lazaro Hernandez","city":"Madrid","founded":"1846","story":"Spanish leather house blending craft, surrealism and quiet intellectual experimentation.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "valentino": {"name":"Valentino","designer":"Alessandro Michele","city":"Rome","founded":"1960","story":"Roman couture romance; under Michele, maximalist eclecticism layered over refined red-carpet glamour.","latestCollection":"Fall 2026 Haute Couture"},
  "fendi": {"name":"Fendi","designer":"Maria Grazia Chiuri","city":"Rome","founded":"1925","story":"Roman house famed for fur artistry, playful luxury and the Baguette bag.","latestCollection":"Fall 2026 Haute Couture"},
  "versace": {"name":"Versace","designer":null,"city":"Milan","founded":"1978","story":"Bold Italian glamour: baroque prints, sensual silhouettes and unapologetic Mediterranean opulence.","latestCollection":"Spring 2026 Ready-to-Wear"},
  "chloe": {"name":"Chloe","designer":"Chemena Kamali","city":"Paris","founded":"1952","story":"Feminine Parisian bohemia: soft romanticism, fluid dressing and seventies-inflected ease.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "lanvin": {"name":"Lanvin","designer":"Peter Copping","city":"Paris","founded":"1889","story":"France's oldest couture house: elegant, refined femininity with delicate craftsmanship.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "balmain": {"name":"Balmain","designer":"Antonin Tron","city":"Paris","founded":"1945","story":"Parisian power-dressing: structured shoulders, ornate embellishment and glamorous, sculptural silhouettes.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "jacquemus": {"name":"Jacquemus","designer":"Simon Porte Jacquemus","city":"Paris","founded":"2009","story":"Sun-drenched southern-French minimalism: playful proportions, tiny bags and Provencal romance.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "acnestudios": {"name":"Acne Studios","designer":"Jonny Johansson","city":"Stockholm","founded":"1996","story":"Scandinavian minimalism with a subversive edge: relaxed tailoring and denim expertise.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "maisonmargiela": {"name":"Maison Margiela","designer":"Glenn Martens","city":"Paris","founded":"1988","story":"Avant-garde French deconstruction: conceptual anonymity, trompe-l'oeil and radical reworking of garments.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "driesvannoten": {"name":"Dries Van Noten","designer":"Julian Klausner","city":"Antwerp","founded":"1986","story":"Belgian mastery of print, colour and textile: painterly, eclectic, layered dressing.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "rickowens": {"name":"Rick Owens","designer":"Rick Owens","city":"Paris","founded":"1994","story":"Dark, brutalist avant-garde: monastic drapery and sculptural, gothic 'glunge' silhouettes.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "marni": {"name":"Marni","designer":"Meryll Rogge","city":"Milan","founded":"1994","story":"Quirky Italian intellectual chic: offbeat colour, bold prints and artful proportions.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "simonerocha": {"name":"Simone Rocha","designer":"Simone Rocha","city":"London","founded":"2010","story":"Irish romantic-gothic femininity: tulle, pearls and darkly poetic feminine tailoring.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "erdem": {"name":"Erdem","designer":"Erdem Moralioglu","city":"London","founded":"2005","story":"London romanticism: intricate florals, historical references and refined feminine tailoring.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "thombrowne": {"name":"Thom Browne","designer":"Thom Browne","city":"New York","founded":"2001","story":"American subversive tailoring: grey suiting, shrunken proportions and theatrical, conceptual presentation.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "stellamccartney": {"name":"Stella McCartney","designer":"Stella McCartney","city":"London","founded":"2001","story":"Sustainable, vegan luxury: sharp tailoring and relaxed, confident modern femininity.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "isabelmarant": {"name":"Isabel Marant","designer":"Kim Bekker","city":"Paris","founded":"1994","story":"Parisian bohemian-cool: effortless off-duty rock-chic and lived-in French-girl style.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "jilsander": {"name":"Jil Sander","designer":"Simone Bellotti","city":"Hamburg","founded":"1968","story":"Purist minimalism: architectural precision, luxurious materials and rigorous, refined restraint.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "ferragamo": {"name":"Ferragamo","designer":"Maximilian Davis","city":"Florence","founded":"1927","story":"Florentine luxury rooted in shoemaking: refined tailoring and elevated Italian craftsmanship.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "maxmara": {"name":"Max Mara","designer":"Ian Griffiths","city":"Reggio Emilia","founded":"1951","story":"Italian ready-to-wear house defined by the camel coat and timeless tailoring.","latestCollection":"Resort 2027"},
  "mugler": {"name":"Mugler","designer":"Miguel Castro Freitas","city":"Paris","founded":"1974","story":"Sculptural, body-conscious glamour: futuristic tailoring, corsetry and sensual, architectural silhouettes.","latestCollection":"Spring 2026 Ready-to-Wear"},
  "rabanne": {"name":"Rabanne","designer":null,"city":"Paris","founded":"1966","story":"Space-age experimentation: metal, chainmail and futuristic materials meeting Parisian nightlife glamour.","latestCollection":"Spring 2026 Ready-to-Wear"},
  "courreges": {"name":"Courreges","designer":null,"city":"Paris","founded":"1961","story":"1960s space-age minimalism revived: clean lines, vinyl and futuristic modernism.","latestCollection":"Fall 2026 Ready-to-Wear"},
  "eliesaab": {"name":"Elie Saab","designer":"Elie Saab","city":"Beirut","founded":"1982","story":"Lebanese couture opulence: ornate, embellished red-carpet gowns and glamorous eveningwear.","latestCollection":"Fall 2026 Haute Couture"},
  "giambattistavalli": {"name":"Giambattista Valli","designer":"Giambattista Valli","city":"Paris","founded":"2005","story":"Romantic Parisian couture: voluminous tulle, florals and hyper-feminine haute glamour.","latestCollection":null},
  "viktorandrolf": {"name":"Viktor&Rolf","designer":"Viktor Horsting & Rolf Snoeren","city":"Amsterdam","founded":"1993","story":"Dutch conceptual couture: wearable-art spectacle blending avant-garde ideas with theatrical wit.","latestCollection":"Fall 2026 Haute Couture"},
  "irisvanherpen": {"name":"Iris van Herpen","designer":"Iris van Herpen","city":"Amsterdam","founded":"2007","story":"Dutch experimental couture fusing science, 3D-printing and nature into sculptural forms.","latestCollection":"Fall 2026 Haute Couture"}
}
''')
PREMIUM = {"acnestudios","isabelmarant","maxmara"}
order = list(DATA.keys())
entries=[]
for k in order:
    d=DATA[k]
    entries.append({"key":k,"name":d["name"],"designer":d.get("designer"),"city":d.get("city"),
                    "founded":d.get("founded"),"story":d.get("story"),
                    "season":d.get("latestCollection"),"tier":("premium" if k in PREMIUM else "luxury"),"looks":[]})
js="/* Major houses (editorial, verified Aug 2026). Concatenated onto EDIT_EDITORIAL. */\n"
js+="window.EDIT_EDITORIAL = (window.EDIT_EDITORIAL||[]).concat(\n"+json.dumps(entries,ensure_ascii=False,indent=1)+"\n);\n"
open("prototype/editorial-majors.js","w").write(js)
print("wrote editorial-majors.js —", len(entries), "houses")
