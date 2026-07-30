/**
 * FlowPilot Studio — Widget Carte géographique (geo.js)
 * Choroplèthe SVG maison : projection Mercator, zoom cinématique à l'ouverture,
 * survol + tooltip, zoom molette / double-clic / boutons, déplacement à la souris.
 * Fond de carte : world-atlas (MIT) ; window.ChartGeo.topojson (déjà chargé par
 * l'app) ne sert plus qu'à convertir le TopoJSON en GeoJSON.
 * Reconnaît les valeurs de la colonne "pays" sous forme de code ISO-2 (FR, DE, LU…),
 * de nom anglais officiel ou d'un alias français courant, puis les projette sur une carte.
 *
 * Options sur l'objet widget (w) :
 *   w.col        : colonne dimension (pays)
 *   w.col2       : colonne mesure (optionnel, sinon comptage)
 *   w.aggr       : agrégation ('sum','avg','count', ...)
 *   w.color      : couleur de base du dégradé
 *   w.geoScope   : 'auto' (défaut) | 'europe' | 'world'
 */

const ISO2_TO_NUM = {
  AD:"20",AE:"784",AF:"4",AG:"28",AI:"660",AL:"8",AM:"51",AO:"24",AQ:"10",AR:"32",
  AS:"16",AT:"40",AU:"36",AW:"533",AX:"248",AZ:"31",BA:"70",BB:"52",BD:"50",BE:"56",
  BF:"854",BG:"100",BH:"48",BI:"108",BJ:"204",BL:"652",BM:"60",BN:"96",BO:"68",BQ:"535",
  BR:"76",BS:"44",BT:"64",BV:"74",BW:"72",BY:"112",BZ:"84",CA:"124",CC:"166",CD:"180",
  CF:"140",CG:"178",CH:"756",CI:"384",CK:"184",CL:"152",CM:"120",CN:"156",CO:"170",CR:"188",
  CU:"192",CV:"132",CW:"531",CX:"162",CY:"196",CZ:"203",DE:"276",DJ:"262",DK:"208",DM:"212",
  DO:"214",DZ:"12",EC:"218",EE:"233",EG:"818",EH:"732",ER:"232",ES:"724",ET:"231",FI:"246",
  FJ:"242",FK:"238",FM:"583",FO:"234",FR:"250",GA:"266",GB:"826",GD:"308",GE:"268",GF:"254",
  GG:"831",GH:"288",GI:"292",GL:"304",GM:"270",GN:"324",GP:"312",GQ:"226",GR:"300",GS:"239",
  GT:"320",GU:"316",GW:"624",GY:"328",HK:"344",HM:"334",HN:"340",HR:"191",HT:"332",HU:"348",
  ID:"360",IE:"372",IL:"376",IM:"833",IN:"356",IO:"86",IQ:"368",IR:"364",IS:"352",IT:"380",
  JE:"832",JM:"388",JO:"400",JP:"392",KE:"404",KG:"417",KH:"116",KI:"296",KM:"174",KN:"659",
  KP:"408",KR:"410",KW:"414",KY:"136",KZ:"398",LA:"418",LB:"422",LC:"662",LI:"438",LK:"144",
  LR:"430",LS:"426",LT:"440",LU:"442",LV:"428",LY:"434",MA:"504",MC:"492",MD:"498",ME:"499",
  MF:"663",MG:"450",MH:"584",MK:"807",ML:"466",MM:"104",MN:"496",MO:"446",MP:"580",MQ:"474",
  MR:"478",MS:"500",MT:"470",MU:"480",MV:"462",MW:"454",MX:"484",MY:"458",MZ:"508",NA:"516",
  NC:"540",NE:"562",NF:"574",NG:"566",NI:"558",NL:"528",NO:"578",NP:"524",NR:"520",NU:"570",
  NZ:"554",OM:"512",PA:"591",PE:"604",PF:"258",PG:"598",PH:"608",PK:"586",PL:"616",PM:"666",
  PN:"612",PR:"630",PS:"275",PT:"620",PW:"585",PY:"600",QA:"634",RE:"638",RO:"642",RS:"688",
  RU:"643",RW:"646",SA:"682",SB:"90",SC:"690",SD:"729",SE:"752",SG:"702",SH:"654",SI:"705",
  SJ:"744",SK:"703",SL:"694",SM:"674",SN:"686",SO:"706",SR:"740",SS:"728",ST:"678",SV:"222",
  SX:"534",SY:"760",SZ:"748",TC:"796",TD:"148",TF:"260",TG:"768",TH:"764",TJ:"762",TK:"772",
  TL:"626",TM:"795",TN:"788",TO:"776",TR:"792",TT:"780",TV:"798",TW:"158",TZ:"834",UA:"804",
  UG:"800",UM:"581",US:"840",UY:"858",UZ:"860",VA:"336",VC:"670",VE:"862",VG:"92",VI:"850",
  VN:"704",VU:"548",WF:"876",WS:"882",YE:"887",YT:"175",ZA:"710",ZM:"894",ZW:"716",
};
// Les ids de world-atlas sont sur 3 chiffres avec zéros initiaux (« 056 » pour la
// Belgique) : on enregistre les deux formes pour que tous les pays matchent.
const NUM_TO_A2 = {}; Object.keys(ISO2_TO_NUM).forEach(a2=>{ const n=ISO2_TO_NUM[a2]; NUM_TO_A2[n]=a2; NUM_TO_A2[('00'+n).slice(-3)]=a2; });

// Nom officiel ISO (anglais) -> alpha-2
const ISO_NAME_TO_A2 = {
  "AFGHANISTAN": "AF",
  "ÅLAND ISLANDS": "AX",
  "ALBANIA": "AL",
  "ALGERIA": "DZ",
  "AMERICAN SAMOA": "AS",
  "ANDORRA": "AD",
  "ANGOLA": "AO",
  "ANGUILLA": "AI",
  "ANTARCTICA": "AQ",
  "ANTIGUA AND BARBUDA": "AG",
  "ARGENTINA": "AR",
  "ARMENIA": "AM",
  "ARUBA": "AW",
  "AUSTRALIA": "AU",
  "AUSTRIA": "AT",
  "AZERBAIJAN": "AZ",
  "BAHAMAS": "BS",
  "BAHRAIN": "BH",
  "BANGLADESH": "BD",
  "BARBADOS": "BB",
  "BELARUS": "BY",
  "BELGIUM": "BE",
  "BELIZE": "BZ",
  "BENIN": "BJ",
  "BERMUDA": "BM",
  "BHUTAN": "BT",
  "BOLIVIA, PLURINATIONAL STATE OF": "BO",
  "BONAIRE, SINT EUSTATIUS AND SABA": "BQ",
  "BOSNIA AND HERZEGOVINA": "BA",
  "BOTSWANA": "BW",
  "BOUVET ISLAND": "BV",
  "BRAZIL": "BR",
  "BRITISH INDIAN OCEAN TERRITORY": "IO",
  "BRUNEI DARUSSALAM": "BN",
  "BULGARIA": "BG",
  "BURKINA FASO": "BF",
  "BURUNDI": "BI",
  "CABO VERDE": "CV",
  "CAMBODIA": "KH",
  "CAMEROON": "CM",
  "CANADA": "CA",
  "CAYMAN ISLANDS": "KY",
  "CENTRAL AFRICAN REPUBLIC": "CF",
  "CHAD": "TD",
  "CHILE": "CL",
  "CHINA": "CN",
  "CHRISTMAS ISLAND": "CX",
  "COCOS (KEELING) ISLANDS": "CC",
  "COLOMBIA": "CO",
  "COMOROS": "KM",
  "CONGO": "CG",
  "CONGO, DEMOCRATIC REPUBLIC OF THE": "CD",
  "COOK ISLANDS": "CK",
  "COSTA RICA": "CR",
  "CÔTE D'IVOIRE": "CI",
  "CROATIA": "HR",
  "CUBA": "CU",
  "CURAÇAO": "CW",
  "CYPRUS": "CY",
  "CZECHIA": "CZ",
  "DENMARK": "DK",
  "DJIBOUTI": "DJ",
  "DOMINICA": "DM",
  "DOMINICAN REPUBLIC": "DO",
  "ECUADOR": "EC",
  "EGYPT": "EG",
  "EL SALVADOR": "SV",
  "EQUATORIAL GUINEA": "GQ",
  "ERITREA": "ER",
  "ESTONIA": "EE",
  "ESWATINI": "SZ",
  "ETHIOPIA": "ET",
  "FALKLAND ISLANDS (MALVINAS)": "FK",
  "FAROE ISLANDS": "FO",
  "FIJI": "FJ",
  "FINLAND": "FI",
  "FRANCE": "FR",
  "FRENCH GUIANA": "GF",
  "FRENCH POLYNESIA": "PF",
  "FRENCH SOUTHERN TERRITORIES": "TF",
  "GABON": "GA",
  "GAMBIA": "GM",
  "GEORGIA": "GE",
  "GERMANY": "DE",
  "GHANA": "GH",
  "GIBRALTAR": "GI",
  "GREECE": "GR",
  "GREENLAND": "GL",
  "GRENADA": "GD",
  "GUADELOUPE": "GP",
  "GUAM": "GU",
  "GUATEMALA": "GT",
  "GUERNSEY": "GG",
  "GUINEA": "GN",
  "GUINEA-BISSAU": "GW",
  "GUYANA": "GY",
  "HAITI": "HT",
  "HEARD ISLAND AND MCDONALD ISLANDS": "HM",
  "HOLY SEE": "VA",
  "HONDURAS": "HN",
  "HONG KONG": "HK",
  "HUNGARY": "HU",
  "ICELAND": "IS",
  "INDIA": "IN",
  "INDONESIA": "ID",
  "IRAN, ISLAMIC REPUBLIC OF": "IR",
  "IRAQ": "IQ",
  "IRELAND": "IE",
  "ISLE OF MAN": "IM",
  "ISRAEL": "IL",
  "ITALY": "IT",
  "JAMAICA": "JM",
  "JAPAN": "JP",
  "JERSEY": "JE",
  "JORDAN": "JO",
  "KAZAKHSTAN": "KZ",
  "KENYA": "KE",
  "KIRIBATI": "KI",
  "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "KP",
  "KOREA, REPUBLIC OF": "KR",
  "KUWAIT": "KW",
  "KYRGYZSTAN": "KG",
  "LAO PEOPLE'S DEMOCRATIC REPUBLIC": "LA",
  "LATVIA": "LV",
  "LEBANON": "LB",
  "LESOTHO": "LS",
  "LIBERIA": "LR",
  "LIBYA": "LY",
  "LIECHTENSTEIN": "LI",
  "LITHUANIA": "LT",
  "LUXEMBOURG": "LU",
  "MACAO": "MO",
  "MADAGASCAR": "MG",
  "MALAWI": "MW",
  "MALAYSIA": "MY",
  "MALDIVES": "MV",
  "MALI": "ML",
  "MALTA": "MT",
  "MARSHALL ISLANDS": "MH",
  "MARTINIQUE": "MQ",
  "MAURITANIA": "MR",
  "MAURITIUS": "MU",
  "MAYOTTE": "YT",
  "MEXICO": "MX",
  "MICRONESIA, FEDERATED STATES OF": "FM",
  "MOLDOVA, REPUBLIC OF": "MD",
  "MONACO": "MC",
  "MONGOLIA": "MN",
  "MONTENEGRO": "ME",
  "MONTSERRAT": "MS",
  "MOROCCO": "MA",
  "MOZAMBIQUE": "MZ",
  "MYANMAR": "MM",
  "NAMIBIA": "NA",
  "NAURU": "NR",
  "NEPAL": "NP",
  "NETHERLANDS, KINGDOM OF THE": "NL",
  "NEW CALEDONIA": "NC",
  "NEW ZEALAND": "NZ",
  "NICARAGUA": "NI",
  "NIGER": "NE",
  "NIGERIA": "NG",
  "NIUE": "NU",
  "NORFOLK ISLAND": "NF",
  "NORTH MACEDONIA": "MK",
  "NORTHERN MARIANA ISLANDS": "MP",
  "NORWAY": "NO",
  "OMAN": "OM",
  "PAKISTAN": "PK",
  "PALAU": "PW",
  "PALESTINE, STATE OF": "PS",
  "PANAMA": "PA",
  "PAPUA NEW GUINEA": "PG",
  "PARAGUAY": "PY",
  "PERU": "PE",
  "PHILIPPINES": "PH",
  "PITCAIRN": "PN",
  "POLAND": "PL",
  "PORTUGAL": "PT",
  "PUERTO RICO": "PR",
  "QATAR": "QA",
  "RÉUNION": "RE",
  "ROMANIA": "RO",
  "RUSSIAN FEDERATION": "RU",
  "RWANDA": "RW",
  "SAINT BARTHÉLEMY": "BL",
  "SAINT HELENA, ASCENSION AND TRISTAN DA CUNHA": "SH",
  "SAINT KITTS AND NEVIS": "KN",
  "SAINT LUCIA": "LC",
  "SAINT MARTIN (FRENCH PART)": "MF",
  "SAINT PIERRE AND MIQUELON": "PM",
  "SAINT VINCENT AND THE GRENADINES": "VC",
  "SAMOA": "WS",
  "SAN MARINO": "SM",
  "SAO TOME AND PRINCIPE": "ST",
  "SAUDI ARABIA": "SA",
  "SENEGAL": "SN",
  "SERBIA": "RS",
  "SEYCHELLES": "SC",
  "SIERRA LEONE": "SL",
  "SINGAPORE": "SG",
  "SINT MAARTEN (DUTCH PART)": "SX",
  "SLOVAKIA": "SK",
  "SLOVENIA": "SI",
  "SOLOMON ISLANDS": "SB",
  "SOMALIA": "SO",
  "SOUTH AFRICA": "ZA",
  "SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS": "GS",
  "SOUTH SUDAN": "SS",
  "SPAIN": "ES",
  "SRI LANKA": "LK",
  "SUDAN": "SD",
  "SURINAME": "SR",
  "SVALBARD AND JAN MAYEN": "SJ",
  "SWEDEN": "SE",
  "SWITZERLAND": "CH",
  "SYRIAN ARAB REPUBLIC": "SY",
  "TAIWAN, PROVINCE OF CHINA": "TW",
  "TAJIKISTAN": "TJ",
  "TANZANIA, UNITED REPUBLIC OF": "TZ",
  "THAILAND": "TH",
  "TIMOR-LESTE": "TL",
  "TOGO": "TG",
  "TOKELAU": "TK",
  "TONGA": "TO",
  "TRINIDAD AND TOBAGO": "TT",
  "TUNISIA": "TN",
  "TÜRKIYE": "TR",
  "TURKMENISTAN": "TM",
  "TURKS AND CAICOS ISLANDS": "TC",
  "TUVALU": "TV",
  "UGANDA": "UG",
  "UKRAINE": "UA",
  "UNITED ARAB EMIRATES": "AE",
  "UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND": "GB",
  "UNITED STATES OF AMERICA": "US",
  "UNITED STATES MINOR OUTLYING ISLANDS": "UM",
  "URUGUAY": "UY",
  "UZBEKISTAN": "UZ",
  "VANUATU": "VU",
  "VENEZUELA, BOLIVARIAN REPUBLIC OF": "VE",
  "VIET NAM": "VN",
  "VIRGIN ISLANDS (BRITISH)": "VG",
  "VIRGIN ISLANDS (U.S.)": "VI",
  "WALLIS AND FUTUNA": "WF",
  "WESTERN SAHARA": "EH",
  "YEMEN": "YE",
  "ZAMBIA": "ZM",
  "ZIMBABWE": "ZW",
};

// Alias courants (FR + variantes anglaises usuelles) -> alpha-2
// Volontairement non exhaustif : complète les 249 noms officiels ISO déjà couverts ci-dessus.
const FR_ALIASES = {
  ALLEMAGNE:"DE", AUTRICHE:"AT", BELGIQUE:"BE", ESPAGNE:"ES", ITALIE:"IT",
  "PAYS-BAS":"NL", PAYSBAS:"NL", HOLLANDE:"NL", POLOGNE:"PL",
  "ROYAUME-UNI":"GB", ROYAUMEUNI:"GB", "GRANDE-BRETAGNE":"GB", GRANDEBRETAGNE:"GB",
  ANGLETERRE:"GB", ECOSSE:"GB", "PAYS DE GALLES":"GB", "IRLANDE DU NORD":"GB", UK:"GB",
  SUISSE:"CH", DANEMARK:"DK", SUEDE:"SE", NORVEGE:"NO", FINLANDE:"FI", IRLANDE:"IE",
  GRECE:"GR", "REPUBLIQUE TCHEQUE":"CZ", REPUBLIQUETCHEQUE:"CZ", TCHEQUIE:"CZ",
  "CZECH REPUBLIC":"CZ", SLOVAQUIE:"SK", HONGRIE:"HU", ROUMANIE:"RO", BULGARIE:"BG",
  CROATIE:"HR", SLOVENIE:"SI", ESTONIE:"EE", LETTONIE:"LV", LITUANIE:"LT",
  MALTE:"MT", CHYPRE:"CY", ISLANDE:"IS",
  "ETATS-UNIS":"US", ETATSUNIS:"US", "ETATS UNIS":"US", USA:"US",
  MEXIQUE:"MX", BRESIL:"BR", CHINE:"CN", JAPON:"JP", INDE:"IN",
  RUSSIE:"RU", RUSSIA:"RU", TURQUIE:"TR", TURKEY:"TR",
  MAROC:"MA", ALGERIE:"DZ", TUNISIE:"TN", EGYPTE:"EG", "AFRIQUE DU SUD":"ZA",
  "COREE DU SUD":"KR", "SOUTH KOREA":"KR", "COREE DU NORD":"KP", "NORTH KOREA":"KP",
  VIETNAM:"VN", THAILANDE:"TH", INDONESIE:"ID", "ARABIE SAOUDITE":"SA",
  "EMIRATS ARABES UNIS":"AE", UAE:"AE",
  "RD CONGO":"CD", "CONGO KINSHASA":"CD", "CONGO-KINSHASA":"CD",
  "CONGO BRAZZAVILLE":"CG", "CONGO-BRAZZAVILLE":"CG",
  "COTE D IVOIRE":"CI", "COTE D'IVOIRE":"CI", "IVORY COAST":"CI",
  BIRMANIE:"MM", BURMA:"MM", MOLDAVIE:"MD", MACEDOINE:"MK", VATICAN:"VA",
  "CAP VERT":"CV", "CAP-VERT":"CV", CAPVERT:"CV", SYRIE:"SY", LAOS:"LA",
};

// Sous-ensemble Europe (hors Russie/Turquie) pour l'auto-détection du cadrage de la carte
const EUROPE_A2 = new Set(["AD","AL","AT","BA","BE","BG","BY","CH","CY","CZ","DE","DK",
  "EE","ES","FI","FO","FR","GB","GG","GI","GR","HR","HU","IE","IM","IS","IT","JE",
  "LI","LT","LU","LV","MC","MD","ME","MK","MT","NL","NO","PL","PT","RO","RS","SE",
  "SI","SK","SM","UA","VA"]);

// Noms d'affichage en français (Europe) pour les labels sur la carte
const A2_TO_FR = {
  AD:"Andorre", AL:"Albanie", AT:"Autriche", BA:"Bosnie-Herzégovine", BE:"Belgique",
  BG:"Bulgarie", BY:"Biélorussie", CH:"Suisse", CY:"Chypre", CZ:"Tchéquie",
  DE:"Allemagne", DK:"Danemark", EE:"Estonie", ES:"Espagne", FI:"Finlande",
  FO:"Îles Féroé", FR:"France", GB:"Royaume-Uni", GG:"Guernesey", GI:"Gibraltar",
  GR:"Grèce", HR:"Croatie", HU:"Hongrie", IE:"Irlande", IM:"Île de Man",
  IS:"Islande", IT:"Italie", JE:"Jersey", LI:"Liechtenstein", LT:"Lituanie",
  LU:"Luxembourg", LV:"Lettonie", MC:"Monaco", MD:"Moldavie", ME:"Monténégro",
  MK:"Macédoine du Nord", MT:"Malte", NL:"Pays-Bas", NO:"Norvège", PL:"Pologne",
  PT:"Portugal", RO:"Roumanie", RS:"Serbie", SE:"Suède", SI:"Slovénie",
  SK:"Slovaquie", SM:"Saint-Marin", UA:"Ukraine", VA:"Vatican",
  RU:"Russie", TR:"Turquie", US:"États-Unis", CN:"Chine", JP:"Japon",
  IN:"Inde", BR:"Brésil", CA:"Canada", MX:"Mexique", MA:"Maroc", DZ:"Algérie",
  TN:"Tunisie", EG:"Égypte", ZA:"Afrique du Sud",
};
function displayCountryName(a2, feature){
  return A2_TO_FR[a2] || (feature&&feature.properties&&feature.properties.name) || a2 || "";
}

function stripAccents(s){
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function normKey(s){
  return stripAccents(s).toUpperCase().trim();
}
function toAlpha2(raw){
  if(raw===null||raw===undefined||raw==="") return null;
  const k=normKey(raw);
  if(/^[A-Z]{2}$/.test(k) && ISO2_TO_NUM[k]) return k;
  if(ISO_NAME_TO_A2[k]) return ISO_NAME_TO_A2[k];
  if(FR_ALIASES[k]) return FR_ALIASES[k];
  return null;
}

let _topoPromise=null;
function loadWorldFeatures(){
  if(_topoPromise) return _topoPromise;
  _topoPromise=fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
    .then(function(r){ return r.json(); })
    .then(function(topo){
      const feats=window.ChartGeo.topojson.feature(topo,topo.objects.countries).features;
      return feats;
    })
    .catch(function(e){ _topoPromise=null; throw e; });
  return _topoPromise;
}

function gradientShade(baseHex,t){
  // t=0 -> presque blanc, t=1 -> couleur pleine
  const hex=(baseHex&&baseHex[0]==="#")?baseHex:"#4a7fa5";
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  const f=0.32+t*0.68;
  const nr=Math.round(255-(255-r)*f), ng=Math.round(255-(255-g)*f), nb=Math.round(255-(255-b)*f);
  return "rgb("+nr+","+ng+","+nb+")";
}

const GEO_NODATA_COLOR="#e7ecf2";

// Classification exposée à l'app (le Tuning s'en sert pour n'afficher le
// réglage « Codes postaux » que si la colonne en contient réellement).
export { classifyGeoLabels };

/* ============================================================================
 * Jeux de couleurs (dégradés séquentiels clair → foncé)
 * w.geoPalette : 'ambre' (défaut) | 'ocean' | 'chaleur' | 'emeraude' | 'violet'
 *                | 'rose' | 'perso' (dégradé monochrome basé sur w.color)
 * ========================================================================= */
export const GEO_PALETTES={
  ambre:    { label:"Ambre",     stops:["#fdf3df","#f7ca77","#EF9F27","#8a4d0a"] },
  ocean:    { label:"Océan",     stops:["#eaf3fb","#a8c9e4","#4a7fa5","#16324a"] },
  chaleur:  { label:"Chaleur",   stops:["#fff6d8","#f9b64e","#e2622f","#7f1d1d"] },
  emeraude: { label:"Émeraude",  stops:["#e8f7ef","#8fd6b1","#1D9E75","#0b4636"] },
  violet:   { label:"Violet",    stops:["#f1effc","#bcb2ee","#7F77DD","#372e7a"] },
  rose:     { label:"Rose",      stops:["#fdeef4","#f2a9c4","#D4537E","#7a1f41"] },
};

function hexToRgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
function rampColor(stops,t){
  t=Math.max(0,Math.min(1,t));
  const n=stops.length-1, seg=Math.min(n-0.000001,t*n);
  const i=Math.floor(seg), f=seg-i;
  const a=hexToRgb(stops[i]), b=hexToRgb(stops[i+1]);
  return "rgb("+Math.round(a[0]+(b[0]-a[0])*f)+","+Math.round(a[1]+(b[1]-a[1])*f)+","+Math.round(a[2]+(b[2]-a[2])*f)+")";
}
// Renvoie {fill(t), cssGradient} selon la palette du widget
function geoColorScheme(w){
  const baseColor=(w.color&&w.color[0]==="#")?w.color:"#4a7fa5";
  const pal=(w.geoPalette&&w.geoPalette!=="perso")?(GEO_PALETTES[w.geoPalette]||GEO_PALETTES.ambre):null;
  if(!w.geoPalette) return schemeFromPalette(GEO_PALETTES.ambre);       // défaut
  if(pal) return schemeFromPalette(pal);
  return {                                                              // 'perso'
    fill:function(t){ return gradientShade(baseColor,Math.max(0.12,t)); },
    cssGradient:"linear-gradient(90deg,"+gradientShade(baseColor,0.12)+","+gradientShade(baseColor,1)+")"
  };
}
function schemeFromPalette(pal){
  return {
    fill:function(t){ return rampColor(pal.stops,0.08+t*0.92); },
    cssGradient:"linear-gradient(90deg,"+pal.stops.join(",")+")"
  };
}

/* ============================================================================
 * Moteur de rendu SVG — carte dynamique FlowPilot
 * 4 niveaux géographiques, détectés automatiquement sur la colonne :
 *   - pays (FR, "Allemagne", "Spain"…)            → choroplèthe pays
 *   - codes postaux français (75001, 2A, 971…)    → choroplèthe départements
 *   - codes postaux européens (10115, SW1A, 00-950…) → bulles par zone postale
 *   - villes (Paris, Lyon, Berlin…)               → bulles proportionnelles
 * Zoom cinématique à l'ouverture, survol + tooltip, zoom molette / pan / boutons.
 * ========================================================================= */

const D2R=Math.PI/180;
function projX(lon){ return lon*D2R; }
function projY(lat){ const l=Math.max(-84,Math.min(84,lat))*D2R; return -Math.log(Math.tan(Math.PI/4+l/2)); }

function featureRings(f){
  const g=f&&f.geometry; if(!g) return [];
  if(g.type==="Polygon") return g.coordinates;
  if(g.type==="MultiPolygon"){
    const out=[]; g.coordinates.forEach(function(p){ p.forEach(function(r){ out.push(r); }); });
    return out;
  }
  return [];
}

// Bornes en coordonnées Mercator, avec fenêtre de clip [lonMin,latMin,lonMax,latMax]
function mercBounds(features, clip){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,found=false;
  features.forEach(function(f){
    featureRings(f).forEach(function(ring){
      ring.forEach(function(pt){
        const lon=pt[0],lat=pt[1];
        if(clip&&(lon<clip[0]||lat<clip[1]||lon>clip[2]||lat>clip[3])) return;
        const x=projX(lon),y=projY(lat);
        if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y;
        found=true;
      });
    });
  });
  if(!found) return mercBounds(features,null);
  return [x0,y0,x1,y1];
}
function pointMercBounds(points){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  points.forEach(function(p){
    const x=projX(p.lon),y=projY(p.lat);
    if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y;
  });
  return [x0,y0,x1,y1];
}

function expandBounds(b,f){
  const dx=(b[2]-b[0])*f, dy=(b[3]-b[1])*f;
  return [b[0]-dx,b[1]-dy,b[2]+dx,b[3]+dy];
}
function ensureSpan(b,minX,minY){
  let x0=b[0],y0=b[1],x1=b[2],y1=b[3];
  if(x1-x0<minX){ const c=(x0+x1)/2; x0=c-minX/2; x1=c+minX/2; }
  if(y1-y0<minY){ const c=(y0+y1)/2; y0=c-minY/2; y1=c+minY/2; }
  return [x0,y0,x1,y1];
}
// Fenêtres de cadrage (w.geoScope) : [lonMin,latMin,lonMax,latMax]
const SCOPE_WINDOWS={europe:[-25,34,35,72],world:[-179.9,-56,179.9,84]};
const COUNTRY_WINDOWS={
  FR:[-5.5,41.2,9.9,51.3], BE:[2.4,49.4,6.6,51.7], CH:[5.8,45.7,10.7,47.9],
  DE:[5.7,47.1,15.2,55.2], ES:[-9.5,35.8,4.5,44.0], IT:[6.5,36.4,18.7,47.3],
  NL:[3.1,50.6,7.4,53.7], PT:[-9.7,36.8,-6.0,42.3], PL:[14.0,48.9,24.3,55.1],
  AT:[9.4,46.2,17.3,49.2], LU:[5.6,49.3,6.7,50.3], GB:[-8.3,49.8,1.9,58.9],
  IE:[-10.6,51.3,-5.8,55.5], DK:[7.9,54.4,13.0,57.9], NO:[4.4,57.8,31.3,71.3],
  SE:[10.9,55.2,24.3,69.2], FI:[20.4,59.6,31.7,70.2], CZ:[11.9,48.4,19.0,51.2],
  HU:[16.0,45.6,23.0,48.7], SI:[13.2,45.3,16.7,47.0],
};
function normScope(scope){ return scope==="france"?"FR":(scope||"auto"); }
function scopeWindowFor(scope){
  scope=normScope(scope);
  return SCOPE_WINDOWS[scope]||COUNTRY_WINDOWS[scope]||null;
}
function windowMerc(win){
  return [projX(win[0]),projY(win[3]),projX(win[2]),projY(win[1])];
}

function fitTransform(b,w,h,pad){
  const dx=b[2]-b[0]||1e-9, dy=b[3]-b[1]||1e-9;
  const s=Math.min((w-pad*2)/dx,(h-pad*2)/dy);
  return { s:s, tx:(w-s*(b[0]+b[2]))/2, ty:(h-s*(b[1]+b[3]))/2 };
}

// Chemin SVG « cuit » dans le repère écran du cadrage de base.
// Les segments qui traversent l'antiméridien (saut de longitude > 180°) sont
// coupés en sous-chemins pour éviter les traînées horizontales sur la vue Monde.
function buildPath(f,s,tx,ty){
  let d="";
  featureRings(f).forEach(function(ring){
    let prevLon=null;
    for(let i=0;i<ring.length;i++){
      const lon=ring[i][0];
      const x=(projX(lon)*s+tx).toFixed(2);
      const y=(projY(ring[i][1])*s+ty).toFixed(2);
      const jump=prevLon!==null&&Math.abs(lon-prevLon)>180;
      d+=((i===0||jump)?"M":"L")+x+","+y;
      prevLon=lon;
    }
    d+="Z";
  });
  return d;
}

// Centroïde + bbox du plus grand anneau (écran) : évite que la Guyane ne
// déplace le label « France », que le Svalbard ne déplace « Norvège », etc.
function largestRingInfo(f,s,tx,ty){
  let best=null,bestArea=0;
  featureRings(f).forEach(function(ring){
    let a=0,cx=0,cy=0,minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    const pts=ring.map(function(pt){
      const x=projX(pt[0])*s+tx, y=projY(pt[1])*s+ty;
      if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y;
      return [x,y];
    });
    for(let i=0,n=pts.length;i<n;i++){
      const p=pts[i],q=pts[(i+1)%n];
      const cross=p[0]*q[1]-q[0]*p[1];
      a+=cross; cx+=(p[0]+q[0])*cross; cy+=(p[1]+q[1])*cross;
    }
    a/=2;
    const absA=Math.abs(a);
    if(absA>bestArea&&absA>1e-6){
      bestArea=absA;
      best={cx:cx/(6*a),cy:cy/(6*a),bw:maxx-minx,bh:maxy-miny};
    }
  });
  return best;
}

function easeInOutCubic(t){ return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; }
function easeOutCubic(t){ return 1-Math.pow(1-t,3); }

/* ── Détection du niveau géographique ─────────────────────────────────── */

function looksLikeCp(s){
  s=String(s).trim().toUpperCase();
  if(/^[0-9]{4,5}$/.test(s)) return true;                                  // FR/DE/ES/IT/BE/CH/AT…
  if(/^[0-9]{2}-[0-9]{3}$/.test(s)) return true;                           // PL
  if(/^[0-9]{4}-[0-9]{3}$/.test(s)) return true;                           // PT
  if(/^[0-9]{4} ?[A-Z]{2}$/.test(s)) return true;                          // NL
  if(/^[A-Z]{1,2}[0-9][0-9A-Z]?( ?[0-9][A-Z]{2})?$/.test(s)) return true;  // GB
  if(/^2[AB]$/.test(s)) return true;                                       // Corse
  if(/^[0-9]{2,3}$/.test(s)) return true;                                  // n° de département
  return false;
}

function classifyGeoLabels(rawLabels){
  let country=0,cp=0,other=0;
  rawLabels.forEach(function(l){
    if(l==null) return;
    const s=String(l).trim();
    if(!s) return;
    if(looksLikeCp(s)) cp++;
    else if(toAlpha2(s)) country++;
    else other++;
  });
  if(cp>country&&cp>=other&&cp>0) return "cp";
  if(country>=other&&country>0) return "country";
  if(other>0) return "city";
  return "country";
}

// Pays des codes postaux : format distinctif quand c'est possible, sinon le
// choix du Tuning (w.geoCpCountry), sinon FR (5 chiffres) / BE (4 chiffres).
function detectCpCountry(rawLabels, forced){
  if(forced&&forced!=="auto") return forced;
  let gb=0,nl=0,pl=0,pt=0,d5=0,d4=0,dept=0;
  rawLabels.forEach(function(l){
    if(l==null) return;
    const s=String(l).trim().toUpperCase();
    if(!s) return;
    if(/^[A-Z]{1,2}[0-9]/.test(s)) gb++;
    else if(/^[0-9]{4} ?[A-Z]{2}$/.test(s)) nl++;
    else if(/^[0-9]{2}-[0-9]{3}$/.test(s)) pl++;
    else if(/^[0-9]{4}-[0-9]{3}$/.test(s)) pt++;
    else if(/^[0-9]{5}$/.test(s)) d5++;
    else if(/^[0-9]{4}$/.test(s)) d4++;
    else if(/^2[AB]$/.test(s)||/^[0-9]{2,3}$/.test(s)) dept++;
  });
  const m=Math.max(gb,nl,pl,pt,d5,d4,dept);
  if(!m) return "FR";
  if(m===gb) return "GB";
  if(m===nl) return "NL";
  if(m===pl) return "PL";
  if(m===pt) return "PT";
  if(m===dept||m===d5) return "FR";
  return "BE";
}

function cpToDept(s){
  s=String(s).trim().toUpperCase();
  if(/^2[AB]$/.test(s)) return s;
  if(/^[0-9]{2}$/.test(s)) return s==="20"?null:s;
  if(/^[0-9]{3}$/.test(s)) return /^97[1-6]$/.test(s)?s:null;
  if(/^[0-9]{5}$/.test(s)){
    const p2=s.slice(0,2);
    if(p2==="20") return parseInt(s,10)<20200?"2A":"2B";
    if(/^97[1-6]/.test(s)) return s.slice(0,3);
    return p2;
  }
  return null;
}

// Normalisation des noms de villes (accents, tirets, St/Ste)
function fpgeoNorm(s){
  s=String(s).normalize("NFD");
  let out="";
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    if(c<768||c>879) out+=s.charAt(i);
  }
  return out.toUpperCase().replace(/[^A-Z0-9]/g,"");
}
function placeKeyVariants(k){
  const v=[k];
  if(k.slice(0,6)==="SAINTE"||k.slice(0,5)==="SAINT"){ /* déjà complet */ }
  else if(k.slice(0,3)==="STE") v.push("SAINTE"+k.slice(3));
  else if(k.slice(0,2)==="ST") v.push("SAINT"+k.slice(2));
  return v;
}

/* ── Chargement des données (relatif à l'app, repli sur flwpilot.com) ──── */

function fetchJsonWithFallback(rel){
  return fetch(rel)
    .then(function(r){ if(!r.ok) throw 0; return r.json(); })
    .catch(function(){
      return fetch("https://www.flwpilot.com/studio/"+rel)
        .then(function(r){ if(!r.ok) throw 0; return r.json(); });
    });
}

let _deptPromise=null;
function loadDeptFeatures(){
  if(_deptPromise) return _deptPromise;
  _deptPromise=fetchJsonWithFallback("widgets/geo-departements.json")
    .then(function(fc){ return fc.features; })
    .catch(function(e){ _deptPromise=null; throw e; });
  return _deptPromise;
}

let _placesPromise=null;
function loadPlaces(){
  if(_placesPromise) return _placesPromise;
  _placesPromise=fetchJsonWithFallback("widgets/geo-places.json")
    .then(function(data){
      const map={};
      data.cities.forEach(function(c,i){
        const k=fpgeoNorm(c[0]);
        if(!(k in map)) map[k]=i;
      });
      if(data.aliases) Object.keys(data.aliases).forEach(function(k){
        if(!(k in map)) map[k]=data.aliases[k];
      });
      return {
        find:function(raw){
          const vars=placeKeyVariants(fpgeoNorm(raw));
          for(let i=0;i<vars.length;i++){
            const idx=map[vars[i]];
            if(idx!==undefined) return data.cities[idx];
          }
          return null;
        }
      };
    })
    .catch(function(e){ _placesPromise=null; throw e; });
  return _placesPromise;
}

let _pcPromise=null;
function loadPostcodes(){
  if(_pcPromise) return _pcPromise;
  _pcPromise=fetchJsonWithFallback("widgets/geo-postcodes.json")
    .catch(function(e){ _pcPromise=null; throw e; });
  return _pcPromise;
}

// Découpages administratifs internes (régions / Länder / provinces… — NUTS Eurostat)
let _regionsPromise=null;
function loadRegions(){
  if(_regionsPromise) return _regionsPromise;
  _regionsPromise=fetchJsonWithFallback("widgets/geo-regions.json")
    .catch(function(e){ _regionsPromise=null; throw e; });
  return _regionsPromise;
}

function worldContext(world,excludeCC){
  return world.filter(function(f){
    const a2=NUM_TO_A2[String(f.id)];
    return a2!=="AQ"&&(!excludeCC||a2!==excludeCC);
  });
}

// Attache le fond du pays « focus » : ses régions internes en base + le reste du monde en contexte
function withFocusBg(prep, focusCC, world){
  if(!focusCC){
    prep.context=worldContext(world,null);
    prep.base=prep.base||[];
    prep.baseCls=prep.baseCls||"fpgeo-region";
    return Promise.resolve(prep);
  }
  const bgP=focusCC==="FR"
    ? loadDeptFeatures()
    : loadRegions().then(function(R){
        const fc=R.countries&&R.countries[focusCC];
        if(!fc) throw 0;
        return fc.features;
      });
  return bgP.then(function(fs){
    prep.base=fs; prep.baseCls="fpgeo-region"; prep.context=worldContext(world,focusCC);
    return prep;
  }).catch(function(){
    prep.base=[]; prep.baseCls="fpgeo-region"; prep.context=worldContext(world,null);
    return prep;
  });
}

/* ── Préparation des scènes ───────────────────────────────────────────── */

function aggInto(byKey,key,label,value){
  if(byKey[key]){ byKey[key].value+=(+value||0); byKey[key].labels.push(String(label)); }
  else byKey[key]={label:label,value:(+value||0),labels:[String(label)]};
}

function prepCountry(w,features,rawLabels,rawValues){
  const byA2={}; const unmatched=[];
  rawLabels.forEach(function(lbl,i){
    const a2=toAlpha2(lbl);
    if(a2) aggInto(byA2,a2,lbl,rawValues[i]);
    else if(lbl!=null&&String(lbl).trim()!=="") unmatched.push(String(lbl));
  });
  const matched=Object.keys(byA2);
  if(!matched.length) return {error:"Aucun pays reconnu dans cette colonne"};

  let scope=normScope(w.geoScope);
  if(scope==="auto") scope=matched.every(function(a2){return EUROPE_A2.has(a2);})?"europe":"world";
  else if(scope!=="world"&&scope!=="europe") scope=COUNTRY_WINDOWS[scope]?"europe":"world"; // zone pays -> contexte Europe
  const featureSet=scope==="europe"
    ? features.filter(function(f){ const a2=NUM_TO_A2[String(f.id)]; return a2&&EUROPE_A2.has(a2); })
    : features.filter(function(f){ return NUM_TO_A2[String(f.id)]!=="AQ"; });

  const entries=[]; const seen={};
  featureSet.forEach(function(f){
    const a2=NUM_TO_A2[String(f.id)];
    const m=a2?byA2[a2]:null;
    if(m){ entries.push({key:a2,feature:f,value:m.value,name:displayCountryName(a2,f),labels:m.labels}); seen[a2]=1; }
  });
  matched.forEach(function(a2){ if(!seen[a2]) unmatched.push(byA2[a2].label+" (non affichable)"); });
  if(!entries.length) return {error:"Aucun pays affichable dans cette colonne"};

  return {kind:"choro",base:featureSet,baseCls:"fpgeo-land",context:[],entries:entries,
    clip:scope==="europe"?[-25,34,35,72]:[-179.9,-56,179.9,84],unmatched:unmatched};
}

function prepDept(w,features,rawLabels,rawValues){
  const byKey={}; const unmatched=[];
  rawLabels.forEach(function(lbl,i){
    const k=lbl!=null?cpToDept(lbl):null;
    if(k) aggInto(byKey,k,lbl,rawValues[i]);
    else if(lbl!=null&&String(lbl).trim()!=="") unmatched.push(String(lbl));
  });
  if(!Object.keys(byKey).length) return {error:"Aucun code postal français reconnu"};

  const entries=[]; const seen={};
  features.forEach(function(f){
    const code=f.properties&&f.properties.code;
    const m=code?byKey[code]:null;
    if(m){ entries.push({key:code,feature:f,value:m.value,name:(f.properties.nom||code)+" ("+code+")",labels:m.labels}); seen[code]=1; }
  });
  Object.keys(byKey).forEach(function(k){ if(!seen[k]) unmatched.push(byKey[k].label+" (hors métropole)"); });
  if(!entries.length) return {error:"Aucun département métropolitain reconnu"};

  return {kind:"choro",base:features,baseCls:"fpgeo-region",context:[],entries:entries,clip:null,unmatched:unmatched};
}

function prepCpZones(w,cc,pcData,rawLabels,rawValues){
  const C=pcData.countries&&pcData.countries[cc];
  if(!C) return {error:"Codes postaux « "+cc+" » non couverts"};
  const byKey={}; const unmatched=[];
  rawLabels.forEach(function(lbl,i){
    if(lbl==null||String(lbl).trim()==="") return;
    const s=String(lbl).trim().toUpperCase();
    let key=null;
    if(C.rule==="alpha"){
      const m=s.match(/^([A-Z]{1,2})[0-9]/);
      if(m&&C.zones[m[1]]) key=m[1]; else if(m&&C.zones[m[1].charAt(0)]) key=m[1].charAt(0);
    } else {
      const d=s.replace(/[^0-9]/g,"");
      if(d.length>=2&&C.zones[d.slice(0,2)]) key=d.slice(0,2);
    }
    if(key) aggInto(byKey,key,lbl,rawValues[i]);
    else unmatched.push(String(lbl));
  });
  const keys=Object.keys(byKey);
  if(!keys.length) return {error:"Aucune zone postale reconnue ("+cc+")"};

  const points=keys.map(function(k){
    const z=C.zones[k];
    return {key:k,name:"Zone "+k,lat:z[0],lon:z[1],value:byKey[k].value,labels:byKey[k].labels};
  });
  return {kind:"points",points:points,clip:null,unmatched:unmatched};
}

function prepCity(w,places,rawLabels,rawValues){
  const byKey={}; const meta={}; const unmatched=[];
  rawLabels.forEach(function(lbl,i){
    if(lbl==null||String(lbl).trim()==="") return;
    const c=places.find(lbl);
    if(c){
      const k=fpgeoNorm(c[0]);
      aggInto(byKey,k,String(lbl),rawValues[i]);
      if(!meta[k]) meta[k]={name:String(lbl),lat:c[1],lon:c[2],cc:c[3]};
    } else unmatched.push(String(lbl));
  });
  const keys=Object.keys(byKey);
  if(!keys.length) return {error:"Aucune ville reconnue dans cette colonne"};

  const points=keys.map(function(k){
    return {key:k,name:meta[k].name,lat:meta[k].lat,lon:meta[k].lon,value:byKey[k].value,labels:byKey[k].labels};
  });
  let cc=null;
  if(keys.length&&keys.every(function(k){ return meta[k].cc===meta[keys[0]].cc; })) cc=meta[keys[0]].cc;
  return {kind:"points",points:points,cc:cc,clip:null,unmatched:unmatched};
}

/* ── Détail par catégorie (carte à camemberts) ────────────────────────── */

const GEO_CAT_COLORS=["#EF9F27","#4a7fa5","#1D9E75","#7F77DD","#D85A30","#D4537E","#38bdf8","#85BC25"];
const GEO_CAT_OTHER="#9aa7b6";
function geoCatColor(cat,ci){ return cat==="Autres"?GEO_CAT_OTHER:GEO_CAT_COLORS[ci%GEO_CAT_COLORS.length]; }

// Secteur annulaire (camembert troué), centré sur l'origine
function geoArcPath(r0,r1,a0,a1){
  if(a1-a0>=Math.PI*2) a1=a0+Math.PI*2-0.0001;
  const large=(a1-a0)>Math.PI?1:0;
  const x0=r1*Math.cos(a0),y0=r1*Math.sin(a0),x1=r1*Math.cos(a1),y1=r1*Math.sin(a1);
  const xi0=r0*Math.cos(a1),yi0=r0*Math.sin(a1),xi1=r0*Math.cos(a0),yi1=r0*Math.sin(a0);
  return "M"+x0.toFixed(2)+","+y0.toFixed(2)
    +"A"+r1.toFixed(2)+","+r1.toFixed(2)+" 0 "+large+" 1 "+x1.toFixed(2)+","+y1.toFixed(2)
    +"L"+xi0.toFixed(2)+","+yi0.toFixed(2)
    +"A"+r0.toFixed(2)+","+r0.toFixed(2)+" 0 "+large+" 0 "+xi1.toFixed(2)+","+yi1.toFixed(2)+"Z";
}

// Fusionne le détail catégoriel de tous les libellés bruts rattachés à un lieu
function geoBdFor(bd,labels){
  const vals={}; let total=0;
  (labels||[]).forEach(function(l){
    const m=bd.byPlace[l]; if(!m) return;
    Object.keys(m).forEach(function(c){ vals[c]=(vals[c]||0)+m[c]; total+=m[c]; });
  });
  return {vals:vals,total:total};
}

/* ── CSS injecté ──────────────────────────────────────────────────────── */

function fpgeoInjectCSS(){
  if(document.getElementById("fpgeo-style")) return;
  const st=document.createElement("style");
  st.id="fpgeo-style";
  st.textContent=[
    '.fpgeo-stage{position:relative;flex:1;min-height:110px;overflow:hidden;border-radius:12px;cursor:grab;',
    ' background:radial-gradient(130% 100% at 28% 8%,rgba(255,255,255,.8) 0%,rgba(255,255,255,0) 55%),linear-gradient(160deg,#d9e8f9 0%,#c2d8f0 55%,#b1cbe8 100%);',
    ' box-shadow:inset 0 0 0 1px rgba(13,27,42,.08)}',
    '.fpgeo-stage.fpgeo-drag{cursor:grabbing}',
    '.fpgeo-svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.fpgeo-land{fill:#e6e9ee;stroke:#8ea3ba;stroke-width:.7;vector-effect:non-scaling-stroke;transition:filter .15s ease}',
    '.fpgeo-land:hover{filter:brightness(1.05)}',
    '.fpgeo-region{fill:#f6f8fb;stroke:#a3b5ca;stroke-width:.65;vector-effect:non-scaling-stroke;transition:filter .15s ease}',
    '.fpgeo-region:hover{filter:brightness(1.03) saturate(1.05)}',
    '.fpgeo-c{stroke:#fff;stroke-width:1;vector-effect:non-scaling-stroke;cursor:pointer;transition:filter .18s ease,opacity .5s ease}',
    '.fpgeo-data.fpgeo-hovering .fpgeo-c:not(.fpgeo-hover){opacity:.72}',
    '.fpgeo-c.fpgeo-hover{filter:brightness(1.1) saturate(1.08);stroke-width:1.8}',
    '.fpgeo-ptg{cursor:pointer}',
    '.fpgeo-ptw.fpgeo-hovering .fpgeo-ptg:not(.fpgeo-hover){opacity:.5}',
    '.fpgeo-ptg{transition:opacity .3s ease}',
    '.fpgeo-pt{stroke:#fff;stroke-width:1.6;transition:filter .18s ease}',
    '.fpgeo-ptg.fpgeo-hover .fpgeo-pt{filter:brightness(1.12) saturate(1.1)}',
    '.fpgeo-bub{transition:transform .55s cubic-bezier(.34,1.56,.64,1)}',
    '.fpgeo-lblg{pointer-events:none;transition:opacity .45s ease}',
    ".fpgeo-lbl-name{font-family:'DM Sans',Arial,sans-serif;font-weight:700;fill:#132A3A;paint-order:stroke;stroke:rgba(255,255,255,.88);stroke-width:3px;stroke-linejoin:round}",
    ".fpgeo-lbl-val{font-family:'Barlow Condensed','DM Sans',Arial,sans-serif;font-weight:800;fill:#0D1B2A;paint-order:stroke;stroke:rgba(255,255,255,.92);stroke-width:3.4px;stroke-linejoin:round;letter-spacing:.02em}",
    ".fpgeo-ptlbl-name{font-family:'DM Sans',Arial,sans-serif;font-weight:700;font-size:10px;fill:#132A3A;paint-order:stroke;stroke:rgba(255,255,255,.9);stroke-width:3px;stroke-linejoin:round;pointer-events:none}",
    ".fpgeo-ptlbl-val{font-family:'Barlow Condensed','DM Sans',Arial,sans-serif;font-weight:800;fill:#fff;pointer-events:none}",
    ".fpgeo-ptlbl-vald{font-family:'Barlow Condensed','DM Sans',Arial,sans-serif;font-weight:800;fill:#13293a;pointer-events:none}",
    '.fpgeo-ctrls{position:absolute;top:8px;right:8px;display:flex;flex-direction:column;gap:4px;opacity:0;transition:opacity .25s ease;z-index:3}',
    '.fpgeo-stage:hover .fpgeo-ctrls{opacity:1}',
    '.fpgeo-btn{width:26px;height:26px;border-radius:8px;border:1px solid rgba(13,27,42,.08);background:rgba(255,255,255,.92);backdrop-filter:blur(4px);color:#31465c;font-size:14px;font-weight:700;line-height:1;display:grid;place-items:center;cursor:pointer;box-shadow:0 2px 6px rgba(13,27,42,.10);transition:background .15s,transform .12s;padding:0}',
    '.fpgeo-btn:hover{background:#fff;transform:translateY(-1px)}',
    '.fpgeo-btn:active{transform:translateY(0) scale(.96)}',
    ".fpgeo-tip{position:absolute;pointer-events:none;z-index:4;min-width:110px;max-width:220px;background:rgba(13,27,42,.94);color:#fff;border-radius:10px;padding:8px 11px;font-family:'DM Sans',Arial,sans-serif;opacity:0;transform:translateY(4px);transition:opacity .15s ease,transform .15s ease;box-shadow:0 8px 22px rgba(13,27,42,.35)}",
    '.fpgeo-tip.fpgeo-tip-on{opacity:1;transform:translateY(0)}',
    '.fpgeo-tip-name{font-size:11px;font-weight:700;letter-spacing:.02em;display:flex;align-items:center;gap:6px}',
    '.fpgeo-tip-dot{width:8px;height:8px;border-radius:99px;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.18)}',
    ".fpgeo-tip-val{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;margin-top:2px;line-height:1.05}",
    '.fpgeo-tip-sub{font-size:9.5px;color:rgba(255,255,255,.62);margin-top:3px}',
    '.fpgeo-tip-nodata{font-size:10px;color:rgba(255,255,255,.65);margin-top:2px}',
    ".fpgeo-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8ca0b3;font-size:11px;font-family:'DM Sans',Arial,sans-serif;gap:8px}",
    '.fpgeo-load::before{content:"";width:14px;height:14px;border-radius:99px;border:2px solid #d7e0ea;border-top-color:#4a7fa5;animation:fpgeo-spin .8s linear infinite}',
    '@keyframes fpgeo-spin{to{transform:rotate(360deg)}}',
    '.fpgeo-hole{fill:rgba(255,255,255,.94)}',
    '/* ── mode sombre ── */',
    'body.fp-dark .fpgeo-stage{background:radial-gradient(130% 100% at 28% 8%,rgba(120,160,210,.10) 0%,rgba(0,0,0,0) 55%),linear-gradient(160deg,#101b2b 0%,#0d1724 55%,#0a1320 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}',
    'body.fp-dark .fpgeo-land{stroke:#3e5471}',
    'body.fp-dark .fpgeo-region{fill:#243144;stroke:#4c637f}',
    'body.fp-dark .fpgeo-region:hover{filter:brightness(1.15)}',
    'body.fp-dark .fpgeo-c{stroke:#1b2735}',
    'body.fp-dark .fpgeo-lbl-name{fill:#e8eef6;stroke:rgba(10,16,26,.85)}',
    'body.fp-dark .fpgeo-lbl-val{fill:#ffffff;stroke:rgba(10,16,26,.9)}',
    'body.fp-dark .fpgeo-ptlbl-name{fill:#dce6f2;stroke:rgba(10,16,26,.85)}',
    'body.fp-dark .fpgeo-ptlbl-vald{fill:#e8eef6}',
    'body.fp-dark .fpgeo-hole{fill:rgba(21,30,42,.94)}',
    'body.fp-dark .fpgeo-btn{background:rgba(21,31,44,.92);color:#c6d4e4;border-color:rgba(255,255,255,.1)}',
    'body.fp-dark .fpgeo-btn:hover{background:#1c2938}',
    'body.fp-dark .fpgeo-load{color:#7288a0}',
    'body.fp-dark .fpgeo-load::before{border-color:#2c3e55;border-top-color:#7fa5c8}'
  ].join('\n');
  document.head.appendChild(st);
}

/* ── Point d'entrée ───────────────────────────────────────────────────── */

export function renderGeo(w, elId, rawLabels, rawValues, chartInstances, fmtNum, canvasId, breakdown){
  const el=document.getElementById(elId);
  if(!el) return;
  if(!canvasId) canvasId="cvg"+w.id.replace(/[^a-zA-Z0-9]/g,"");
  fpgeoInjectCSS();

  if(!w.col){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">🌍</div><div>Sélectionne une colonne pays, ville ou code postal</div></div>';
    return;
  }
  if(typeof window.ChartGeo==="undefined"){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">⚠️</div><div>Module carte indisponible (connexion internet requise)</div></div>';
    return;
  }

  if(chartInstances[canvasId]){ try{ chartInstances[canvasId].destroy(); }catch(e){} delete chartInstances[canvasId]; }

  // Formateur lié au widget : la carte rend en asynchrone (après chargement du
  // fond de carte), donc on fige ici le format du widget (valueFormat, décimales,
  // devise…) au lieu de dépendre de l'état global au moment du dessin.
  const fmtW=(typeof window!=="undefined"&&typeof window.fpFormatNumber==="function")
    ? function(v){ return window.fpFormatNumber(v,w); }
    : fmtNum;

  el.innerHTML='<div class="geo-wrap" style="display:flex;flex-direction:column;height:100%;gap:4px">'
    +'<div class="fpgeo-stage" id="'+canvasId+'-stage"><div class="fpgeo-load">Chargement de la carte…</div></div>'
    +'<div class="geo-legend" id="'+canvasId+'-legend" style="display:flex;align-items:center;gap:6px;font-size:9px;color:var(--muted,#8ca0b3);padding:0 4px"></div>'
    +'<div class="geo-warn" id="'+canvasId+'-warn" style="font-size:9px;color:#D85A30;padding:0 4px;display:none"></div>'
    +'</div>';

  function fail(){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">⚠️</div><div>Impossible de charger le fond de carte</div></div>';
  }
  const bd=(breakdown&&breakdown.cats&&breakdown.cats.length&&breakdown.byPlace)?breakdown:null;
  function start(geo){
    if(geo.error){
      el.innerHTML='<div class="wc-empty"><div class="we-icon">🌍</div><div>'+geo.error+'</div></div>';
      return;
    }
    geo.breakdown=bd;
    buildGeoScene(w, el, canvasId, chartInstances, fmtW, geo, 0, false);
  }

  const mode=classifyGeoLabels(rawLabels);
  const scopeCC=COUNTRY_WINDOWS[normScope(w.geoScope)]?normScope(w.geoScope):null;
  if(mode==="cp"){
    const cc=detectCpCountry(rawLabels, w.geoCpCountry);
    if(cc==="FR"){
      Promise.all([loadDeptFeatures(),loadWorldFeatures()]).then(function(res){
        const prep=prepDept(w,res[0],rawLabels,rawValues);
        if(!prep.error) prep.context=worldContext(res[1],"FR");
        start(prep);
      }).catch(fail);
    } else {
      Promise.all([loadPostcodes(),loadWorldFeatures()]).then(function(res){
        const prep=prepCpZones(w,cc,res[0],rawLabels,rawValues);
        if(prep.error) return start(prep);
        withFocusBg(prep,scopeCC||cc,res[1]).then(start);
      }).catch(fail);
    }
  } else if(mode==="city"){
    Promise.all([loadPlaces(),loadWorldFeatures()]).then(function(res){
      const prep=prepCity(w,res[0],rawLabels,rawValues);
      if(prep.error) return start(prep);
      // fond détaillé (départements / régions) du pays affiché : zone forcée ou pays unique des données
      withFocusBg(prep,scopeCC||prep.cc,res[1]).then(start);
    }).catch(fail);
  } else {
    loadWorldFeatures().then(function(features){
      start(prepCountry(w,features,rawLabels,rawValues));
    }).catch(fail);
  }
}

/* ── Construction de la scène (choroplèthe ou bulles) ─────────────────── */

function buildGeoScene(w, el, canvasId, chartInstances, fmtNum, geo, attempt, skipIntro){
  const stage=document.getElementById(canvasId+"-stage");
  if(!stage) return;
  const W=stage.clientWidth, H=stage.clientHeight;
  if((W<40||H<40)&&attempt<12){
    requestAnimationFrame(function(){ buildGeoScene(w,el,canvasId,chartInstances,fmtNum,geo,attempt+1,skipIntro); });
    return;
  }

  const isChoro=geo.kind==="choro";
  const bd=geo.breakdown||null;
  const donutMode=!!bd;
  const items=isChoro?geo.entries:geo.points;
  const values=items.map(function(it){return it.value;});
  const vmin=Math.min.apply(null,values), vmax=Math.max.apply(null,values);
  let total=0; values.forEach(function(v){ total+=(+v||0); });
  const sorted=items.slice().sort(function(a,b){return b.value-a.value;});
  const rankOf={}; sorted.forEach(function(it,i){ rankOf[it.key]=i+1; });
  const scheme=geoColorScheme(w);
  function tOf(v){ return vmax>vmin?(v-vmin)/(vmax-vmin):0.7; }

  // ---- cadrage : fenêtre forcée (w.geoScope) ou zoom auto sur les données --
  const baseFs=geo.base||[], ctxFs=geo.context||[];
  const allBg=ctxFs.length?ctxFs.concat(baseFs):baseFs;
  const fullB=mercBounds(allBg,geo.clip);
  // référence pour l'intro et les tailles mini : le pays/la zone de base si présent, sinon tout
  const refB=baseFs.length?mercBounds(baseFs,geo.clip):fullB;
  const forcedWin=scopeWindowFor(w.geoScope);
  let dataB;
  if(forcedWin){
    dataB=windowMerc(forcedWin);
  } else {
    dataB=isChoro
      ? mercBounds(items.map(function(e){return e.feature;}),geo.clip)
      : pointMercBounds(items);
    dataB=expandBounds(dataB,isChoro?0.14:0.22);
    dataB=ensureSpan(dataB,(refB[2]-refB[0])*0.16,(refB[3]-refB[1])*0.16);
  }
  const fit=fitTransform(dataB,W,H,8);
  const fitAll=fitTransform(expandBounds(refB,0.05),W,H,8);

  // ---- construction du SVG ----------------------------------------------
  const NS="http://www.w3.org/2000/svg";
  stage.innerHTML="";
  const svg=document.createElementNS(NS,"svg");
  svg.setAttribute("class","fpgeo-svg");
  svg.setAttribute("viewBox","0 0 "+W+" "+H);

  const defs=document.createElementNS(NS,"defs");
  const filt=document.createElementNS(NS,"filter");
  filt.setAttribute("id",canvasId+"-sh");
  filt.setAttribute("x","-20%");filt.setAttribute("y","-20%");
  filt.setAttribute("width","140%");filt.setAttribute("height","140%");
  const fds=document.createElementNS(NS,"feDropShadow");
  fds.setAttribute("dx","0");fds.setAttribute("dy","1.2");
  fds.setAttribute("stdDeviation","1.4");
  fds.setAttribute("flood-color","#0d1b2a");
  fds.setAttribute("flood-opacity","0.28");
  filt.appendChild(fds); defs.appendChild(filt); svg.appendChild(defs);

  const gZoom=document.createElementNS(NS,"g");
  const gLand=document.createElementNS(NS,"g");
  const gData=document.createElementNS(NS,"g");
  gData.setAttribute("class","fpgeo-data");
  if(isChoro) gData.setAttribute("filter","url(#"+canvasId+"-sh)");
  gZoom.appendChild(gLand); gZoom.appendChild(gData);
  const gPts=document.createElementNS(NS,"g");
  gPts.setAttribute("class","fpgeo-ptw");
  const gLbl=document.createElementNS(NS,"g");
  svg.appendChild(gZoom); svg.appendChild(gPts); svg.appendChild(gLbl);
  stage.appendChild(svg);

  const tip=document.createElement("div");
  tip.className="fpgeo-tip";
  stage.appendChild(tip);
  const ctrls=document.createElement("div");
  ctrls.className="fpgeo-ctrls";
  ctrls.innerHTML='<button class="fpgeo-btn" data-act="in" title="Zoomer" type="button">+</button>'
    +'<button class="fpgeo-btn" data-act="out" title="Dézoomer" type="button">–</button>'
    +'<button class="fpgeo-btn" data-act="reset" title="Vue initiale" type="button" style="font-size:12px">⟲</button>';
  stage.appendChild(ctrls);

  // ---- état zoom/pan ------------------------------------------------------
  let z={k:1,tx:0,ty:0};
  let labelsOn=false, dead=false, introRaf=0, zoomRaf=0;
  const labels=[];   // labels choroplèthe {g,x,y,bw,bh}
  const bubbles=[];  // bulles {g,circle,tName,tVal,x,y,r,rank}

  function applyView(){
    gZoom.setAttribute("transform","translate("+z.tx+" "+z.ty+") scale("+z.k+")");
    for(let i=0;i<labels.length;i++){
      const L=labels[i];
      L.g.setAttribute("transform","translate("+(L.x*z.k+z.tx)+" "+(L.y*z.k+z.ty)+")");
      const vis=labelsOn&&L.bw*z.k>=26&&L.bh*z.k>=18;
      L.g.style.opacity=vis?1:0;
    }
    const ks=Math.sqrt(z.k);
    for(let i=0;i<bubbles.length;i++){
      const B=bubbles[i];
      const r=B.r*ks;
      B.g.setAttribute("transform","translate("+(B.x*z.k+z.tx)+" "+(B.y*z.k+z.ty)+")");
      B.scaleG.setAttribute("transform","scale("+ks.toFixed(3)+")");
      const fits=B.donut
        ? B.valLen*B.fs*0.56<=B.r*0.8
        : B.valLen*B.fs*0.56<=B.r*2.1;
      const showVal=labelsOn&&r>=11&&fits;
      const showName=labelsOn&&(B.rank<=6||r>=13);
      B.tVal.style.opacity=showVal?1:0;
      B.tName.style.opacity=showName?1:0;
      B.tName.setAttribute("y",(r+11).toFixed(1));
    }
  }

  // ---- tooltip ------------------------------------------------------------
  let stageRect=null;
  function moveTip(e){
    if(!stageRect) stageRect=stage.getBoundingClientRect();
    let x=e.clientX-stageRect.left+12, y=e.clientY-stageRect.top+12;
    const tw=tip.offsetWidth||140, th=tip.offsetHeight||60;
    if(x+tw>W-4) x=e.clientX-stageRect.left-tw-12;
    if(y+th>H-4) y=e.clientY-stageRect.top-th-12;
    tip.style.left=Math.max(4,x)+"px";
    tip.style.top=Math.max(4,y)+"px";
  }
  function showTip(name,value,fill,key,e,extraHtml){
    const pct=(total>0&&isFinite(value))?(value/total*100):null;
    tip.innerHTML='<div class="fpgeo-tip-name"><span class="fpgeo-tip-dot" style="background:'+fill+'"></span>'+name+'</div>'
      +'<div class="fpgeo-tip-val">'+fmtNum(value)+'</div>'
      +(pct!=null?'<div class="fpgeo-tip-sub">'+pct.toLocaleString("fr-FR",{maximumFractionDigits:1})+' % du total · n° '+rankOf[key]+'/'+items.length+'</div>':'')
      +(extraHtml||'');
    tip.classList.add("fpgeo-tip-on");
    moveTip(e);
  }
  function bindLandTip(p,name){
    p.addEventListener("pointerenter",function(e){
      if(!name) return;
      tip.innerHTML='<div class="fpgeo-tip-name"><span class="fpgeo-tip-dot" style="background:#c7d2de"></span>'+name+'</div>'
        +'<div class="fpgeo-tip-nodata">Pas de donnée</div>';
      tip.classList.add("fpgeo-tip-on");
      moveTip(e);
    });
    p.addEventListener("pointermove",moveTip);
    p.addEventListener("pointerleave",function(){ tip.classList.remove("fpgeo-tip-on"); });
  }

  // ---- fond (contexte monde + découpage du pays) + couches de données ----
  const entryByFeature=isChoro?new Map(geo.entries.map(function(e){return [e.feature,e];})):null;
  const dataShapes=[];
  const fpDark=!!(document.body&&document.body.classList&&document.body.classList.contains("fp-dark"));
  const LAND_TINTS=fpDark?["#222f3f","#1e2a39","#1a2533"]:["#eef0f3","#e4e8ed","#dae0e8"];
  ctxFs.forEach(function(f,i){
    const d=buildPath(f,fit.s,fit.tx,fit.ty);
    if(!d) return;
    const p=document.createElementNS(NS,"path");
    p.setAttribute("d",d);
    p.setAttribute("class","fpgeo-land");
    p.style.fill=LAND_TINTS[i%3]; // teintes alternées : chaque pays se distingue
    gLand.appendChild(p);
    const a2=NUM_TO_A2[String(f.id)];
    bindLandTip(p,a2?displayCountryName(a2,f):null);
  });
  baseFs.forEach(function(f,bi){
    const entry=(entryByFeature&&!donutMode)?entryByFeature.get(f):null;
    const d=buildPath(f,fit.s,fit.tx,fit.ty);
    if(!d) return;
    const p=document.createElementNS(NS,"path");
    p.setAttribute("d",d);
    if(entry){
      const fill=scheme.fill(tOf(entry.value));
      p.setAttribute("class","fpgeo-c");
      p.setAttribute("fill",fill);
      gData.appendChild(p);
      dataShapes.push({p:p,entry:entry,fill:fill});
    } else {
      const cls=geo.baseCls||"fpgeo-land";
      p.setAttribute("class",cls);
      if(cls==="fpgeo-land") p.style.fill=LAND_TINTS[(ctxFs.length+bi)%3];
      gLand.appendChild(p);
      const a2=NUM_TO_A2[String(f.id)];
      const nm=(f.properties&&f.properties.nom)||(a2?displayCountryName(a2,f):null);
      bindLandTip(p,nm);
    }
  });

  // labels choroplèthe (nom + valeur), du plus fort au plus faible
  if(isChoro&&!donutMode){
    dataShapes.sort(function(a,b){return b.entry.value-a.entry.value;});
    dataShapes.forEach(function(s,i){
      const lb=largestRingInfo(s.entry.feature,fit.s,fit.tx,fit.ty);
      if(!lb||!isFinite(lb.cx)||!isFinite(lb.cy)) return;
      const nameSize=Math.max(9,Math.min(14,lb.bw/8));
      const valSize=nameSize+3;
      const g=document.createElementNS(NS,"g");
      g.setAttribute("class","fpgeo-lblg");
      g.style.opacity=0;
      g.style.transitionDelay=Math.min(600,i*70)+"ms";
      const tn=document.createElementNS(NS,"text");
      tn.setAttribute("class","fpgeo-lbl-name");
      tn.setAttribute("text-anchor","middle");
      tn.setAttribute("y",String(-valSize*0.55));
      tn.setAttribute("font-size",String(nameSize));
      tn.textContent=s.entry.name;
      const tv=document.createElementNS(NS,"text");
      tv.setAttribute("class","fpgeo-lbl-val");
      tv.setAttribute("text-anchor","middle");
      tv.setAttribute("y",String(nameSize*0.72));
      tv.setAttribute("font-size",String(valSize));
      tv.textContent=fmtNum(s.entry.value);
      g.appendChild(tn); g.appendChild(tv); gLbl.appendChild(g);
      labels.push({g:g,x:lb.cx,y:lb.cy,bw:lb.bw,bh:lb.bh});
    });
    dataShapes.forEach(function(s){
      s.p.addEventListener("pointerenter",function(e){
        gData.classList.add("fpgeo-hovering");
        s.p.classList.add("fpgeo-hover");
        gData.appendChild(s.p);
        showTip(s.entry.name,s.entry.value,s.fill,s.entry.key,e);
      });
      s.p.addEventListener("pointermove",moveTip);
      s.p.addEventListener("pointerleave",function(){
        gData.classList.remove("fpgeo-hovering");
        s.p.classList.remove("fpgeo-hover");
        tip.classList.remove("fpgeo-tip-on");
      });
    });
  }

  // bulles proportionnelles (villes / zones postales)
  let ptItems=null;
  if(!isChoro) ptItems=items.map(function(pt){
    return {key:pt.key,name:pt.name,value:pt.value,labels:pt.labels,
      bx:projX(pt.lon)*fit.s+fit.tx, by:projY(pt.lat)*fit.s+fit.ty};
  });
  else if(donutMode){
    // choroplèthe + détail catégoriel -> camemberts posés au centroïde de chaque zone
    ptItems=[];
    items.forEach(function(e){
      const lb=largestRingInfo(e.feature,fit.s,fit.tx,fit.ty);
      if(!lb||!isFinite(lb.cx)||!isFinite(lb.cy)) return;
      ptItems.push({key:e.key,name:e.name,value:e.value,labels:e.labels,bx:lb.cx,by:lb.cy});
    });
  }
  if(ptItems){
    const rMax=Math.max(14,Math.min(30,Math.min(W,H)*0.055));
    const rMin=Math.min(donutMode?9:7,rMax*0.45);
    const ptsSorted=ptItems.slice().sort(function(a,b){return b.value-a.value;});
    ptsSorted.forEach(function(pt,i){
      const t=tOf(pt.value);
      const r=ptsSorted.length===1?rMax*0.75:rMin+(rMax-rMin)*Math.sqrt(Math.max(0,t));
      const fill=scheme.fill(0.5+t*0.5);
      const g=document.createElementNS(NS,"g");
      g.setAttribute("class","fpgeo-ptg");
      const gScale=document.createElementNS(NS,"g");
      const bub=document.createElementNS(NS,"g");
      bub.setAttribute("class","fpgeo-bub");
      let segsInfo=null;
      if(donutMode){
        const bf=geoBdFor(bd,pt.labels);
        if(bf.total>0){
          segsInfo=[];
          let a=-Math.PI/2;
          bd.cats.forEach(function(cat,ci){
            const v=bf.vals[cat]||0;
            if(v<=0) return;
            const a2=a+(v/bf.total)*Math.PI*2;
            const seg=document.createElementNS(NS,"path");
            seg.setAttribute("class","fpgeo-pt");
            seg.setAttribute("d",geoArcPath(r*0.42,r,a,a2));
            seg.setAttribute("fill",geoCatColor(cat,ci));
            bub.appendChild(seg);
            segsInfo.push({cat:cat,v:v,color:geoCatColor(cat,ci)});
            a=a2;
          });
          const hole=document.createElementNS(NS,"circle");
          hole.setAttribute("r",(r*0.42).toFixed(1));
          hole.setAttribute("class","fpgeo-hole");
          bub.appendChild(hole);
        }
      }
      let c=null;
      if(!segsInfo){
        c=document.createElementNS(NS,"circle");
        c.setAttribute("class","fpgeo-pt");
        c.setAttribute("fill",fill);
        c.setAttribute("fill-opacity","0.92");
        c.setAttribute("r",r.toFixed(1));
        bub.appendChild(c);
      }
      const fs=Math.max(8,Math.min(13,r*0.75));
      const tv=document.createElementNS(NS,"text");
      tv.setAttribute("class",segsInfo?"fpgeo-ptlbl-vald":"fpgeo-ptlbl-val");
      tv.setAttribute("text-anchor","middle");
      tv.setAttribute("dy","3.2");
      tv.setAttribute("font-size",fs.toFixed(1));
      tv.style.opacity=0;
      tv.textContent=fmtNum(pt.value);
      bub.appendChild(tv);
      gScale.appendChild(bub); g.appendChild(gScale);
      const tn=document.createElementNS(NS,"text");
      tn.setAttribute("class","fpgeo-ptlbl-name");
      tn.setAttribute("text-anchor","middle");
      tn.style.opacity=0;
      tn.textContent=pt.name;
      g.appendChild(tn);
      gPts.appendChild(g);
      const B={g:g,scaleG:gScale,tName:tn,tVal:tv,fs:fs,valLen:fmtNum(pt.value).length,
        donut:!!segsInfo,x:pt.bx,y:pt.by,r:r,rank:i+1,pt:pt,fill:fill};
      bubbles.push(B);
      g.addEventListener("pointerenter",function(e){
        gPts.classList.add("fpgeo-hovering");
        g.classList.add("fpgeo-hover");
        gPts.appendChild(g);
        let extra="";
        if(segsInfo){
          const tot=segsInfo.reduce(function(sm,x){return sm+x.v;},0);
          extra=segsInfo.slice().sort(function(a,b){return b.v-a.v;}).map(function(x){
            const pc=tot>0?(x.v/tot*100):0;
            return '<div style="display:flex;align-items:center;gap:6px;font-size:10px;margin-top:3px">'
              +'<span class="fpgeo-tip-dot" style="background:'+x.color+'"></span>'
              +'<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px">'+x.cat+'</span>'
              +'<span style="margin-left:auto;font-weight:700">'+fmtNum(x.v)+'</span>'
              +'<span style="color:rgba(255,255,255,.55)">'+pc.toLocaleString("fr-FR",{maximumFractionDigits:0})+'%</span>'
              +'</div>';
          }).join("");
        }
        showTip(pt.name,pt.value,fill,pt.key,e,extra);
      });
      g.addEventListener("pointermove",moveTip);
      g.addEventListener("pointerleave",function(){
        gPts.classList.remove("fpgeo-hovering");
        g.classList.remove("fpgeo-hover");
        tip.classList.remove("fpgeo-tip-on");
      });
    });
  }

  // ---- zoom / pan ---------------------------------------------------------
  const K_MIN=0.7,K_MAX=13;
  function zoomAbout(px,py,factor){
    const k2=Math.max(K_MIN,Math.min(K_MAX,z.k*factor));
    const r=k2/z.k;
    z={k:k2,tx:px-(px-z.tx)*r,ty:py-(py-z.ty)*r};
    applyView();
  }
  function animateZoomTo(target,dur){
    if(zoomRaf) cancelAnimationFrame(zoomRaf);
    const from={k:z.k,tx:z.tx,ty:z.ty};
    let t0=null;
    function step(ts){
      if(dead) return;
      if(t0==null) t0=ts;
      const p=Math.min(1,(ts-t0)/dur), e=easeInOutCubic(p);
      z={k:from.k+(target.k-from.k)*e,tx:from.tx+(target.tx-from.tx)*e,ty:from.ty+(target.ty-from.ty)*e};
      applyView();
      if(p<1) zoomRaf=requestAnimationFrame(step);
    }
    zoomRaf=requestAnimationFrame(step);
  }
  function cancelIntro(){
    if(introRaf){ cancelAnimationFrame(introRaf); introRaf=0; z={k:1,tx:0,ty:0}; labelsOn=true; applyView(); }
  }
  stage.addEventListener("wheel",function(e){
    e.preventDefault();
    cancelIntro();
    if(!stageRect) stageRect=stage.getBoundingClientRect();
    const f=Math.pow(1.0018,-e.deltaY);
    zoomAbout(e.clientX-stageRect.left,e.clientY-stageRect.top,f);
  },{passive:false});
  let drag=null;
  stage.addEventListener("pointerdown",function(e){
    if(e.target.closest&&e.target.closest(".fpgeo-btn")) return;
    cancelIntro();
    drag={x:e.clientX,y:e.clientY,tx:z.tx,ty:z.ty,moved:false,id:e.pointerId};
  });
  stage.addEventListener("pointermove",function(e){
    if(!drag) return;
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(!drag.moved&&Math.abs(dx)+Math.abs(dy)>3){
      drag.moved=true;
      stage.classList.add("fpgeo-drag");
      try{ stage.setPointerCapture(drag.id); }catch(err){}
    }
    if(drag.moved){ z.tx=drag.tx+dx; z.ty=drag.ty+dy; applyView(); }
  });
  function endDrag(){ if(drag&&drag.moved) stage.classList.remove("fpgeo-drag"); drag=null; stageRect=null; }
  stage.addEventListener("pointerup",endDrag);
  stage.addEventListener("pointercancel",endDrag);
  stage.addEventListener("dblclick",function(e){
    e.preventDefault();
    if(!stageRect) stageRect=stage.getBoundingClientRect();
    zoomAbout(e.clientX-stageRect.left,e.clientY-stageRect.top,1.8);
  });
  ctrls.addEventListener("click",function(e){
    const b=e.target.closest(".fpgeo-btn"); if(!b) return;
    cancelIntro();
    if(b.dataset.act==="in") zoomAbout(W/2,H/2,1.45);
    else if(b.dataset.act==="out") zoomAbout(W/2,H/2,1/1.45);
    else animateZoomTo({k:1,tx:0,ty:0},550);
  });

  // ---- animation d'ouverture ---------------------------------------------
  const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!(skipIntro||reduceMotion)){
    dataShapes.forEach(function(s,i){
      s.p.style.opacity="0";
      s.p.style.transitionDelay=Math.min(700,120+i*60)+"ms";
    });
    bubbles.forEach(function(B,i){
      B.g.querySelector(".fpgeo-bub").style.transform="scale(0)";
      B.g.querySelector(".fpgeo-bub").style.transitionDelay=Math.min(800,200+i*55)+"ms";
    });
    gLand.style.opacity="0";
    gLand.style.transition="opacity .6s ease";
    svg.style.opacity="0";
    svg.style.transition="opacity .4s ease";
  }

  if(skipIntro||reduceMotion){
    z={k:1,tx:0,ty:0}; labelsOn=true; applyView();
  } else {
    let start;
    const kN=fitAll.s/fit.s;
    if(kN<0.9){
      start={k:kN,tx:fitAll.tx-fit.tx*kN,ty:fitAll.ty-fit.ty*kN};
    } else {
      const k0=0.82;
      start={k:k0,tx:(1-k0)*W/2,ty:(1-k0)*H/2};
    }
    z=start; applyView();
    requestAnimationFrame(function(){
      svg.style.opacity="1";
      gLand.style.opacity="1";
      dataShapes.forEach(function(s){ s.p.style.opacity="1"; });
      bubbles.forEach(function(B){ B.g.querySelector(".fpgeo-bub").style.transform="scale(1)"; });
    });
    const DUR=1250;
    let t0=null;
    function intro(ts){
      if(dead) return;
      if(t0==null) t0=ts;
      const p=Math.min(1,(ts-t0)/DUR), e=easeInOutCubic(p);
      z={k:start.k+(1-start.k)*e,tx:start.tx*(1-e),ty:start.ty*(1-e)};
      if(!labelsOn&&p>=0.6) labelsOn=true;
      applyView();
      if(p<1) introRaf=requestAnimationFrame(intro);
      else{
        introRaf=0;
        setTimeout(function(){
          if(dead) return;
          dataShapes.forEach(function(s){ s.p.style.opacity=""; s.p.style.transitionDelay=""; });
          bubbles.forEach(function(B){ const bb=B.g.querySelector(".fpgeo-bub"); bb.style.transitionDelay=""; });
          labels.forEach(function(L){ L.g.style.transitionDelay="0ms"; });
        },900);
      }
    }
    introRaf=requestAnimationFrame(intro);
  }

  // ---- légende + avertissements ------------------------------------------
  const legendEl=document.getElementById(canvasId+"-legend");
  if(legendEl){
    if(donutMode){
      legendEl.style.flexWrap="wrap";
      legendEl.innerHTML=bd.cats.map(function(cat,ci){
        return '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">'
          +'<span style="width:8px;height:8px;border-radius:99px;background:'+geoCatColor(cat,ci)+';box-shadow:inset 0 0 0 1px rgba(13,27,42,.15)"></span>'
          +cat+'</span>';
      }).join('');
    } else {
      legendEl.innerHTML=
        '<span>'+fmtNum(vmin)+'</span>'
        +'<span style="flex:1;height:7px;border-radius:4px;background:'+scheme.cssGradient+';box-shadow:inset 0 0 0 1px rgba(13,27,42,.06)"></span>'
        +'<span>'+fmtNum(vmax)+'</span>';
    }
  }
  const warnEl=document.getElementById(canvasId+"-warn");
  if(warnEl){
    const unmatched=geo.unmatched||[];
    if(unmatched.length){
      const sample=unmatched.slice(0,3).join(", ");
      warnEl.style.display="";
      warnEl.textContent="⚠️ "+unmatched.length+" valeur(s) non reconnue(s) : "+sample+(unmatched.length>3?"…":"");
    } else {
      warnEl.style.display="none";
    }
  }

  // ---- redimensionnement + cycle de vie ----------------------------------
  let roTimer=0;
  const ro=new ResizeObserver(function(){
    if(dead) return;
    const nw=stage.clientWidth, nh=stage.clientHeight;
    if(Math.abs(nw-W)<8&&Math.abs(nh-H)<8) return;
    clearTimeout(roTimer);
    roTimer=setTimeout(function(){
      if(dead) return;
      dead=true; try{ro.disconnect();}catch(e){}
      if(introRaf) cancelAnimationFrame(introRaf);
      if(zoomRaf) cancelAnimationFrame(zoomRaf);
      buildGeoScene(w,el,canvasId,chartInstances,fmtNum,geo,0,true);
    },160);
  });
  ro.observe(stage);

  chartInstances[canvasId]={
    destroy:function(){
      dead=true;
      clearTimeout(roTimer);
      try{ ro.disconnect(); }catch(e){}
      if(introRaf) cancelAnimationFrame(introRaf);
      if(zoomRaf) cancelAnimationFrame(zoomRaf);
    }
  };
}
