/**
 * FlowPilot Studio — Widget Carte géographique (geo.js)
 * Choropleth basé sur chartjs-chart-geo (MIT, sgratzl) + world-atlas (MIT).
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

export function renderGeo(w, elId, rawLabels, rawValues, chartInstances, fmtNum, canvasId){
  const el=document.getElementById(elId);
  if(!el) return;
  if(!canvasId) canvasId="cvg"+w.id.replace(/[^a-zA-Z0-9]/g,"");

  if(!w.col){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">\uD83C\uDF0D</div><div>Sélectionne une colonne pays</div></div>';
    return;
  }
  if(typeof window.ChartGeo==="undefined"){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">⚠️</div><div>Module carte indisponible (connexion internet requise)</div></div>';
    return;
  }

  el.innerHTML='<div class="geo-wrap" style="display:flex;flex-direction:column;height:100%;gap:4px">'
    +'<div class="chart-wrap" style="flex:1;min-height:110px;position:relative"><canvas id="'+canvasId+'"></canvas></div>'
    +'<div class="geo-legend" id="'+canvasId+'-legend" style="display:flex;align-items:center;gap:6px;font-size:9px;color:var(--muted,#8ca0b3);padding:0 4px"></div>'
    +'<div class="geo-warn" id="'+canvasId+'-warn" style="font-size:9px;color:#D85A30;padding:0 4px;display:none"></div>'
    +'</div>';

  loadWorldFeatures().then(function(features){
    renderGeoChart(w, el, canvasId, rawLabels, rawValues, chartInstances, fmtNum, features);
  }).catch(function(){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">⚠️</div><div>Impossible de charger le fond de carte</div></div>';
  });
}

function renderGeoChart(w, el, canvasId, rawLabels, rawValues, chartInstances, fmtNum, features){
  const canvas=document.getElementById(canvasId);
  if(!canvas) return; // le widget a pu être retiré entre-temps

  // Construire la correspondance alpha2 -> {rawLabel, value}
  const byA2={}; const unmatched=[];
  rawLabels.forEach(function(lbl,i){
    const a2=toAlpha2(lbl);
    if(a2) byA2[a2]={label:lbl,value:rawValues[i]};
    else if(lbl!=null && String(lbl).trim()!=="") unmatched.push(String(lbl));
  });

  const matchedA2=Object.keys(byA2);
  if(!matchedA2.length){
    el.innerHTML='<div class="wc-empty"><div class="we-icon">\uD83C\uDF0D</div><div>Aucun pays reconnu dans cette colonne</div></div>';
    return;
  }

  // Cadrage : auto détecte Europe si 100% des pays reconnus y sont, sinon Monde
  let scope=w.geoScope||"auto";
  if(scope==="auto") scope=matchedA2.every(function(a2){return EUROPE_A2.has(a2);})?"europe":"world";

  const featureSet=scope==="europe"
    ? features.filter(function(f){ const a2=NUM_TO_A2[String(f.id)]; return a2 && EUROPE_A2.has(a2); })
    : features;

  const values=matchedA2.map(function(a2){return byA2[a2].value;});
  const vmin=Math.min.apply(null,values), vmax=Math.max.apply(null,values);
  const baseColor=(w.color&&w.color[0]==="#")?w.color:"#4a7fa5";

  const dataPoints=[]; const bgColors=[]; const chartLabels=[];
  featureSet.forEach(function(f){
    const a2=NUM_TO_A2[String(f.id)];
    const m=a2?byA2[a2]:null;
    dataPoints.push({feature:f, value:m?m.value:null});
    if(m){
      const t=vmax>vmin?(m.value-vmin)/(vmax-vmin):0.7;
      bgColors.push(gradientShade(baseColor,Math.max(0.12,t)));
      chartLabels.push(m.label);
    } else {
      bgColors.push(GEO_NODATA_COLOR);
      chartLabels.push(null);
    }
  });

  if(chartInstances[canvasId]){ try{ chartInstances[canvasId].destroy(); }catch(e){} }

  chartInstances[canvasId]=new Chart(canvas.getContext("2d"),{
    type:"choropleth",
    data:{
      labels:chartLabels,
      datasets:[{
        label:w.title||"Carte",
        outline:featureSet,
        data:dataPoints,
        backgroundColor:bgColors,
        borderColor:"#fff",
        borderWidth:0.6
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      showOutline:true,
      showGraticule:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            label:function(ctx){
              const v=ctx.raw&&ctx.raw.value;
              const nm=(ctx.raw&&ctx.raw.feature&&ctx.raw.feature.properties&&ctx.raw.feature.properties.name)||"";
              if(v==null) return nm+" — pas de donnée";
              return nm+": "+fmtNum(v);
            }
          }
        }
      },
      scales:{
        projection:{
          axis:"x",
          projection: scope==="europe" ? "mercator" : "equalEarth",
          projectionScale: scope==="europe" ? 1.35 : 1.15,
          projectionOffset:[0,0]
        }
      }
    }
  });

  // Légende dégradé min -> max
  const legendEl=document.getElementById(canvasId+"-legend");
  if(legendEl){
    legendEl.innerHTML=
      '<span>'+fmtNum(vmin)+'</span>'
      +'<span style="flex:1;height:6px;border-radius:3px;background:linear-gradient(90deg,'+gradientShade(baseColor,0.12)+','+gradientShade(baseColor,1)+')"></span>'
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
}
