// Master Dataset of Indian States and Districts
// Source: Government of India Local Government Directory (LGD) - lgdirectory.gov.in

export interface IndianState {
  code: string;
  name: string;
  type: "STATE" | "UT";
  lgdCode?: number;
  gstCode?: string;
  lgd?: number;
  gst?: string;
  aliases: string[];
}

export interface IndianDistrict {
  id: string;
  name: string;
  stateCode: string;
  stateName: string;
  lgdCode: number;
  aliases: string[];
}

export const INDIAN_STATES: IndianState[] = [
  {
    "code": "AN",
    "name": "Andaman and Nicobar Islands",
    "type": "UT",
    "lgd": 35,
    "gst": "35",
    "aliases": []
  },
  {
    "code": "AP",
    "name": "Andhra Pradesh",
    "type": "STATE",
    "lgd": 28,
    "gst": "37",
    "aliases": []
  },
  {
    "code": "AR",
    "name": "Arunachal Pradesh",
    "type": "STATE",
    "lgd": 12,
    "gst": "12",
    "aliases": []
  },
  {
    "code": "AS",
    "name": "Assam",
    "type": "STATE",
    "lgd": 18,
    "gst": "18",
    "aliases": []
  },
  {
    "code": "BR",
    "name": "Bihar",
    "type": "STATE",
    "lgd": 10,
    "gst": "10",
    "aliases": []
  },
  {
    "code": "CH",
    "name": "Chandigarh",
    "type": "UT",
    "lgd": 4,
    "gst": "04",
    "aliases": []
  },
  {
    "code": "CG",
    "name": "Chhattisgarh",
    "type": "STATE",
    "lgd": 22,
    "gst": "22",
    "aliases": [
      "Chattisgarh"
    ]
  },
  {
    "code": "DN",
    "name": "Dadra and Nagar Haveli and Daman and Diu",
    "type": "UT",
    "lgd": 38,
    "gst": "26",
    "aliases": [
      "Dadra & Nagar Haveli and Daman & Diu",
      "Daman and Diu",
      "Dadra and Nagar Haveli"
    ]
  },
  {
    "code": "DL",
    "name": "Delhi",
    "type": "UT",
    "lgd": 7,
    "gst": "07",
    "aliases": [
      "National Capital Territory of Delhi",
      "NCT of Delhi"
    ]
  },
  {
    "code": "GA",
    "name": "Goa",
    "type": "STATE",
    "lgd": 30,
    "gst": "30",
    "aliases": []
  },
  {
    "code": "GJ",
    "name": "Gujarat",
    "type": "STATE",
    "lgd": 24,
    "gst": "24",
    "aliases": []
  },
  {
    "code": "HR",
    "name": "Haryana",
    "type": "STATE",
    "lgd": 6,
    "gst": "06",
    "aliases": []
  },
  {
    "code": "HP",
    "name": "Himachal Pradesh",
    "type": "STATE",
    "lgd": 2,
    "gst": "02",
    "aliases": []
  },
  {
    "code": "JK",
    "name": "Jammu and Kashmir",
    "type": "UT",
    "lgd": 1,
    "gst": "01",
    "aliases": [
      "Jammu & Kashmir"
    ]
  },
  {
    "code": "JH",
    "name": "Jharkhand",
    "type": "STATE",
    "lgd": 20,
    "gst": "20",
    "aliases": []
  },
  {
    "code": "KA",
    "name": "Karnataka",
    "type": "STATE",
    "lgd": 29,
    "gst": "29",
    "aliases": []
  },
  {
    "code": "KL",
    "name": "Kerala",
    "type": "STATE",
    "lgd": 32,
    "gst": "32",
    "aliases": []
  },
  {
    "code": "LA",
    "name": "Ladakh",
    "type": "UT",
    "lgd": 37,
    "gst": "38",
    "aliases": []
  },
  {
    "code": "LD",
    "name": "Lakshadweep",
    "type": "UT",
    "lgd": 31,
    "gst": "31",
    "aliases": []
  },
  {
    "code": "MP",
    "name": "Madhya Pradesh",
    "type": "STATE",
    "lgd": 23,
    "gst": "23",
    "aliases": []
  },
  {
    "code": "MH",
    "name": "Maharashtra",
    "type": "STATE",
    "lgd": 27,
    "gst": "27",
    "aliases": []
  },
  {
    "code": "MN",
    "name": "Manipur",
    "type": "STATE",
    "lgd": 14,
    "gst": "14",
    "aliases": []
  },
  {
    "code": "ML",
    "name": "Meghalaya",
    "type": "STATE",
    "lgd": 17,
    "gst": "17",
    "aliases": []
  },
  {
    "code": "MZ",
    "name": "Mizoram",
    "type": "STATE",
    "lgd": 15,
    "gst": "15",
    "aliases": []
  },
  {
    "code": "NL",
    "name": "Nagaland",
    "type": "STATE",
    "lgd": 13,
    "gst": "13",
    "aliases": []
  },
  {
    "code": "OD",
    "name": "Odisha",
    "type": "STATE",
    "lgd": 21,
    "gst": "21",
    "aliases": [
      "Orissa"
    ]
  },
  {
    "code": "PY",
    "name": "Puducherry",
    "type": "UT",
    "lgd": 34,
    "gst": "34",
    "aliases": [
      "Pondicherry"
    ]
  },
  {
    "code": "PB",
    "name": "Punjab",
    "type": "STATE",
    "lgd": 3,
    "gst": "03",
    "aliases": []
  },
  {
    "code": "RJ",
    "name": "Rajasthan",
    "type": "STATE",
    "lgd": 8,
    "gst": "08",
    "aliases": []
  },
  {
    "code": "SK",
    "name": "Sikkim",
    "type": "STATE",
    "lgd": 11,
    "gst": "11",
    "aliases": []
  },
  {
    "code": "TN",
    "name": "Tamil Nadu",
    "type": "STATE",
    "lgd": 33,
    "gst": "33",
    "aliases": []
  },
  {
    "code": "TS",
    "name": "Telangana",
    "type": "STATE",
    "lgd": 36,
    "gst": "36",
    "aliases": []
  },
  {
    "code": "TR",
    "name": "Tripura",
    "type": "STATE",
    "lgd": 16,
    "gst": "16",
    "aliases": []
  },
  {
    "code": "UP",
    "name": "Uttar Pradesh",
    "type": "STATE",
    "lgd": 9,
    "gst": "09",
    "aliases": []
  },
  {
    "code": "UK",
    "name": "Uttarakhand",
    "type": "STATE",
    "lgd": 5,
    "gst": "05",
    "aliases": [
      "Uttaranchal"
    ]
  },
  {
    "code": "WB",
    "name": "West Bengal",
    "type": "STATE",
    "lgd": 19,
    "gst": "19",
    "aliases": []
  }
];

export const INDIAN_DISTRICTS: IndianDistrict[] = [
  {
    "id": "an_nicobar",
    "lgdCode": 603,
    "stateCode": "AN",
    "stateName": "Andaman and Nicobar Islands",
    "name": "Nicobar",
    "aliases": []
  },
  {
    "id": "an_north_and_middle_andaman",
    "lgdCode": 632,
    "stateCode": "AN",
    "stateName": "Andaman and Nicobar Islands",
    "name": "North and Middle Andaman",
    "aliases": []
  },
  {
    "id": "an_south_andaman",
    "lgdCode": 602,
    "stateCode": "AN",
    "stateName": "Andaman and Nicobar Islands",
    "name": "South Andaman",
    "aliases": []
  },
  {
    "id": "ap_alluri_sitharama_raju",
    "lgdCode": 745,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Alluri Sitharama Raju",
    "aliases": []
  },
  {
    "id": "ap_anakapalli",
    "lgdCode": 744,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Anakapalli",
    "aliases": []
  },
  {
    "id": "ap_anantapur",
    "lgdCode": 502,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Anantapur",
    "aliases": []
  },
  {
    "id": "ap_annamayya",
    "lgdCode": 753,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Annamayya",
    "aliases": []
  },
  {
    "id": "ap_bapatla",
    "lgdCode": 750,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Bapatla",
    "aliases": []
  },
  {
    "id": "ap_chittoor",
    "lgdCode": 503,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Chittoor",
    "aliases": []
  },
  {
    "id": "ap_east_godavari",
    "lgdCode": 505,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "East Godavari",
    "aliases": []
  },
  {
    "id": "ap_eluru",
    "lgdCode": 748,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Eluru",
    "aliases": []
  },
  {
    "id": "ap_guntur",
    "lgdCode": 506,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Guntur",
    "aliases": []
  },
  {
    "id": "ap_kakinada",
    "lgdCode": 746,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Kakinada",
    "aliases": []
  },
  {
    "id": "ap_konaseema",
    "lgdCode": 747,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Konaseema",
    "aliases": []
  },
  {
    "id": "ap_krishna",
    "lgdCode": 510,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Krishna",
    "aliases": []
  },
  {
    "id": "ap_kurnool",
    "lgdCode": 511,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Kurnool",
    "aliases": []
  },
  {
    "id": "ap_nandyal",
    "lgdCode": 755,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Nandyal",
    "aliases": []
  },
  {
    "id": "ap_ntr",
    "lgdCode": 749,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Ntr",
    "aliases": []
  },
  {
    "id": "ap_palnadu",
    "lgdCode": 751,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Palnadu",
    "aliases": []
  },
  {
    "id": "ap_parvathipuram_manyam",
    "lgdCode": 743,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Parvathipuram Manyam",
    "aliases": []
  },
  {
    "id": "ap_prakasam",
    "lgdCode": 517,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Prakasam",
    "aliases": []
  },
  {
    "id": "ap_spsr_nellore",
    "lgdCode": 515,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Spsr Nellore",
    "aliases": []
  },
  {
    "id": "ap_sri_sathya_sai",
    "lgdCode": 754,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Sri Sathya Sai",
    "aliases": []
  },
  {
    "id": "ap_srikakulam",
    "lgdCode": 519,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Srikakulam",
    "aliases": []
  },
  {
    "id": "ap_tirupati",
    "lgdCode": 752,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Tirupati",
    "aliases": []
  },
  {
    "id": "ap_visakhapatanam",
    "lgdCode": 520,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Visakhapatanam",
    "aliases": []
  },
  {
    "id": "ap_vizianagaram",
    "lgdCode": 521,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Vizianagaram",
    "aliases": []
  },
  {
    "id": "ap_west_godavari",
    "lgdCode": 523,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "West Godavari",
    "aliases": []
  },
  {
    "id": "ap_y_s_r",
    "lgdCode": 504,
    "stateCode": "AP",
    "stateName": "Andhra Pradesh",
    "name": "Y.s.r.",
    "aliases": []
  },
  {
    "id": "ar_anjaw",
    "lgdCode": 628,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Anjaw",
    "aliases": []
  },
  {
    "id": "ar_changlang",
    "lgdCode": 229,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Changlang",
    "aliases": []
  },
  {
    "id": "ar_dibang_valley",
    "lgdCode": 230,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Dibang Valley",
    "aliases": []
  },
  {
    "id": "ar_east_kameng",
    "lgdCode": 231,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "East Kameng",
    "aliases": []
  },
  {
    "id": "ar_east_siang",
    "lgdCode": 232,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "East Siang",
    "aliases": []
  },
  {
    "id": "ar_kamle",
    "lgdCode": 718,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Kamle",
    "aliases": []
  },
  {
    "id": "ar_kra_daadi",
    "lgdCode": 677,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Kra Daadi",
    "aliases": []
  },
  {
    "id": "ar_kurung_kumey",
    "lgdCode": 233,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Kurung Kumey",
    "aliases": []
  },
  {
    "id": "ar_leparada",
    "lgdCode": 724,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Leparada",
    "aliases": []
  },
  {
    "id": "ar_lohit",
    "lgdCode": 234,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Lohit",
    "aliases": []
  },
  {
    "id": "ar_longding",
    "lgdCode": 666,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Longding",
    "aliases": []
  },
  {
    "id": "ar_lower_dibang_valley",
    "lgdCode": 235,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Lower Dibang Valley",
    "aliases": []
  },
  {
    "id": "ar_lower_siang",
    "lgdCode": 719,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Lower Siang",
    "aliases": []
  },
  {
    "id": "ar_lower_subansiri",
    "lgdCode": 236,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Lower Subansiri",
    "aliases": []
  },
  {
    "id": "ar_namsai",
    "lgdCode": 678,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Namsai",
    "aliases": []
  },
  {
    "id": "ar_pakke_kessang",
    "lgdCode": 723,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Pakke Kessang",
    "aliases": []
  },
  {
    "id": "ar_papum_pare",
    "lgdCode": 237,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Papum Pare",
    "aliases": []
  },
  {
    "id": "ar_shi_yomi",
    "lgdCode": 725,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Shi Yomi",
    "aliases": []
  },
  {
    "id": "ar_siang",
    "lgdCode": 679,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Siang",
    "aliases": []
  },
  {
    "id": "ar_tawang",
    "lgdCode": 238,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Tawang",
    "aliases": []
  },
  {
    "id": "ar_tirap",
    "lgdCode": 239,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Tirap",
    "aliases": []
  },
  {
    "id": "ar_upper_siang",
    "lgdCode": 240,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Upper Siang",
    "aliases": []
  },
  {
    "id": "ar_upper_subansiri",
    "lgdCode": 241,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "Upper Subansiri",
    "aliases": []
  },
  {
    "id": "ar_west_kameng",
    "lgdCode": 242,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "West Kameng",
    "aliases": []
  },
  {
    "id": "ar_west_siang",
    "lgdCode": 243,
    "stateCode": "AR",
    "stateName": "Arunachal Pradesh",
    "name": "West Siang",
    "aliases": []
  },
  {
    "id": "as_bajali",
    "lgdCode": 739,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Bajali",
    "aliases": []
  },
  {
    "id": "as_baksa",
    "lgdCode": 616,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Baksa",
    "aliases": []
  },
  {
    "id": "as_barpeta",
    "lgdCode": 280,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Barpeta",
    "aliases": []
  },
  {
    "id": "as_biswanath",
    "lgdCode": 705,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Biswanath",
    "aliases": []
  },
  {
    "id": "as_bongaigaon",
    "lgdCode": 281,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Bongaigaon",
    "aliases": []
  },
  {
    "id": "as_cachar",
    "lgdCode": 282,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Cachar",
    "aliases": []
  },
  {
    "id": "as_charaideo",
    "lgdCode": 708,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Charaideo",
    "aliases": []
  },
  {
    "id": "as_chirang",
    "lgdCode": 612,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Chirang",
    "aliases": []
  },
  {
    "id": "as_darrang",
    "lgdCode": 283,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Darrang",
    "aliases": []
  },
  {
    "id": "as_dhemaji",
    "lgdCode": 284,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Dhemaji",
    "aliases": []
  },
  {
    "id": "as_dhubri",
    "lgdCode": 285,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Dhubri",
    "aliases": []
  },
  {
    "id": "as_dibrugarh",
    "lgdCode": 286,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Dibrugarh",
    "aliases": []
  },
  {
    "id": "as_dima_hasao",
    "lgdCode": 299,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Dima Hasao",
    "aliases": []
  },
  {
    "id": "as_goalpara",
    "lgdCode": 287,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Goalpara",
    "aliases": []
  },
  {
    "id": "as_golaghat",
    "lgdCode": 288,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Golaghat",
    "aliases": []
  },
  {
    "id": "as_hailakandi",
    "lgdCode": 289,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Hailakandi",
    "aliases": []
  },
  {
    "id": "as_hojai",
    "lgdCode": 709,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Hojai",
    "aliases": []
  },
  {
    "id": "as_jorhat",
    "lgdCode": 290,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Jorhat",
    "aliases": []
  },
  {
    "id": "as_kamrup",
    "lgdCode": 291,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Kamrup",
    "aliases": []
  },
  {
    "id": "as_kamrup_metro",
    "lgdCode": 618,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Kamrup Metro",
    "aliases": []
  },
  {
    "id": "as_karbi_anglong",
    "lgdCode": 292,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Karbi Anglong",
    "aliases": []
  },
  {
    "id": "as_karimganj",
    "lgdCode": 293,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Karimganj",
    "aliases": []
  },
  {
    "id": "as_kokrajhar",
    "lgdCode": 294,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Kokrajhar",
    "aliases": []
  },
  {
    "id": "as_lakhimpur",
    "lgdCode": 295,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Lakhimpur",
    "aliases": []
  },
  {
    "id": "as_majuli",
    "lgdCode": 706,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Majuli",
    "aliases": []
  },
  {
    "id": "as_marigaon",
    "lgdCode": 296,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Marigaon",
    "aliases": []
  },
  {
    "id": "as_nagaon",
    "lgdCode": 297,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Nagaon",
    "aliases": []
  },
  {
    "id": "as_nalbari",
    "lgdCode": 298,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Nalbari",
    "aliases": []
  },
  {
    "id": "as_sivasagar",
    "lgdCode": 300,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Sivasagar",
    "aliases": []
  },
  {
    "id": "as_sonitpur",
    "lgdCode": 301,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Sonitpur",
    "aliases": []
  },
  {
    "id": "as_south_salmara_mancachar",
    "lgdCode": 707,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "South Salmara Mancachar",
    "aliases": []
  },
  {
    "id": "as_tamulpur",
    "lgdCode": 756,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Tamulpur",
    "aliases": []
  },
  {
    "id": "as_tinsukia",
    "lgdCode": 302,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Tinsukia",
    "aliases": []
  },
  {
    "id": "as_udalguri",
    "lgdCode": 617,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "Udalguri",
    "aliases": []
  },
  {
    "id": "as_west_karbi_anglong",
    "lgdCode": 710,
    "stateCode": "AS",
    "stateName": "Assam",
    "name": "West Karbi Anglong",
    "aliases": []
  },
  {
    "id": "br_araria",
    "lgdCode": 188,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Araria",
    "aliases": []
  },
  {
    "id": "br_arwal",
    "lgdCode": 611,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Arwal",
    "aliases": []
  },
  {
    "id": "br_aurangabad",
    "lgdCode": 189,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Aurangabad",
    "aliases": []
  },
  {
    "id": "br_banka",
    "lgdCode": 190,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Banka",
    "aliases": []
  },
  {
    "id": "br_begusarai",
    "lgdCode": 191,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Begusarai",
    "aliases": []
  },
  {
    "id": "br_bhagalpur",
    "lgdCode": 192,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Bhagalpur",
    "aliases": []
  },
  {
    "id": "br_bhojpur",
    "lgdCode": 193,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Bhojpur",
    "aliases": []
  },
  {
    "id": "br_buxar",
    "lgdCode": 194,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Buxar",
    "aliases": []
  },
  {
    "id": "br_darbhanga",
    "lgdCode": 195,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Darbhanga",
    "aliases": []
  },
  {
    "id": "br_gaya",
    "lgdCode": 196,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Gaya",
    "aliases": []
  },
  {
    "id": "br_gopalganj",
    "lgdCode": 197,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Gopalganj",
    "aliases": []
  },
  {
    "id": "br_jamui",
    "lgdCode": 198,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Jamui",
    "aliases": []
  },
  {
    "id": "br_jehanabad",
    "lgdCode": 199,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Jehanabad",
    "aliases": []
  },
  {
    "id": "br_kaimur_bhabua",
    "lgdCode": 200,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Kaimur (bhabua)",
    "aliases": []
  },
  {
    "id": "br_katihar",
    "lgdCode": 201,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Katihar",
    "aliases": []
  },
  {
    "id": "br_khagaria",
    "lgdCode": 202,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Khagaria",
    "aliases": []
  },
  {
    "id": "br_kishanganj",
    "lgdCode": 203,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Kishanganj",
    "aliases": []
  },
  {
    "id": "br_lakhisarai",
    "lgdCode": 204,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Lakhisarai",
    "aliases": []
  },
  {
    "id": "br_madhepura",
    "lgdCode": 205,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Madhepura",
    "aliases": []
  },
  {
    "id": "br_madhubani",
    "lgdCode": 206,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Madhubani",
    "aliases": []
  },
  {
    "id": "br_munger",
    "lgdCode": 207,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Munger",
    "aliases": []
  },
  {
    "id": "br_muzaffarpur",
    "lgdCode": 208,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Muzaffarpur",
    "aliases": []
  },
  {
    "id": "br_nalanda",
    "lgdCode": 209,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Nalanda",
    "aliases": []
  },
  {
    "id": "br_nawada",
    "lgdCode": 210,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Nawada",
    "aliases": []
  },
  {
    "id": "br_pashchim_champaran",
    "lgdCode": 211,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Pashchim Champaran",
    "aliases": []
  },
  {
    "id": "br_patna",
    "lgdCode": 212,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Patna",
    "aliases": []
  },
  {
    "id": "br_purbi_champaran",
    "lgdCode": 213,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Purbi Champaran",
    "aliases": []
  },
  {
    "id": "br_purnia",
    "lgdCode": 214,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Purnia",
    "aliases": []
  },
  {
    "id": "br_rohtas",
    "lgdCode": 215,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Rohtas",
    "aliases": []
  },
  {
    "id": "br_saharsa",
    "lgdCode": 216,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Saharsa",
    "aliases": []
  },
  {
    "id": "br_samastipur",
    "lgdCode": 217,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Samastipur",
    "aliases": []
  },
  {
    "id": "br_saran",
    "lgdCode": 218,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Saran",
    "aliases": []
  },
  {
    "id": "br_sheikhpura",
    "lgdCode": 219,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Sheikhpura",
    "aliases": []
  },
  {
    "id": "br_sheohar",
    "lgdCode": 220,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Sheohar",
    "aliases": []
  },
  {
    "id": "br_sitamarhi",
    "lgdCode": 221,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Sitamarhi",
    "aliases": []
  },
  {
    "id": "br_siwan",
    "lgdCode": 222,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Siwan",
    "aliases": []
  },
  {
    "id": "br_supaul",
    "lgdCode": 223,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Supaul",
    "aliases": []
  },
  {
    "id": "br_vaishali",
    "lgdCode": 224,
    "stateCode": "BR",
    "stateName": "Bihar",
    "name": "Vaishali",
    "aliases": []
  },
  {
    "id": "ch_chandigarh",
    "lgdCode": 44,
    "stateCode": "CH",
    "stateName": "Chandigarh",
    "name": "Chandigarh",
    "aliases": []
  },
  {
    "id": "cg_balod",
    "lgdCode": 646,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Balod",
    "aliases": []
  },
  {
    "id": "cg_baloda_bazar",
    "lgdCode": 644,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Baloda Bazar",
    "aliases": []
  },
  {
    "id": "cg_balrampur",
    "lgdCode": 649,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Balrampur",
    "aliases": []
  },
  {
    "id": "cg_bastar",
    "lgdCode": 374,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Bastar",
    "aliases": []
  },
  {
    "id": "cg_bemetara",
    "lgdCode": 650,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Bemetara",
    "aliases": []
  },
  {
    "id": "cg_bijapur",
    "lgdCode": 636,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Bijapur",
    "aliases": []
  },
  {
    "id": "cg_bilaspur",
    "lgdCode": 375,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Bilaspur",
    "aliases": []
  },
  {
    "id": "cg_dantewada",
    "lgdCode": 376,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Dantewada",
    "aliases": []
  },
  {
    "id": "cg_dhamtari",
    "lgdCode": 377,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Dhamtari",
    "aliases": []
  },
  {
    "id": "cg_durg",
    "lgdCode": 378,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Durg",
    "aliases": []
  },
  {
    "id": "cg_gariyaband",
    "lgdCode": 645,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Gariyaband",
    "aliases": []
  },
  {
    "id": "cg_gaurella_pendra_marwahi",
    "lgdCode": 734,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Gaurella Pendra Marwahi",
    "aliases": []
  },
  {
    "id": "cg_janjgir_champa",
    "lgdCode": 379,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Janjgir-champa",
    "aliases": []
  },
  {
    "id": "cg_jashpur",
    "lgdCode": 380,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Jashpur",
    "aliases": []
  },
  {
    "id": "cg_kabirdham",
    "lgdCode": 382,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Kabirdham",
    "aliases": []
  },
  {
    "id": "cg_kanker",
    "lgdCode": 381,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Kanker",
    "aliases": []
  },
  {
    "id": "cg_khairgarh_chhuikhadan_gandai",
    "lgdCode": 759,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Khairgarh Chhuikhadan Gandai",
    "aliases": []
  },
  {
    "id": "cg_kondagaon",
    "lgdCode": 643,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Kondagaon",
    "aliases": []
  },
  {
    "id": "cg_korba",
    "lgdCode": 383,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Korba",
    "aliases": []
  },
  {
    "id": "cg_korea",
    "lgdCode": 384,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Korea",
    "aliases": []
  },
  {
    "id": "cg_mahasamund",
    "lgdCode": 385,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Mahasamund",
    "aliases": []
  },
  {
    "id": "cg_manendragarh_chirimiri_bharatpur",
    "lgdCode": 760,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Manendragarh Chirimiri Bharatpur",
    "aliases": []
  },
  {
    "id": "cg_mohla_manpur_ambagarh_chouki",
    "lgdCode": 761,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Mohla Manpur Ambagarh Chouki",
    "aliases": []
  },
  {
    "id": "cg_mungeli",
    "lgdCode": 647,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Mungeli",
    "aliases": []
  },
  {
    "id": "cg_narayanpur",
    "lgdCode": 637,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Narayanpur",
    "aliases": []
  },
  {
    "id": "cg_raigarh",
    "lgdCode": 386,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Raigarh",
    "aliases": []
  },
  {
    "id": "cg_raipur",
    "lgdCode": 387,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Raipur",
    "aliases": []
  },
  {
    "id": "cg_rajnandgaon",
    "lgdCode": 388,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Rajnandgaon",
    "aliases": []
  },
  {
    "id": "cg_sakti",
    "lgdCode": 762,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Sakti",
    "aliases": []
  },
  {
    "id": "cg_sarangarh_bilaigarh",
    "lgdCode": 763,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Sarangarh Bilaigarh",
    "aliases": []
  },
  {
    "id": "cg_sukma",
    "lgdCode": 642,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Sukma",
    "aliases": []
  },
  {
    "id": "cg_surajpur",
    "lgdCode": 648,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Surajpur",
    "aliases": []
  },
  {
    "id": "cg_surguja",
    "lgdCode": 389,
    "stateCode": "CG",
    "stateName": "Chhattisgarh",
    "name": "Surguja",
    "aliases": []
  },
  {
    "id": "dn_dadra_and_nagar_haveli",
    "lgdCode": 465,
    "stateCode": "DN",
    "stateName": "Dadra and Nagar Haveli and Daman and Diu",
    "name": "Dadra and Nagar Haveli",
    "aliases": []
  },
  {
    "id": "dn_daman",
    "lgdCode": 463,
    "stateCode": "DN",
    "stateName": "Dadra and Nagar Haveli and Daman and Diu",
    "name": "Daman",
    "aliases": []
  },
  {
    "id": "dn_diu",
    "lgdCode": 464,
    "stateCode": "DN",
    "stateName": "Dadra and Nagar Haveli and Daman and Diu",
    "name": "Diu",
    "aliases": []
  },
  {
    "id": "dl_central",
    "lgdCode": 77,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "Central",
    "aliases": []
  },
  {
    "id": "dl_east",
    "lgdCode": 78,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "East",
    "aliases": []
  },
  {
    "id": "dl_new_delhi",
    "lgdCode": 79,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "New Delhi",
    "aliases": []
  },
  {
    "id": "dl_north",
    "lgdCode": 80,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "North",
    "aliases": []
  },
  {
    "id": "dl_north_east",
    "lgdCode": 81,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "North East",
    "aliases": []
  },
  {
    "id": "dl_north_west",
    "lgdCode": 82,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "North West",
    "aliases": []
  },
  {
    "id": "dl_shahdara",
    "lgdCode": 671,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "Shahdara",
    "aliases": []
  },
  {
    "id": "dl_south",
    "lgdCode": 83,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "South",
    "aliases": []
  },
  {
    "id": "dl_south_east",
    "lgdCode": 670,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "South East",
    "aliases": []
  },
  {
    "id": "dl_south_west",
    "lgdCode": 84,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "South West",
    "aliases": []
  },
  {
    "id": "dl_west",
    "lgdCode": 85,
    "stateCode": "DL",
    "stateName": "Delhi",
    "name": "West",
    "aliases": []
  },
  {
    "id": "ga_north_goa",
    "lgdCode": 551,
    "stateCode": "GA",
    "stateName": "Goa",
    "name": "North Goa",
    "aliases": []
  },
  {
    "id": "ga_south_goa",
    "lgdCode": 552,
    "stateCode": "GA",
    "stateName": "Goa",
    "name": "South Goa",
    "aliases": []
  },
  {
    "id": "gj_ahmadabad",
    "lgdCode": 438,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Ahmadabad",
    "aliases": []
  },
  {
    "id": "gj_amreli",
    "lgdCode": 439,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Amreli",
    "aliases": []
  },
  {
    "id": "gj_anand",
    "lgdCode": 440,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Anand",
    "aliases": []
  },
  {
    "id": "gj_arvalli",
    "lgdCode": 672,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Arvalli",
    "aliases": []
  },
  {
    "id": "gj_banas_kantha",
    "lgdCode": 441,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Banas Kantha",
    "aliases": []
  },
  {
    "id": "gj_bharuch",
    "lgdCode": 442,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Bharuch",
    "aliases": []
  },
  {
    "id": "gj_bhavnagar",
    "lgdCode": 443,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Bhavnagar",
    "aliases": []
  },
  {
    "id": "gj_botad",
    "lgdCode": 676,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Botad",
    "aliases": []
  },
  {
    "id": "gj_chhotaudepur",
    "lgdCode": 668,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Chhotaudepur",
    "aliases": []
  },
  {
    "id": "gj_dang",
    "lgdCode": 444,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Dang",
    "aliases": []
  },
  {
    "id": "gj_devbhumi_dwarka",
    "lgdCode": 674,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Devbhumi Dwarka",
    "aliases": []
  },
  {
    "id": "gj_dohad",
    "lgdCode": 445,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Dohad",
    "aliases": []
  },
  {
    "id": "gj_gandhinagar",
    "lgdCode": 446,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Gandhinagar",
    "aliases": []
  },
  {
    "id": "gj_gir_somnath",
    "lgdCode": 675,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Gir Somnath",
    "aliases": []
  },
  {
    "id": "gj_jamnagar",
    "lgdCode": 447,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Jamnagar",
    "aliases": []
  },
  {
    "id": "gj_junagadh",
    "lgdCode": 448,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Junagadh",
    "aliases": []
  },
  {
    "id": "gj_kachchh",
    "lgdCode": 449,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Kachchh",
    "aliases": []
  },
  {
    "id": "gj_kheda",
    "lgdCode": 450,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Kheda",
    "aliases": []
  },
  {
    "id": "gj_mahesana",
    "lgdCode": 451,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Mahesana",
    "aliases": []
  },
  {
    "id": "gj_mahisagar",
    "lgdCode": 669,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Mahisagar",
    "aliases": []
  },
  {
    "id": "gj_morbi",
    "lgdCode": 673,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Morbi",
    "aliases": []
  },
  {
    "id": "gj_narmada",
    "lgdCode": 452,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Narmada",
    "aliases": []
  },
  {
    "id": "gj_navsari",
    "lgdCode": 453,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Navsari",
    "aliases": []
  },
  {
    "id": "gj_panch_mahals",
    "lgdCode": 454,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Panch Mahals",
    "aliases": []
  },
  {
    "id": "gj_patan",
    "lgdCode": 455,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Patan",
    "aliases": []
  },
  {
    "id": "gj_porbandar",
    "lgdCode": 456,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Porbandar",
    "aliases": []
  },
  {
    "id": "gj_rajkot",
    "lgdCode": 457,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Rajkot",
    "aliases": []
  },
  {
    "id": "gj_sabar_kantha",
    "lgdCode": 458,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Sabar Kantha",
    "aliases": []
  },
  {
    "id": "gj_surat",
    "lgdCode": 459,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Surat",
    "aliases": []
  },
  {
    "id": "gj_surendranagar",
    "lgdCode": 460,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Surendranagar",
    "aliases": []
  },
  {
    "id": "gj_tapi",
    "lgdCode": 641,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Tapi",
    "aliases": []
  },
  {
    "id": "gj_vadodara",
    "lgdCode": 461,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Vadodara",
    "aliases": []
  },
  {
    "id": "gj_valsad",
    "lgdCode": 462,
    "stateCode": "GJ",
    "stateName": "Gujarat",
    "name": "Valsad",
    "aliases": []
  },
  {
    "id": "hr_ambala",
    "lgdCode": 58,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Ambala",
    "aliases": []
  },
  {
    "id": "hr_bhiwani",
    "lgdCode": 59,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Bhiwani",
    "aliases": []
  },
  {
    "id": "hr_charki_dadri",
    "lgdCode": 701,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Charki Dadri",
    "aliases": []
  },
  {
    "id": "hr_faridabad",
    "lgdCode": 60,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Faridabad",
    "aliases": []
  },
  {
    "id": "hr_fatehabad",
    "lgdCode": 61,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Fatehabad",
    "aliases": []
  },
  {
    "id": "hr_gurugram",
    "lgdCode": 62,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Gurugram",
    "aliases": []
  },
  {
    "id": "hr_hisar",
    "lgdCode": 63,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Hisar",
    "aliases": []
  },
  {
    "id": "hr_jhajjar",
    "lgdCode": 64,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Jhajjar",
    "aliases": []
  },
  {
    "id": "hr_jind",
    "lgdCode": 65,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Jind",
    "aliases": []
  },
  {
    "id": "hr_kaithal",
    "lgdCode": 66,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Kaithal",
    "aliases": []
  },
  {
    "id": "hr_karnal",
    "lgdCode": 67,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Karnal",
    "aliases": []
  },
  {
    "id": "hr_kurukshetra",
    "lgdCode": 68,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Kurukshetra",
    "aliases": []
  },
  {
    "id": "hr_mahendragarh",
    "lgdCode": 69,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Mahendragarh",
    "aliases": []
  },
  {
    "id": "hr_nuh",
    "lgdCode": 604,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Nuh",
    "aliases": []
  },
  {
    "id": "hr_palwal",
    "lgdCode": 619,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Palwal",
    "aliases": []
  },
  {
    "id": "hr_panchkula",
    "lgdCode": 70,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Panchkula",
    "aliases": []
  },
  {
    "id": "hr_panipat",
    "lgdCode": 71,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Panipat",
    "aliases": []
  },
  {
    "id": "hr_rewari",
    "lgdCode": 72,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Rewari",
    "aliases": []
  },
  {
    "id": "hr_rohtak",
    "lgdCode": 73,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Rohtak",
    "aliases": []
  },
  {
    "id": "hr_sirsa",
    "lgdCode": 74,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Sirsa",
    "aliases": []
  },
  {
    "id": "hr_sonipat",
    "lgdCode": 75,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Sonipat",
    "aliases": []
  },
  {
    "id": "hr_yamunanagar",
    "lgdCode": 76,
    "stateCode": "HR",
    "stateName": "Haryana",
    "name": "Yamunanagar",
    "aliases": []
  },
  {
    "id": "hp_bilaspur",
    "lgdCode": 15,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Bilaspur",
    "aliases": []
  },
  {
    "id": "hp_chamba",
    "lgdCode": 16,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Chamba",
    "aliases": []
  },
  {
    "id": "hp_hamirpur",
    "lgdCode": 17,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Hamirpur",
    "aliases": []
  },
  {
    "id": "hp_kangra",
    "lgdCode": 18,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Kangra",
    "aliases": []
  },
  {
    "id": "hp_kinnaur",
    "lgdCode": 19,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Kinnaur",
    "aliases": []
  },
  {
    "id": "hp_kullu",
    "lgdCode": 20,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Kullu",
    "aliases": []
  },
  {
    "id": "hp_lahul_and_spiti",
    "lgdCode": 21,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Lahul and Spiti",
    "aliases": []
  },
  {
    "id": "hp_mandi",
    "lgdCode": 22,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Mandi",
    "aliases": []
  },
  {
    "id": "hp_shimla",
    "lgdCode": 23,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Shimla",
    "aliases": []
  },
  {
    "id": "hp_sirmaur",
    "lgdCode": 24,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Sirmaur",
    "aliases": []
  },
  {
    "id": "hp_solan",
    "lgdCode": 25,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Solan",
    "aliases": []
  },
  {
    "id": "hp_una",
    "lgdCode": 26,
    "stateCode": "HP",
    "stateName": "Himachal Pradesh",
    "name": "Una",
    "aliases": []
  },
  {
    "id": "jk_anantnag",
    "lgdCode": 1,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Anantnag",
    "aliases": []
  },
  {
    "id": "jk_bandipora",
    "lgdCode": 623,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Bandipora",
    "aliases": []
  },
  {
    "id": "jk_baramulla",
    "lgdCode": 3,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Baramulla",
    "aliases": []
  },
  {
    "id": "jk_budgam",
    "lgdCode": 2,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Budgam",
    "aliases": []
  },
  {
    "id": "jk_doda",
    "lgdCode": 4,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Doda",
    "aliases": []
  },
  {
    "id": "jk_ganderbal",
    "lgdCode": 626,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Ganderbal",
    "aliases": []
  },
  {
    "id": "jk_jammu",
    "lgdCode": 5,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Jammu",
    "aliases": []
  },
  {
    "id": "jk_kathua",
    "lgdCode": 7,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Kathua",
    "aliases": []
  },
  {
    "id": "jk_kishtwar",
    "lgdCode": 620,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Kishtwar",
    "aliases": []
  },
  {
    "id": "jk_kulgam",
    "lgdCode": 622,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Kulgam",
    "aliases": []
  },
  {
    "id": "jk_kupwara",
    "lgdCode": 8,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Kupwara",
    "aliases": []
  },
  {
    "id": "jk_poonch",
    "lgdCode": 10,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Poonch",
    "aliases": []
  },
  {
    "id": "jk_pulwama",
    "lgdCode": 11,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Pulwama",
    "aliases": []
  },
  {
    "id": "jk_rajouri",
    "lgdCode": 12,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Rajouri",
    "aliases": []
  },
  {
    "id": "jk_ramban",
    "lgdCode": 621,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Ramban",
    "aliases": []
  },
  {
    "id": "jk_reasi",
    "lgdCode": 627,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Reasi",
    "aliases": []
  },
  {
    "id": "jk_samba",
    "lgdCode": 624,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Samba",
    "aliases": []
  },
  {
    "id": "jk_shopian",
    "lgdCode": 625,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Shopian",
    "aliases": []
  },
  {
    "id": "jk_srinagar",
    "lgdCode": 13,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Srinagar",
    "aliases": []
  },
  {
    "id": "jk_udhampur",
    "lgdCode": 14,
    "stateCode": "JK",
    "stateName": "Jammu and Kashmir",
    "name": "Udhampur",
    "aliases": []
  },
  {
    "id": "jh_bokaro",
    "lgdCode": 322,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Bokaro",
    "aliases": []
  },
  {
    "id": "jh_chatra",
    "lgdCode": 323,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Chatra",
    "aliases": []
  },
  {
    "id": "jh_deoghar",
    "lgdCode": 324,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Deoghar",
    "aliases": []
  },
  {
    "id": "jh_dhanbad",
    "lgdCode": 325,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Dhanbad",
    "aliases": []
  },
  {
    "id": "jh_dumka",
    "lgdCode": 326,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Dumka",
    "aliases": []
  },
  {
    "id": "jh_east_singhbum",
    "lgdCode": 327,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "East Singhbum",
    "aliases": []
  },
  {
    "id": "jh_garhwa",
    "lgdCode": 328,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Garhwa",
    "aliases": []
  },
  {
    "id": "jh_giridih",
    "lgdCode": 329,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Giridih",
    "aliases": []
  },
  {
    "id": "jh_godda",
    "lgdCode": 330,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Godda",
    "aliases": []
  },
  {
    "id": "jh_gumla",
    "lgdCode": 331,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Gumla",
    "aliases": []
  },
  {
    "id": "jh_hazaribagh",
    "lgdCode": 332,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Hazaribagh",
    "aliases": []
  },
  {
    "id": "jh_jamtara",
    "lgdCode": 333,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Jamtara",
    "aliases": []
  },
  {
    "id": "jh_khunti",
    "lgdCode": 606,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Khunti",
    "aliases": []
  },
  {
    "id": "jh_koderma",
    "lgdCode": 334,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Koderma",
    "aliases": []
  },
  {
    "id": "jh_latehar",
    "lgdCode": 335,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Latehar",
    "aliases": []
  },
  {
    "id": "jh_lohardaga",
    "lgdCode": 336,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Lohardaga",
    "aliases": []
  },
  {
    "id": "jh_pakur",
    "lgdCode": 337,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Pakur",
    "aliases": []
  },
  {
    "id": "jh_palamu",
    "lgdCode": 338,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Palamu",
    "aliases": []
  },
  {
    "id": "jh_ramgarh",
    "lgdCode": 607,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Ramgarh",
    "aliases": []
  },
  {
    "id": "jh_ranchi",
    "lgdCode": 339,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Ranchi",
    "aliases": []
  },
  {
    "id": "jh_sahebganj",
    "lgdCode": 340,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Sahebganj",
    "aliases": []
  },
  {
    "id": "jh_saraikela_kharsawan",
    "lgdCode": 341,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Saraikela Kharsawan",
    "aliases": []
  },
  {
    "id": "jh_simdega",
    "lgdCode": 342,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "Simdega",
    "aliases": []
  },
  {
    "id": "jh_west_singhbhum",
    "lgdCode": 343,
    "stateCode": "JH",
    "stateName": "Jharkhand",
    "name": "West Singhbhum",
    "aliases": []
  },
  {
    "id": "ka_bagalkote",
    "lgdCode": 524,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Bagalkote",
    "aliases": []
  },
  {
    "id": "ka_ballari",
    "lgdCode": 528,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Ballari",
    "aliases": []
  },
  {
    "id": "ka_belagavi",
    "lgdCode": 527,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Belagavi",
    "aliases": []
  },
  {
    "id": "ka_bengaluru_rural",
    "lgdCode": 526,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Bengaluru Rural",
    "aliases": []
  },
  {
    "id": "ka_bengaluru_urban",
    "lgdCode": 525,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Bengaluru Urban",
    "aliases": []
  },
  {
    "id": "ka_bidar",
    "lgdCode": 529,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Bidar",
    "aliases": []
  },
  {
    "id": "ka_chamarajanagara",
    "lgdCode": 531,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Chamarajanagara",
    "aliases": []
  },
  {
    "id": "ka_chikkaballapura",
    "lgdCode": 630,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Chikkaballapura",
    "aliases": []
  },
  {
    "id": "ka_chikkamagaluru",
    "lgdCode": 532,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Chikkamagaluru",
    "aliases": []
  },
  {
    "id": "ka_chitradurga",
    "lgdCode": 533,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Chitradurga",
    "aliases": []
  },
  {
    "id": "ka_dakshina_kannada",
    "lgdCode": 534,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Dakshina Kannada",
    "aliases": []
  },
  {
    "id": "ka_davangere",
    "lgdCode": 535,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Davangere",
    "aliases": []
  },
  {
    "id": "ka_dharwad",
    "lgdCode": 536,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Dharwad",
    "aliases": []
  },
  {
    "id": "ka_gadag",
    "lgdCode": 537,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Gadag",
    "aliases": []
  },
  {
    "id": "ka_hassan",
    "lgdCode": 539,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Hassan",
    "aliases": []
  },
  {
    "id": "ka_haveri",
    "lgdCode": 540,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Haveri",
    "aliases": []
  },
  {
    "id": "ka_kalaburagi",
    "lgdCode": 538,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Kalaburagi",
    "aliases": []
  },
  {
    "id": "ka_kodagu",
    "lgdCode": 541,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Kodagu",
    "aliases": []
  },
  {
    "id": "ka_kolar",
    "lgdCode": 542,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Kolar",
    "aliases": []
  },
  {
    "id": "ka_koppal",
    "lgdCode": 543,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Koppal",
    "aliases": []
  },
  {
    "id": "ka_mandya",
    "lgdCode": 544,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Mandya",
    "aliases": []
  },
  {
    "id": "ka_mysuru",
    "lgdCode": 545,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Mysuru",
    "aliases": []
  },
  {
    "id": "ka_raichur",
    "lgdCode": 546,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Raichur",
    "aliases": []
  },
  {
    "id": "ka_ramanagara",
    "lgdCode": 631,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Ramanagara",
    "aliases": []
  },
  {
    "id": "ka_shivamogga",
    "lgdCode": 547,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Shivamogga",
    "aliases": []
  },
  {
    "id": "ka_tumakuru",
    "lgdCode": 548,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Tumakuru",
    "aliases": []
  },
  {
    "id": "ka_udupi",
    "lgdCode": 549,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Udupi",
    "aliases": []
  },
  {
    "id": "ka_uttara_kannada",
    "lgdCode": 550,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Uttara Kannada",
    "aliases": []
  },
  {
    "id": "ka_vijayanagar",
    "lgdCode": 738,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Vijayanagar",
    "aliases": []
  },
  {
    "id": "ka_vijayapura",
    "lgdCode": 530,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Vijayapura",
    "aliases": []
  },
  {
    "id": "ka_yadgir",
    "lgdCode": 635,
    "stateCode": "KA",
    "stateName": "Karnataka",
    "name": "Yadgir",
    "aliases": []
  },
  {
    "id": "kl_alappuzha",
    "lgdCode": 554,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Alappuzha",
    "aliases": []
  },
  {
    "id": "kl_ernakulam",
    "lgdCode": 555,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Ernakulam",
    "aliases": []
  },
  {
    "id": "kl_idukki",
    "lgdCode": 556,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Idukki",
    "aliases": []
  },
  {
    "id": "kl_kannur",
    "lgdCode": 557,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Kannur",
    "aliases": []
  },
  {
    "id": "kl_kasaragod",
    "lgdCode": 558,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Kasaragod",
    "aliases": []
  },
  {
    "id": "kl_kollam",
    "lgdCode": 559,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Kollam",
    "aliases": []
  },
  {
    "id": "kl_kottayam",
    "lgdCode": 560,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Kottayam",
    "aliases": []
  },
  {
    "id": "kl_kozhikode",
    "lgdCode": 561,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Kozhikode",
    "aliases": []
  },
  {
    "id": "kl_malappuram",
    "lgdCode": 562,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Malappuram",
    "aliases": []
  },
  {
    "id": "kl_palakkad",
    "lgdCode": 563,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Palakkad",
    "aliases": []
  },
  {
    "id": "kl_pathanamthitta",
    "lgdCode": 564,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Pathanamthitta",
    "aliases": []
  },
  {
    "id": "kl_thiruvananthapuram",
    "lgdCode": 565,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Thiruvananthapuram",
    "aliases": []
  },
  {
    "id": "kl_thrissur",
    "lgdCode": 566,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Thrissur",
    "aliases": []
  },
  {
    "id": "kl_wayanad",
    "lgdCode": 567,
    "stateCode": "KL",
    "stateName": "Kerala",
    "name": "Wayanad",
    "aliases": []
  },
  {
    "id": "la_kargil",
    "lgdCode": 6,
    "stateCode": "LA",
    "stateName": "Ladakh",
    "name": "Kargil",
    "aliases": []
  },
  {
    "id": "la_leh_ladakh",
    "lgdCode": 9,
    "stateCode": "LA",
    "stateName": "Ladakh",
    "name": "Leh Ladakh",
    "aliases": []
  },
  {
    "id": "ld_lakshadweep_district",
    "lgdCode": 553,
    "stateCode": "LD",
    "stateName": "Lakshadweep",
    "name": "Lakshadweep District",
    "aliases": []
  },
  {
    "id": "mp_agar_malwa",
    "lgdCode": 667,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Agar Malwa",
    "aliases": []
  },
  {
    "id": "mp_alirajpur",
    "lgdCode": 639,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Alirajpur",
    "aliases": []
  },
  {
    "id": "mp_anuppur",
    "lgdCode": 390,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Anuppur",
    "aliases": []
  },
  {
    "id": "mp_ashoknagar",
    "lgdCode": 391,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Ashoknagar",
    "aliases": []
  },
  {
    "id": "mp_balaghat",
    "lgdCode": 392,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Balaghat",
    "aliases": []
  },
  {
    "id": "mp_barwani",
    "lgdCode": 393,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Barwani",
    "aliases": []
  },
  {
    "id": "mp_betul",
    "lgdCode": 394,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Betul",
    "aliases": []
  },
  {
    "id": "mp_bhind",
    "lgdCode": 395,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Bhind",
    "aliases": []
  },
  {
    "id": "mp_bhopal",
    "lgdCode": 396,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Bhopal",
    "aliases": []
  },
  {
    "id": "mp_burhanpur",
    "lgdCode": 397,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Burhanpur",
    "aliases": []
  },
  {
    "id": "mp_chhatarpur",
    "lgdCode": 398,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Chhatarpur",
    "aliases": []
  },
  {
    "id": "mp_chhindwara",
    "lgdCode": 399,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Chhindwara",
    "aliases": []
  },
  {
    "id": "mp_damoh",
    "lgdCode": 400,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Damoh",
    "aliases": []
  },
  {
    "id": "mp_datia",
    "lgdCode": 401,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Datia",
    "aliases": []
  },
  {
    "id": "mp_dewas",
    "lgdCode": 402,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Dewas",
    "aliases": []
  },
  {
    "id": "mp_dhar",
    "lgdCode": 403,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Dhar",
    "aliases": []
  },
  {
    "id": "mp_dindori",
    "lgdCode": 404,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Dindori",
    "aliases": []
  },
  {
    "id": "mp_east_nimar",
    "lgdCode": 405,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "East Nimar",
    "aliases": []
  },
  {
    "id": "mp_guna",
    "lgdCode": 406,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Guna",
    "aliases": []
  },
  {
    "id": "mp_gwalior",
    "lgdCode": 407,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Gwalior",
    "aliases": []
  },
  {
    "id": "mp_harda",
    "lgdCode": 408,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Harda",
    "aliases": []
  },
  {
    "id": "mp_indore",
    "lgdCode": 410,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Indore",
    "aliases": []
  },
  {
    "id": "mp_jabalpur",
    "lgdCode": 411,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Jabalpur",
    "aliases": []
  },
  {
    "id": "mp_jhabua",
    "lgdCode": 412,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Jhabua",
    "aliases": []
  },
  {
    "id": "mp_katni",
    "lgdCode": 413,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Katni",
    "aliases": []
  },
  {
    "id": "mp_khargone",
    "lgdCode": 414,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Khargone",
    "aliases": []
  },
  {
    "id": "mp_mandla",
    "lgdCode": 415,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Mandla",
    "aliases": []
  },
  {
    "id": "mp_mandsaur",
    "lgdCode": 416,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Mandsaur",
    "aliases": []
  },
  {
    "id": "mp_morena",
    "lgdCode": 417,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Morena",
    "aliases": []
  },
  {
    "id": "mp_narmadapuram",
    "lgdCode": 409,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Narmadapuram",
    "aliases": []
  },
  {
    "id": "mp_narsinghpur",
    "lgdCode": 418,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Narsinghpur",
    "aliases": []
  },
  {
    "id": "mp_neemuch",
    "lgdCode": 419,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Neemuch",
    "aliases": []
  },
  {
    "id": "mp_niwari",
    "lgdCode": 722,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Niwari",
    "aliases": []
  },
  {
    "id": "mp_panna",
    "lgdCode": 420,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Panna",
    "aliases": []
  },
  {
    "id": "mp_raisen",
    "lgdCode": 421,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Raisen",
    "aliases": []
  },
  {
    "id": "mp_rajgarh",
    "lgdCode": 422,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Rajgarh",
    "aliases": []
  },
  {
    "id": "mp_ratlam",
    "lgdCode": 423,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Ratlam",
    "aliases": []
  },
  {
    "id": "mp_rewa",
    "lgdCode": 424,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Rewa",
    "aliases": []
  },
  {
    "id": "mp_sagar",
    "lgdCode": 425,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Sagar",
    "aliases": []
  },
  {
    "id": "mp_satna",
    "lgdCode": 426,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Satna",
    "aliases": []
  },
  {
    "id": "mp_sehore",
    "lgdCode": 427,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Sehore",
    "aliases": []
  },
  {
    "id": "mp_seoni",
    "lgdCode": 428,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Seoni",
    "aliases": []
  },
  {
    "id": "mp_shahdol",
    "lgdCode": 429,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Shahdol",
    "aliases": []
  },
  {
    "id": "mp_shajapur",
    "lgdCode": 430,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Shajapur",
    "aliases": []
  },
  {
    "id": "mp_sheopur",
    "lgdCode": 431,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Sheopur",
    "aliases": []
  },
  {
    "id": "mp_shivpuri",
    "lgdCode": 432,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Shivpuri",
    "aliases": []
  },
  {
    "id": "mp_sidhi",
    "lgdCode": 433,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Sidhi",
    "aliases": []
  },
  {
    "id": "mp_singrauli",
    "lgdCode": 638,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Singrauli",
    "aliases": []
  },
  {
    "id": "mp_tikamgarh",
    "lgdCode": 434,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Tikamgarh",
    "aliases": []
  },
  {
    "id": "mp_ujjain",
    "lgdCode": 435,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Ujjain",
    "aliases": []
  },
  {
    "id": "mp_umaria",
    "lgdCode": 436,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Umaria",
    "aliases": []
  },
  {
    "id": "mp_vidisha",
    "lgdCode": 437,
    "stateCode": "MP",
    "stateName": "Madhya Pradesh",
    "name": "Vidisha",
    "aliases": []
  },
  {
    "id": "mh_ahilyanagar",
    "lgdCode": 466,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Ahilyanagar",
    "aliases": [
      "Ahmednagar"
    ]
  },
  {
    "id": "mh_akola",
    "lgdCode": 467,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Akola",
    "aliases": []
  },
  {
    "id": "mh_amravati",
    "lgdCode": 468,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Amravati",
    "aliases": []
  },
  {
    "id": "mh_beed",
    "lgdCode": 470,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Beed",
    "aliases": []
  },
  {
    "id": "mh_bhandara",
    "lgdCode": 471,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Bhandara",
    "aliases": []
  },
  {
    "id": "mh_buldhana",
    "lgdCode": 472,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Buldhana",
    "aliases": []
  },
  {
    "id": "mh_chandrapur",
    "lgdCode": 473,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Chandrapur",
    "aliases": []
  },
  {
    "id": "mh_chhatrapati_sambhajinagar",
    "lgdCode": 469,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Chhatrapati Sambhajinagar",
    "aliases": [
      "Aurangabad"
    ]
  },
  {
    "id": "mh_dharashiv",
    "lgdCode": 488,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Dharashiv",
    "aliases": [
      "Osmanabad"
    ]
  },
  {
    "id": "mh_dhule",
    "lgdCode": 474,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Dhule",
    "aliases": []
  },
  {
    "id": "mh_gadchiroli",
    "lgdCode": 475,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Gadchiroli",
    "aliases": []
  },
  {
    "id": "mh_gondia",
    "lgdCode": 476,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Gondia",
    "aliases": []
  },
  {
    "id": "mh_hingoli",
    "lgdCode": 477,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Hingoli",
    "aliases": []
  },
  {
    "id": "mh_jalgaon",
    "lgdCode": 478,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Jalgaon",
    "aliases": []
  },
  {
    "id": "mh_jalna",
    "lgdCode": 479,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Jalna",
    "aliases": []
  },
  {
    "id": "mh_kolhapur",
    "lgdCode": 480,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Kolhapur",
    "aliases": []
  },
  {
    "id": "mh_latur",
    "lgdCode": 481,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Latur",
    "aliases": []
  },
  {
    "id": "mh_mumbai_city",
    "lgdCode": 482,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Mumbai City",
    "aliases": [
      "Mumbai"
    ]
  },
  {
    "id": "mh_mumbai_suburban",
    "lgdCode": 483,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Mumbai Suburban",
    "aliases": []
  },
  {
    "id": "mh_nagpur",
    "lgdCode": 484,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Nagpur",
    "aliases": []
  },
  {
    "id": "mh_nanded",
    "lgdCode": 485,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Nanded",
    "aliases": []
  },
  {
    "id": "mh_nandurbar",
    "lgdCode": 486,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Nandurbar",
    "aliases": []
  },
  {
    "id": "mh_nashik",
    "lgdCode": 487,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Nashik",
    "aliases": []
  },
  {
    "id": "mh_palghar",
    "lgdCode": 665,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Palghar",
    "aliases": []
  },
  {
    "id": "mh_parbhani",
    "lgdCode": 489,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Parbhani",
    "aliases": []
  },
  {
    "id": "mh_pune",
    "lgdCode": 490,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Pune",
    "aliases": []
  },
  {
    "id": "mh_raigad",
    "lgdCode": 491,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Raigad",
    "aliases": []
  },
  {
    "id": "mh_ratnagiri",
    "lgdCode": 492,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Ratnagiri",
    "aliases": []
  },
  {
    "id": "mh_sangli",
    "lgdCode": 493,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Sangli",
    "aliases": []
  },
  {
    "id": "mh_satara",
    "lgdCode": 494,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Satara",
    "aliases": []
  },
  {
    "id": "mh_sindhudurg",
    "lgdCode": 495,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Sindhudurg",
    "aliases": []
  },
  {
    "id": "mh_solapur",
    "lgdCode": 496,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Solapur",
    "aliases": []
  },
  {
    "id": "mh_thane",
    "lgdCode": 497,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Thane",
    "aliases": []
  },
  {
    "id": "mh_wardha",
    "lgdCode": 498,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Wardha",
    "aliases": []
  },
  {
    "id": "mh_washim",
    "lgdCode": 499,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Washim",
    "aliases": []
  },
  {
    "id": "mh_yavatmal",
    "lgdCode": 500,
    "stateCode": "MH",
    "stateName": "Maharashtra",
    "name": "Yavatmal",
    "aliases": []
  },
  {
    "id": "mn_bishnupur",
    "lgdCode": 252,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Bishnupur",
    "aliases": []
  },
  {
    "id": "mn_chandel",
    "lgdCode": 253,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Chandel",
    "aliases": []
  },
  {
    "id": "mn_churachandpur",
    "lgdCode": 254,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Churachandpur",
    "aliases": []
  },
  {
    "id": "mn_imphal_east",
    "lgdCode": 255,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Imphal East",
    "aliases": []
  },
  {
    "id": "mn_imphal_west",
    "lgdCode": 256,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Imphal West",
    "aliases": []
  },
  {
    "id": "mn_jiribam",
    "lgdCode": 713,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Jiribam",
    "aliases": []
  },
  {
    "id": "mn_kakching",
    "lgdCode": 711,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Kakching",
    "aliases": []
  },
  {
    "id": "mn_kamjong",
    "lgdCode": 717,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Kamjong",
    "aliases": []
  },
  {
    "id": "mn_kangpokpi",
    "lgdCode": 712,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Kangpokpi",
    "aliases": []
  },
  {
    "id": "mn_noney",
    "lgdCode": 714,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Noney",
    "aliases": []
  },
  {
    "id": "mn_pherzawl",
    "lgdCode": 715,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Pherzawl",
    "aliases": []
  },
  {
    "id": "mn_senapati",
    "lgdCode": 257,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Senapati",
    "aliases": []
  },
  {
    "id": "mn_tamenglong",
    "lgdCode": 258,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Tamenglong",
    "aliases": []
  },
  {
    "id": "mn_tengnoupal",
    "lgdCode": 716,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Tengnoupal",
    "aliases": []
  },
  {
    "id": "mn_thoubal",
    "lgdCode": 259,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Thoubal",
    "aliases": []
  },
  {
    "id": "mn_ukhrul",
    "lgdCode": 260,
    "stateCode": "MN",
    "stateName": "Manipur",
    "name": "Ukhrul",
    "aliases": []
  },
  {
    "id": "ml_east_garo_hills",
    "lgdCode": 273,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "East Garo Hills",
    "aliases": []
  },
  {
    "id": "ml_east_jaintia_hills",
    "lgdCode": 657,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "East Jaintia Hills",
    "aliases": []
  },
  {
    "id": "ml_east_khasi_hills",
    "lgdCode": 274,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "East Khasi Hills",
    "aliases": []
  },
  {
    "id": "ml_eastern_west_khasi_hills",
    "lgdCode": 740,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "Eastern West Khasi Hills",
    "aliases": []
  },
  {
    "id": "ml_north_garo_hills",
    "lgdCode": 656,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "North Garo Hills",
    "aliases": []
  },
  {
    "id": "ml_ri_bhoi",
    "lgdCode": 276,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "Ri Bhoi",
    "aliases": []
  },
  {
    "id": "ml_south_garo_hills",
    "lgdCode": 277,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "South Garo Hills",
    "aliases": []
  },
  {
    "id": "ml_south_west_garo_hills",
    "lgdCode": 663,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "South West Garo Hills",
    "aliases": []
  },
  {
    "id": "ml_south_west_khasi_hills",
    "lgdCode": 658,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "South West Khasi Hills",
    "aliases": []
  },
  {
    "id": "ml_west_garo_hills",
    "lgdCode": 278,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "West Garo Hills",
    "aliases": []
  },
  {
    "id": "ml_west_jaintia_hills",
    "lgdCode": 275,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "West Jaintia Hills",
    "aliases": []
  },
  {
    "id": "ml_west_khasi_hills",
    "lgdCode": 279,
    "stateCode": "ML",
    "stateName": "Meghalaya",
    "name": "West Khasi Hills",
    "aliases": []
  },
  {
    "id": "mz_aizawl",
    "lgdCode": 261,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Aizawl",
    "aliases": []
  },
  {
    "id": "mz_champhai",
    "lgdCode": 262,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Champhai",
    "aliases": []
  },
  {
    "id": "mz_hnahthial",
    "lgdCode": 726,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Hnahthial",
    "aliases": []
  },
  {
    "id": "mz_khawzawl",
    "lgdCode": 728,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Khawzawl",
    "aliases": []
  },
  {
    "id": "mz_kolasib",
    "lgdCode": 263,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Kolasib",
    "aliases": []
  },
  {
    "id": "mz_lawngtlai",
    "lgdCode": 264,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Lawngtlai",
    "aliases": []
  },
  {
    "id": "mz_lunglei",
    "lgdCode": 265,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Lunglei",
    "aliases": []
  },
  {
    "id": "mz_mamit",
    "lgdCode": 266,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Mamit",
    "aliases": []
  },
  {
    "id": "mz_saiha",
    "lgdCode": 267,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Saiha",
    "aliases": []
  },
  {
    "id": "mz_saitual",
    "lgdCode": 727,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Saitual",
    "aliases": []
  },
  {
    "id": "mz_serchhip",
    "lgdCode": 268,
    "stateCode": "MZ",
    "stateName": "Mizoram",
    "name": "Serchhip",
    "aliases": []
  },
  {
    "id": "nl_chumoukedima",
    "lgdCode": 758,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Chumoukedima",
    "aliases": []
  },
  {
    "id": "nl_dimapur",
    "lgdCode": 244,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Dimapur",
    "aliases": []
  },
  {
    "id": "nl_kiphire",
    "lgdCode": 614,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Kiphire",
    "aliases": []
  },
  {
    "id": "nl_kohima",
    "lgdCode": 245,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Kohima",
    "aliases": []
  },
  {
    "id": "nl_longleng",
    "lgdCode": 615,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Longleng",
    "aliases": []
  },
  {
    "id": "nl_mokokchung",
    "lgdCode": 246,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Mokokchung",
    "aliases": []
  },
  {
    "id": "nl_mon",
    "lgdCode": 247,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Mon",
    "aliases": []
  },
  {
    "id": "nl_noklak",
    "lgdCode": 736,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Noklak",
    "aliases": []
  },
  {
    "id": "nl_peren",
    "lgdCode": 613,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Peren",
    "aliases": []
  },
  {
    "id": "nl_phek",
    "lgdCode": 248,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Phek",
    "aliases": []
  },
  {
    "id": "nl_tseminyu",
    "lgdCode": 757,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Tseminyu",
    "aliases": []
  },
  {
    "id": "nl_tuensang",
    "lgdCode": 249,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Tuensang",
    "aliases": []
  },
  {
    "id": "nl_wokha",
    "lgdCode": 250,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Wokha",
    "aliases": []
  },
  {
    "id": "nl_zunheboto",
    "lgdCode": 251,
    "stateCode": "NL",
    "stateName": "Nagaland",
    "name": "Zunheboto",
    "aliases": []
  },
  {
    "id": "od_anugul",
    "lgdCode": 344,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Anugul",
    "aliases": []
  },
  {
    "id": "od_balangir",
    "lgdCode": 345,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Balangir",
    "aliases": []
  },
  {
    "id": "od_baleshwar",
    "lgdCode": 346,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Baleshwar",
    "aliases": []
  },
  {
    "id": "od_bargarh",
    "lgdCode": 347,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Bargarh",
    "aliases": []
  },
  {
    "id": "od_bhadrak",
    "lgdCode": 348,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Bhadrak",
    "aliases": []
  },
  {
    "id": "od_boudh",
    "lgdCode": 349,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Boudh",
    "aliases": []
  },
  {
    "id": "od_cuttack",
    "lgdCode": 350,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Cuttack",
    "aliases": []
  },
  {
    "id": "od_deogarh",
    "lgdCode": 351,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Deogarh",
    "aliases": []
  },
  {
    "id": "od_dhenkanal",
    "lgdCode": 352,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Dhenkanal",
    "aliases": []
  },
  {
    "id": "od_gajapati",
    "lgdCode": 353,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Gajapati",
    "aliases": []
  },
  {
    "id": "od_ganjam",
    "lgdCode": 354,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Ganjam",
    "aliases": []
  },
  {
    "id": "od_jagatsinghapur",
    "lgdCode": 355,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Jagatsinghapur",
    "aliases": []
  },
  {
    "id": "od_jajapur",
    "lgdCode": 356,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Jajapur",
    "aliases": []
  },
  {
    "id": "od_jharsuguda",
    "lgdCode": 357,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Jharsuguda",
    "aliases": []
  },
  {
    "id": "od_kalahandi",
    "lgdCode": 358,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Kalahandi",
    "aliases": []
  },
  {
    "id": "od_kandhamal",
    "lgdCode": 359,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Kandhamal",
    "aliases": []
  },
  {
    "id": "od_kendrapara",
    "lgdCode": 360,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Kendrapara",
    "aliases": []
  },
  {
    "id": "od_kendujhar",
    "lgdCode": 361,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Kendujhar",
    "aliases": []
  },
  {
    "id": "od_khordha",
    "lgdCode": 362,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Khordha",
    "aliases": []
  },
  {
    "id": "od_koraput",
    "lgdCode": 363,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Koraput",
    "aliases": []
  },
  {
    "id": "od_malkangiri",
    "lgdCode": 364,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Malkangiri",
    "aliases": []
  },
  {
    "id": "od_mayurbhanj",
    "lgdCode": 365,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Mayurbhanj",
    "aliases": []
  },
  {
    "id": "od_nabarangpur",
    "lgdCode": 366,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Nabarangpur",
    "aliases": []
  },
  {
    "id": "od_nayagarh",
    "lgdCode": 367,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Nayagarh",
    "aliases": []
  },
  {
    "id": "od_nuapada",
    "lgdCode": 368,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Nuapada",
    "aliases": []
  },
  {
    "id": "od_puri",
    "lgdCode": 369,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Puri",
    "aliases": []
  },
  {
    "id": "od_rayagada",
    "lgdCode": 370,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Rayagada",
    "aliases": []
  },
  {
    "id": "od_sambalpur",
    "lgdCode": 371,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Sambalpur",
    "aliases": []
  },
  {
    "id": "od_sonepur",
    "lgdCode": 372,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Sonepur",
    "aliases": []
  },
  {
    "id": "od_sundargarh",
    "lgdCode": 373,
    "stateCode": "OD",
    "stateName": "Odisha",
    "name": "Sundargarh",
    "aliases": []
  },
  {
    "id": "py_karaikal",
    "lgdCode": 598,
    "stateCode": "PY",
    "stateName": "Puducherry",
    "name": "Karaikal",
    "aliases": []
  },
  {
    "id": "py_mahe",
    "lgdCode": 599,
    "stateCode": "PY",
    "stateName": "Puducherry",
    "name": "Mahe",
    "aliases": []
  },
  {
    "id": "py_pondicherry",
    "lgdCode": 600,
    "stateCode": "PY",
    "stateName": "Puducherry",
    "name": "Pondicherry",
    "aliases": []
  },
  {
    "id": "py_yanam",
    "lgdCode": 601,
    "stateCode": "PY",
    "stateName": "Puducherry",
    "name": "Yanam",
    "aliases": []
  },
  {
    "id": "pb_amritsar",
    "lgdCode": 27,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Amritsar",
    "aliases": []
  },
  {
    "id": "pb_barnala",
    "lgdCode": 605,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Barnala",
    "aliases": []
  },
  {
    "id": "pb_bathinda",
    "lgdCode": 28,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Bathinda",
    "aliases": []
  },
  {
    "id": "pb_faridkot",
    "lgdCode": 29,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Faridkot",
    "aliases": []
  },
  {
    "id": "pb_fatehgarh_sahib",
    "lgdCode": 30,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Fatehgarh Sahib",
    "aliases": []
  },
  {
    "id": "pb_fazilka",
    "lgdCode": 651,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Fazilka",
    "aliases": []
  },
  {
    "id": "pb_ferozepur",
    "lgdCode": 31,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Ferozepur",
    "aliases": []
  },
  {
    "id": "pb_gurdaspur",
    "lgdCode": 32,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Gurdaspur",
    "aliases": []
  },
  {
    "id": "pb_hoshiarpur",
    "lgdCode": 33,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Hoshiarpur",
    "aliases": []
  },
  {
    "id": "pb_jalandhar",
    "lgdCode": 34,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Jalandhar",
    "aliases": []
  },
  {
    "id": "pb_kapurthala",
    "lgdCode": 35,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Kapurthala",
    "aliases": []
  },
  {
    "id": "pb_ludhiana",
    "lgdCode": 36,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Ludhiana",
    "aliases": []
  },
  {
    "id": "pb_malerkotla",
    "lgdCode": 737,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Malerkotla",
    "aliases": []
  },
  {
    "id": "pb_mansa",
    "lgdCode": 37,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Mansa",
    "aliases": []
  },
  {
    "id": "pb_moga",
    "lgdCode": 38,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Moga",
    "aliases": []
  },
  {
    "id": "pb_pathankot",
    "lgdCode": 662,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Pathankot",
    "aliases": []
  },
  {
    "id": "pb_patiala",
    "lgdCode": 41,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Patiala",
    "aliases": []
  },
  {
    "id": "pb_rupnagar",
    "lgdCode": 42,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Rupnagar",
    "aliases": []
  },
  {
    "id": "pb_s_a_s_nagar",
    "lgdCode": 608,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "S.a.s Nagar",
    "aliases": []
  },
  {
    "id": "pb_sangrur",
    "lgdCode": 43,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Sangrur",
    "aliases": []
  },
  {
    "id": "pb_shahid_bhagat_singh_nagar",
    "lgdCode": 40,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Shahid Bhagat Singh Nagar",
    "aliases": []
  },
  {
    "id": "pb_sri_muktsar_sahib",
    "lgdCode": 39,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Sri Muktsar Sahib",
    "aliases": []
  },
  {
    "id": "pb_tarn_taran",
    "lgdCode": 609,
    "stateCode": "PB",
    "stateName": "Punjab",
    "name": "Tarn Taran",
    "aliases": []
  },
  {
    "id": "rj_ajmer",
    "lgdCode": 86,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Ajmer",
    "aliases": []
  },
  {
    "id": "rj_alwar",
    "lgdCode": 87,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Alwar",
    "aliases": []
  },
  {
    "id": "rj_banswara",
    "lgdCode": 88,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Banswara",
    "aliases": []
  },
  {
    "id": "rj_baran",
    "lgdCode": 89,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Baran",
    "aliases": []
  },
  {
    "id": "rj_barmer",
    "lgdCode": 90,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Barmer",
    "aliases": []
  },
  {
    "id": "rj_bharatpur",
    "lgdCode": 91,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Bharatpur",
    "aliases": []
  },
  {
    "id": "rj_bhilwara",
    "lgdCode": 92,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Bhilwara",
    "aliases": []
  },
  {
    "id": "rj_bikaner",
    "lgdCode": 93,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Bikaner",
    "aliases": []
  },
  {
    "id": "rj_bundi",
    "lgdCode": 94,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Bundi",
    "aliases": []
  },
  {
    "id": "rj_chittorgarh",
    "lgdCode": 95,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Chittorgarh",
    "aliases": []
  },
  {
    "id": "rj_churu",
    "lgdCode": 96,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Churu",
    "aliases": []
  },
  {
    "id": "rj_dausa",
    "lgdCode": 97,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Dausa",
    "aliases": []
  },
  {
    "id": "rj_dholpur",
    "lgdCode": 98,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Dholpur",
    "aliases": []
  },
  {
    "id": "rj_dungarpur",
    "lgdCode": 99,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Dungarpur",
    "aliases": []
  },
  {
    "id": "rj_ganganagar",
    "lgdCode": 100,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Ganganagar",
    "aliases": []
  },
  {
    "id": "rj_hanumangarh",
    "lgdCode": 101,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Hanumangarh",
    "aliases": []
  },
  {
    "id": "rj_jaipur",
    "lgdCode": 102,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Jaipur",
    "aliases": []
  },
  {
    "id": "rj_jaisalmer",
    "lgdCode": 103,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Jaisalmer",
    "aliases": []
  },
  {
    "id": "rj_jalore",
    "lgdCode": 104,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Jalore",
    "aliases": []
  },
  {
    "id": "rj_jhalawar",
    "lgdCode": 105,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Jhalawar",
    "aliases": []
  },
  {
    "id": "rj_jhunjhunu",
    "lgdCode": 106,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Jhunjhunu",
    "aliases": []
  },
  {
    "id": "rj_jodhpur",
    "lgdCode": 107,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Jodhpur",
    "aliases": []
  },
  {
    "id": "rj_karauli",
    "lgdCode": 108,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Karauli",
    "aliases": []
  },
  {
    "id": "rj_kota",
    "lgdCode": 109,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Kota",
    "aliases": []
  },
  {
    "id": "rj_nagaur",
    "lgdCode": 110,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Nagaur",
    "aliases": []
  },
  {
    "id": "rj_pali",
    "lgdCode": 111,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Pali",
    "aliases": []
  },
  {
    "id": "rj_pratapgarh",
    "lgdCode": 629,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Pratapgarh",
    "aliases": []
  },
  {
    "id": "rj_rajsamand",
    "lgdCode": 112,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Rajsamand",
    "aliases": []
  },
  {
    "id": "rj_sawai_madhopur",
    "lgdCode": 113,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Sawai Madhopur",
    "aliases": []
  },
  {
    "id": "rj_sikar",
    "lgdCode": 114,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Sikar",
    "aliases": []
  },
  {
    "id": "rj_sirohi",
    "lgdCode": 115,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Sirohi",
    "aliases": []
  },
  {
    "id": "rj_tonk",
    "lgdCode": 116,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Tonk",
    "aliases": []
  },
  {
    "id": "rj_udaipur",
    "lgdCode": 117,
    "stateCode": "RJ",
    "stateName": "Rajasthan",
    "name": "Udaipur",
    "aliases": []
  },
  {
    "id": "sk_gangtok",
    "lgdCode": 225,
    "stateCode": "SK",
    "stateName": "Sikkim",
    "name": "Gangtok",
    "aliases": []
  },
  {
    "id": "sk_gyalshing",
    "lgdCode": 228,
    "stateCode": "SK",
    "stateName": "Sikkim",
    "name": "Gyalshing",
    "aliases": []
  },
  {
    "id": "sk_mangan",
    "lgdCode": 226,
    "stateCode": "SK",
    "stateName": "Sikkim",
    "name": "Mangan",
    "aliases": []
  },
  {
    "id": "sk_namchi",
    "lgdCode": 227,
    "stateCode": "SK",
    "stateName": "Sikkim",
    "name": "Namchi",
    "aliases": []
  },
  {
    "id": "sk_pakyong",
    "lgdCode": 741,
    "stateCode": "SK",
    "stateName": "Sikkim",
    "name": "Pakyong",
    "aliases": []
  },
  {
    "id": "sk_soreng",
    "lgdCode": 742,
    "stateCode": "SK",
    "stateName": "Sikkim",
    "name": "Soreng",
    "aliases": []
  },
  {
    "id": "tn_ariyalur",
    "lgdCode": 610,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Ariyalur",
    "aliases": []
  },
  {
    "id": "tn_chengalpattu",
    "lgdCode": 730,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Chengalpattu",
    "aliases": []
  },
  {
    "id": "tn_chennai",
    "lgdCode": 568,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Chennai",
    "aliases": []
  },
  {
    "id": "tn_coimbatore",
    "lgdCode": 569,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Coimbatore",
    "aliases": []
  },
  {
    "id": "tn_cuddalore",
    "lgdCode": 570,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Cuddalore",
    "aliases": []
  },
  {
    "id": "tn_dharmapuri",
    "lgdCode": 571,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Dharmapuri",
    "aliases": []
  },
  {
    "id": "tn_dindigul",
    "lgdCode": 572,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Dindigul",
    "aliases": []
  },
  {
    "id": "tn_erode",
    "lgdCode": 573,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Erode",
    "aliases": []
  },
  {
    "id": "tn_kallakurichi",
    "lgdCode": 729,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Kallakurichi",
    "aliases": []
  },
  {
    "id": "tn_kanchipuram",
    "lgdCode": 574,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Kanchipuram",
    "aliases": []
  },
  {
    "id": "tn_kanniyakumari",
    "lgdCode": 575,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Kanniyakumari",
    "aliases": []
  },
  {
    "id": "tn_karur",
    "lgdCode": 576,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Karur",
    "aliases": []
  },
  {
    "id": "tn_krishnagiri",
    "lgdCode": 577,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Krishnagiri",
    "aliases": []
  },
  {
    "id": "tn_madurai",
    "lgdCode": 578,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Madurai",
    "aliases": []
  },
  {
    "id": "tn_mayiladuthurai",
    "lgdCode": 735,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Mayiladuthurai",
    "aliases": []
  },
  {
    "id": "tn_nagapattinam",
    "lgdCode": 579,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Nagapattinam",
    "aliases": []
  },
  {
    "id": "tn_namakkal",
    "lgdCode": 580,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Namakkal",
    "aliases": []
  },
  {
    "id": "tn_perambalur",
    "lgdCode": 581,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Perambalur",
    "aliases": []
  },
  {
    "id": "tn_pudukkottai",
    "lgdCode": 582,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Pudukkottai",
    "aliases": []
  },
  {
    "id": "tn_ramanathapuram",
    "lgdCode": 583,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Ramanathapuram",
    "aliases": []
  },
  {
    "id": "tn_ranipet",
    "lgdCode": 731,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Ranipet",
    "aliases": []
  },
  {
    "id": "tn_salem",
    "lgdCode": 584,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Salem",
    "aliases": []
  },
  {
    "id": "tn_sivaganga",
    "lgdCode": 585,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Sivaganga",
    "aliases": []
  },
  {
    "id": "tn_tenkasi",
    "lgdCode": 733,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Tenkasi",
    "aliases": []
  },
  {
    "id": "tn_thanjavur",
    "lgdCode": 586,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Thanjavur",
    "aliases": []
  },
  {
    "id": "tn_the_nilgiris",
    "lgdCode": 587,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "The Nilgiris",
    "aliases": []
  },
  {
    "id": "tn_theni",
    "lgdCode": 588,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Theni",
    "aliases": []
  },
  {
    "id": "tn_thiruvallur",
    "lgdCode": 589,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Thiruvallur",
    "aliases": []
  },
  {
    "id": "tn_thiruvarur",
    "lgdCode": 590,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Thiruvarur",
    "aliases": []
  },
  {
    "id": "tn_tiruchirappalli",
    "lgdCode": 591,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Tiruchirappalli",
    "aliases": []
  },
  {
    "id": "tn_tirunelveli",
    "lgdCode": 592,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Tirunelveli",
    "aliases": []
  },
  {
    "id": "tn_tirupathur",
    "lgdCode": 732,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Tirupathur",
    "aliases": []
  },
  {
    "id": "tn_tiruppur",
    "lgdCode": 634,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Tiruppur",
    "aliases": []
  },
  {
    "id": "tn_tiruvannamalai",
    "lgdCode": 593,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Tiruvannamalai",
    "aliases": []
  },
  {
    "id": "tn_tuticorin",
    "lgdCode": 594,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Tuticorin",
    "aliases": []
  },
  {
    "id": "tn_vellore",
    "lgdCode": 595,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Vellore",
    "aliases": []
  },
  {
    "id": "tn_villupuram",
    "lgdCode": 596,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Villupuram",
    "aliases": []
  },
  {
    "id": "tn_virudhunagar",
    "lgdCode": 597,
    "stateCode": "TN",
    "stateName": "Tamil Nadu",
    "name": "Virudhunagar",
    "aliases": []
  },
  {
    "id": "ts_adilabad",
    "lgdCode": 501,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Adilabad",
    "aliases": []
  },
  {
    "id": "ts_bhadradri_kothagudem",
    "lgdCode": 690,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Bhadradri Kothagudem",
    "aliases": []
  },
  {
    "id": "ts_hanumakonda",
    "lgdCode": 686,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Hanumakonda",
    "aliases": []
  },
  {
    "id": "ts_hyderabad",
    "lgdCode": 507,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Hyderabad",
    "aliases": []
  },
  {
    "id": "ts_jagitial",
    "lgdCode": 681,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Jagitial",
    "aliases": []
  },
  {
    "id": "ts_jangoan",
    "lgdCode": 689,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Jangoan",
    "aliases": []
  },
  {
    "id": "ts_jayashankar_bhupalapally",
    "lgdCode": 687,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Jayashankar Bhupalapally",
    "aliases": []
  },
  {
    "id": "ts_jogulamba_gadwal",
    "lgdCode": 695,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Jogulamba Gadwal",
    "aliases": []
  },
  {
    "id": "ts_kamareddy",
    "lgdCode": 685,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Kamareddy",
    "aliases": []
  },
  {
    "id": "ts_karimnagar",
    "lgdCode": 508,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Karimnagar",
    "aliases": []
  },
  {
    "id": "ts_khammam",
    "lgdCode": 509,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Khammam",
    "aliases": []
  },
  {
    "id": "ts_kumuram_bheem_asifabad",
    "lgdCode": 699,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Kumuram Bheem Asifabad",
    "aliases": []
  },
  {
    "id": "ts_mahabubabad",
    "lgdCode": 688,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Mahabubabad",
    "aliases": []
  },
  {
    "id": "ts_mahabubnagar",
    "lgdCode": 512,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Mahabubnagar",
    "aliases": []
  },
  {
    "id": "ts_mancherial",
    "lgdCode": 684,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Mancherial",
    "aliases": []
  },
  {
    "id": "ts_medak",
    "lgdCode": 513,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Medak",
    "aliases": []
  },
  {
    "id": "ts_medchal_malkajgiri",
    "lgdCode": 700,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Medchal Malkajgiri",
    "aliases": []
  },
  {
    "id": "ts_mulugu",
    "lgdCode": 720,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Mulugu",
    "aliases": []
  },
  {
    "id": "ts_nagarkurnool",
    "lgdCode": 694,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Nagarkurnool",
    "aliases": []
  },
  {
    "id": "ts_nalgonda",
    "lgdCode": 514,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Nalgonda",
    "aliases": []
  },
  {
    "id": "ts_narayanpet",
    "lgdCode": 721,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Narayanpet",
    "aliases": []
  },
  {
    "id": "ts_nirmal",
    "lgdCode": 680,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Nirmal",
    "aliases": []
  },
  {
    "id": "ts_nizamabad",
    "lgdCode": 516,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Nizamabad",
    "aliases": []
  },
  {
    "id": "ts_peddapalli",
    "lgdCode": 682,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Peddapalli",
    "aliases": []
  },
  {
    "id": "ts_rajanna_sircilla",
    "lgdCode": 683,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Rajanna Sircilla",
    "aliases": []
  },
  {
    "id": "ts_ranga_reddy",
    "lgdCode": 518,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Ranga Reddy",
    "aliases": []
  },
  {
    "id": "ts_sangareddy",
    "lgdCode": 691,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Sangareddy",
    "aliases": []
  },
  {
    "id": "ts_siddipet",
    "lgdCode": 692,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Siddipet",
    "aliases": []
  },
  {
    "id": "ts_suryapet",
    "lgdCode": 696,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Suryapet",
    "aliases": []
  },
  {
    "id": "ts_vikarabad",
    "lgdCode": 698,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Vikarabad",
    "aliases": []
  },
  {
    "id": "ts_wanaparthy",
    "lgdCode": 693,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Wanaparthy",
    "aliases": []
  },
  {
    "id": "ts_warangal",
    "lgdCode": 522,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Warangal",
    "aliases": []
  },
  {
    "id": "ts_yadadri_bhuvanagiri",
    "lgdCode": 697,
    "stateCode": "TS",
    "stateName": "Telangana",
    "name": "Yadadri Bhuvanagiri",
    "aliases": []
  },
  {
    "id": "tr_dhalai",
    "lgdCode": 269,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "Dhalai",
    "aliases": []
  },
  {
    "id": "tr_gomati",
    "lgdCode": 654,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "Gomati",
    "aliases": []
  },
  {
    "id": "tr_khowai",
    "lgdCode": 652,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "Khowai",
    "aliases": []
  },
  {
    "id": "tr_north_tripura",
    "lgdCode": 270,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "North Tripura",
    "aliases": []
  },
  {
    "id": "tr_sepahijala",
    "lgdCode": 653,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "Sepahijala",
    "aliases": []
  },
  {
    "id": "tr_south_tripura",
    "lgdCode": 271,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "South Tripura",
    "aliases": []
  },
  {
    "id": "tr_unakoti",
    "lgdCode": 655,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "Unakoti",
    "aliases": []
  },
  {
    "id": "tr_west_tripura",
    "lgdCode": 272,
    "stateCode": "TR",
    "stateName": "Tripura",
    "name": "West Tripura",
    "aliases": []
  },
  {
    "id": "up_agra",
    "lgdCode": 118,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Agra",
    "aliases": []
  },
  {
    "id": "up_aligarh",
    "lgdCode": 119,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Aligarh",
    "aliases": []
  },
  {
    "id": "up_ambedkar_nagar",
    "lgdCode": 121,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Ambedkar Nagar",
    "aliases": []
  },
  {
    "id": "up_amethi",
    "lgdCode": 640,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Amethi",
    "aliases": []
  },
  {
    "id": "up_amroha",
    "lgdCode": 154,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Amroha",
    "aliases": []
  },
  {
    "id": "up_auraiya",
    "lgdCode": 122,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Auraiya",
    "aliases": []
  },
  {
    "id": "up_ayodhya",
    "lgdCode": 140,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Ayodhya",
    "aliases": []
  },
  {
    "id": "up_azamgarh",
    "lgdCode": 123,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Azamgarh",
    "aliases": []
  },
  {
    "id": "up_baghpat",
    "lgdCode": 124,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Baghpat",
    "aliases": []
  },
  {
    "id": "up_bahraich",
    "lgdCode": 125,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Bahraich",
    "aliases": []
  },
  {
    "id": "up_ballia",
    "lgdCode": 126,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Ballia",
    "aliases": []
  },
  {
    "id": "up_balrampur",
    "lgdCode": 127,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Balrampur",
    "aliases": []
  },
  {
    "id": "up_banda",
    "lgdCode": 128,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Banda",
    "aliases": []
  },
  {
    "id": "up_barabanki",
    "lgdCode": 129,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Barabanki",
    "aliases": []
  },
  {
    "id": "up_bareilly",
    "lgdCode": 130,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Bareilly",
    "aliases": []
  },
  {
    "id": "up_basti",
    "lgdCode": 131,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Basti",
    "aliases": []
  },
  {
    "id": "up_bhadohi",
    "lgdCode": 179,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Bhadohi",
    "aliases": []
  },
  {
    "id": "up_bijnor",
    "lgdCode": 132,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Bijnor",
    "aliases": []
  },
  {
    "id": "up_budaun",
    "lgdCode": 133,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Budaun",
    "aliases": []
  },
  {
    "id": "up_bulandshahr",
    "lgdCode": 134,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Bulandshahr",
    "aliases": []
  },
  {
    "id": "up_chandauli",
    "lgdCode": 135,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Chandauli",
    "aliases": []
  },
  {
    "id": "up_chitrakoot",
    "lgdCode": 136,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Chitrakoot",
    "aliases": []
  },
  {
    "id": "up_deoria",
    "lgdCode": 137,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Deoria",
    "aliases": []
  },
  {
    "id": "up_etah",
    "lgdCode": 138,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Etah",
    "aliases": []
  },
  {
    "id": "up_etawah",
    "lgdCode": 139,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Etawah",
    "aliases": []
  },
  {
    "id": "up_farrukhabad",
    "lgdCode": 141,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Farrukhabad",
    "aliases": []
  },
  {
    "id": "up_fatehpur",
    "lgdCode": 142,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Fatehpur",
    "aliases": []
  },
  {
    "id": "up_firozabad",
    "lgdCode": 143,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Firozabad",
    "aliases": []
  },
  {
    "id": "up_gautam_buddha_nagar",
    "lgdCode": 144,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Gautam Buddha Nagar",
    "aliases": []
  },
  {
    "id": "up_ghaziabad",
    "lgdCode": 145,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Ghaziabad",
    "aliases": []
  },
  {
    "id": "up_ghazipur",
    "lgdCode": 146,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Ghazipur",
    "aliases": []
  },
  {
    "id": "up_gonda",
    "lgdCode": 147,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Gonda",
    "aliases": []
  },
  {
    "id": "up_gorakhpur",
    "lgdCode": 148,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Gorakhpur",
    "aliases": []
  },
  {
    "id": "up_hamirpur",
    "lgdCode": 149,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Hamirpur",
    "aliases": []
  },
  {
    "id": "up_hapur",
    "lgdCode": 661,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Hapur",
    "aliases": []
  },
  {
    "id": "up_hardoi",
    "lgdCode": 150,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Hardoi",
    "aliases": []
  },
  {
    "id": "up_hathras",
    "lgdCode": 163,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Hathras",
    "aliases": []
  },
  {
    "id": "up_jalaun",
    "lgdCode": 151,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Jalaun",
    "aliases": []
  },
  {
    "id": "up_jaunpur",
    "lgdCode": 152,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Jaunpur",
    "aliases": []
  },
  {
    "id": "up_jhansi",
    "lgdCode": 153,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Jhansi",
    "aliases": []
  },
  {
    "id": "up_kannauj",
    "lgdCode": 155,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Kannauj",
    "aliases": []
  },
  {
    "id": "up_kanpur_dehat",
    "lgdCode": 156,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Kanpur Dehat",
    "aliases": []
  },
  {
    "id": "up_kanpur_nagar",
    "lgdCode": 157,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Kanpur Nagar",
    "aliases": []
  },
  {
    "id": "up_kasganj",
    "lgdCode": 633,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Kasganj",
    "aliases": []
  },
  {
    "id": "up_kaushambi",
    "lgdCode": 158,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Kaushambi",
    "aliases": []
  },
  {
    "id": "up_kheri",
    "lgdCode": 159,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Kheri",
    "aliases": []
  },
  {
    "id": "up_kushi_nagar",
    "lgdCode": 160,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Kushi Nagar",
    "aliases": []
  },
  {
    "id": "up_lalitpur",
    "lgdCode": 161,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Lalitpur",
    "aliases": []
  },
  {
    "id": "up_lucknow",
    "lgdCode": 162,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Lucknow",
    "aliases": []
  },
  {
    "id": "up_maharajganj",
    "lgdCode": 164,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Maharajganj",
    "aliases": []
  },
  {
    "id": "up_mahoba",
    "lgdCode": 165,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Mahoba",
    "aliases": []
  },
  {
    "id": "up_mainpuri",
    "lgdCode": 166,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Mainpuri",
    "aliases": []
  },
  {
    "id": "up_mathura",
    "lgdCode": 167,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Mathura",
    "aliases": []
  },
  {
    "id": "up_mau",
    "lgdCode": 168,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Mau",
    "aliases": []
  },
  {
    "id": "up_meerut",
    "lgdCode": 169,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Meerut",
    "aliases": []
  },
  {
    "id": "up_mirzapur",
    "lgdCode": 170,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Mirzapur",
    "aliases": []
  },
  {
    "id": "up_moradabad",
    "lgdCode": 171,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Moradabad",
    "aliases": []
  },
  {
    "id": "up_muzaffarnagar",
    "lgdCode": 172,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Muzaffarnagar",
    "aliases": []
  },
  {
    "id": "up_pilibhit",
    "lgdCode": 173,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Pilibhit",
    "aliases": []
  },
  {
    "id": "up_pratapgarh",
    "lgdCode": 174,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Pratapgarh",
    "aliases": []
  },
  {
    "id": "up_prayagraj",
    "lgdCode": 120,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Prayagraj",
    "aliases": []
  },
  {
    "id": "up_rae_bareli",
    "lgdCode": 175,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Rae Bareli",
    "aliases": []
  },
  {
    "id": "up_rampur",
    "lgdCode": 176,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Rampur",
    "aliases": []
  },
  {
    "id": "up_saharanpur",
    "lgdCode": 177,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Saharanpur",
    "aliases": []
  },
  {
    "id": "up_sambhal",
    "lgdCode": 659,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Sambhal",
    "aliases": []
  },
  {
    "id": "up_sant_kabeer_nagar",
    "lgdCode": 178,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Sant Kabeer Nagar",
    "aliases": []
  },
  {
    "id": "up_shahjahanpur",
    "lgdCode": 180,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Shahjahanpur",
    "aliases": []
  },
  {
    "id": "up_shamli",
    "lgdCode": 660,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Shamli",
    "aliases": []
  },
  {
    "id": "up_shravasti",
    "lgdCode": 181,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Shravasti",
    "aliases": []
  },
  {
    "id": "up_siddharth_nagar",
    "lgdCode": 182,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Siddharth Nagar",
    "aliases": []
  },
  {
    "id": "up_sitapur",
    "lgdCode": 183,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Sitapur",
    "aliases": []
  },
  {
    "id": "up_sonbhadra",
    "lgdCode": 184,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Sonbhadra",
    "aliases": []
  },
  {
    "id": "up_sultanpur",
    "lgdCode": 185,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Sultanpur",
    "aliases": []
  },
  {
    "id": "up_unnao",
    "lgdCode": 186,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Unnao",
    "aliases": []
  },
  {
    "id": "up_varanasi",
    "lgdCode": 187,
    "stateCode": "UP",
    "stateName": "Uttar Pradesh",
    "name": "Varanasi",
    "aliases": []
  },
  {
    "id": "uk_almora",
    "lgdCode": 45,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Almora",
    "aliases": []
  },
  {
    "id": "uk_bageshwar",
    "lgdCode": 46,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Bageshwar",
    "aliases": []
  },
  {
    "id": "uk_chamoli",
    "lgdCode": 47,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Chamoli",
    "aliases": []
  },
  {
    "id": "uk_champawat",
    "lgdCode": 48,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Champawat",
    "aliases": []
  },
  {
    "id": "uk_dehradun",
    "lgdCode": 49,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Dehradun",
    "aliases": []
  },
  {
    "id": "uk_haridwar",
    "lgdCode": 50,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Haridwar",
    "aliases": []
  },
  {
    "id": "uk_nainital",
    "lgdCode": 51,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Nainital",
    "aliases": []
  },
  {
    "id": "uk_pauri_garhwal",
    "lgdCode": 52,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Pauri Garhwal",
    "aliases": []
  },
  {
    "id": "uk_pithoragarh",
    "lgdCode": 53,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Pithoragarh",
    "aliases": []
  },
  {
    "id": "uk_rudra_prayag",
    "lgdCode": 54,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Rudra Prayag",
    "aliases": []
  },
  {
    "id": "uk_tehri_garhwal",
    "lgdCode": 55,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Tehri Garhwal",
    "aliases": []
  },
  {
    "id": "uk_udam_singh_nagar",
    "lgdCode": 56,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Udam Singh Nagar",
    "aliases": []
  },
  {
    "id": "uk_uttar_kashi",
    "lgdCode": 57,
    "stateCode": "UK",
    "stateName": "Uttarakhand",
    "name": "Uttar Kashi",
    "aliases": []
  },
  {
    "id": "wb_24_paraganas_north",
    "lgdCode": 303,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "24 Paraganas North",
    "aliases": []
  },
  {
    "id": "wb_24_paraganas_south",
    "lgdCode": 304,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "24 Paraganas South",
    "aliases": []
  },
  {
    "id": "wb_alipurduar",
    "lgdCode": 664,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Alipurduar",
    "aliases": []
  },
  {
    "id": "wb_bankura",
    "lgdCode": 305,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Bankura",
    "aliases": []
  },
  {
    "id": "wb_birbhum",
    "lgdCode": 307,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Birbhum",
    "aliases": []
  },
  {
    "id": "wb_coochbehar",
    "lgdCode": 308,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Coochbehar",
    "aliases": []
  },
  {
    "id": "wb_darjeeling",
    "lgdCode": 309,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Darjeeling",
    "aliases": []
  },
  {
    "id": "wb_dinajpur_dakshin",
    "lgdCode": 310,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Dinajpur Dakshin",
    "aliases": []
  },
  {
    "id": "wb_dinajpur_uttar",
    "lgdCode": 311,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Dinajpur Uttar",
    "aliases": []
  },
  {
    "id": "wb_hooghly",
    "lgdCode": 312,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Hooghly",
    "aliases": []
  },
  {
    "id": "wb_howrah",
    "lgdCode": 313,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Howrah",
    "aliases": []
  },
  {
    "id": "wb_jalpaiguri",
    "lgdCode": 314,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Jalpaiguri",
    "aliases": []
  },
  {
    "id": "wb_jhargram",
    "lgdCode": 703,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Jhargram",
    "aliases": []
  },
  {
    "id": "wb_kalimpong",
    "lgdCode": 702,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Kalimpong",
    "aliases": []
  },
  {
    "id": "wb_kolkata",
    "lgdCode": 315,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Kolkata",
    "aliases": []
  },
  {
    "id": "wb_maldah",
    "lgdCode": 316,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Maldah",
    "aliases": []
  },
  {
    "id": "wb_medinipur_east",
    "lgdCode": 317,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Medinipur East",
    "aliases": []
  },
  {
    "id": "wb_medinipur_west",
    "lgdCode": 318,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Medinipur West",
    "aliases": []
  },
  {
    "id": "wb_murshidabad",
    "lgdCode": 319,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Murshidabad",
    "aliases": []
  },
  {
    "id": "wb_nadia",
    "lgdCode": 320,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Nadia",
    "aliases": []
  },
  {
    "id": "wb_paschim_bardhaman",
    "lgdCode": 704,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Paschim Bardhaman",
    "aliases": []
  },
  {
    "id": "wb_purba_bardhaman",
    "lgdCode": 306,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Purba Bardhaman",
    "aliases": []
  },
  {
    "id": "wb_purulia",
    "lgdCode": 321,
    "stateCode": "WB",
    "stateName": "West Bengal",
    "name": "Purulia",
    "aliases": []
  }
];

export const MAHARASHTRA_DISTRICTS: IndianDistrict[] = INDIAN_DISTRICTS.filter(
  (d) => d.stateCode === "MH"
);

/**
 * Returns all Indian States and UTs sorted alphabetically by name.
 */
export function getAllStates(): IndianState[] {
  return [...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns all districts belonging to a specific state (matched by state code or name).
 */
export function getDistrictsByState(stateCodeOrName?: string | null): IndianDistrict[] {
  if (!stateCodeOrName) return [];
  const normalized = stateCodeOrName.trim().toLowerCase();
  
  const state = INDIAN_STATES.find(
    (s) =>
      s.code.toLowerCase() === normalized ||
      s.name.toLowerCase() === normalized ||
      s.aliases.some((a) => a.toLowerCase() === normalized)
  );

  const targetCode = state ? state.code : normalized.toUpperCase();
  return INDIAN_DISTRICTS.filter((d) => d.stateCode === targetCode).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Finds a district by exact name or alias.
 */
export function findDistrict(districtName?: string | null): IndianDistrict | undefined {
  if (!districtName) return undefined;
  const normalized = districtName.trim().toLowerCase();
  return INDIAN_DISTRICTS.find(
    (d) =>
      d.name.toLowerCase() === normalized ||
      d.aliases.some((a) => a.toLowerCase() === normalized)
  );
}

/**
 * Formats options for dropdowns with support for "Unknown District".
 */
export function getAllDistrictDropdownOptions(): { value: string; label: string; stateName?: string }[] {
  const options = INDIAN_DISTRICTS.map((d) => ({
    value: d.name,
    label: d.aliases.length > 0 ? `${d.name} (${d.aliases.join(", ")})` : d.name,
    stateName: d.stateName,
  }));
  return options;
}
