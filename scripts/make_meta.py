import json, re

META_RAW = r'''{
  "aflalonyc": {"founder":"Yael Aflalo","founded":"2024","city":"New York","story":"Understated luxury womenswear from Reformation's founder — refined tailoring and elevated everyday essentials."},
  "alamedaturquesa": {"founder":"Ana & Carolina Santos","founded":"2012","city":"Portugal","story":"Handcrafted Portuguese footwear, known for pom-pom and tassel-embellished flats and mules."},
  "almadalabel": {"founder":"Alexa Dagmar & Linda Juhola","founded":"2020","city":"Helsinki","story":"Scandinavian minimalist womenswear — tailored trousers, blazers and pared-back staples."},
  "anothertomorrow": {"founder":"Vanessa Barboni Hallik","founded":"2018","city":"New York","story":"B Corp sustainable luxury emphasizing traceable materials, tailoring and timeless staples."},
  "ashlynnewyork": {"founder":"Ashlynn Park","founded":"2020","city":"New York","story":"Architectural womenswear merging Japanese pattern-cutting with Western draping and refined tailoring."},
  "beabongiasca": {"founder":"Bea Bongiasca","founded":"2013","city":"Milan","story":"Playful demi-fine jewelry — colorful enamel vines and technicolor gemstone designs."},
  "dissh": {"founder":"Maree Henry","founded":"2001","city":"Brisbane","story":"Contemporary Australian womenswear — elevated minimalist staples and tailoring at mid prices."},
  "deijistudios": {"founder":"Juliette Harkness & Emma Nelson","founded":"2016","city":"Byron Bay","story":"Byron Bay label making relaxed European-linen loungewear, sleepwear and everyday separates."},
  "eliou__": {"founder":"Cristina Mantilla & Duda Teixeira","founded":"2019","city":"Miami","story":"Handmade beaded jewelry — pearl and freshwater-bead necklaces with a Mediterranean-summer feel."},
  "fabrique.official": {"founder":null,"founded":null,"city":"Bangkok","story":"Bangkok fashion boutique carrying women's clothing, denim, swimwear and accessories."},
  "flattered": {"founder":"Pingis Hadenius & team","founded":"2013","city":"Stockholm","story":"Swedish label crafting minimalist Scandinavian footwear and leather accessories."},
  "hermanoskoumori": {"founder":"Alex León & Alex Sandler","founded":"2018","city":"Mexico City","story":"Mexico City running and lifestyle apparel blending performance textiles with Mexican culture."},
  "khaite": {"founder":"Catherine Holstein","founded":"2016","city":"New York","story":"New York luxury womenswear pairing polished tailoring with sensual, elevated everyday pieces."},
  "lideewoman": {"founder":"Breeana Smith & Iuliia Ievdokymenko","founded":"2019","city":"Australia","story":"Australian label specializing in permanently pleated, colorful sculptural dresses and separates."},
  "louloudesaison": {"founder":"Chloe Harrouche & Ugo Bensoussan","founded":"2019","city":"Paris","story":"French label offering elevated everyday essentials with understated Parisian simplicity."},
  "nililotan": {"founder":"Nili Lotan","founded":"2003","city":"New York","story":"New York label known for effortless, military-influenced tailoring and refined staples."},
  "phoebephilo": {"founder":"Phoebe Philo","founded":"2023","city":"London","story":"Namesake luxury label of the former Celine designer — pared-back minimalism with a raw edge."},
  "proenzaschouler": {"founder":"Jack McCollough & Lazaro Hernandez","founded":"2002","city":"New York","story":"New York ready-to-wear — modern American sophistication, sharp tailoring and inventive craft."},
  "raisavanessa": {"founder":"Raisa & Vanessa Sason","founded":"2011","city":"Istanbul","story":"Istanbul label by twin sisters, known for dramatic, sculptural eveningwear and gowns."},
  "rohe_frames": {"founder":"Marieke Meulendijks & Maickel Weyers","founded":"2021","city":"Amsterdam","story":"Amsterdam label — fluid tailoring, fine knits and sculptural, tactile outerwear."},
  "rue__sophie": {"founder":"Sabina Vilusic","founded":"2024","city":null,"story":"Accessible-luxury womenswear — versatile, utility-minded elevated essentials."},
  "schiaparelli": {"founder":"Elsa Schiaparelli","founded":"1927","city":"Paris","story":"Parisian couture house rooted in Surrealist design and bold, sculptural embellishment."},
  "studionicholson": {"founder":"Nick Wakeman","founded":"2010","city":"London","story":"London label — modular, Japanese-influenced minimalist wardrobes with volume-focused tailoring."},
  "tabvintage": {"founder":"Alexis Novak","founded":"2019","city":"Los Angeles","story":"Los Angeles archival vintage studio sourcing and restoring rare designer and couture pieces."},
  "therow": {"founder":"Mary-Kate & Ashley Olsen","founded":"2006","city":"New York","story":"American luxury house known for minimalist, impeccably crafted tailoring in refined fabrics."},
  "toteme": {"founder":"Elin Kling & Karl Lindman","founded":"2014","city":"Stockholm","story":"Swedish label defining Scandinavian minimalism through clean tailoring and elevated essentials."},
  "victoriabeckham": {"founder":"Victoria Beckham","founded":"2008","city":"London","story":"London label — modern minimalist tailoring, fluid dresses and refined ready-to-wear."},
  "thefrankieshop": {"founder":"Gaelle Drevet","founded":"2014","city":"New York","story":"Downtown-cool wardrobe staples — sharp tailoring and elevated basics at accessible prices."},
  "tove": {"founder":"Camille Perry & Holly Wright","founded":"2019","city":"London","story":"Sensual, pared-back ready-to-wear from two ex-Topshop designers — clean lines, elevated staples."},
  "tamararalph": {"founder":"Tamara Ralph","founded":"2022","city":"London","story":"Couture-trained glamour — sculptural, embellished eveningwear from the former Ralph & Russo designer."},
  "mariemas": {"founder":null,"founded":"2016","city":"Paris","story":"Parisian fine jewelry built on movement — rotating, reversible coloured-stone designs."},
  "liestudio": {"founder":null,"founded":"2018","city":"Copenhagen","story":"Danish demi-fine jewelry — sculptural gold-plated pieces with a minimal Scandinavian edge."},
  "bandit": {"founder":null,"founded":"2020","city":"New York","story":"Community-driven running brand making high-performance racewear without sponsor logos."},
  "currentlyrunning": {"founder":null,"founded":null,"city":null,"story":"Elevated activewear and run-club staples made for everyday movement."}
}'''

ADJ = [
  ["Lemaire","Paris","fluid understated tailoring","luxury"],
  ["Wardrobe.NYC","New York","minimalist wardrobe staples","premium"],
  ["St. Agni","Byron Bay","pared-back leather essentials","premium"],
  ["Matteau","Sydney","minimalist swim and resort","contemporary"],
  ["Gabriela Hearst","New York","sustainable luxury tailoring","luxury"],
  ["Loulou Studio","Paris","elevated cashmere basics","premium"],
  ["Bevza","New York","sculptural Ukrainian minimalism","contemporary"],
  ["LOW Classic","Seoul","Korean minimalist ready-to-wear","contemporary"],
]

meta = json.loads(META_RAW)
adj = [[re.sub(r'[^a-z0-9]','',n.lower()), n, c, tier, note] for (n,c,note,tier) in ADJ]

js = "window.EDIT_META = %s;\nwindow.EDIT_ADJACENT = %s;\n" % (
    json.dumps(meta, ensure_ascii=False), json.dumps(adj, ensure_ascii=False))
open("prototype/edit-meta.js","w").write(js)
print("wrote prototype/edit-meta.js —", len(meta), "brands,", len(adj), "adjacent")
