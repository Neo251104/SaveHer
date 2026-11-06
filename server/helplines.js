'use strict';
// South African emergency and support numbers, checked against government sources (gov.za, sanews.gov.za).
// Numbers change: re-verify before each release. Kept in one file so they are easy to update.
module.exports = [
  { name: 'Emergency (any cellphone)', number: '112', note: 'Works from any mobile phone, even without airtime', tel: '112', urgent: true },
  { name: 'SAPS flying squad', number: '10111', note: 'Police emergency response', tel: '10111', urgent: true },
  { name: 'Ambulance', number: '10177', note: 'Public ambulance service', tel: '10177', urgent: true },
  { name: 'GBV Command Centre', number: '0800 428 428', note: '24 hours, free. If you cannot speak: send a Please Call Me to *120*7867# or SMS “help” to 31531', tel: '0800428428' },
  { name: 'Stop Gender Violence helpline', number: '0800 150 150', note: 'Free, 24 hours', tel: '0800150150' },
  { name: 'National Shelter Helpline', number: '0800 001 005', note: 'Find a safe place to stay', tel: '0800001005' },
  { name: 'Lifeline counselling', number: '0861 322 322', note: '24 hour counselling', tel: '0861322322' },
  { name: 'SADAG suicide crisis line', number: '0800 567 567', note: '24 hours, free', tel: '0800567567' },
  { name: 'Childline', number: '0800 055 555', note: 'For children and anyone worried about a child', tel: '0800055555' },
];
