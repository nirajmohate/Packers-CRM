/** Cloud Packers logo shipped with the app (public/logo.jpg). Used in the app header, sign-in page and,
 *  when no logo is uploaded in Settings, on the PDFs. */
export const BRAND = {
  name: 'Cloud Packers',
  logo: '/logo.jpg',
  logoRatio: 480 / 298, // width / height of public/logo.jpg
  slogan: 'Move Better... Live Happier...',
} as const;

/** The three badges at the top right of every PDF. Change the text here if anything changes. */
export const PDF_BADGES = {
  iso: '9001:2015',     // ISO certificate number shown in the round seal
  support: '24x7',      // support hours
  branches: '33',       // number of branches
  branchesText: 'ALL OVER INDIA',
} as const;

/**
 * Previous clients shown on every QUOTATION PDF ("Our valued clients").
 * Files live in public/clients/. To add one: put a small JPG there and add a line here
 * (ratio = width / height of the picture). To remove one: delete its line.
 */
export const CLIENT_LOGOS: readonly { name: string; file: string; ratio: number }[] = [
  { name: 'Asian Paints', file: '/clients/asian-paints.jpg', ratio: 1.207 },
  { name: 'Castrol', file: '/clients/castrol.jpg', ratio: 3.495 },
  { name: 'InfoVision', file: '/clients/infovision.jpg', ratio: 2.857 },
  { name: 'SBI', file: '/clients/sbi.jpg', ratio: 2.88 },
  { name: 'TPNODL', file: '/clients/tpnodl.jpg', ratio: 4.138 },
  { name: 'FSNL', file: '/clients/fsnl.jpg', ratio: 0.786 },
  { name: 'Blue Star', file: '/clients/blue-star.jpg', ratio: 3.303 },
  { name: 'JSW Steel', file: '/clients/jsw-steel.jpg', ratio: 3.077 },
  { name: "L'Oreal India", file: '/clients/loreal-india.jpg', ratio: 2.951 },
  { name: 'Netlabs', file: '/clients/netlabs.jpg', ratio: 1.818 },
];

/**
 * SAMPLE contact details printed on PDFs only while the real ones are empty.
 * Replace them in the app: Branches → edit a branch (phone, address) and Settings → company email.
 */
export const SAMPLE_CONTACT = {
  phone: '9876543210',
  email: 'info@cloudpackers.com',
  address: (city: string) => `Office No. 12, Main Road${city ? ', ' + city : ''}`,
} as const;
