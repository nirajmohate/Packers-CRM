import type { CalcLine, Column, Field, ModuleConfig, Section } from './types';
import { EXTRA, FREIGHT, INCLUDED, gstOptions, num, round2 } from './calc';
import { STATES } from './states';

/* ---------- shared pieces ---------- */
const customer = (title = 'Customer', _phoneRequired = true): Section => ({
  title,
  fields: [
    { key: 'customerName', label: 'Customer name' },
    { key: 'customerPhone', label: 'Mobile number', type: 'tel', half: true, validate: 'phone', placeholder: '98765 43210' },
    { key: 'customerEmail', label: 'Email', half: true, validate: 'email' },
  ],
});

const billing = (withDue = false): Section => ({
  title: 'Billing & GST',
  fields: [
    { key: 'customerGst', label: 'Customer GSTIN (optional)', half: true, validate: 'gstin', upper: true, placeholder: '27ABCDE1234F1Z5' },
    { key: 'placeOfSupply', label: 'Place of supply', type: 'select', options: STATES, half: true, hint: 'Decides CGST+SGST or IGST' },
    ...(withDue ? [{ key: 'dueDate', label: 'Due date', type: 'date' as const, half: true }] : []),
    { key: 'billingAddress', label: 'Billing address', type: 'textarea' },
  ],
});

const SERVICES = ['Household shifting', 'Office shifting', 'Vehicle transport', 'Commercial goods', 'Local shifting'];

const move = (extra: Field[] = []): Section => ({
  title: 'Move details',
  fields: [
    { key: 'fromCity', label: 'From city', half: true },
    { key: 'toCity', label: 'To city', half: true },
    { key: 'fromAddress', label: 'Pickup address', type: 'textarea' },
    { key: 'toAddress', label: 'Delivery address', type: 'textarea' },
    { key: 'moveDate', label: 'Moving date', type: 'date', half: true },
    { key: 'serviceType', label: 'Service type', type: 'select', options: SERVICES, half: true },
    ...extra,
  ],
});

const notes: Section = { title: 'Notes', fields: [{ key: 'notes', label: 'Note for the customer (printed on the PDF)', type: 'textarea' }] };

export const UNITS = ['Nos', 'Trip', 'Kg', 'CFT', 'Sq ft', 'Km', 'Day', 'Month', 'Lump sum'];
export const GST_RATES = ['0', '5', '12', '18', '28'];

const moneyCols: Column[] = [
  { key: 'description', label: 'Description', placeholder: 'e.g. Packing & loading' },
  { key: 'qty', label: 'Qty', type: 'number', default: '1' },
  { key: 'unit', label: 'Unit', type: 'select', options: UNITS, default: 'Nos', emptyLabel: '-' },
  { key: 'rate', label: 'Rate (₹)', type: 'number' },
  { key: 'gst', label: 'GST %', type: 'select', options: GST_RATES, emptyLabel: 'Default' },
  { key: 'hsn', label: 'HSN / SAC', placeholder: 'e.g. 996511' },
];

const MONEY_TERMS = [
  'Payment: 50% advance at booking and the balance before unloading, unless agreed otherwise.',
  'Goods are carried at owner\'s risk unless transit insurance is taken.',
  'Cash, jewellery and valuables are not accepted for transport.',
  'We are not responsible for delay caused by natural calamity, strike, road closure or government restrictions.',
  'Any claim must be reported in writing within 48 hours of delivery.',
];

const condition = ['Good', 'Fair', 'Damaged', 'Not applicable'];
const PAY_MODES = ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Card'];
const nonCash = { key: 'paymentMode', notIn: ['', 'Cash'] };

const l = (label: string, value: number, bold = false): CalcLine => ({ label, value, bold });

/* ---------- quotation & bill, laid out like the format your staff already know ---------- */
export const MOVING_TYPES = ['Household Shifting', 'Office Shifting', 'Local Shifting', 'Domestic Shifting', 'International Shifting', 'Car Transportation', 'Bike Transportation', 'Commercial Goods', 'Warehouse / Storage'];
const FLOORS = ['Ground Floor', ...Array.from({ length: 20 }, (_, i) => `${i + 1}${['st', 'nd', 'rd'][i] && i < 3 ? ['st', 'nd', 'rd'][i] : 'th'} Floor`), 'Above 20th Floor'];
const YES_NO = ['Yes', 'No'];
const CHARGE_MODES = [INCLUDED, EXTRA, 'Not Applicable'];
const PCTS = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '7', '8', '9', '10', '12', '15', '18', '20', '25'];
const INS_TYPES = ['Not Applicable', 'Optional', 'Included'];

/** Country / state / city / pincode / address block; `p` is the key prefix (from, to, bill, consignor…). */
const place = (p: string, extra: Field[] = [], showIf?: Field['showIf']): Field[] => [
  { key: p + 'Country', label: 'Country', half: true, showIf },
  { key: p + 'State', label: 'State', type: 'select', options: STATES, half: true, showIf },
  { key: p + 'City', label: 'City', half: true, showIf },
  { key: p + 'Pincode', label: 'Pincode', validate: 'pincode', half: true, showIf },
  { key: p + 'Address', label: 'Address', type: 'textarea', showIf },
  ...extra,
];
const floorLift = (p: string): Field[] => [
  { key: p + 'Floor', label: 'Floor', type: 'select', options: FLOORS, half: true },
  { key: p + 'Lift', label: 'Is lift available?', type: 'select', options: YES_NO, half: true },
];
/** "Included in Freight / Extra charge / Not Applicable" box with its amount next to it. */
const modeCharge = (k: string, label: string): Field[] => [
  { key: k + 'Mode', label, type: 'select', options: CHARGE_MODES, half: true },
  { key: k + 'Charge', label: `${label} (₹)`, type: 'number', min: 0, money: true, half: true, showIf: { key: k + 'Mode', in: [EXTRA] } },
];
const payment = (kind: 'quotation' | 'bill'): Section => ({
  title: 'Payment details',
  print: false,
  fields: [
    { key: 'freight', label: 'Freight charge (₹)', type: 'number', min: 0, money: true, half: true },
    { key: 'advance', label: 'Advance paid (₹)', type: 'number', min: 0, money: true, half: true },
    ...modeCharge('packing', 'Packing charge'),
    ...modeCharge('unpacking', 'Unpacking charge'),
    ...modeCharge('loading', 'Loading charge'),
    ...modeCharge('unloading', 'Unloading charge'),
    ...modeCharge('packingMaterial', 'Packing material charge'),
    { key: 'perUnitRate', label: 'Charge per KG/MT (₹)', type: 'number', min: 0, half: true, hint: 'Printed as a rate; not added to the total' },
    { key: 'perUnit', label: 'Per', type: 'select', options: ['Per KG', 'Per MT', 'Per Quintal', 'Per CFT', 'Per Trip'], half: true },
    { key: 'storageCharge', label: 'Storage charge (₹)', type: 'number', min: 0, money: true, half: true },
    { key: 'carTransportCharge', label: 'Car transport charge (₹)', type: 'number', min: 0, money: true, half: true },
    { key: 'miscCharge', label: 'Miscellaneous charges (₹)', type: 'number', min: 0, money: true, half: true },
    { key: 'otherCharge', label: 'Other charges (₹)', type: 'number', min: 0, money: true, half: true },
    { key: 'stCharge', label: 'S.T. charge (₹)', type: 'number', min: 0, money: true, half: true },
    { key: 'greenTax', label: kind === 'quotation' ? 'Octroi / green tax (₹)' : 'Green tax (₹)', type: 'number', min: 0, money: true, half: true },
    { key: 'surchargeMode', label: 'Surcharge', type: 'select', options: ['Not Applicable', 'Applicable'], half: true },
    { key: 'surchargePct', label: 'Surcharge % (on freight)', type: 'select', options: PCTS, half: true, showIf: { key: 'surchargeMode', in: ['Applicable'] } },
    { key: 'gstShow', label: 'GST (show / hide)', type: 'select', options: gstOptions(kind === 'quotation' ? 'Quotation' : 'Bill'), half: true },
    { key: 'gstRate', label: 'GST %', type: 'select', options: GST_RATES, half: true },
    { key: 'gstMode', label: 'GST type', type: 'select', options: ['CGST + SGST', 'IGST'], half: true },
    ...(kind === 'bill'
      ? [
          { key: 'reverseCharge', label: 'Reverse charge', type: 'select' as const, options: ['No', 'Yes'], half: true },
          { key: 'gstPaidBy', label: 'GST paid by', type: 'select' as const, options: ['Consignee', 'Consignor', 'Transporter'], half: true },
        ]
      : [{ key: 'totalShow', label: 'Total amount in PDF', type: 'select' as const, options: ['Show', 'Hide'], half: true }]),
    { key: 'discount', label: 'Discount (₹, on sub total)', type: 'number', min: 0, money: true, half: true },
    { key: 'roundOff', label: 'Round off the total to the nearest rupee', type: 'check', half: true },
    { key: 'notes', label: kind === 'quotation' ? 'Remark' : 'Payment remark', type: 'textarea' },
  ],
});
const insurance = (p: string, title: string, valueLabel: string): Section => ({
  title,
  print: false,
  fields: [
    { key: p + 'Type', label: 'Insurance type', type: 'select', options: INS_TYPES, hint: 'Included: added to the total. Optional: shown, not added.' },
    { key: p + 'Pct', label: 'Insurance charge (%)', type: 'select', options: PCTS, half: true, showIf: { key: p + 'Type', notIn: ['', 'Not Applicable'] } },
    { key: p + 'Gst', label: 'GST %', type: 'select', options: GST_RATES, half: true, showIf: { key: p + 'Type', notIn: ['', 'Not Applicable'] } },
    { key: p + 'Value', label: valueLabel, type: 'number', min: 0, money: true, showIf: { key: p + 'Type', notIn: ['', 'Not Applicable'] }, hint: p === 'ins' ? 'Empty = total value of the Items list' : undefined },
  ],
});
const freightDefaults = (kind: 'quotation' | 'bill'): Record<string, string> => ({
  calcMode: FREIGHT, fromCountry: 'India', toCountry: 'India', billCountry: 'India', consignorCountry: 'India', consigneeCountry: 'India',
  fromFloor: 'Ground Floor', toFloor: 'Ground Floor', fromLift: 'Yes', toLift: 'Yes',
  packingMode: INCLUDED, unpackingMode: INCLUDED, loadingMode: INCLUDED, unloadingMode: INCLUDED, packingMaterialMode: INCLUDED,
  perUnit: 'Per KG', surchargeMode: 'Not Applicable', surchargePct: '10',
  gstShow: kind === 'quotation' ? 'GST Charge Show In Quotation' : 'GST Charge Show In Bill', gstRate: kind === 'quotation' ? '0' : '18', gstMode: 'CGST + SGST',
  totalShow: 'Show', roundOff: '1', insType: 'Optional', insPct: '3', insGst: '0', vinsType: 'Not Applicable', vinsPct: '3', vinsGst: '0',
  ...(kind === 'bill' ? { reverseCharge: 'No', gstPaidBy: 'Consignee', shipmentType: 'Household Goods', movingPath: 'By Road', weightUnit: 'KG', consignorSame: '1' } : {}),
});


/* ---------- the nine document types in use ---------- */
export const MODULES: ModuleConfig[] = [
  {
    slug: 'quotation', title: 'Quotation', short: 'QTN', prefix: 'QTN', color: '#2563eb', icon: 'FileText',
    money: true, freight: true, goods: true, advance: 'required', bank: true, qr: true,
    statuses: ['Pending', 'In process', 'Approved', 'Booked', 'Rejected', 'Cancelled'],
    defaults: freightDefaults('quotation'),
    sections: [
      {
        title: 'Quotation details',
        fields: [
          { key: 'movingType', label: 'Moving type', suggestions: MOVING_TYPES, placeholder: 'Select or type moving type', half: true },
          { key: 'companyName', label: 'Company name of party', half: true },
          { key: 'customerGst', label: 'Company GST no.', validate: 'gstin', upper: true, half: true, placeholder: '27ABCDE1234F1Z5' },
          { key: 'customerName', label: 'Party name', half: true },
          { key: 'customerPhone', label: 'Party mobile', type: 'tel', validate: 'phone', half: true, placeholder: '98765 43210' },
          { key: 'customerEmail', label: 'Email', validate: 'email', half: true },
          { key: 'packingDate', label: 'Packing date', type: 'date', half: true },
          { key: 'moveDate', label: 'Moving date', type: 'date', half: true },
        ],
      },
      { title: 'Move from', fields: [...place('from'), ...floorLift('from')] },
      { title: 'Move to', fields: [...place('to'), ...floorLift('to')] },
      payment('quotation'),
      insurance('ins', 'Insurance details', 'Declaration value of goods (₹)'),
      insurance('vins', 'Vehicle insurance details', 'Declaration value of vehicle (₹)'),
      { title: 'Other details', fields: [{ key: 'validTill', label: 'Valid till', type: 'date', half: true }] },
    ],
    terms: MONEY_TERMS, signLabels: ['Customer signature', 'Authorised signatory'],
    check: (d, { docDate }): Record<string, string> => (d.validTill && d.validTill < docDate ? { validTill: 'Cannot be before the quotation date' } : {}),
  },
  {
    slug: 'survey', title: 'Survey List', short: 'SUR', prefix: 'SUR', color: '#7c3aed', icon: 'ClipboardList',
    suggest: 'household', itemsTitle: 'Inventory & volume', statuses: ['Pending', 'In process', 'Link sent', 'Filled by customer', 'Completed', 'Cancelled'],
    sections: [
      customer(),
      {
        title: 'Survey details',
        fields: [
          { key: 'surveyDate', label: 'Survey date', type: 'date', half: true },
          { key: 'surveyorName', label: 'Surveyor name', half: true },
          { key: 'fromCity', label: 'From city', half: true },
          { key: 'toCity', label: 'To city', half: true },
          { key: 'moveDate', label: 'Moving date', type: 'date', half: true },
          { key: 'serviceType', label: 'Service type', type: 'select', options: SERVICES, half: true },
          { key: 'fromAddress', label: 'Pickup address', type: 'textarea' },
          { key: 'toAddress', label: 'Delivery address', type: 'textarea' },
          { key: 'floorFrom', label: 'Floor (pickup)', half: true },
          { key: 'floorTo', label: 'Floor (delivery)', half: true },
          { key: 'lift', label: 'Lift available', type: 'select', options: ['Yes', 'No'], half: true },
          { key: 'parking', label: 'Truck parking distance (m)', type: 'number', min: 0, half: true },
          { key: 'remarks', label: 'Remarks', type: 'textarea' },
        ],
      },
    ],
    columns: [
      { key: 'description', label: 'Item / room', placeholder: 'e.g. Double bed' },
      { key: 'qty', label: 'Qty', type: 'number', default: '1' },
      { key: 'cft', label: 'Volume per unit (CFT)', type: 'number' },
    ],
    terms: ['This survey is an estimate based on the items seen on the survey date.', 'Items added later may change the quotation.'],
    signLabels: ['Customer signature', 'Surveyor signature'],
  },
  {
    slug: 'packing', title: 'Packing List', short: 'PKG', prefix: 'PKG', color: '#ea580c', icon: 'PackageOpen',
    suggest: 'household', itemsTitle: 'Packed items', statuses: ['Pending', 'In process', 'Packed', 'Delivered', 'Cancelled'],
    sections: [
      customer(),
      {
        title: 'Packing details',
        fields: [
          { key: 'packingDate', label: 'Packing date', type: 'date', half: true },
          { key: 'vehicleNo', label: 'Vehicle number', half: true, validate: 'vehicle', upper: true, placeholder: 'MH15AB1234' },
          { key: 'packingTeam', label: 'Packing team / supervisor' },
          { key: 'fromAddress', label: 'Pickup address', type: 'textarea' },
          { key: 'toAddress', label: 'Delivery address', type: 'textarea' },
          { key: 'remarks', label: 'Remarks', type: 'textarea' },
        ],
      },
    ],
    columns: [
      { key: 'description', label: 'Item', placeholder: 'e.g. LED TV 43"' },
      { key: 'qty', label: 'Qty', type: 'number', default: '1' },
      { key: 'boxNo', label: 'Box / marks no.', placeholder: 'e.g. B-12' },
      { key: 'material', label: 'Packing material', placeholder: 'Bubble wrap, carton…' },
      { key: 'condition', label: 'Condition', type: 'select', options: ['New', 'Good', 'Old', 'Scratched', 'Damaged'], emptyLabel: 'Select' },
    ],
    terms: ['Items are packed as listed. The customer has checked the list and the condition noted against each item.'],
    signLabels: ['Customer signature', 'Packing supervisor'],
  },
  {
    slug: 'lr', title: 'LR / Bilty', short: 'LR', prefix: 'LR', color: '#0891b2', icon: 'Truck',
    itemsTitle: 'Goods description', statuses: ['Pending', 'In process', 'Booked', 'In transit', 'Delivered', 'Cancelled'],
    calc: (d) => {
      const base = round2(num(d.freight) + num(d.hamali) + num(d.otherCharges));
      const gst = round2((base * num(d.lrGst)) / 100);
      const total = round2(base + gst);
      const mode = d.paymentMode;
      const adv = mode === 'Paid' ? total : Math.min(num(d.advance), total);
      const balance = mode === 'To be billed' ? 0 : round2(Math.max(total - adv, 0));
      const lines: CalcLine[] = [];
      if (num(d.freight) > 0) lines.push(l('Freight', num(d.freight)));
      if (num(d.hamali) > 0) lines.push(l('Loading / unloading (hamali)', num(d.hamali)));
      if (num(d.otherCharges) > 0) lines.push(l('Other charges', num(d.otherCharges)));
      if (gst > 0) lines.push(l(`GST @ ${num(d.lrGst)}%`, gst));
      lines.push(l('Total freight', total, true));
      if (mode === 'To pay' && adv > 0) lines.push(l('Advance paid', adv));
      if (mode === 'To pay' && balance > 0) lines.push(l('Balance to pay at delivery', balance, true));
      if (mode === 'Paid') lines.push(l('Freight paid in full', 0));
      if (mode === 'To be billed') lines.push(l('To be billed later', 0));
      return { lines, total, balance };
    },
    sections: [
      customer('Consignor (sender)'),
      {
        title: 'Consignee (receiver)',
        fields: [
          { key: 'consigneeName', label: 'Consignee name' },
          { key: 'consigneePhone', label: 'Consignee mobile', type: 'tel', validate: 'phone' },
          { key: 'consigneeGst', label: 'Consignee GSTIN (optional)', validate: 'gstin', upper: true },
        ],
      },
      {
        title: 'Booking & vehicle',
        fields: [
          { key: 'fromCity', label: 'From', half: true },
          { key: 'toCity', label: 'To', half: true },
          { key: 'fromAddress', label: 'Pickup address', type: 'textarea' },
          { key: 'toAddress', label: 'Delivery address', type: 'textarea' },
          { key: 'vehicleNo', label: 'Vehicle number', half: true, validate: 'vehicle', upper: true, placeholder: 'MH15AB1234' },
          { key: 'driverName', label: 'Driver name', half: true },
          { key: 'driverPhone', label: 'Driver mobile', type: 'tel', half: true, validate: 'phone' },
          { key: 'moveDate', label: 'Loading date', type: 'date', half: true },
          { key: 'invoiceRef', label: 'Invoice / e-way bill no.', hint: 'Optional, for goods above ₹50,000', half: true },
          { key: 'declaredValue', label: 'Declared value (₹)', type: 'number', min: 0, money: true, half: true },
          { key: 'risk', label: 'Risk', type: 'select', options: ['Owner\'s risk', 'Carrier\'s risk'], half: true },
        ],
      },
      {
        title: 'Freight',
        fields: [
          { key: 'paymentMode', label: 'Freight paid as', type: 'select', options: ['To pay', 'Paid', 'To be billed'] },
          { key: 'freight', label: 'Freight (₹)', type: 'number', min: 0, money: true, half: true },
          { key: 'hamali', label: 'Loading / unloading (₹)', type: 'number', min: 0, money: true, half: true },
          { key: 'otherCharges', label: 'Other charges (₹)', type: 'number', min: 0, money: true, half: true },
          { key: 'lrGst', label: 'GST on freight', type: 'select', options: ['0', '5', '12', '18'], half: true },
          { key: 'advance', label: 'Advance paid (₹)', type: 'number', min: 0, money: true, showIf: { key: 'paymentMode', in: ['To pay'] } },
        ],
      },
    ],
    columns: [
      { key: 'description', label: 'Goods description', placeholder: 'e.g. Household goods' },
      { key: 'packages', label: 'Packages', type: 'number' },
      { key: 'weight', label: 'Weight (kg)', type: 'number' },
    ],
    terms: ['Goods are accepted at owner\'s risk unless stated otherwise.', 'Delivery is subject to payment of freight and other charges.', 'The consignee must check the goods at the time of delivery.'],
    signLabels: ['Consignor signature', 'Booking clerk'],
    check: (d) => {
      const e: Record<string, string> = {};
      const base = num(d.freight) + num(d.hamali) + num(d.otherCharges);
      const total = base + (base * num(d.lrGst)) / 100;
      if (d.paymentMode === 'To pay' && num(d.advance) > total + 0.004) e.advance = 'Advance is more than the total freight';
      return e;
    },
  },
  {
    slug: 'vehicle', title: 'Vehicle Condition', short: 'VCR', prefix: 'VCR', color: '#0d9488', icon: 'CarFront',
    statuses: ['Pending', 'In process', 'Completed', 'Cancelled'],
    sections: [
      customer('Vehicle owner'),
      {
        title: 'Vehicle details',
        fields: [
          { key: 'vehicleNo', label: 'Registration number', half: true, validate: 'vehicle', upper: true, placeholder: 'MH15AB1234' },
          { key: 'vehicleType', label: 'Vehicle type', type: 'select', options: ['Car', 'Bike / scooter', 'SUV', 'Van', 'Truck', 'Other'], half: true },
          { key: 'makeModel', label: 'Make & model', half: true },
          { key: 'color', label: 'Colour', half: true },
          { key: 'odometer', label: 'Odometer (km)', type: 'number', min: 0, half: true },
          { key: 'fuel', label: 'Fuel level', type: 'select', options: ['Empty', '1/4', '1/2', '3/4', 'Full'], half: true },
          { key: 'keys', label: 'Keys handed over', type: 'select', options: ['Yes', 'No'], half: true },
          { key: 'moveDate', label: 'Loading date', type: 'date', half: true },
        ],
      },
      {
        title: 'Condition check',
        fields: [
          { key: 'cFront', label: 'Front bumper', type: 'select', options: condition, half: true },
          { key: 'cRear', label: 'Rear bumper', type: 'select', options: condition, half: true },
          { key: 'cBonnet', label: 'Bonnet', type: 'select', options: condition, half: true },
          { key: 'cRoof', label: 'Roof', type: 'select', options: condition, half: true },
          { key: 'cLeft', label: 'Left side', type: 'select', options: condition, half: true },
          { key: 'cRight', label: 'Right side', type: 'select', options: condition, half: true },
          { key: 'cGlass', label: 'Windshield / glass', type: 'select', options: condition, half: true },
          { key: 'cTyres', label: 'Tyres', type: 'select', options: condition, half: true },
          { key: 'cInterior', label: 'Interior', type: 'select', options: condition, half: true },
          { key: 'cLights', label: 'Lights', type: 'select', options: condition, half: true },
          { key: 'damages', label: 'Existing damage / scratches', type: 'textarea' },
          { key: 'accessories', label: 'Accessories & items inside', type: 'textarea' },
        ],
      },
    ],
    terms: ['The condition above was checked with the owner before loading.', 'Existing damage noted here is not the company\'s responsibility.', 'Remove personal belongings and valuables from the vehicle.'],
    signLabels: ['Owner signature', 'Company representative'],
  },
  {
    slug: 'proforma', title: 'Proforma Invoice', short: 'PRO', prefix: 'PRO', color: '#9333ea', icon: 'FileClock',
    money: true, advance: 'required', advanceLabel: 'Advance payable (₹)', bank: true, qr: true, suggest: 'services', itemsTitle: 'Services & charges',
    statuses: ['Pending', 'In process', 'Sent', 'Paid', 'Cancelled'],
    sections: [customer(), billing(), move([{ key: 'validTill', label: 'Valid till', type: 'date', half: true }]), notes],
    columns: moneyCols,
    terms: ['This is a proforma invoice and not a tax invoice.', ...MONEY_TERMS.slice(0, 2)],
    signLabels: ['Customer signature', 'Authorised signatory'],
    check: (d, { docDate }): Record<string, string> => (d.validTill && d.validTill < docDate ? { validTill: 'Cannot be before the invoice date' } : {}),
  },
  {
    slug: 'bill', title: 'Bill / Invoice', short: 'INV', prefix: 'INV', color: '#16a34a', icon: 'ReceiptText',
    money: true, freight: true, goods: true, advance: 'received', bank: true, qr: true,
    statuses: ['Unpaid', 'Partial', 'Paid', 'Cancelled'],
    defaults: freightDefaults('bill'),
    sections: [
      {
        title: 'Bill details',
        fields: [
          { key: 'companyName', label: 'Company name of party', half: true },
          { key: 'lrNo', label: 'LR number', half: true },
          { key: 'deliveryDate', label: 'Delivery date', type: 'date', half: true },
          { key: 'shipmentType', label: 'Type of shipment', suggestions: ['Household Goods', 'Office Goods', 'Car', 'Bike', 'Commercial Goods'], half: true },
          { key: 'movingPath', label: 'Moving path', type: 'select', options: ['By Road', 'By Rail', 'By Air', 'By Sea'], half: true },
          { key: 'movingPathRemark', label: 'Moving path remark', half: true },
          { key: 'fromCity', label: 'Move from', half: true },
          { key: 'toCity', label: 'Move to', half: true },
          { key: 'vehicleNo', label: 'Vehicle number', validate: 'vehicle', upper: true, half: true, placeholder: 'MH15AB1234' },
          { key: 'poNumber', label: 'Purchase order (P.O.) no.', half: true },
          { key: 'poDate', label: 'P.O. date', type: 'date', half: true },
        ],
      },
      {
        title: 'Billing details',
        fields: [
          { key: 'customerName', label: 'Bill to name', half: true },
          { key: 'customerPhone', label: 'Bill to phone', type: 'tel', validate: 'phone', half: true, placeholder: '98765 43210' },
          { key: 'customerGst', label: 'GSTIN', validate: 'gstin', upper: true, placeholder: '27ABCDE1234F1Z5' },
          ...place('bill').map((f) => (f.key === 'billAddress' ? { ...f, key: 'billingAddress' } : f)),
        ],
      },
      {
        title: 'Consignor / move from',
        fields: [
          { key: 'consignorSame', label: 'Consignor details same as billing details', type: 'check' },
          { key: 'consignorName', label: 'Consignor name', half: true, showIf: { key: 'consignorSame', notIn: ['1'] } },
          { key: 'consignorPhone', label: 'Consignor phone', type: 'tel', validate: 'phone', half: true, showIf: { key: 'consignorSame', notIn: ['1'] } },
          { key: 'consignorGst', label: 'GSTIN', validate: 'gstin', upper: true, showIf: { key: 'consignorSame', notIn: ['1'] } },
          ...place('consignor', [], { key: 'consignorSame', notIn: ['1'] }),
        ],
      },
      {
        title: 'Consignee / move to',
        fields: [
          { key: 'consigneeName', label: 'Consignee name', half: true },
          { key: 'consigneePhone', label: 'Consignee phone', type: 'tel', validate: 'phone', half: true },
          { key: 'consigneeGst', label: 'GSTIN', validate: 'gstin', upper: true },
          ...place('consignee'),
        ],
      },
      payment('bill'),
      {
        title: 'Package details',
        fields: [
          { key: 'packages', label: 'Package', half: true },
          { key: 'packageDesc', label: 'Description', half: true },
          { key: 'totalWeight', label: 'Total weight', type: 'number', min: 0, half: true },
          { key: 'weightUnit', label: 'Weight unit', type: 'select', options: ['KG', 'MT', 'Quintal', 'Ton'], half: true },
          { key: 'hsn', label: 'HSN / SAC code', half: true },
          { key: 'packageRemark', label: 'Remark', type: 'textarea' },
        ],
      },
      insurance('ins', 'Insurance details', 'Declaration value of goods (₹)'),
      insurance('vins', 'Vehicle insurance details', 'Declaration value of vehicle (₹)'),
      { title: 'Other details', fields: [{ key: 'dueDate', label: 'Payment due date', type: 'date', half: true, hint: 'Used for overdue bills on the Payments page' }] },
    ],
    terms: ['Please pay the balance by the due date.', 'Payment by cash, UPI or bank transfer. Cheques are subject to realisation.', 'All disputes are subject to local jurisdiction.'],
    signLabels: ['Customer signature', 'Authorised signatory'],
    check: (d, { docDate }): Record<string, string> => (d.dueDate && d.dueDate < docDate ? { dueDate: 'Cannot be before the bill date' } : {}),
  },
  {
    slug: 'receipt', title: 'Money Receipt', short: 'RCT', prefix: 'RCT', color: '#db2777', icon: 'BadgeIndianRupee',
    statuses: ['Received'],
    calc: (d) => ({ lines: [], total: num(d.amount) }),
    sections: [
      { title: 'Settle a bill', fields: [{ key: 'againstId', label: 'Against bill (optional)', type: 'bill', hint: 'Pick a bill to reduce its balance. Leave empty for a general receipt.' }] },
      customer('Received from'),
      {
        title: 'Payment',
        fields: [
          { key: 'amount', label: 'Amount received (₹)', type: 'number', min: 0, money: true, half: true },
          { key: 'paymentMode', label: 'Payment mode', type: 'select', options: PAY_MODES, half: true },
          { key: 'againstDoc', label: 'Against bill no.', readOnly: true, half: true, showIf: { key: 'againstId', notIn: [''] } },
          { key: 'txnRef', label: 'Transaction ID / cheque no.', showIf: nonCash, half: true },
          { key: 'chequeDate', label: 'Cheque date', type: 'date', showIf: { key: 'paymentMode', in: ['Cheque'] }, half: true },
          { key: 'chequeBank', label: 'Cheque bank', showIf: { key: 'paymentMode', in: ['Cheque'] } },
          { key: 'purpose', label: 'Received towards', type: 'textarea' },
        ],
      },
    ],
    terms: ['Cheque payments are subject to realisation.', 'This receipt is valid only with the company stamp or signature.'],
    signLabels: ['Customer signature', 'Receiver signature'],
    check: (d) => {
      const e: Record<string, string> = {};
      // nothing is mandatory: only a typed amount below zero is refused
      if (num(d.amount) < 0) e.amount = 'Amount cannot be negative';
      return e;
    },
  },
  {
    slug: 'fov', title: 'FOV-SCF Form', short: 'FOV', prefix: 'FOV', color: '#4f46e5', icon: 'ShieldCheck',
    statuses: ['Pending', 'In process', 'Completed', 'Cancelled'],
    calc: (d) => {
      const fov = num(d.fovAmount), scf = num(d.scfCharge);
      const lines: CalcLine[] = [];
      if (fov > 0) lines.push(l('FOV charge', fov));
      if (scf > 0) lines.push(l('SCF charge', scf));
      const total = round2(fov + scf);
      lines.push(l('Total', total, true));
      return { lines, total };
    },
    deriveOn: ['goodsValue', 'fovRate'],
    derive: (d): Record<string, string> => {
      const out: Record<string, string> = {};
      if (num(d.goodsValue) && num(d.fovRate)) out.fovAmount = String(round2((num(d.goodsValue) * num(d.fovRate)) / 100));
      return out;
    },
    sections: [
      customer(),
      move(),
      {
        title: 'Declaration of value',
        fields: [
          { key: 'goodsValue', label: 'Declared value of goods (₹)', type: 'number', min: 0, money: true },
          { key: 'fovRate', label: 'FOV rate (%)', type: 'number', min: 0, max: 100, half: true },
          { key: 'fovAmount', label: 'FOV amount (₹)', type: 'number', min: 0, money: true, half: true, hint: 'Value x rate, editable' },
          { key: 'scfCharge', label: 'SCF charge (₹)', type: 'number', min: 0, money: true, half: true },
          { key: 'insured', label: 'Transit insurance taken', type: 'select', options: ['Yes', 'No'], half: true },
          { key: 'policyNo', label: 'Policy number', showIf: { key: 'insured', in: ['Yes'] } },
          { key: 'remarks', label: 'Remarks', type: 'textarea' },
        ],
      },
    ],
    terms: ['I declare that the value of the goods stated above is true and correct.', 'In case of loss or damage, the claim is limited to the declared value.', 'I have read and accepted the terms of carriage.'],
    signLabels: ['Customer signature', 'Authorised signatory'],
  },
];

export const BY_SLUG: Record<string, ModuleConfig> = Object.fromEntries(MODULES.map((m) => [m.slug, m]));

/** "Create from this document" shortcuts */
export const CONVERT: Record<string, string[]> = {
  survey: ['quotation', 'bill', 'packing'],
  quotation: ['proforma', 'bill', 'packing', 'lr'],
  proforma: ['bill', 'receipt'],
  bill: ['receipt', 'fov'],
  packing: ['lr', 'vehicle'],
  lr: ['vehicle'],
};

/**
 * What a customer may fill through a shared survey link (no login). Everything else on a survey
 * (surveyor, survey date, terms, volume) is left for your staff. The server enforces this list.
 */
export const PUBLIC_SURVEY_FIELDS = ['customerName', 'customerPhone', 'customerEmail', 'fromCity', 'toCity', 'moveDate', 'serviceType', 'fromAddress', 'toAddress', 'floorFrom', 'floorTo', 'lift', 'remarks'];
export const PUBLIC_SURVEY_COLUMNS = ['description', 'qty'];
export function publicSurveyConfig(): ModuleConfig {
  const base = MODULES.find((m) => m.slug === 'survey')!;
  const keep = new Set(PUBLIC_SURVEY_FIELDS);
  return {
    ...base,
    sections: base.sections
      .map((sec) => ({ ...sec, title: sec.title === 'Survey details' ? 'Move details' : sec.title, fields: sec.fields.filter((f) => keep.has(f.key)).map((f) => (f.key === 'customerName' || f.key === 'customerPhone' ? { ...f, required: true } : f)) }))
      .filter((sec) => sec.fields.length),
    columns: base.columns!.filter((c) => PUBLIC_SURVEY_COLUMNS.includes(c.key)).map((c) => (c.key === 'description' ? { ...c, label: 'Item' } : c)),
    itemsTitle: 'Items to shift',
  };
}

/** Services with the SAC code filled in when you pick them. Confirm the codes and GST rates with your CA. */
export const SERVICE_PRESETS: { name: string; hsn: string }[] = [
  { name: 'Packing & loading charges', hsn: '998541' },
  { name: 'Transportation charges', hsn: '996511' },
  { name: 'Unloading & unpacking', hsn: '998541' },
  { name: 'Loading & unloading labour', hsn: '996719' },
  { name: 'Packing material', hsn: '998541' },
  { name: 'Car / bike transport', hsn: '996511' },
  { name: 'Storage charges', hsn: '996729' },
  { name: 'Insurance / FOV', hsn: '' },
  { name: 'Toll & parking', hsn: '' },
  { name: 'Door-to-door service', hsn: '996511' },
];

/** Typical volumes in cubic feet; filled in on the survey list and always editable. */
export const HOUSEHOLD: { name: string; cft: number }[] = [
  { name: 'Single bed', cft: 40 }, { name: 'Double bed', cft: 60 }, { name: 'Mattress', cft: 25 },
  { name: 'Sofa set (3+1+1)', cft: 70 }, { name: 'Dining table', cft: 40 }, { name: 'Almirah / wardrobe', cft: 50 },
  { name: 'Refrigerator', cft: 35 }, { name: 'Washing machine', cft: 20 }, { name: 'LED TV', cft: 12 },
  { name: 'Air conditioner', cft: 25 }, { name: 'Microwave', cft: 8 }, { name: 'Study table', cft: 20 },
  { name: 'Chair', cft: 6 }, { name: 'Dressing table', cft: 25 }, { name: 'Carton boxes', cft: 4 },
  { name: 'Kitchen items', cft: 4 }, { name: 'Two-wheeler', cft: 45 }, { name: 'Four-wheeler', cft: 400 },
];

export const suggestionNames = (kind: 'services' | 'household') => (kind === 'services' ? SERVICE_PRESETS.map((s) => s.name) : HOUSEHOLD.map((h) => h.name));
