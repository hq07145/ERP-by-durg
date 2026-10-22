// Comprehensive, verified dataset of all Indian Districts across 28 States and 8 Union Territories
// Source: Government of India Local Government Directory (LGD) / Ministry of Panchayati Raj / Census of India
// Total States: 28, Total Union Territories: 8, Total Entities: 36, Total Districts: 772

export interface IndianStateInfo {
  code: string;
  name: string;
  type: "state" | "union_territory";
  districts: string[];
}

export interface IndianDistrictOption {
  value: string;
  label: string;
  district: string;
  state: string;
  stateCode?: string;
  isDuplicate?: boolean;
}

export const DUPLICATE_DISTRICT_NAMES = new Set<string>(["aurangabad","balrampur","bilaspur","hamirpur","pratapgarh"]);

export const INDIAN_STATES_AND_UTS: IndianStateInfo[] = [
  {
    "code": "AP",
    "name": "Andhra Pradesh",
    "type": "state",
    "districts": [
      "Srikakulam",
      "Parvathipuram Manyam",
      "Vizianagaram",
      "Visakhapatnam",
      "Alluri Sitharama Raju",
      "Anakapalli",
      "Kakinada",
      "East Godavari",
      "Konaseema",
      "Eluru",
      "West Godavari",
      "Nandamuri Taraka Rama Rao",
      "Krishna",
      "Palnadu",
      "Guntur",
      "Bapatla",
      "Prakasam",
      "Sri Potti Sriramulu Nellore",
      "Kurnool",
      "Nandyal",
      "Anantapur",
      "Sri SathyaYSR",
      "Annamayya",
      "Tirupati",
      "Chittoor"
    ]
  },
  {
    "code": "AR",
    "name": "Arunachal Pradesh",
    "type": "state",
    "districts": [
      "Anjaw",
      "Changlang",
      "East Kameng",
      "East Siang",
      "Kamle",
      "Kra Daadi",
      "Kurung Kumey",
      "Lepa Rada",
      "Lohit",
      "Longding",
      "Lower Dibang Valley",
      "Lower Siang",
      "Lower Subansiri",
      "Namsai",
      "Pakke-Kessang",
      "Papum Pare",
      "Shi Yomi",
      "Siang",
      "Tawang",
      "Tirap",
      "Upper Dibang Valley",
      "Upper Siang",
      "Upper Subansiri",
      "West Kameng",
      "West Siang",
      "Itanagar City Complex"
    ]
  },
  {
    "code": "AS",
    "name": "Assam",
    "type": "state",
    "districts": [
      "Bajali",
      "Baksa",
      "Barpeta",
      "Biswanath",
      "Bongaigaon",
      "Cachar",
      "Charaideo",
      "Chirang",
      "Darrang",
      "Dhemaji",
      "Dhubri",
      "Dibrugarh",
      "Dima Hasao",
      "Goalpara",
      "Golaghat",
      "Hailakandi",
      "Hojai",
      "Jorhat",
      "Kamrup",
      "Kamrup Metropolitan",
      "Karbi Anglong",
      "Karimganj",
      "Kokrajhar",
      "Lakhimpur",
      "Majuli",
      "Morigaon",
      "Nagaon",
      "Nalbari",
      "Sivasagar",
      "South Salmara Mankachar",
      "Sonitpur",
      "Tinsukia",
      "Udalguri",
      "West Karbi Anglong",
      "Tamulpur"
    ]
  },
  {
    "code": "BR",
    "name": "Bihar",
    "type": "state",
    "districts": [
      "Araria",
      "Arwal",
      "Aurangabad",
      "Banka",
      "Begusarai",
      "Bhagalpur",
      "Bhojpur",
      "Buxar",
      "Darbhanga",
      "East Champaran",
      "Gaya",
      "Gopalganj",
      "Jamui",
      "Jehanabad",
      "Kaimur",
      "Katihar",
      "Khagaria",
      "Kishanganj",
      "Lakhisarai",
      "Madhepura",
      "Madhubani",
      "Munger",
      "Muzaffarpur",
      "Nalanda",
      "Nawada",
      "Patna",
      "Purnia",
      "Rohtas",
      "Saharsa",
      "Samastipur",
      "Saran",
      "Sheikhpura",
      "Sheohar",
      "Sitamarhi",
      "Siwan",
      "Supaul",
      "Vaishali",
      "West Champaran"
    ]
  },
  {
    "code": "CG",
    "name": "Chhattisgarh",
    "type": "state",
    "districts": [
      "Balod",
      "Baloda Bazar-Bhatapara",
      "Balrampur",
      "Bastar",
      "Bemetara",
      "Bijapur",
      "Bilaspur",
      "Dantewada",
      "Dhamtari",
      "Durg",
      "Gariaband",
      "Gaurella-Pendra-Marwahi",
      "Janjgir-Champa",
      "Jashpur",
      "Kabirdham",
      "Kanker",
      "Kondagaon",
      "Korba",
      "Korea",
      "Mahasamund",
      "Manendragarh-Chirmiri-Bharatpur",
      "Mohla Manpur",
      "Mungeli",
      "Narayanpur",
      "Raigarh",
      "Raipur",
      "Rajnandgaon",
      "Sarangarh-Bilaigarh",
      "Shakti",
      "Sukma",
      "Surajpur",
      "Surguja",
      "Khairagarh-Chhuikhadan-Gandai"
    ]
  },
  {
    "code": "GA",
    "name": "Goa",
    "type": "state",
    "districts": [
      "North Goa",
      "South Goa"
    ]
  },
  {
    "code": "GJ",
    "name": "Gujarat",
    "type": "state",
    "districts": [
      "Ahmedabad",
      "Amreli",
      "Anand",
      "Aravalli",
      "Banaskantha",
      "Bharuch",
      "Bhavnagar",
      "Botad",
      "Chhota Udaipur",
      "Dahod",
      "Dang",
      "Devbhumi Dwarka",
      "Gandhinagar",
      "Gir Somnath",
      "Jamnagar",
      "Junagadh",
      "Kheda",
      "Kutch",
      "Mahisagar",
      "Mehsana",
      "Morbi",
      "Narmada",
      "Navsari",
      "Panchmahal",
      "Patan",
      "Porbandar",
      "Rajkot",
      "Sabarkantha",
      "Surat",
      "Surendranagar",
      "Tapi",
      "Vadodara",
      "Valsad"
    ]
  },
  {
    "code": "HR",
    "name": "Haryana",
    "type": "state",
    "districts": [
      "Ambala",
      "Bhiwani",
      "Charkhi Dadri",
      "Faridabad",
      "Fatehabad",
      "Gurugram",
      "Hisar",
      "Jhajjar",
      "Jind",
      "Kaithal",
      "Karnal",
      "Kurukshetra",
      "Mahendragarh",
      "Nuh",
      "Palwal",
      "Panchkula",
      "Panipat",
      "Rewari",
      "Rohtak",
      "Sirsa",
      "Sonipat",
      "Yamunanagar"
    ]
  },
  {
    "code": "HP",
    "name": "Himachal Pradesh",
    "type": "state",
    "districts": [
      "Bilaspur",
      "Chamba",
      "Hamirpur",
      "Kangra",
      "Kinnaur",
      "Kullu",
      "Lahaul and Spiti",
      "Mandi",
      "Shimla",
      "Sirmaur",
      "Solan",
      "Una"
    ]
  },
  {
    "code": "JH",
    "name": "Jharkhand",
    "type": "state",
    "districts": [
      "Bokaro",
      "Chatra",
      "Deoghar",
      "Dhanbad",
      "Dumka",
      "East Singhbhum",
      "Garhwa",
      "Giridih",
      "Godda",
      "Gumla",
      "Hazaribag",
      "Jamtara",
      "Khunti",
      "Koderma",
      "Latehar",
      "Lohardaga",
      "Pakur",
      "Palamu",
      "Ramgarh",
      "Ranchi",
      "Sahibganj",
      "Seraikela-Kharsawan",
      "Simdega",
      "West Singhbhum"
    ]
  },
  {
    "code": "KA",
    "name": "Karnataka",
    "type": "state",
    "districts": [
      "Bagalkot",
      "Bellary",
      "Belgaum",
      "Bangalore Rural",
      "Bangalore Urban",
      "Bidar",
      "Chamarajanagara",
      "Chikkaballapur",
      "Chikmagalur",
      "Chitradurga",
      "Dakshina Kannada",
      "Davanagere",
      "Dharwad",
      "Gadag",
      "Gulbarga",
      "Hassan",
      "Haveri",
      "Kodagu",
      "Kolar",
      "Koppala",
      "Mandya",
      "Mysore",
      "Raichur",
      "Ramanagara",
      "Shimoga",
      "Tumakuru",
      "Udupi",
      "Uttara Kannada",
      "Vijayanagara",
      "Vijayapura",
      "Yadgir"
    ]
  },
  {
    "code": "KL",
    "name": "Kerala",
    "type": "state",
    "districts": [
      "Alappuzha",
      "Ernakulam",
      "Idukki",
      "Kannur",
      "Kasaragod",
      "Kollam",
      "Kottayam",
      "Kozhikode",
      "Malappuram",
      "Palakkad",
      "Pathanamthitta",
      "Thrissur",
      "Thiruvananthapuram",
      "Wayanad"
    ]
  },
  {
    "code": "MP",
    "name": "Madhya Pradesh",
    "type": "state",
    "districts": [
      "Agar Malwa",
      "Alirajpur",
      "Anuppur",
      "Ashoknagar",
      "Balaghat",
      "Barwani",
      "Betul",
      "Bhind",
      "Bhopal",
      "Burhanpur",
      "Chachoda",
      "Chhatarpur",
      "Chhindwara",
      "Damoh",
      "Datia",
      "Dewas",
      "Dhar",
      "Dindori",
      "Guna",
      "Gwalior",
      "Harda",
      "Narmadapuram",
      "Indore",
      "Jabalpur",
      "Jhabua",
      "Katni",
      "Khandwa (East Nimar)",
      "Khargone (West Nimar)",
      "Maihar",
      "Mandla",
      "Mandsaur",
      "Morena",
      "Narsinghpur",
      "Nagda",
      "Neemuch",
      "Niwari",
      "Panna",
      "Raisen",
      "Rajgarh",
      "Ratlam",
      "Rewa",
      "Sagar",
      "Satna",
      "Sehore",
      "Seoni",
      "Shahdol",
      "Shajapur",
      "Sheopur",
      "Shivpuri",
      "Sidhi",
      "Singrauli",
      "Tikamgarh",
      "Ujjain",
      "Umaria",
      "Vidisha"
    ]
  },
  {
    "code": "MH",
    "name": "Maharashtra",
    "type": "state",
    "districts": [
      "Ahmednagar",
      "Akola",
      "Amravati",
      "Aurangabad",
      "Beed",
      "Bhandara",
      "Buldhana",
      "Chandrapur",
      "Dhule",
      "Gadchiroli",
      "Gondia",
      "Hingoli",
      "Jalgaon",
      "Jalna",
      "Kolhapur",
      "Latur",
      "Mumbai City",
      "Mumbai suburban",
      "Nanded",
      "Nandurbar",
      "Nagpur",
      "Nashik",
      "Osmanabad",
      "Palghar",
      "Parbhani",
      "Pune",
      "Raigad",
      "Ratnagiri",
      "Sangli",
      "Satara",
      "Sindhudurg",
      "Solapur",
      "Thane",
      "Wardha",
      "Washim",
      "Yavatmal"
    ]
  },
  {
    "code": "MN",
    "name": "Manipur",
    "type": "state",
    "districts": [
      "Bishnupur",
      "Chandel",
      "Churachandpur",
      "Imphal East",
      "Imphal West",
      "Jiribam",
      "Kakching",
      "Kamjong",
      "Kangpokpi",
      "Noney",
      "Pherzawl",
      "Senapati",
      "Tamenglong",
      "Tengnoupal",
      "Thoubal",
      "Ukhrul"
    ]
  },
  {
    "code": "ML",
    "name": "Meghalaya",
    "type": "state",
    "districts": [
      "East Garo Hills",
      "East Khasi Hills",
      "East Jaintia Hills",
      "Eastern West Khasi Hills district",
      "North Garo Hills",
      "Ri Bhoi",
      "South Garo Hills",
      "South West Garo Hills",
      "South West Khasi Hills",
      "West Jaintia Hills",
      "West Garo Hills",
      "West Khasi Hills"
    ]
  },
  {
    "code": "MZ",
    "name": "Mizoram",
    "type": "state",
    "districts": [
      "Aizawl",
      "Champhai",
      "Hnahthial",
      "Khawzawl",
      "Kolasib",
      "Lawngtlai",
      "Lunglei",
      "Mamit",
      "Saiha",
      "Saitual",
      "Serchhip"
    ]
  },
  {
    "code": "NL",
    "name": "Nagaland",
    "type": "state",
    "districts": [
      "Chümoukedima",
      "Dimapur",
      "Kiphire",
      "Kohima",
      "Longleng",
      "Mokokchung",
      "Mon",
      "Niuland",
      "Noklak",
      "Peren",
      "Phek",
      "Shamator",
      "Tseminyü",
      "Tuensang",
      "Wokha",
      "Zunheboto"
    ]
  },
  {
    "code": "OD",
    "name": "Odisha",
    "type": "state",
    "districts": [
      "Angul",
      "Boudh (Bauda)",
      "Bhadrak",
      "Balangir",
      "Bargarh (Baragarh)",
      "Balasore",
      "Cuttack",
      "Debagarh (Deogarh)",
      "Dhenkanal",
      "Ganjam",
      "Gajapati",
      "Jharsuguda",
      "Jajpur",
      "Jagatsinghpur",
      "Khordha",
      "Kendujhar",
      "Kalahandi",
      "Kandhamal",
      "Koraput",
      "Kendrapara",
      "Malkangiri",
      "Mayurbhanj",
      "Nabarangpur",
      "Nuapada",
      "Nayagarh",
      "Puri",
      "Rayagada",
      "Sambalpur",
      "Subarnapur (Sonepur)",
      "Sundargarh"
    ]
  },
  {
    "code": "PB",
    "name": "Punjab",
    "type": "state",
    "districts": [
      "Amritsar",
      "Barnala",
      "Bathinda",
      "Firozpur",
      "Faridkot",
      "Fatehgarh Sahib",
      "Fazilka",
      "Gurdaspur",
      "Hoshiarpur",
      "Jalandhar",
      "Kapurthala",
      "Ludhiana",
      "Malerkotla",
      "Mansa",
      "Moga",
      "Sri Muktsar Sahib",
      "Pathankot",
      "Patiala",
      "Rupnagar",
      "Sahibzada Ajit Singh Nagar",
      "Sangrur",
      "Shahid Bhagat Singh Nagar",
      "Tarn Taran"
    ]
  },
  {
    "code": "RJ",
    "name": "Rajasthan",
    "type": "state",
    "districts": [
      "Ajmer",
      "Alwar",
      "Bikaner",
      "Barmer",
      "Banswara",
      "Bharatpur",
      "Baran",
      "Bundi",
      "Bhilwara",
      "Churu",
      "Chittorgarh",
      "Dausa",
      "Dholpur",
      "Dungarpur",
      "Sri Ganganagar",
      "Hanumangarh",
      "Jhunjhunu",
      "Jalore",
      "Jodhpur",
      "Jaipur",
      "Jaisalmer",
      "Jhalawar",
      "Karauli",
      "Kota",
      "Nagaur",
      "Pali",
      "Pratapgarh",
      "Rajsamand",
      "Sikar",
      "Sawai Madhopur",
      "Sirohi",
      "Tonk",
      "Udaipur"
    ]
  },
  {
    "code": "SK",
    "name": "Sikkim",
    "type": "state",
    "districts": [
      "East Sikkim",
      "North Sikkim",
      "Pakyong",
      "Soreng",
      "South Sikkim",
      "West Sikkim"
    ]
  },
  {
    "code": "TN",
    "name": "Tamil Nadu",
    "type": "state",
    "districts": [
      "Ariyalur",
      "Chengalpattu",
      "Chennai",
      "Coimbatore",
      "Cuddalore",
      "Dharmapuri",
      "Dindigul",
      "Erode",
      "Kallakurichi",
      "Kanchipuram",
      "Kanyakumari",
      "Karur",
      "Krishnagiri",
      "Madurai",
      "Mayiladuthurai",
      "Nagapattinam",
      "Nilgiris",
      "Namakkal",
      "Perambalur",
      "Pudukkottai",
      "Ramanathapuram",
      "Ranipet",
      "Salem",
      "Sivaganga",
      "Tenkasi",
      "Tiruppur",
      "Tiruchirappalli",
      "Theni",
      "Tirunelveli",
      "Thanjavur",
      "Thoothukudi",
      "Tirupattur",
      "Tiruvallur",
      "Tiruvarur",
      "Tiruvannamalai",
      "Vellore",
      "Viluppuram",
      "Virudhunagar"
    ]
  },
  {
    "code": "TG",
    "name": "Telangana",
    "type": "state",
    "districts": [
      "Adilabad",
      "Bhadradri Kothagudem",
      "Hanamkonda",
      "Hyderabad",
      "Jagtial",
      "Jangaon",
      "Jayashankar Bhupalpally",
      "Jogulamba Gadwal",
      "Kamareddy",
      "Karimnagar",
      "Khammam",
      "Kumuram Bheem Asifabad",
      "Mahabubabad",
      "Mahbubnagar",
      "Mancherial",
      "Medak",
      "Medchal–Malkajgiri",
      "Mulugu",
      "Nalgonda",
      "Narayanpet",
      "Nagarkurnool",
      "Nirmal",
      "Nizamabad",
      "Peddapalli",
      "Rajanna Sircilla",
      "Ranga Reddy",
      "Sangareddy",
      "Siddipet",
      "Suryapet",
      "Vikarabad",
      "Wanaparthy",
      "Warangal",
      "Yadadri Bhuvanagiri"
    ]
  },
  {
    "code": "TR",
    "name": "Tripura",
    "type": "state",
    "districts": [
      "Dhalai",
      "Gomati",
      "Khowai",
      "North Tripura",
      "Sepahijala",
      "South Tripura",
      "Unakoti",
      "West Tripura"
    ]
  },
  {
    "code": "UP",
    "name": "Uttar Pradesh",
    "type": "state",
    "districts": [
      "Agra",
      "Aligarh",
      "Allahabad",
      "Ambedkar Nagar",
      "Amethi",
      "Amroha",
      "Auraiya",
      "Azamgarh",
      "Bagpat",
      "Bahraich",
      "Ballia",
      "Balrampur",
      "Banda",
      "Barabanki",
      "Bareilly",
      "Basti",
      "Bhadohi",
      "Bijnor",
      "Budaun",
      "Bulandshahr",
      "Chandauli",
      "Chitrakoot",
      "Deoria",
      "Etah",
      "Etawah",
      "Faizabad",
      "Farrukhabad",
      "Fatehpur",
      "Firozabad",
      "Gautam Buddha Nagar",
      "Ghaziabad",
      "Ghazipur",
      "Gonda",
      "Gorakhpur",
      "Hamirpur",
      "Hapur",
      "Hardoi",
      "Hathras",
      "Jalaun",
      "Jaunpur",
      "Jhansi",
      "Kannauj",
      "Kanpur Dehat",
      "Kanpur Nagar",
      "Kasganj",
      "Kaushambi",
      "Kushinagar",
      "Lakhimpur Kheri",
      "Lalitpur",
      "Lucknow",
      "Maharajganj",
      "Mahoba",
      "Mainpuri",
      "Mathura",
      "Mau",
      "Meerut",
      "Mirzapur",
      "Moradabad",
      "Muzaffarnagar",
      "Pilibhit",
      "Pratapgarh",
      "Raebareli",
      "Rampur",
      "Saharanpur",
      "Sambhal",
      "Sant Kabir Nagar",
      "Shahjahanpur",
      "Shamli",
      "Shravasti",
      "Siddharthnagar",
      "Sitapur",
      "Sonbhadra",
      "Sultanpur",
      "Unnao",
      "Varanasi"
    ]
  },
  {
    "code": "UK",
    "name": "Uttarakhand",
    "type": "state",
    "districts": [
      "Almora",
      "Bageshwar",
      "Chamoli",
      "Champawat",
      "Dehradun",
      "Didihat",
      "Haridwar",
      "Kotdwar",
      "Nainital",
      "Pauri Garhwal",
      "Pithoragarh",
      "Ranikhet",
      "Rudraprayag",
      "Tehri Garhwal",
      "Udham Singh Nagar",
      "Uttarkashi",
      "Yamunotri"
    ]
  },
  {
    "code": "WB",
    "name": "West Bengal",
    "type": "state",
    "districts": [
      "Alipurduar",
      "Bankura",
      "Paschim Bardhaman",
      "Purba Bardhaman",
      "Birbhum",
      "Cooch Behar",
      "Dakshin Dinajpur",
      "Darjeeling",
      "Hooghly",
      "Howrah",
      "Jalpaiguri",
      "Jhargram",
      "Kalimpong",
      "Kolkata",
      "Maldah",
      "Murshidabad",
      "Nadia",
      "North 24 Parganas",
      "Paschim Medinipur",
      "Purba Medinipur",
      "Purulia",
      "South 24 Parganas",
      "Uttar Dinajpur"
    ]
  },
  {
    "code": "AN",
    "name": "Andaman and Nicobar Islands",
    "type": "union_territory",
    "districts": [
      "Nicobar",
      "North and Middle Andaman",
      "South Andaman"
    ]
  },
  {
    "code": "CH",
    "name": "Chandigarh",
    "type": "union_territory",
    "districts": [
      "Chandigarh"
    ]
  },
  {
    "code": "DH",
    "name": "Dadra and Nagar Haveli and Daman and Diu",
    "type": "union_territory",
    "districts": [
      "Daman",
      "Diu",
      "Dadra and Nagar Haveli"
    ]
  },
  {
    "code": "JK",
    "name": "Jammu and Kashmir",
    "type": "union_territory",
    "districts": [
      "Anantnag",
      "Budgam",
      "Bandipore",
      "Baramulla",
      "Doda",
      "Ganderbal",
      "Jammu",
      "Kathua",
      "Kishtwar",
      "Kulgam",
      "Kupwara",
      "Poonch",
      "Pulwama",
      "Rajouri",
      "Ramban",
      "Reasi",
      "Samba",
      "Shopian",
      "Srinagar",
      "Udhampur"
    ]
  },
  {
    "code": "LA",
    "name": "Ladakh",
    "type": "union_territory",
    "districts": [
      "Kargil",
      "Leh"
    ]
  },
  {
    "code": "LD",
    "name": "Lakshadweep",
    "type": "union_territory",
    "districts": [
      "Lakshadweep"
    ]
  },
  {
    "code": "DL",
    "name": "Delhi",
    "type": "union_territory",
    "districts": [
      "Central Delhi",
      "East Delhi",
      "New Delhi",
      "North Delhi",
      "North East Delhi",
      "North West Delhi",
      "Shahdara district",
      "South Delhi",
      "South East Delhi",
      "South West Delhi",
      "West Delhi"
    ]
  },
  {
    "code": "PY",
    "name": "Puducherry",
    "type": "union_territory",
    "districts": [
      "Karaikal",
      "Mahé",
      "Puducherry",
      "Yanam"
    ]
  }
];

export const ALL_INDIAN_DISTRICTS: IndianDistrictOption[] = (() => {
  const list: IndianDistrictOption[] = [];
  for (const s of INDIAN_STATES_AND_UTS) {
    for (const d of s.districts) {
      const isDup = DUPLICATE_DISTRICT_NAMES.has(d.toLowerCase());
      const val = isDup ? `${d} (${s.name})` : d;
      list.push({
        value: val,
        label: val,
        district: d,
        state: s.name,
        stateCode: s.code,
        isDuplicate: isDup,
      });
    }
  }
  list.sort((a, b) => a.district.localeCompare(b.district) || a.state.localeCompare(b.state));
  return list;
})();

/**
 * Builds the full dropdown option list for the District filter:
 * 1. All Districts (default)
 * 2. Unknown District
 * 3. All 772 Indian districts
 * 4. Any custom customer districts existing in DB
 */
export function getIndianDistrictsDropdownOptions(
  existingDbDistricts: string[] = []
): IndianDistrictOption[] {
  const standardDistricts = ALL_INDIAN_DISTRICTS;
  const options: IndianDistrictOption[] = [
    { value: "", label: "All Districts", district: "", state: "" },
    { value: "Unknown District", label: "Unknown District", district: "Unknown District", state: "" },
    ...standardDistricts,
  ];
  const standardSet = new Set(standardDistricts.map((d) => d.district.toLowerCase()));
  for (const raw of existingDbDistricts) {
    const d = raw?.trim();
    if (!d || d === "Unknown District" || standardSet.has(d.toLowerCase())) continue;
    options.push({ value: d, label: d, district: d, state: "" });
  }
  return options;
}

/**
 * Matches an address district/state against the filter criteria.
 * Uses state information internally where available to distinguish districts with identical names.
 */
export function matchesDistrict(
  addrDistrict: string | null | undefined,
  addrState: string | null | undefined,
  filterDistrict: string | undefined
): boolean {
  if (!filterDistrict || filterDistrict === "All Districts" || filterDistrict.trim() === "") {
    return true;
  }
  const filter = filterDistrict.trim();
  const dName = addrDistrict && addrDistrict.trim() ? addrDistrict.trim() : "Unknown District";
  if (filter === "Unknown District") {
    return dName === "Unknown District";
  }
  if (dName === "Unknown District") {
    return false;
  }
  // Check if filter specifies state in parentheses, e.g. "Bilaspur (Chhattisgarh)"
  const parenMatch = filter.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    const targetDistrict = parenMatch[1].trim().toLowerCase();
    const targetState = parenMatch[2].trim().toLowerCase();
    if (dName.toLowerCase() !== targetDistrict) return false;
    if (addrState && addrState.trim()) {
      const s = addrState.trim().toLowerCase();
      if (!s.includes(targetState) && !targetState.includes(s)) {
        return false;
      }
    }
    return true;
  }
  return dName.toLowerCase() === filter.toLowerCase();
}

/**
 * Formats the district name for summary tables:
 * If duplicate name and state is known, displays `${district} (${state})`
 */
export function resolveDistrictDisplayName(
  district: string | null | undefined,
  state: string | null | undefined
): string {
  if (!district || !district.trim()) return "Unknown District";
  const d = district.trim();
  if (d === "Unknown District") return "Unknown District";
  if (DUPLICATE_DISTRICT_NAMES.has(d.toLowerCase()) && state && state.trim()) {
    return `${d} (${state.trim()})`;
  }
  return d;
}

/**
 * Resolves the state for a given district name or value (e.g. "Pune" -> "Maharashtra", "Indore" -> "Madhya Pradesh").
 */
export function getStateForDistrict(districtNameOrValue: string | null | undefined): string | undefined {
  if (!districtNameOrValue || !districtNameOrValue.trim()) return undefined;
  const raw = districtNameOrValue.trim();

  // If in format "District (State)"
  const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    return parenMatch[2].trim();
  }

  // Look up in ALL_INDIAN_DISTRICTS
  const match = ALL_INDIAN_DISTRICTS.find(
    (d) => d.district.toLowerCase() === raw.toLowerCase() || d.value.toLowerCase() === raw.toLowerCase()
  );
  return match?.state;
}

/**
 * Normalizes a district name to plain district string (e.g. "Bilaspur (Chhattisgarh)" -> "Bilaspur", "Pune" -> "Pune").
 */
export function getBaseDistrictName(districtNameOrValue: string | null | undefined): string {
  if (!districtNameOrValue || !districtNameOrValue.trim()) return "";
  const raw = districtNameOrValue.trim();
  const parenMatch = raw.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    return parenMatch[1].trim();
  }
  return raw;
}

