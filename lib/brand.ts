/** Cloud Packers logo shipped with the app (public/logo.jpg). Used in the app header, sign-in page and,
 *  when no logo is uploaded in Settings, on the PDFs. */
export const BRAND = {
  name: 'Cloud Packers',
  logo: '/logo.jpg',
  logoRatio: 480 / 298, // width / height of public/logo.jpg
  slogan: 'Move Better... Live Happier...',
} as const;

/**
 * SAMPLE contact details printed on PDFs only while the real ones are empty.
 * Replace them in the app: Branches → edit a branch (phone, address) and Settings → company email.
 */
export const SAMPLE_CONTACT = {
  phone: '9876543210',
  email: 'info@cloudpackers.com',
  address: (city: string) => `Office No. 12, Main Road${city ? ', ' + city : ''}`,
} as const;
