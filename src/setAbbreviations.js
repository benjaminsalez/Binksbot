// Dictionnaire des abreviations d'extension du JCC Pokemon (source:
// Poképédia), les deux formats consideres: le code numerote du bloc
// (ex: "ME02") et le symbole court officiel (ex: "PFL"). Les deux menent
// au meme nom de serie complet, utilise pour aider a departager entre
// plusieurs cartes portant le meme numero dans des series differentes.
export const SET_ABBREVIATIONS = {
  // Méga-Évolution
  "ME01": "Méga-Évolution", "MEG": "Méga-Évolution",
  "ME02": "Méga-Évolution Flammes Fantasmagoriques", "PFL": "Méga-Évolution Flammes Fantasmagoriques",
  "ME2": "Méga-Évolution Flammes Fantasmagoriques",
  "ME2.5": "Méga-Évolution Héros Transcendants", "ME02.5": "Méga-Évolution Héros Transcendants", "ASC": "Méga-Évolution Héros Transcendants",
  "ME03": "Méga-Évolution Équilibre Parfait", "ME3": "Méga-Évolution Équilibre Parfait", "POR": "Méga-Évolution Équilibre Parfait",
  "ME04": "Méga-Évolution Chaos Ascendant", "ME4": "Méga-Évolution Chaos Ascendant", "CRI": "Méga-Évolution Chaos Ascendant",
  "ME05": "Méga-Évolution Nuit Noire", "ME5": "Méga-Évolution Nuit Noire", "PBL": "Méga-Évolution Nuit Noire",
  "MEP": "Promo ME",

  // Écarlate et Violet
  "EV01": "Écarlate et Violet", "EV1": "Écarlate et Violet", "SVI": "Écarlate et Violet",
  "EV02": "Écarlate et Violet Évolutions à Paldea", "EV2": "Écarlate et Violet Évolutions à Paldea", "PAL": "Écarlate et Violet Évolutions à Paldea",
  "EV03": "Écarlate et Violet Flammes Obsidiennes", "EV3": "Écarlate et Violet Flammes Obsidiennes", "OBF": "Écarlate et Violet Flammes Obsidiennes",
  "EV03.5": "Écarlate et Violet 151", "MEW": "Écarlate et Violet 151",
  "EV04": "Écarlate et Violet Faille Paradoxe", "EV4": "Écarlate et Violet Faille Paradoxe", "PAR": "Écarlate et Violet Faille Paradoxe",
  "EV04.5": "Écarlate et Violet Destinées de Paldea", "PAF": "Écarlate et Violet Destinées de Paldea",
  "EV05": "Écarlate et Violet Forces Temporelles", "EV5": "Écarlate et Violet Forces Temporelles", "TEF": "Écarlate et Violet Forces Temporelles",
  "EV06": "Écarlate et Violet Mascarade Crépusculaire", "EV6": "Écarlate et Violet Mascarade Crépusculaire", "TWM": "Écarlate et Violet Mascarade Crépusculaire",
  "EV06.5": "Écarlate et Violet Fable Nébuleuse", "SFA": "Écarlate et Violet Fable Nébuleuse",
  "EV07": "Écarlate et Violet Couronne Stellaire", "EV7": "Écarlate et Violet Couronne Stellaire", "SCR": "Écarlate et Violet Couronne Stellaire",
  "EV08": "Écarlate et Violet Étincelles Déferlantes", "EV8": "Écarlate et Violet Étincelles Déferlantes", "SSP": "Écarlate et Violet Étincelles Déferlantes",
  "EV08.5": "Écarlate et Violet Évolutions Prismatiques", "PRE": "Écarlate et Violet Évolutions Prismatiques",
  "EV09": "Écarlate et Violet Aventures Ensemble", "EV9": "Écarlate et Violet Aventures Ensemble", "JTG": "Écarlate et Violet Aventures Ensemble",
  "EV10": "Écarlate et Violet Rivalités Destinées", "DRI": "Écarlate et Violet Rivalités Destinées",
  "EV10.5": "Écarlate et Violet Foudre Noire", "BLK": "Écarlate et Violet Foudre Noire", "WHT": "Écarlate et Violet Flamme Blanche",
  "SVP": "Promo SV", "SVE": "Écarlate et Violet Énergie de base",

  // Épée et Bouclier
  "EB01": "Épée et Bouclier", "SSH": "Épée et Bouclier",
  "EB02": "Épée et Bouclier Clash des Rebelles", "RCL": "Épée et Bouclier Clash des Rebelles",
  "EB03": "Épée et Bouclier Ténèbres Embrasées", "DAA": "Épée et Bouclier Ténèbres Embrasées",
  "EB03.5": "La Voie du Maître", "CPA": "La Voie du Maître",
  "EB04": "Épée et Bouclier Voltage Éclatant", "VIV": "Épée et Bouclier Voltage Éclatant",
  "EB04.5": "Destinées Radieuses", "SHF": "Destinées Radieuses",
  "EB05": "Épée et Bouclier Styles de Combat", "BST": "Épée et Bouclier Styles de Combat",
  "EB06": "Épée et Bouclier Règne de Glace", "CRE": "Épée et Bouclier Règne de Glace",
  "EB07": "Épée et Bouclier Évolution Céleste", "EVS": "Épée et Bouclier Évolution Céleste",
  "EB07.5": "Célébrations", "CEL": "Célébrations",
  "EB08": "Épée et Bouclier Poing de Fusion", "FST": "Épée et Bouclier Poing de Fusion",
  "EB09": "Épée et Bouclier Stars Étincelantes", "BRS": "Épée et Bouclier Stars Étincelantes",
  "EB10": "Épée et Bouclier Astres Radieux", "ASR": "Épée et Bouclier Astres Radieux",
  "EB10.5": "Pokémon GO", "PGO": "Pokémon GO",
  "EB11": "Épée et Bouclier Origine Perdue", "LOR": "Épée et Bouclier Origine Perdue",
  "EB12": "Épée et Bouclier Tempête Argentée", "SIT": "Épée et Bouclier Tempête Argentée",
  "EB12.5": "Zénith Suprême", "CRZ": "Zénith Suprême",

  // Soleil et Lune
  "SL01": "Soleil et Lune", "SUM": "Soleil et Lune",
  "SL02": "Soleil et Lune Gardiens Ascendants", "GRI": "Soleil et Lune Gardiens Ascendants",
  "SL03": "Soleil et Lune Ombres Ardentes", "BUS": "Soleil et Lune Ombres Ardentes",
  "SL03.5": "Légendes Brillantes", "SLG": "Légendes Brillantes",
  "SL04": "Soleil et Lune Invasion Carmin", "CIN": "Soleil et Lune Invasion Carmin",
  "SL05": "Soleil et Lune Ultra-Prisme", "UPR": "Soleil et Lune Ultra-Prisme",
  "SL06": "Soleil et Lune Lumière Interdite", "FLI": "Soleil et Lune Lumière Interdite",
  "SL07": "Soleil et Lune Tempête Céleste", "CES": "Soleil et Lune Tempête Céleste",
  "SL07.5": "Majesté des Dragons", "DRM": "Majesté des Dragons",
  "SL08": "Soleil et Lune Tonnerre Perdu", "LOT": "Soleil et Lune Tonnerre Perdu",
  "SL09": "Soleil et Lune Duo de Choc", "TEU": "Soleil et Lune Duo de Choc",
  "SL10": "Soleil et Lune Alliance Infaillible", "UNB": "Soleil et Lune Alliance Infaillible",
  "SL11": "Soleil et Lune Harmonie des Esprits", "UNM": "Soleil et Lune Harmonie des Esprits",
  "SL11.5": "Destinées Occultes", "HIF": "Destinées Occultes",
  "SL12": "Soleil et Lune Éclipse Cosmique", "CEC": "Soleil et Lune Éclipse Cosmique",

  // XY
  "XY00": "XY Bienvenue à Kalos", "KSS": "XY Bienvenue à Kalos",
  "XY01": "XY", "XY": "XY",
  "XY02": "XY Étincelles", "FLF": "XY Étincelles",
  "XY03": "XY Poings Furieux", "FFI": "XY Poings Furieux",
  "XY04": "XY Vigueur Spectrale", "PHF": "XY Vigueur Spectrale",
  "XY05": "XY Primo-Choc", "PRC": "XY Primo-Choc",
  "DC01": "Double Danger", "DCR": "Double Danger",
  "XY06": "XY Ciel Rugissant", "ROS": "XY Ciel Rugissant",
  "XY07": "XY Origines Antiques", "AOR": "XY Origines Antiques",
  "XY08": "XY Impulsion TURBO", "BKT": "XY Impulsion TURBO",
  "XY09": "XY Rupture TURBO", "BKP": "XY Rupture TURBO",
  "G01": "Générations", "GEN": "Générations",
  "XY10": "XY Impact des Destins", "FCO": "XY Impact des Destins",
  "XY11": "XY Offensive Vapeur", "STS": "XY Offensive Vapeur",
  "XY12": "XY Évolutions", "EVO": "XY Évolutions",

  // EX (Rubis & Saphir a Gardiens du Pouvoir)
  "EX01": "EX Rubis & Saphir", "RS": "EX Rubis & Saphir",
  "EX02": "EX Tempête de sable", "SS": "EX Tempête de sable",
  "EX03": "EX Dragon", "DR": "EX Dragon",
  "EX04": "EX Team Magma VS Team Aqua", "MA": "EX Team Magma VS Team Aqua",
  "EX05": "EX Légendes Oubliées", "HL": "EX Légendes Oubliées",
  "EX06": "EX Rouge Feu & Vert Feuille", "RG": "EX Rouge Feu & Vert Feuille",
  "EX07": "EX Team Rocket Returns", "TRR": "EX Team Rocket Returns",
  "EX08": "EX Deoxys", "DX": "EX Deoxys",
  "EX09": "EX Émeraude", "EM": "EX Émeraude",
  "EX10": "EX Forces Cachées", "UF": "EX Forces Cachées",
  "EX11": "EX Espèces Delta", "DS": "EX Espèces Delta",
  "EX12": "EX Créateurs de légendes", "LM": "EX Créateurs de légendes",
  "EX13": "EX Fantômes Holon", "HP": "EX Fantômes Holon",
  "EX14": "EX Gardiens de Cristal", "CG": "EX Gardiens de Cristal",
  "EX15": "EX Île des Dragons", "DF": "EX Île des Dragons",
  "EX16": "EX Gardiens du Pouvoir", "PK": "EX Gardiens du Pouvoir",

  // Divers / Wizards / anciennes series
  "TR": "Team Rocket",
  "N1": "Neo Genesis", "N2": "Neo Discovery", "N3": "Neo Revelation", "N4": "Neo Destiny",
  "G1": "Gym Heroes", "G2": "Gym Challenge",
  "B2": "Base Set 2", "FO": "Fossile", "JU": "Jungle", "BS": "Set de Base",
  "LG": "Legendary Collection", "SK": "Skyridge", "AQ": "Aquapolis",
};

/**
 * Cherche un code d'abreviation de serie CONNU dans le titre (mot isole),
 * et retourne le nom complet de la serie correspondante si trouve.
 */
export function findSetAbbreviation(title) {
  const tokens = title.split(/[^A-Za-z0-9.]+/).filter(Boolean);
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (SET_ABBREVIATIONS[upper]) {
      return SET_ABBREVIATIONS[upper];
    }
  }
  return null;
}
