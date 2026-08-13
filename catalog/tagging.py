"""Derive aesthetic + region tags from a brand's story and city.
Uses the same controlled vocabulary as the discovery pool so the two match up."""

# keyword -> aesthetic tag
_AESTHETIC = {
    "minimal": "minimalist", "pared-back": "minimalist", "pared back": "minimalist", "purist": "minimalist",
    "tailor": "tailoring", "suiting": "tailoring", "suit": "tailoring",
    "romantic": "romantic", "romanticism": "romantic",
    "avant-garde": "avant-garde", "conceptual": "avant-garde", "experimental": "avant-garde",
    "sculptural": "sculptural", "architectural": "sculptural", "structural": "sculptural",
    "leather": "leather",
    "knit": "knitwear", "cashmere": "knitwear",
    "print": "print", "floral": "print", "colour": "print", "color": "print",
    "sustainab": "sustainable", "traceable": "sustainable", "vegan": "sustainable", "organic": "sustainable",
    "evening": "eveningwear", "gown": "eveningwear", "red-carpet": "eveningwear", "red carpet": "eveningwear",
    "street": "streetwear",
    "sport": "sportswear", "running": "sportswear", "activewear": "sportswear", "performance": "sportswear",
    "jewel": "jewelry",
    "denim": "denim",
    "bohemia": "bohemian", "seventies": "bohemian",
    "futuristic": "futuristic", "space-age": "futuristic", "space age": "futuristic",
    "couture": "couture",
    "relaxed": "relaxed", "everyday": "relaxed", "ease": "relaxed", "off-duty": "relaxed",
    "feminine": "feminine", "femininity": "feminine",
    "deconstruct": "deconstruction",
    "craft": "artisanal", "hand": "artisanal", "atelier": "artisanal", "artisan": "artisanal",
    "texture": "tactile", "tactile": "tactile",
    "playful": "playful", "ironic": "playful", "quirky": "playful", "whimsical": "playful",
    "utilit": "utilitarian", "workwear": "utilitarian", "military": "utilitarian",
}

# city -> region tag
_REGION = {
    "paris": "french", "lyon": "french", "marseille": "french",
    "milan": "italian", "rome": "italian", "florence": "italian", "vicenza": "italian", "reggio": "italian",
    "stockholm": "scandinavian", "copenhagen": "scandinavian", "oslo": "scandinavian",
    "helsinki": "scandinavian", "gothenburg": "scandinavian",
    "london": "british", "manchester": "british", "dublin": "british",
    "new york": "american", "los angeles": "american", "miami": "american",
    "sydney": "australian", "melbourne": "australian", "brisbane": "australian",
    "gold coast": "australian", "byron": "australian", "australia": "australian",
    "tokyo": "japanese", "kyoto": "japanese",
    "seoul": "korean",
    "antwerp": "belgian", "ghent": "belgian",
    "amsterdam": "dutch",
    "madrid": "spanish", "barcelona": "spanish",
}


def derive_tags(story: str = "", city: str = ""):
    s = (story or "").lower()
    tags = []
    for kw, tag in _AESTHETIC.items():
        if kw in s and tag not in tags:
            tags.append(tag)
    c = (city or "").lower()
    for kw, region in _REGION.items():
        if kw in c:
            if region not in tags:
                tags.append(region)
            break
    return tags[:6]
