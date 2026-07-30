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
const NUM_TO_A2 = {}; Object.keys(ISO2_TO_NUM).forEach(a2=>{ NUM_TO_A2[ISO2_TO_NUM[a2]]=a2; });

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
 * Moteur de rendu SVG — carte choroplèthe dynamique FlowPilot
 * Zoom cinématique à l'ouverture, survol + tooltip, zoom molette / pan / boutons.
 * chartjs-chart-geo n'est plus utilisé que pour la conversion TopoJSON→GeoJSON
 * (window.ChartGeo.topojson), déjà chargée par l'app.
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
// (permet d'ignorer les territoires lointains : Guyane pour FR, Svalbard pour NO…)
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

function expandBounds(b,f){
  const dx=(b[2]-b[0])*f, dy=(b[3]-b[1])*f;
  return [b[0]-dx,b[1]-dy,b[2]+dx,b[3]+dy];
}
function ensureSpan(b,minX,minY){
  let [x0,y0,x1,y1]=b;
  if(x1-x0<minX){ const c=(x0+x1)/2; x0=c-minX/2; x1=c+minX/2; }
  if(y1-y0<minY){ const c=(y0+y1)/2; y0=c-minY/2; y1=c+minY/2; }
  return [x0,y0,x1,y1];
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

function fpgeoInjectCSS(){
  if(document.getElementById("fpgeo-style")) return;
  const st=document.createElement("style");
  st.id="fpgeo-style";
  st.textContent=[
    '.fpgeo-stage{position:relative;flex:1;min-height:110px;overflow:hidden;border-radius:12px;cursor:grab;',
    ' background:radial-gradient(130% 100% at 28% 8%,#ffffff 0%,rgba(255,255,255,0) 52%),linear-gradient(160deg,#f5f9fd 0%,#e9eff7 58%,#e2eaf4 100%);',
    ' box-shadow:inset 0 0 0 1px rgba(13,27,42,.05)}',
    '.fpgeo-stage.fpgeo-drag{cursor:grabbing}',
    '.fpgeo-svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.fpgeo-land{fill:#e4eaf2;stroke:#fff;stroke-width:.7;vector-effect:non-scaling-stroke}',
    '.fpgeo-c{stroke:#fff;stroke-width:1;vector-effect:non-scaling-stroke;cursor:pointer;transition:filter .18s ease,opacity .5s ease}',
    '.fpgeo-data.fpgeo-hovering .fpgeo-c:not(.fpgeo-hover){opacity:.72}',
    '.fpgeo-c.fpgeo-hover{filter:brightness(1.1) saturate(1.08);stroke-width:1.8}',
    '.fpgeo-lblg{pointer-events:none;transition:opacity .45s ease}',
    ".fpgeo-lbl-name{font-family:'DM Sans',Arial,sans-serif;font-weight:700;fill:#132A3A;paint-order:stroke;stroke:rgba(255,255,255,.88);stroke-width:3px;stroke-linejoin:round}",
    ".fpgeo-lbl-val{font-family:'Barlow Condensed','DM Sans',Arial,sans-serif;font-weight:800;fill:#0D1B2A;paint-order:stroke;stroke:rgba(255,255,255,.92);stroke-width:3.4px;stroke-linejoin:round;letter-spacing:.02em}",
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
    '@keyframes fpgeo-spin{to{transform:rotate(360deg)}}'
  ].join('\n');
  document.head.appendChild(st);
}

export function renderGeo(w, elId, rawLabels, rawValues, chartInstances, fmtNum, canvasId){
  const el=document.getElementById(elId);
  if(!el) return;
  if(!canvasId) canvasId="cvg"+w.id.replace(/[^a-zA-Z0-9]/g,"");
  fpgeoInjectCSS();

  if(!w.col){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">🌍</div><div>Sélectionne une colonne pays</div></div>';
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

  loadWorldFeatures().then(function(features){
    buildGeoScene(w, el, canvasId, rawLabels, rawValues, chartInstances, fmtW, features, 0, false);
  }).catch(function(){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">⚠️</div><div>Impossible de charger le fond de carte</div></div>';
  });
}

function buildGeoScene(w, el, canvasId, rawLabels, rawValues, chartInstances, fmtNum, features, attempt, skipIntro){
  const stage=document.getElementById(canvasId+"-stage");
  if(!stage) return;
  const W=stage.clientWidth, H=stage.clientHeight;
  if((W<40||H<40)&&attempt<12){
    requestAnimationFrame(function(){ buildGeoScene(w,el,canvasId,rawLabels,rawValues,chartInstances,fmtNum,features,attempt+1,skipIntro); });
    return;
  }

  // ---- correspondance pays -> valeur -------------------------------------
  const byA2={}; const unmatched=[];
  rawLabels.forEach(function(lbl,i){
    const a2=toAlpha2(lbl);
    if(a2) byA2[a2]={label:lbl,value:rawValues[i]};
    else if(lbl!=null&&String(lbl).trim()!=="") unmatched.push(String(lbl));
  });
  const matchedA2=Object.keys(byA2);
  if(!matchedA2.length){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">🌍</div><div>Aucun pays reconnu dans cette colonne</div></div>';
    return;
  }

  let scope=w.geoScope||"auto";
  if(scope==="auto") scope=matchedA2.every(function(a2){return EUROPE_A2.has(a2);})?"europe":"world";

  let featureSet=scope==="europe"
    ? features.filter(function(f){ const a2=NUM_TO_A2[String(f.id)]; return a2&&EUROPE_A2.has(a2); })
    : features.filter(function(f){ return NUM_TO_A2[String(f.id)]!=="AQ"; }); // pas d'Antarctique

  const values=matchedA2.map(function(a2){return byA2[a2].value;});
  const vmin=Math.min.apply(null,values), vmax=Math.max.apply(null,values);
  let total=0; values.forEach(function(v){ total+=(+v||0); });
  const sortedA2=matchedA2.slice().sort(function(a,b){return byA2[b].value-byA2[a].value;});
  const rankOf={}; sortedA2.forEach(function(a2,i){ rankOf[a2]=i+1; });
  const scheme=geoColorScheme(w);

  // ---- cadrage : zoom auto sur la zone des données -----------------------
  const clip=scope==="europe"?[-25,34,35,72]:[-179.9,-56,179.9,84];
  const fullB=mercBounds(featureSet,clip);
  const dataFeats=featureSet.filter(function(f){ return !!byA2[NUM_TO_A2[String(f.id)]]; });
  let dataB=mercBounds(dataFeats.length?dataFeats:featureSet,clip);
  dataB=expandBounds(dataB,0.14);
  dataB=ensureSpan(dataB,(fullB[2]-fullB[0])*0.22,(fullB[3]-fullB[1])*0.22);
  const fit=fitTransform(dataB,W,H,8);
  const fitAll=fitTransform(expandBounds(fullB,0.03),W,H,8);

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
  gData.setAttribute("filter","url(#"+canvasId+"-sh)");
  gZoom.appendChild(gLand); gZoom.appendChild(gData);
  const gLbl=document.createElementNS(NS,"g");
  svg.appendChild(gZoom); svg.appendChild(gLbl);
  stage.appendChild(svg);

  // Tooltip + contrôles
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
  const labels=[];

  function applyView(){
    gZoom.setAttribute("transform","translate("+z.tx+" "+z.ty+") scale("+z.k+")");
    for(let i=0;i<labels.length;i++){
      const L=labels[i];
      L.g.setAttribute("transform","translate("+(L.x*z.k+z.tx)+" "+(L.y*z.k+z.ty)+")");
      const vis=labelsOn&&L.bw*z.k>=26&&L.bh*z.k>=18;
      L.g.style.opacity=vis?1:0;
    }
  }

  // ---- pays ---------------------------------------------------------------
  const dataShapes=[];
  featureSet.forEach(function(f){
    const a2=NUM_TO_A2[String(f.id)];
    const m=a2?byA2[a2]:null;
    const d=buildPath(f,fit.s,fit.tx,fit.ty);
    if(!d) return;
    const p=document.createElementNS(NS,"path");
    p.setAttribute("d",d);
    if(m){
      const t=vmax>vmin?(m.value-vmin)/(vmax-vmin):0.7;
      const fill=scheme.fill(t);
      p.setAttribute("class","fpgeo-c");
      p.setAttribute("fill",fill);
      gData.appendChild(p);
      dataShapes.push({p:p,a2:a2,f:f,value:m.value,fill:fill});
    } else {
      p.setAttribute("class","fpgeo-land");
      p.dataset.a2=a2||"";
      gLand.appendChild(p);
      bindLandTip(p,a2,f);
    }
  });

  // ---- labels (nom + valeur) ---------------------------------------------
  dataShapes.sort(function(a,b){return b.value-a.value;});
  dataShapes.forEach(function(s,i){
    const lb=largestRingInfo(s.f,fit.s,fit.tx,fit.ty);
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
    tn.textContent=displayCountryName(s.a2,s.f);
    const tv=document.createElementNS(NS,"text");
    tv.setAttribute("class","fpgeo-lbl-val");
    tv.setAttribute("text-anchor","middle");
    tv.setAttribute("y",String(nameSize*0.72));
    tv.setAttribute("font-size",String(valSize));
    tv.textContent=fmtNum(s.value);
    g.appendChild(tn); g.appendChild(tv); gLbl.appendChild(g);
    labels.push({g:g,x:lb.cx,y:lb.cy,bw:lb.bw,bh:lb.bh});
  });

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
  function showDataTip(s,e){
    const name=displayCountryName(s.a2,s.f);
    const pct=(total>0&&isFinite(s.value))?(s.value/total*100):null;
    tip.innerHTML='<div class="fpgeo-tip-name"><span class="fpgeo-tip-dot" style="background:'+s.fill+'"></span>'+name+'</div>'
      +'<div class="fpgeo-tip-val">'+fmtNum(s.value)+'</div>'
      +(pct!=null?'<div class="fpgeo-tip-sub">'+pct.toLocaleString("fr-FR",{maximumFractionDigits:1})+' % du total · n° '+rankOf[s.a2]+'/'+matchedA2.length+'</div>':'');
    tip.classList.add("fpgeo-tip-on");
    moveTip(e);
  }
  function bindLandTip(p,a2,f){
    p.addEventListener("pointerenter",function(e){
      const name=displayCountryName(a2,f);
      if(!name) return;
      tip.innerHTML='<div class="fpgeo-tip-name"><span class="fpgeo-tip-dot" style="background:#c7d2de"></span>'+name+'</div>'
        +'<div class="fpgeo-tip-nodata">Pas de donnée</div>';
      tip.classList.add("fpgeo-tip-on");
      moveTip(e);
    });
    p.addEventListener("pointermove",moveTip);
    p.addEventListener("pointerleave",function(){ tip.classList.remove("fpgeo-tip-on"); });
  }
  dataShapes.forEach(function(s){
    s.p.addEventListener("pointerenter",function(e){
      gData.classList.add("fpgeo-hovering");
      s.p.classList.add("fpgeo-hover");
      gData.appendChild(s.p); // passe au premier plan pour un contour net
      showDataTip(s,e);
    });
    s.p.addEventListener("pointermove",moveTip);
    s.p.addEventListener("pointerleave",function(){
      gData.classList.remove("fpgeo-hovering");
      s.p.classList.remove("fpgeo-hover");
      tip.classList.remove("fpgeo-tip-on");
    });
  });

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
  // apparition progressive des pays colorés (du plus fort au plus faible)
  dataShapes.forEach(function(s,i){
    if(skipIntro||reduceMotion) return;
    s.p.style.opacity="0";
    s.p.style.transitionDelay=Math.min(700,120+i*60)+"ms";
  });
  if(!(skipIntro||reduceMotion)){
    gLand.style.opacity="0";
    gLand.style.transition="opacity .6s ease";
    svg.style.opacity="0";
    svg.style.transition="opacity .4s ease";
  }

  if(skipIntro||reduceMotion){
    z={k:1,tx:0,ty:0}; labelsOn=true; applyView();
  } else {
    // vue de départ : carte entière, puis zoom cinématique vers la zone des données
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
        // nettoie les délais/opacités inline pour laisser la main au CSS (survol)
        setTimeout(function(){
          if(dead) return;
          dataShapes.forEach(function(s){ s.p.style.opacity=""; s.p.style.transitionDelay=""; });
          labels.forEach(function(L){ L.g.style.transitionDelay="0ms"; });
        },900);
      }
    }
    introRaf=requestAnimationFrame(intro);
  }

  // ---- légende + avertissements ------------------------------------------
  const legendEl=document.getElementById(canvasId+"-legend");
  if(legendEl){
    legendEl.innerHTML=
      '<span>'+fmtNum(vmin)+'</span>'
      +'<span style="flex:1;height:7px;border-radius:4px;background:'+scheme.cssGradient+';box-shadow:inset 0 0 0 1px rgba(13,27,42,.06)"></span>'
      +'<span>'+fmtNum(vmax)+'</span>';
  }
  const warnEl=document.getElementById(canvasId+"-warn");
  if(warnEl){
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
      buildGeoScene(w,el,canvasId,rawLabels,rawValues,chartInstances,fmtNum,features,0,true);
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
