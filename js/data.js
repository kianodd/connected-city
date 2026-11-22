// ============================================================
// شبکه‌ساز: شهر متصل — داده‌های ثابت بازی (GAME_DATA)
// Vanilla JS، بدون build. در مرورگر به‌صورت global و در Node با require قابل استفاده است.
// ============================================================

const GAME_DATA = (() => {
  // ---------- RNG قطعی برای تولید ساختمان‌ها (ثابت در هر بار بارگذاری) ----------
  let _s = 1405;
  const rnd = () => {
    _s = (_s * 1103515245 + 12345) & 0x7fffffff;
    return _s / 0x7fffffff;
  };

  // ---------- مناطق شهر (مختصات دنیای 3200×2400 — نقشهٔ بزرگ‌تر، ۱۴ منطقه) ----------
  const districts = [
    { id: 'center',     name: 'مرکز شهر',      type: 'commercial',  x: 1600, y: 1200, radius: 440, population: 18000, demandBase: 4200, priceSensitivity: 0.6, potentialRevenue: 95000 },
    { id: 'bazaar',     name: 'بازار',          type: 'commercial',  x: 1120, y: 1560, radius: 320, population: 9000,  demandBase: 2600, priceSensitivity: 0.8, potentialRevenue: 52000 },
    { id: 'university', name: 'دانشگاه',        type: 'landmark',    x: 680,  y: 660,  radius: 370, population: 6500,  demandBase: 2400, priceSensitivity: 0.9, potentialRevenue: 38000 },
    { id: 'hospital',   name: 'بیمارستان',      type: 'landmark',    x: 2320, y: 780,  radius: 300, population: 4200,  demandBase: 1800, priceSensitivity: 0.2, potentialRevenue: 46000 },
    { id: 'industrial', name: 'منطقه صنعتی',   type: 'industrial',  x: 2620, y: 1820, radius: 490, population: 3200,  demandBase: 3200, priceSensitivity: 0.3, potentialRevenue: 88000 },
    { id: 'north',      name: 'حاشیه شمالی',   type: 'sparse',      x: 1640, y: 300,  radius: 480, population: 5200,  demandBase: 1100, priceSensitivity: 1.0, potentialRevenue: 21000 },
    { id: 'residential',name: 'کوی مسکونی',    type: 'residential', x: 580,  y: 1820, radius: 450, population: 14500, demandBase: 3400, priceSensitivity: 0.7, potentialRevenue: 61000 },
    { id: 'dense',      name: 'محله پرتراکم',  type: 'dense',       x: 2120, y: 1340, radius: 350, population: 16500, demandBase: 3900, priceSensitivity: 0.85, potentialRevenue: 72000 },
    { id: 'station',    name: 'ایستگاه قطار',   type: 'landmark',    x: 1600, y: 2180, radius: 300, population: 5000,  demandBase: 2100, priceSensitivity: 0.5, potentialRevenue: 40000 },
    { id: 'stadium',    name: 'ورزشگاه',        type: 'landmark',    x: 2650, y: 420,  radius: 280, population: 3000,  demandBase: 1600, priceSensitivity: 0.6, potentialRevenue: 35000 },
    { id: 'east_res',   name: 'کوی شرقی',       type: 'residential', x: 2780, y: 1180, radius: 380, population: 12000, demandBase: 3000, priceSensitivity: 0.7, potentialRevenue: 55000 },
    { id: 'south_sparse',name: 'حاشیه جنوبی',  type: 'sparse',      x: 900,  y: 2240, radius: 380, population: 4200,  demandBase: 950,  priceSensitivity: 1.0, potentialRevenue: 18000 },
    { id: 'west_town',  name: 'شهرک غربی',      type: 'residential', x: 320,  y: 1180, radius: 360, population: 10500, demandBase: 2700, priceSensitivity: 0.75, potentialRevenue: 50000 },
    { id: 'old_town',   name: 'بافت قدیم',      type: 'dense',       x: 1350, y: 780,  radius: 280, population: 13500, demandBase: 3300, priceSensitivity: 0.8, potentialRevenue: 58000 },
  ];

  // ---------- ساختمان‌ها (~190) — ساختمان‌های بلند (height>=10) دید مستقیم را می‌بندند ----------
  const buildings = [];
  const bTypes = ['residential', 'commercial', 'office', 'industrial'];
  const bColors = {
    residential: ['#5b6b82', '#64748b', '#55677d', '#6b7a90', '#5f7186'],
    commercial:  ['#7a6a4f', '#8a7a5c', '#6e5f45', '#837257'],
    office:      ['#4f6a7a', '#557a8a', '#47626f', '#5d7f8f'],
    industrial:  ['#6b5a4a', '#75624f', '#5f5044', '#6f5d4c'],
  };
  let bIdx = 0;
  districts.forEach((d) => {
    const count = (d.type === 'dense' || d.type === 'commercial') ? 16
      : d.type === 'sparse' ? 7
      : d.type === 'landmark' ? 10 : 12;
    for (let i = 0; i < count; i++) {
      bIdx++;
      const ang = rnd() * Math.PI * 2;
      const dist = rnd() * d.radius * 0.78;
      const tall = (d.type === 'dense' || d.type === 'commercial' || d.type === 'office') && rnd() > 0.45;
      const height = tall ? 10 + Math.floor(rnd() * 18) : 2 + Math.floor(rnd() * 7);
      const bType = d.type === 'industrial' ? 'industrial' : bTypes[Math.floor(rnd() * 3)];
      const palette = bColors[bType] || bColors.residential;
      buildings.push({
        id: 'b' + bIdx,
        districtId: d.id,
        x: Math.round(d.x + Math.cos(ang) * dist),
        y: Math.round(d.y + Math.sin(ang) * dist),
        w: 26 + Math.floor(rnd() * 42),
        h: 26 + Math.floor(rnd() * 42),
        height, // طبقه
        type: bType,
        color: palette[Math.floor(rnd() * palette.length)],
        name: height >= 15 ? 'برج ' + d.name + ' ' + i : undefined,
      });
    }
  });

  // ---------- نقاط نصب ----------
  const installPoints = [
    { id: 'ip_hq',      x: 1600, y: 1200, kind: 'datacenter',    name: 'مرکز دادهٔ مرکزی (HQ)' },
    { id: 'ip_t1',      x: 1240, y: 960,  kind: 'tower',         name: 'دکل غربی' },
    { id: 'ip_t2',      x: 2020, y: 1040, kind: 'tower',         name: 'دکل شرقی' },
    { id: 'ip_t3',      x: 1600, y: 420,  kind: 'tower',         name: 'دکل شمالی' },
    { id: 'ip_r1',      x: 1620, y: 1180, kind: 'rooftop',       name: 'بام برج مرکز شهر' },
    { id: 'ip_r2',      x: 700,  y: 680,  kind: 'rooftop',       name: 'بام ساختمان دانشگاه' },
    { id: 'ip_r3',      x: 2130, y: 1320, kind: 'rooftop',       name: 'بام برج محله پرتراکم' },
    { id: 'ip_e1',      x: 1120, y: 1540, kind: 'equipment_room',name: 'اتاق تجهیزات بازار' },
    { id: 'ip_e2',      x: 2320, y: 800,  kind: 'equipment_room',name: 'اتاق تجهیزات بیمارستان' },
    { id: 'ip_e3',      x: 2600, y: 1800, kind: 'equipment_room',name: 'اتاق تجهیزات صنعتی' },
    { id: 'ip_dc2',     x: 840,  y: 1400, kind: 'datacenter',    name: 'مرکز دادهٔ غربی' },
    { id: 'ip_t4',      x: 600,  y: 1840, kind: 'tower',         name: 'دکل کوی مسکونی' },
    { id: 'ip_t5',      x: 2650, y: 430,  kind: 'tower',         name: 'دکل ورزشگاه' },
    { id: 'ip_t6',      x: 2780, y: 1180, kind: 'tower',         name: 'دکل کوی شرقی' },
    { id: 'ip_t7',      x: 320,  y: 1180, kind: 'tower',         name: 'دکل شهرک غربی' },
    { id: 'ip_t8',      x: 1050, y: 2150, kind: 'tower',         name: 'دکل حاشیه جنوبی' },
    { id: 'ip_e4',      x: 1600, y: 2180, kind: 'equipment_room',name: 'اتاق تجهیزات ایستگاه قطار' },
    { id: 'ip_r4',      x: 1350, y: 780,  kind: 'rooftop',       name: 'بام برج بافت قدیم' },
    { id: 'ip_dc3',     x: 2400, y: 1500, kind: 'datacenter',    name: 'مرکز دادهٔ شرقی' },
  ];

  // ---------- کاتالوگ تجهیزات (برندهای خیالی: پارس‌نت، آریاتل، سیمرغ‌لینک) ----------
  // unlock: null = از ابتدا آزاد | 'tech id' = نیازمند تحقیق
  const equipmentList = [
    { id: 'fiber_cable',     name: 'کابل فیبر نوری پارس‌نت',   cost: 5000,   monthlyCost: 120,  buildDays: 2,  capacity: 10000, radius: 0,    unlock: null,            category: 'cable' },
    { id: 'copper_cable',    name: 'کابل مسی آریاتل',          cost: 2000,   monthlyCost: 60,   buildDays: 1,  capacity: 100,   radius: 0,    unlock: null,            category: 'cable' },
    { id: 'ftth',            name: 'فیبر تا خانه (FTTH)',      cost: 16000,  monthlyCost: 300,  buildDays: 5,  capacity: 1000,  radius: 140,  unlock: 'ftth',          category: 'access' },
    { id: 'cell_2g',         name: 'دکل سلولی 2G آریاتل',      cost: 20000,  monthlyCost: 700,  buildDays: 6,  capacity: 40,    radius: 400,  unlock: null,            category: 'access' },
    { id: 'cell_3g',         name: 'دکل سلولی 3G آریاتل',      cost: 32000,  monthlyCost: 1000, buildDays: 7,  capacity: 220,   radius: 340,  unlock: null,            category: 'access' },
    { id: 'cell_4g',         name: 'دکل سلولی 4G پارس‌نت',     cost: 62000,  monthlyCost: 1800, buildDays: 9,  capacity: 1100,  radius: 290,  unlock: 'lte',           category: 'access' },
    { id: 'cell_5g',         name: 'دکل سلولی 5G سیمرغ‌لینک',  cost: 125000, monthlyCost: 3400, buildDays: 12, capacity: 5200,  radius: 205,  unlock: '5g',            category: 'access' },
    { id: 'fwa_ap',          name: 'آنتن دسترسی ثابت بی‌سیم',  cost: 25000,  monthlyCost: 800,  buildDays: 4,  capacity: 550,   radius: 255,  unlock: null,            category: 'access' },
    { id: 'ptp_link',        name: 'لینک نقطه‌به‌نقطه',        cost: 18000,  monthlyCost: 450,  buildDays: 3,  capacity: 1000,  radius: 1500, unlock: null,            category: 'backhaul' },
    { id: 'wifi_ap',         name: 'اکسس‌پوینت وای‌فای',       cost: 8000,   monthlyCost: 200,  buildDays: 1,  capacity: 320,   radius: 90,   unlock: null,            category: 'access' },
    { id: 'sat_terminal_leo',name: 'پایانه ماهواره‌ای LEO',    cost: 82000,  monthlyCost: 2600, buildDays: 8,  capacity: 260,   radius: 300,  unlock: 'satellite_leo', category: 'satellite' },
    { id: 'sat_terminal_geo',name: 'پایانه ماهواره‌ای GEO',    cost: 61000,  monthlyCost: 1900, buildDays: 8,  capacity: 130,   radius: 350,  unlock: 'satellite_geo', category: 'satellite' },
    { id: 'sat_gateway',     name: 'دروازه زمینی ماهواره',     cost: 205000, monthlyCost: 6200, buildDays: 20, capacity: 6000,  radius: 0,    unlock: 'satellite_leo', category: 'satellite' },
    { id: 'router',          name: 'روتر لبه پارس‌نت',         cost: 10000,  monthlyCost: 250,  buildDays: 1,  capacity: 1200,  radius: 0,    unlock: null,            category: 'core' },
    { id: 'switch',          name: 'سوئیچ تجمیع محلی',         cost: 6000,   monthlyCost: 150,  buildDays: 1,  capacity: 1200,  radius: 0,    unlock: null,            category: 'core' },
    { id: 'aggregation',     name: 'گره تجمیع منطقه‌ای',       cost: 42000,  monthlyCost: 1200, buildDays: 6,  capacity: 12000, radius: 0,    unlock: null,            category: 'core' },
    { id: 'core_router',     name: 'روتر هسته',                cost: 105000, monthlyCost: 3200, buildDays: 10, capacity: 40000, radius: 0,    unlock: null,            category: 'core' },
    { id: 'internet_gateway',name: 'دروازه اینترنت',           cost: 155000, monthlyCost: 4800, buildDays: 12, capacity: 40000, radius: 0,    unlock: null,            category: 'core' },
  ];
  // دسترسی هم به‌صورت آرایه و هم به‌صورت نگاشت با کلید id
  const equipment = equipmentList.slice();
  equipmentList.forEach((e) => { equipment[e.id] = e; });

  // ---------- درخت فناوری ----------
  const techList = [
    { id: 'fiber',         name: 'شبکه فیبر نوری',        cost: 15000, requires: [],                 unlocks: ['fiber_cable', 'aggregation'] },
    { id: 'lte',           name: 'فناوری LTE (4G)',       cost: 30000, requires: [],                 unlocks: ['cell_4g'] },
    { id: 'ftth',          name: 'فیبر تا خانه',          cost: 45000, requires: ['fiber'],          unlocks: ['ftth'] },
    { id: '5g',            name: 'نسل پنجم (5G)',         cost: 80000, requires: ['lte'],            unlocks: ['cell_5g'] },
    { id: 'satellite_leo', name: 'ماهواره مدار پایین',    cost: 90000, requires: [],                 unlocks: ['sat_terminal_leo', 'sat_gateway'] },
    { id: 'satellite_geo', name: 'ماهواره زمین‌آهنگ',     cost: 70000, requires: ['satellite_leo'],  unlocks: ['sat_terminal_geo'] },
    { id: 'smart_mgmt',    name: 'مدیریت هوشمند شبکه',    cost: 40000, requires: ['fiber'],          unlocks: [] },
  ];
  const techs = techList.slice();
  techList.forEach((t) => { techs[t.id] = t; });

  // ---------- بسته‌های اشتراک ----------
  const packageList = [
    { id: 'home',       name: 'خانگی',        speedMbps: 50,   price: 120,  serviceLevel: 'standard' },
    { id: 'business',   name: 'تجاری',        speedMbps: 200,  price: 450,  serviceLevel: 'priority' },
    { id: 'fwa',        name: 'بی‌سیم ثابت',  speedMbps: 100,  price: 180,  serviceLevel: 'standard' },
    { id: 'enterprise', name: 'سازمانی',      speedMbps: 1000, price: 3000, serviceLevel: 'premium' },
    { id: 'satellite',  name: 'ماهواره‌ای',   speedMbps: 80,   price: 900,  serviceLevel: 'priority' },
  ];
  const packages = packageList.slice();
  packageList.forEach((p) => { packages[p.id] = p; });

  // ---------- مأموریت‌ها ----------
  const missions = [
    { id: 'm_first_tower', name: 'اولین دکل',        description: 'یک گره دسترسی (دکل یا آنتن) بسازید.',            goal: { type: 'build_access', count: 1 },        reward: 5000 },
    { id: 'm_connect',     name: 'اتصال به هسته',    description: 'یک گره دسترسی را به شبکه وصل کنید.',              goal: { type: 'connect_access', count: 1 },      reward: 5000 },
    { id: 'm_serve',       name: 'اولین مشترکان',    description: 'در یک منطقه به کیفیت سرویس ۵۰٪ برسید.',           goal: { type: 'district_qos', qos: 0.5, count: 1 }, reward: 8000 },
    { id: 'm_subs_500',    name: '۵۰۰ مشترک',        description: 'به ۵۰۰ مشترک فعال برسید.',                        goal: { type: 'subscribers', count: 500 },       reward: 15000 },
    { id: 'm_tech',        name: 'تحقیق و توسعه',    description: 'یک فناوری جدید باز کنید.',                        goal: { type: 'unlock_tech', count: 1 },         reward: 10000 },
    { id: 'm_coverage',    name: 'پوشش شهر',         description: 'در ۴ منطقه کیفیت سرویس بالای ۶۰٪ بگیرید.',         goal: { type: 'district_qos', qos: 0.6, count: 4 }, reward: 40000 },
    { id: 'm_subs_5000',   name: '۵۰۰۰ مشترک',       description: 'به ۵۰۰۰ مشترک فعال برسید.',                       goal: { type: 'subscribers', count: 5000 },      reward: 60000 },
    { id: 'm_satellite',   name: 'اتصال ماهواره‌ای', description: 'یک پایانه ماهواره‌ای را به دروازه وصل کنید.',      goal: { type: 'satellite_path', count: 1 },      reward: 50000 },
    { id: 'm_profit',      name: 'ماه سودده',        description: 'یک ماه با سود خالص مثبت تمام کنید.',               goal: { type: 'monthly_profit', count: 1 },      reward: 30000 },
  ];

  // ---------- قالب رویدادها ----------
  const events = [
    { id: 'ev_cable_cut',   name: 'قطع کابل فیبر',     type: 'failure',  probability: 0.010, description: 'حفاری شهری یک کابل فیبر را قطع کرد.',        effect: { target: 'random_link', action: 'cut' } },
    { id: 'ev_power_out',   name: 'قطعی برق',          type: 'failure',  probability: 0.008, description: 'برق یک منطقه قطع شد و یک گره از کار افتاد.', effect: { target: 'random_node', action: 'fail' } },
    { id: 'ev_storm',       name: 'طوفان',             type: 'weather',  probability: 0.006, description: 'طوفان به لینک‌های بی‌سیم آسیب زد.',          effect: { target: 'ptp_links', action: 'degrade' } },
    { id: 'ev_demand_surge',name: 'موج تقاضا',         type: 'demand',   probability: 0.012, description: 'تقاضای اینترنت در یک منطقه ناگهان بالا رفت.', effect: { target: 'random_district', action: 'demand_up', factor: 1.4 } },
    { id: 'ev_new_building',name: 'ساختمان جدید',      type: 'growth',   probability: 0.010, description: 'یک مجتمع جدید جمعیت منطقه را بیشتر کرد.',    effect: { target: 'random_district', action: 'population_up', factor: 1.08 } },
    { id: 'ev_grant',       name: 'یارانه دولتی',      type: 'finance',  probability: 0.004, description: 'برای توسعه پوشش، یارانه دریافت کردید.',      effect: { target: 'cash', action: 'add', amount: 25000 } },
    { id: 'ev_complaint',   name: 'شکایت رسانه‌ای',    type: 'reputation', probability: 0.008, description: 'کیفیت پایین سرویس در رسانه‌ها بازتاب یافت.', effect: { target: 'random_district', action: 'satisfaction_down', amount: 8 } },
  ];

  // ---------- نقش‌های پرسنل ----------
  const staffRoles = [
    { id: 'technician', name: 'تکنسین شبکه',   salary: 1800, skill: 'repair',    description: 'سرعت تعمیر خرابی‌ها را بالا می‌برد.' },
    { id: 'engineer',   name: 'مهندس شبکه',    salary: 3500, skill: 'build',     description: 'زمان ساخت تجهیزات را کم می‌کند.' },
    { id: 'support',    name: 'پشتیبانی مشتری', salary: 1400, skill: 'satisfaction', description: 'رضایت مشترکان را بهبود می‌دهد.' },
    { id: 'manager',    name: 'مدیر عملیات',   salary: 5000, skill: 'management', description: 'هزینه‌های ماهانه را کاهش می‌دهد.' },
  ];

  return {
    world: { width: 3200, height: 2400 },
    districts,
    buildings,
    installPoints,
    equipment,
    equipmentList,
    techs,
    techList,
    packages,
    packageList,
    missions,
    events,
    staffRoles,
    // رسانه‌های لینک و ویژگی‌هایشان
    linkMedia: {
      fiber:     { name: 'فیبر نوری',  capacity: 10000, latency: 2 },
      copper:    { name: 'مسی',        capacity: 100,   latency: 5 },
      ethernet:  { name: 'اترنت',      capacity: 1000,  latency: 1 },
      ptp:       { name: 'نقطه‌به‌نقطه', capacity: 1000, latency: 8 },
      satellite: { name: 'ماهواره‌ای', capacity: 600,   latency: 45 },
    },
    // همان رسانه‌ها به‌صورت آرایه (برای انتخاب‌گر UI)
    media: [
      { id: 'fiber',     name: 'فیبر نوری',    costPerUnit: 8, capacity: 10000, latency: 2 },
      { id: 'copper',    name: 'مسی',          costPerUnit: 3, capacity: 100,   latency: 5 },
      { id: 'ethernet',  name: 'اترنت',        costPerUnit: 2, capacity: 1000,  latency: 1 },
      { id: 'ptp',       name: 'نقطه‌به‌نقطه', costPerUnit: 5, capacity: 1000,  latency: 8 },
      { id: 'satellite', name: 'ماهواره‌ای',   costPerUnit: 20, capacity: 600,  latency: 45 },
    ],
    linkTypes: null, // در ادامه برابر media می‌شود
  };
})();

GAME_DATA.linkTypes = GAME_DATA.media;
if (typeof window !== 'undefined') window.GAME_DATA = GAME_DATA;

if (typeof module !== 'undefined' && module.exports) module.exports = GAME_DATA;
