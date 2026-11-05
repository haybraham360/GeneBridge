/**
 * Demo notices (task 08 section 6), seeded by `npm run seed:notices` and
 * listed in README.md. Codes are fixed so the links stay the same between
 * seeds. All synthetic.
 */
export const demoNotices = [
  {
    key: 'withCondition',
    code: 'demoA7f3kQ9xLm2Pv8RtZc4Wn6Yb',
    locale: 'en',
    condition_id: 'sickle_cell_disease',
    expired: false,
    phone: '+971500000101',
  },
  {
    key: 'withoutCondition',
    code: 'demoB2h8sN5vKq1Xj7GdFw3Ep9Ua',
    locale: 'ar',
    condition_id: null,
    expired: false,
    phone: '+971500000102',
  },
  {
    key: 'expired',
    code: 'demoC9m4tR6yHz3Lb1QnVx8Ks5Jd',
    locale: 'en',
    condition_id: 'sickle_cell_disease',
    expired: true,
    phone: '+971500000103',
  },
] as const;
