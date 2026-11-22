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

  // ---------- مناطق شهر (مختصات دنیای 7200×5400 — نقشهٔ پشتیبان ثابت، ۱۴ منطقه) ----------
  const districts = [
    { id: 'center',     name: 'مرکز شهر',      type: 'commercial',  x: 3600, y: 2700, radius: 440, population: 18000, demandBase: 4200, priceSensitivity: 0.6, potentialRevenue: 95000 },
    { id: 'bazaar',     name: 'بازار',          type: 'commercial',  x: 2520, y: 3510, radius: 320, population: 9000,  demandBase: 2600, priceSensitivity: 0.8, potentialRevenue: 52000 },
    { id: 'university', name: 'دانشگاه',        type: 'landmark',    x: 1530,  y: 1485,  radius: 370, population: 6500,  demandBase: 2400, priceSensitivity: 0.9, potentialRevenue: 38000 },
    { id: 'hospital',   name: 'بیمارستان',      type: 'landmark',    x: 5220, y: 1755,  radius: 300, population: 4200,  demandBase: 1800, priceSensitivity: 0.2, potentialRevenue: 46000 },
    { id: 'industrial', name: 'منطقه صنعتی',   type: 'industrial',  x: 5895, y: 4095, radius: 490, population: 3200,  demandBase: 3200, priceSensitivity: 0.3, potentialRevenue: 88000 },
    { id: 'north',      name: 'حاشیه شمالی',   type: 'sparse',      x: 3690, y: 675,  radius: 480, population: 5200,  demandBase: 1100, priceSensitivity: 1.0, potentialRevenue: 21000 },
    { id: 'residential',name: 'کوی مسکونی',    type: 'residential', x: 1305,  y: 4095, radius: 450, population: 14500, demandBase: 3400, priceSensitivity: 0.7, potentialRevenue: 61000 },
    { id: 'dense',      name: 'محله پرتراکم',  type: 'dense',       x: 4770, y: 3015, radius: 350, population: 16500, demandBase: 3900, priceSensitivity: 0.85, potentialRevenue: 72000 },
    { id: 'station',    name: 'ایستگاه قطار',   type: 'landmark',    x: 3600, y: 4905, radius: 300, population: 5000,  demandBase: 2100, priceSensitivity: 0.5, potentialRevenue: 40000 },
    { id: 'stadium',    name: 'ورزشگاه',        type: 'landmark',    x: 5962, y: 945,  radius: 280, population: 3000,  demandBase: 1600, priceSensitivity: 0.6, potentialRevenue: 35000 },
    { id: 'east_res',   name: 'کوی شرقی',       type: 'residential', x: 6255, y: 2655, radius: 380, population: 12000, demandBase: 3000, priceSensitivity: 0.7, potentialRevenue: 55000 },
    { id: 'south_sparse',name: 'حاشیه جنوبی',  type: 'sparse',      x: 2025,  y: 5040, radius: 380, population: 4200,  demandBase: 950,  priceSensitivity: 1.0, potentialRevenue: 18000 },
    { id: 'west_town',  name: 'شهرک غربی',      type: 'residential', x: 720,  y: 2655, radius: 360, population: 10500, demandBase: 2700, priceSensitivity: 0.75, potentialRevenue: 50000 },
    { id: 'old_town',   name: 'بافت قدیم',      type: 'dense',       x: 3038, y: 1755,  radius: 280, population: 13500, demandBase: 3300, priceSensitivity: 0.8, potentialRevenue: 58000 },
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
    { id: 'ip_hq',      x: 3600, y: 2700, kind: 'datacenter',    name: 'مرکز دادهٔ مرکزی (HQ)' },
    { id: 'ip_t1',      x: 2790, y: 2160,  kind: 'tower',         name: 'دکل غربی' },
    { id: 'ip_t2',      x: 4545, y: 2340, kind: 'tower',         name: 'دکل شرقی' },
    { id: 'ip_t3',      x: 3600, y: 945,  kind: 'tower',         name: 'دکل شمالی' },
    { id: 'ip_r1',      x: 3645, y: 2655, kind: 'rooftop',       name: 'بام برج مرکز شهر' },
    { id: 'ip_r2',      x: 1575,  y: 1530,  kind: 'rooftop',       name: 'بام ساختمان دانشگاه' },
    { id: 'ip_r3',      x: 4792, y: 2970, kind: 'rooftop',       name: 'بام برج محله پرتراکم' },
    { id: 'ip_e1',      x: 2520, y: 3465, kind: 'equipment_room',name: 'اتاق تجهیزات بازار' },
    { id: 'ip_e2',      x: 5220, y: 1800,  kind: 'equipment_room',name: 'اتاق تجهیزات بیمارستان' },
    { id: 'ip_e3',      x: 5850, y: 4050, kind: 'equipment_room',name: 'اتاق تجهیزات صنعتی' },
    { id: 'ip_dc2',     x: 1890,  y: 3150, kind: 'datacenter',    name: 'مرکز دادهٔ غربی' },
    { id: 'ip_t4',      x: 1350,  y: 4140, kind: 'tower',         name: 'دکل کوی مسکونی' },
    { id: 'ip_t5',      x: 5962, y: 968,  kind: 'tower',         name: 'دکل ورزشگاه' },
    { id: 'ip_t6',      x: 6255, y: 2655, kind: 'tower',         name: 'دکل کوی شرقی' },
    { id: 'ip_t7',      x: 720,  y: 2655, kind: 'tower',         name: 'دکل شهرک غربی' },
    { id: 'ip_t8',      x: 2362, y: 4838, kind: 'tower',         name: 'دکل حاشیه جنوبی' },
    { id: 'ip_e4',      x: 3600, y: 4905, kind: 'equipment_room',name: 'اتاق تجهیزات ایستگاه قطار' },
    { id: 'ip_r4',      x: 3038, y: 1755,  kind: 'rooftop',       name: 'بام برج بافت قدیم' },
    { id: 'ip_dc3',     x: 5400, y: 3375, kind: 'datacenter',    name: 'مرکز دادهٔ شرقی' },
  ];

  // ---------- کاتالوگ تجهیزات (برندهای خیالی: پارس‌نت، آریاتل، سیمرغ‌لینک) ----------
  // unlock: null = از ابتدا آزاد | 'tech id' = نیازمند تحقیق
  const equipmentList = [
    { id: 'fiber_cable',     name: 'کابل فیبر نوری پارس‌نت',   cost: 5000,   monthlyCost: 120,  buildDays: 2,  capacity: 10000, radius: 0,    unlock: null,            category: 'cable',
      guide: 'کابل فیبر نوری برای اتصال گره‌ها به هم با ظرفیت بسیار بالا و تأخیر کم. بهترین گزینه برای مسیرهای اصلی و انتقال (Backhaul) است؛ گران‌تر از مسی است ولی ظرفیتش چند برابر است. با ابزار «اتصال» بین دو گره استفاده می‌شود.' },
    { id: 'copper_cable',    name: 'کابل مسی آریاتل',          cost: 2000,   monthlyCost: 60,   buildDays: 1,  capacity: 100,   radius: 0,    unlock: null,            category: 'cable',
      guide: 'ارزان‌ترین راه اتصال دو گره، اما ظرفیت کمی دارد و زود اشباع می‌شود. فقط برای شروع کار و اتصال‌های کوتاه و کم‌ترافیک مناسب است؛ بعداً با فیبر جایگزینش کنید.' },
    { id: 'ftth',            name: 'فیبر تا خانه (FTTH)',      cost: 16000,  monthlyCost: 300,  buildDays: 5,  capacity: 1000,  radius: 140,  unlock: 'ftth',          category: 'access',
      guide: 'اتصال مستقیم فیبر تا ساختمان مشتری با ظرفیت بالا و کیفیت پایدار. برای مناطق مسکونی و تجاری پرتقاضا عالی است. نیازمند تحقیق «فیبر تا خانه» و اتصال به شبکه هسته است.' },
    { id: 'cell_2g',         name: 'دکل سلولی 2G آریاتل',      cost: 20000,  monthlyCost: 700,  buildDays: 6,  capacity: 40,    radius: 400,  unlock: null,            category: 'access',
      guide: 'ارزان‌ترین دکل سلولی با برد زیاد ولی ظرفیت بسیار کم. فقط برای پوشش اولیه مناطق کم‌تراکم خوب است و با رشد مشترک‌ها زود اشباع می‌شود. باید به هسته متصل شود تا سرویس بدهد.' },
    { id: 'cell_3g',         name: 'دکل سلولی 3G آریاتل',      cost: 32000,  monthlyCost: 1000, buildDays: 7,  capacity: 220,   radius: 340,  unlock: null,            category: 'access',
      guide: 'دکل نسل سوم: برد خوب و ظرفیت متوسط؛ تعادل مناسبی برای ابتدای بازی و مناطق مسکونی معمولی. در مناطق پرتراکم به‌تدریج کم می‌آورد. نیازمند اتصال انتقالی به هسته است.' },
    { id: 'cell_4g',         name: 'دکل سلولی 4G پارس‌نت',     cost: 62000,  monthlyCost: 1800, buildDays: 9,  capacity: 1100,  radius: 290,  unlock: 'lte',           category: 'access',
      guide: 'دکل LTE با ظرفیت بالا و پوشش خوب؛ ستون اصلی شبکه در مناطق پرجمعیت. نیازمند تحقیق «فناوری LTE» است و برای اشباع‌نشدن به اتصال فیبر یا لینک قوی به هسته نیاز دارد.' },
    { id: 'cell_5g',         name: 'دکل سلولی 5G سیمرغ‌لینک',  cost: 125000, monthlyCost: 3400, buildDays: 12, capacity: 5200,  radius: 205,  unlock: '5g',            category: 'access',
      guide: 'بیشترین ظرفیت سلولار برای مناطق بسیار پرتراکم و پرمصرف، ولی بردش کمتر و هزینه‌اش بالاست. نیازمند تحقیق «نسل پنجم» (پس از LTE) و اتصال انتقالی پرظرفیت به هسته است.' },
    { id: 'fwa_ap',          name: 'آنتن دسترسی ثابت بی‌سیم',  cost: 25000,  monthlyCost: 800,  buildDays: 4,  capacity: 550,   radius: 255,  unlock: null,            category: 'access',
      guide: 'اینترنت بی‌سیم برای خانه‌ها و کسب‌وکارهای ثابت بدون کابل‌کشی تا مشتری. برای حاشیه شهر و جاهایی که فیبر نمی‌رسد عالی است. کیفیتش به فاصله و دید مستقیم بستگی دارد؛ ساختمان‌های بلند جلویش را می‌گیرند.' },
    { id: 'ptp_link',        name: 'لینک نقطه‌به‌نقطه',        cost: 18000,  monthlyCost: 450,  buildDays: 3,  capacity: 1000,  radius: 1500, unlock: null,            category: 'backhaul',
      guide: 'اتصال بی‌سیم جهت‌دار بین دو گره؛ جایگزین کابل برای انتقال (Backhaul). وقتی کابل‌کشی سخت یا گران است استفاده کنید؛ برای مسیر پشتیبان هم خوب است. به دید مستقیم بین دو طرف نیاز دارد.' },
    { id: 'wifi_ap',         name: 'اکسس‌پوینت وای‌فای',       cost: 8000,   monthlyCost: 200,  buildDays: 1,  capacity: 320,   radius: 90,   unlock: null,            category: 'access',
      guide: 'ارزان‌ترین و سریع‌ترین راه شروع سرویس در یک محدوده کوچک (یک محله یا ساختمان). بردش کم است؛ برای پوشش وسیع‌تر چند تا کنار هم بگذارید و همه را به شبکه وصل کنید.' },
    { id: 'sat_terminal_leo',name: 'پایانه ماهواره‌ای LEO',    cost: 82000,  monthlyCost: 2600, buildDays: 8,  capacity: 260,   radius: 300,  unlock: 'satellite_leo', category: 'satellite',
      guide: 'پایانه ماهواره مدار پایین: اینترنت ماهواره‌ای با تأخیر کمتر برای مناطق دورافتاده و مسیر پشتیبان. باید از راه دروازه زمینی ماهواره به هسته برسد. نیازمند تحقیق «ماهواره مدار پایین»؛ هزینه ماهانه بالایی دارد.' },
    { id: 'sat_terminal_geo',name: 'پایانه ماهواره‌ای GEO',    cost: 61000,  monthlyCost: 1900, buildDays: 8,  capacity: 130,   radius: 350,  unlock: 'satellite_geo', category: 'satellite',
      guide: 'پایانه ماهواره زمین‌آهنگ: پوشش وسیع ولی تأخیر بیشتر و ظرفیت کمتر از LEO. برای نقاط خیلی دور که هیچ زیرساختی ندارند. نیازمند تحقیق «ماهواره زمین‌آهنگ» و اتصال به دروازه زمینی است.' },
    { id: 'sat_gateway',     name: 'دروازه زمینی ماهواره',     cost: 205000, monthlyCost: 6200, buildDays: 20, capacity: 6000,  radius: 0,    unlock: 'satellite_leo', category: 'satellite',
      guide: 'ایستگاه زمینی که ترافیک پایانه‌های ماهواره‌ای را به هسته شبکه می‌رساند. بدون آن هیچ پایانه ماهواره‌ای کار نمی‌کند. گران است؛ فقط وقتی شبکه ماهواره‌ای می‌سازید لازم می‌شود.' },
    { id: 'router',          name: 'روتر لبه پارس‌نت',         cost: 10000,  monthlyCost: 250,  buildDays: 1,  capacity: 1200,  radius: 0,    unlock: null,            category: 'core',
      guide: 'گره واسط برای جمع‌کردن ترافیک چند دستگاه دسترسی و رساندنش به تجمیع یا هسته. ارزان و سریع ساخته می‌شود و برای شبکه‌های کوچک کافی است.' },
    { id: 'switch',          name: 'سوئیچ تجمیع محلی',         cost: 6000,   monthlyCost: 150,  buildDays: 1,  capacity: 1200,  radius: 0,    unlock: null,            category: 'core',
      guide: 'چند اتصال نزدیک را به هم وصل می‌کند تا به یک گره بالادستی برسند. ارزان‌ترین راه ساخت یک نقطه تجمیع کوچک در یک محله.' },
    { id: 'aggregation',     name: 'گره تجمیع منطقه‌ای',       cost: 42000,  monthlyCost: 1200, buildDays: 6,  capacity: 12000, radius: 0,    unlock: null,            category: 'core',
      guide: 'ترافیک چند منطقه و دستگاه دسترسی را جمع می‌کند و به هسته می‌رساند. ظرفیت بسیار بالا دارد و برای گسترش شبکه به مناطق جدید ضروری است. به اتصال فیبر به هسته نیاز دارد.' },
    { id: 'core_router',     name: 'روتر هسته',                cost: 105000, monthlyCost: 900,  buildDays: 10, capacity: 40000, radius: 0,    unlock: null,            category: 'core',
      guide: 'قلب شبکه شما؛ همه ترافیک شهر از آن عبور می‌کند و به دروازه اینترنت وصل است. از ابتدای بازی فعال است. اگر اشباع شود کل شهر کند می‌شود؛ با گره‌های تجمیع بار را پخش کنید.' },
    { id: 'internet_gateway',name: 'دروازه اینترنت',           cost: 155000, monthlyCost: 1500, buildDays: 12, capacity: 40000, radius: 0,    unlock: null,            category: 'core',
      guide: 'اتصال شبکه شما به اینترنت جهانی. بدون مسیر تا این گره هیچ مشتری‌ای آنلاین نمی‌شود. از ابتدای بازی فعال و به روتر هسته متصل است.' },
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
    { id: 'satellite',  name: 'ماهواره‌ای',   speedMbps: 300,  price: 900,  serviceLevel: 'priority' },
  ];
  const packages = packageList.slice();
  packageList.forEach((p) => { packages[p.id] = p; });

  // ---------- سهم تقاضای هر فناوری در هر نوع منطقه (جمع هر ردیف = ۱) ----------
  // کلیدها: fiber=فیبر/مسی، cellular=سلولار، fwa=وایرلس ثابت، wifi=وای‌فای، satellite=ماهواره
  const techDemandSplit = {
    dense:       { fiber: 0.20, cellular: 0.35, fwa: 0.10, wifi: 0.30, satellite: 0.05 },
    residential: { fiber: 0.30, cellular: 0.25, fwa: 0.20, wifi: 0.20, satellite: 0.05 },
    commercial:  { fiber: 0.45, cellular: 0.20, fwa: 0.05, wifi: 0.25, satellite: 0.05 },
    industrial:  { fiber: 0.55, cellular: 0.15, fwa: 0.10, wifi: 0.05, satellite: 0.15 },
    landmark:    { fiber: 0.35, cellular: 0.25, fwa: 0.05, wifi: 0.30, satellite: 0.05 },
    sparse:      { fiber: 0.05, cellular: 0.25, fwa: 0.35, wifi: 0.10, satellite: 0.25 },
    academic:    { fiber: 0.35, cellular: 0.25, fwa: 0.05, wifi: 0.30, satellite: 0.05 },
    medical:     { fiber: 0.45, cellular: 0.20, fwa: 0.05, wifi: 0.20, satellite: 0.10 },
    heavy_industrial: { fiber: 0.60, cellular: 0.10, fwa: 0.10, wifi: 0.05, satellite: 0.15 },
    tourism:     { fiber: 0.25, cellular: 0.30, fwa: 0.10, wifi: 0.30, satellite: 0.05 },
    transport:   { fiber: 0.30, cellular: 0.30, fwa: 0.10, wifi: 0.25, satellite: 0.05 },
    villa:       { fiber: 0.40, cellular: 0.20, fwa: 0.20, wifi: 0.15, satellite: 0.05 },
    slum:        { fiber: 0.05, cellular: 0.30, fwa: 0.30, wifi: 0.15, satellite: 0.20 },
    government:  { fiber: 0.50, cellular: 0.20, fwa: 0.05, wifi: 0.20, satellite: 0.05 },
  };
  const techDemandSplitDefault = { fiber: 0.25, cellular: 0.30, fwa: 0.15, wifi: 0.20, satellite: 0.10 };

  // ---------- راهنمای فناوری‌ها (نمای کلی در منوی راهنما) ----------
  const techGuides = [
    { id: 'cables', name: 'کابل‌ها (فیبر و مسی)',
      desc: 'کابل‌ها گره‌ها را به هم وصل می‌کنند و ترافیک را منتقل می‌کنند. فیبر ظرفیت بسیار بالا و تأخیر کم دارد؛ مسی ارزان است ولی زود اشباع می‌شود.',
      whenToUse: 'برای مسیرهای اصلی و پرترافیک فیبر؛ برای شروع ارزان و اتصال‌های کم‌ترافیک مسی.',
      equipmentIds: ['fiber_cable', 'copper_cable'] },
    { id: 'fiber', name: 'فیبر نوری و FTTH',
      desc: 'فیبر نوری سریع‌ترین و پایدارترین رسانه انتقال است. FTTH یعنی رساندن فیبر تا خود ساختمان مشتری؛ کیفیت و ظرفیت عالی برای مناطق پرتقاضا.',
      whenToUse: 'وقتی منطقه‌ای پرمشترک و پرمصرف است و کیفیت پایدار می‌خواهید. هزینه اولیه بالاتر، ولی بهترین تجربه مشتری.',
      equipmentIds: ['ftth', 'fiber_cable'] },
    { id: 'copper', name: 'مسی / DSL',
      desc: 'فناوری قدیمی‌تر و ارزان‌تر روی سیم مسی؛ ظرفیت محدود و حساس به فاصله.',
      whenToUse: 'فقط برای شروع ارزان یا اتصال‌های خیلی کم‌ترافیک؛ در بلندمدت با فیبر جایگزین شود.',
      equipmentIds: ['copper_cable'] },
    { id: 'cellular', name: 'سلولار (2G تا 5G)',
      desc: 'دکل‌های موبایل پوشش بی‌سیم وسیع می‌دهند. هر نسل جدید ظرفیت بیشتری دارد ولی برد کمتر و هزینه بالاتر: 2G ارزان و کم‌ظرفیت، 3G متعادل، 4G/LTE پرظرفیت، 5G بیشترین ظرفیت برای مناطق بسیار متراکم.',
      whenToUse: 'برای پوشش سریع مناطق وسیع و پرجمعیت. هر دکل باید با فیبر یا لینک قوی به هسته وصل شود وگرنه اشباع می‌شود.',
      equipmentIds: ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g'] },
    { id: 'fwa', name: 'وایرلس ثابت (FWA)',
      desc: 'اینترنت بی‌سیم برای مشتریان ثابت (خانه و مغازه) با آنتن گیرنده؛ بدون کابل‌کشی تا مشتری.',
      whenToUse: 'برای حاشیه شهر و مناطقی که فیبر نمی‌رسد. به دید مستقیم نیاز دارد و ساختمان بلند مزاحم است.',
      equipmentIds: ['fwa_ap'] },
    { id: 'ptp', name: 'لینک نقطه‌به‌نقطه',
      desc: 'اتصال بی‌سیم جهت‌دار بین دو گره برای انتقال ترافیک (Backhaul) به‌جای کابل.',
      whenToUse: 'وقتی کابل‌کشی بین دو گره سخت یا گران است، یا برای ساخت مسیر پشتیبان دوم.',
      equipmentIds: ['ptp_link'] },
    { id: 'wifi', name: 'وای‌فای',
      desc: 'پوشش بی‌سیم برد کوتاه برای یک ساختمان یا محله کوچک؛ ارزان‌ترین شروع ممکن.',
      whenToUse: 'برای اولین سرویس و مناطق کوچک. برای پوشش بزرگ‌تر چند اکسس‌پوینت و بعد دکل یا فیبر لازم است.',
      equipmentIds: ['wifi_ap'] },
    { id: 'satellite', name: 'ماهواره (LEO و GEO)',
      desc: 'اینترنت از ماهواره: پایانه مشتری یا سایت ← ماهواره ← دروازه زمینی ← هسته. LEO تأخیر کمتر و ظرفیت بیشتری دارد؛ GEO پوشش وسیع‌تر ولی کندتر است. هزینه تجهیزات و ماهانه بالاست.',
      whenToUse: 'برای مناطق دورافتاده بدون زیرساخت زمینی و به‌عنوان مسیر پشتیبان هنگام قطع فیبر؛ جایگزین همیشگی فیبر نیست.',
      equipmentIds: ['sat_terminal_leo', 'sat_terminal_geo', 'sat_gateway'] },
    { id: 'core', name: 'هسته و تجمیع',
      desc: 'روتر هسته و دروازه اینترنت قلب شبکه‌اند؛ گره‌های تجمیع ترافیک مناطق را جمع و به هسته می‌رسانند. هر دستگاه دسترسی باید مسیری تا هسته و دروازه داشته باشد.',
      whenToUse: 'تجمیع را وقتی بسازید که چند دستگاه دسترسی در یک ناحیه دارید تا بار هسته کم و مسیرها کوتاه شود.',
      equipmentIds: ['core_router', 'internet_gateway', 'aggregation', 'router', 'switch'] },
  ];

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
    { id: 'technician', name: 'تکنسین میدانی', salary: 1800, skill: 'repair',
      description: 'سرعت ساخت تجهیزات و تعمیر خرابی‌ها را بالا می‌برد.',
      effect: 'ساخت تجهیزات و تعمیر گره‌ها و لینک‌های خراب را سریع‌تر انجام می‌دهد. هرچه شبکه بزرگ‌تر شود، تکنسین بیشتری لازم است تا سرعت ساخت و تعمیر افت نکند.',
      absence: 'بدون تکنسین میدانی، ساخت و تعمیر بسیار کند انجام می‌شود و قطعی‌ها طولانی می‌شوند.' },
    { id: 'engineer', name: 'مهندس شبکه', salary: 3500, skill: 'build',
      description: 'ظرفیت مؤثر شبکه را بیشتر و ازدحام را کمتر می‌کند.',
      effect: 'ظرفیت مؤثر لینک‌ها را بیشتر می‌کند تا در ساعات شلوغ ازدحام دیرتر کیفیت سرویس را پایین بیاورد. شبکهٔ بزرگ‌تر به مهندس بیشتری نیاز دارد.',
      absence: 'بدون مهندس شبکه، ظرفیت مؤثر کمتر است و ازدحام زودتر کیفیت سرویس را پایین می‌آورد.' },
    { id: 'support', name: 'تیم پشتیبانی', salary: 1400, skill: 'satisfaction',
      description: 'افت رضایت و ریزش مشترک را کمتر می‌کند.',
      effect: 'به شکایت مشترکان رسیدگی می‌کند: افت رضایت هنگام قطعی کندتر، ریزش مشترک کمتر و بازگشت رضایت بعد از رفع قطعی سریع‌تر می‌شود. مشترکان بیشتر یعنی پشتیبانی بیشتر.',
      absence: 'بدون تیم پشتیبانی، رضایت سریع‌تر سقوط می‌کند و در قطعی‌ها مشترکان بیشتری ریزش می‌کنند.' },
    { id: 'sales', name: 'تیم فروش', salary: 1600, skill: 'growth',
      description: 'نرخ جذب مشترک جدید را بالا می‌برد.',
      effect: 'جذب مشترک جدید در مناطق سرویس‌گرفته را سریع‌تر می‌کند. هرچه مناطق بیشتری سرویس بگیرند، تیم فروش بزرگ‌تری لازم است.',
      absence: 'بدون تیم فروش، رشد مشترک فقط با نرخ پایهٔ کند انجام می‌شود.' },
  ];

  return {
    world: { width: 7200, height: 5400 },
    // مسیر رودخانه (همان نقاطی که map.js رسم می‌کند؛ برای جای‌گذاری ساختمان‌های جدید)
    river: [
      { x: 2160, y: -40 }, { x: 2080, y: 360 }, { x: 2200, y: 800 },
      { x: 2100, y: 1240 }, { x: 2220, y: 1700 }, { x: 2120, y: 2080 }, { x: 2200, y: 2440 }
    ],
    // رشد تدریجی شهر: سقف ساختمان هر منطقه = شمار اولیه × ضریب نوع منطقه؛ نرخ = احتمال ساخت یک ساختمان در هر روز
    growth: {
      capMultiplier: { dense: 2.0, commercial: 2.0, residential: 1.8, industrial: 1.6, landmark: 1.4, sparse: 1.5,
        academic: 1.6, medical: 1.4, heavy_industrial: 1.5, tourism: 1.6, transport: 1.5, villa: 1.6, slum: 2.2, government: 1.5 },
      rate: { dense: 0.12, commercial: 0.12, residential: 0.09, industrial: 0.08, landmark: 0.06, sparse: 0.05 }
    },
    buildingColors: bColors,
    buildingTypes: bTypes,
    districts,
    buildings,
    installPoints,
    equipment,
    equipmentList,
    techs,
    techList,
    packages,
    packageList,
    techDemandSplit,
    techDemandSplitDefault,
    techGuides,
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
