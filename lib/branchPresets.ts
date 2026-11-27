/**
 * The 17 Cloud Packers branches, with the contact details from the footer of each city page on cloudpackers.com.
 * Admin → Branches → "Set up the 17 branches" adds or updates them (see app/api/branches/presets).
 * `match` are other names the same branch may already have in the app.
 */
export interface BranchPreset { name: string; code: string; city: string; address: string; phone: string; phone2?: string; match?: string[] }

export const COMPANY_EMAIL = 'info@cloudpackers.com';

export const BRANCH_PRESETS: BranchPreset[] = [
  { name: 'Agartala', code: 'AGT', city: 'Agartala', address: 'Shubash Colony, Gandhigram, Agartala, Tripura (W)', phone: '9704050621' },
  { name: 'Ahmedabad', code: 'AMD', city: 'Ahmedabad', address: '03, Bhagirth Habitat, Nr. Rainbow-9, Lambha, Ahmedabad - 382405', phone: '9861716621' },
  { name: 'Balasore', code: 'BLS', city: 'Balasore', address: 'Plot no. 99/3586, Kukudapdaganapati Nagar, Balasore - 756001', phone: '7205610621' },
  { name: 'Bangalore', code: 'BLR', city: 'Bangalore', address: 'No-24/25, Sai Ganga Nivas, Kurudusunnenahalli, Virgo Nagar, Bangalore - 560049', phone: '8105600621', phone2: '7411809197', match: ['bengaluru', 'bangaluru'] },
  { name: 'Bhadrak', code: 'BDK', city: 'Bhadrak', address: 'Bhadrak, Odisha', phone: '7205610621' },
  { name: 'Bhubaneswar', code: 'BBS', city: 'Bhubaneswar', address: 'GM-6, VSS Nagar, Bhubaneswar, Odisha - 751007', phone: '9777616621', match: ['bhubaneshwar'] },
  { name: 'Chennai', code: 'CHN', city: 'Chennai', address: '137 Maharaja Nagar, Grant Lyon, Karikala Cholan 7th Street, Redhills, Chennai - 600052', phone: '9692316525', match: ['madras'] },
  { name: 'Delhi', code: 'DEL', city: 'Delhi', address: 'Dwarka Sector 26, Bharthal Village, Near Nykaa Warehouse, Delhi - 110077', phone: '7993900621', match: ['new delhi'] },
  { name: 'Durgapur', code: 'DGP', city: 'Durgapur', address: 'Plot no. 874, Padhuanpada, Bhoi Sahi, Durgapur, 756001', phone: '8926978630' },
  { name: 'Hyderabad', code: 'HYD', city: 'Hyderabad', address: 'No 1-30-331, Ward Number 10, Kanajiguda, Alwal, Secunderabad, Telangana 500015', phone: '7719000621', match: ['secunderabad'] },
  { name: 'Indore', code: 'IDR', city: 'Indore', address: 'C/o Ruchi Infrastructure Ltd., Survey No 96/1, Mangliya Sadak, A.B. Road, Mangliya, Indore - 453771', phone: '8296890298', phone2: '8600654621' },
  { name: 'Kochi', code: 'KOC', city: 'Kochi', address: 'Kochi, Kerala', phone: '7205610621', phone2: '8105600621', match: ['cochin'] },
  { name: 'Kolkata', code: 'KOL', city: 'Kolkata', address: '128/D, Kanaipur Colony, Basai, Kanaipur, Konnagar, West Bengal - 712234', phone: '8926978621', match: ['calcutta'] },
  { name: 'Mumbai', code: 'MUM', city: 'Mumbai', address: 'K2, Shop No 1, Ground Floor, Ridhi Shidhi Complex, Kalher, Bhiwandi, Thane - 421302', phone: '8296890298', match: ['bombay', 'thane', 'bhiwandi'] },
  { name: 'Pune', code: 'PUN', city: 'Pune', address: 'Plot no 69, Sector 23, Transport Nagar, Nigdi, Pune, MH - 411044', phone: '7796000621', phone2: '8105600621', match: ['poona'] },
  { name: 'Ranchi', code: 'RAN', city: 'Ranchi', address: 'Plot-280, New A.G. Colony, Kadru, Ranchi-2, Pincode - 834002', phone: '8130360621', phone2: '8105600621' },
  { name: 'Visakhapatnam', code: 'VSK', city: 'Visakhapatnam', address: '203, Deekshita Chandrapalem, Madhurwada, Visakhapatnam - 530048', phone: '9124044621', match: ['vizag', 'vishakhapatnam', 'vishakapatnam'] },
];
