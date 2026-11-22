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
    { id: 'fiber_cable',     name: 'کابل فیبر نوری پارس‌نت',   cost: 5000,   monthlyCost: 120,  buildDays: 0.125,  capacity: 10000, radius: 0,    unlock: null,            category: 'cable',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }],
      guide: 'کابل فیبر نوری برای اتصال گره‌ها به هم با ظرفیت بسیار بالا و تأخیر کم. بهترین گزینه برای مسیرهای اصلی و انتقال (Backhaul) است؛ گران‌تر از مسی است ولی ظرفیتش چند برابر است. با ابزار «اتصال» بین دو گره استفاده می‌شود.' },
    { id: 'copper_cable',    name: 'کابل مسی آریاتل',          cost: 2000,   monthlyCost: 60,   buildDays: 0.125,  capacity: 100,   radius: 0,    unlock: null,            category: 'cable',
      connects: [{ medium: 'copper', targets: ['node'], direction: 'both' }],
      guide: 'ارزان‌ترین راه اتصال دو گره، اما ظرفیت کمی دارد و زود اشباع می‌شود. فقط برای شروع کار و اتصال‌های کوتاه و کم‌ترافیک مناسب است؛ بعداً با فیبر جایگزینش کنید.' },
    { id: 'street_cabinet',  name: 'کابینت خیابانی',           cost: 7000,   monthlyCost: 150,  buildDays: 0.125,  capacity: 2500,  radius: 180,  unlock: null,            category: 'access', tech: 'fiber', ports: 24,
      connects: [
        { medium: 'fiber', targets: ['node'], direction: 'both' },
        { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' },
        { medium: 'fiber', targets: ['building'], direction: 'downstream' },
        { medium: 'copper', targets: ['building'], direction: 'downstream' },
      ],
      guide: 'کابینت توزیع خیابانی: نقطهٔ اتصال ساختمان‌های اطراف به شبکهٔ سیمی. انشعاب فیبر و سیم مسی ساختمان‌ها فقط از راه کابینت انجام می‌شود؛ کابینت را نزدیک ساختمان‌ها بگذارید و با فیبر یا مسی به تجمیع/هسته وصلش کنید. هر کابینت در سطح ۱ تعداد ۲۴ پورت دارد (با ارتقا بیشتر می‌شود). انشعاب فیبر تا شعاع ۱۸۰ واحد و سیم مسی (DSL، تا حدود ۱۰۰ مگابیت و ارزان‌تر) تا شعاع ۱۲۰ واحد می‌رسد. هر ساختمان فقط به یکی از فیبر یا سیم مسی وصل می‌شود.' },
    { id: 'ftth',            name: 'فیبر تا خانه (FTTH)',      cost: 16000,  monthlyCost: 300,  buildDays: 0.375,  capacity: 2500,  radius: 140,  unlock: 'ftth',          category: 'access', tech: 'fiber',
      connects: [
        { medium: 'fiber', targets: ['node'], direction: 'both' },
        { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' },
        { medium: 'fiber', targets: ['building'], direction: 'downstream', legacy: true },
      ],
      guide: 'اتصال مستقیم فیبر تا ساختمان مشتری با ظرفیت بالا و کیفیت پایدار (ظرفیت گره: حدود ۲٫۵ گیگابیت، مثل یک پورت GPON). برای مناطق مسکونی و تجاری پرتقاضا عالی است. نیازمند تحقیق «فیبر تا خانه» و اتصال به شبکه هسته است. توجه: انشعاب‌های جدید ساختمان‌ها از راه «کابینت خیابانی» انجام می‌شود؛ انشعاب‌های مستقیم قدیمی به این گره همچنان کار می‌کنند و این گره می‌تواند گره بالادستی کابینت‌ها باشد.' },
    { id: 'cell_2g',         name: 'دکل سلولی 2G آریاتل',      cost: 12000,  monthlyCost: 500,  buildDays: 0.375,  capacity: 60,    radius: 400,  unlock: null,            category: 'access', tech: 'cellular',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'ارزان‌ترین دکل سلولی با برد زیاد ولی ظرفیت بسیار کم (ظرفیت سایت: حدود ۶۰ مگابیت؛ در دنیای واقعی 2G/EDGE فقط چند مگابیت می‌دهد و این عدد برای قابل‌بازی‌ماندن بازی مقیاس شده است). فقط برای پوشش اولیه مناطق کم‌تراکم خوب است و با رشد مشترک‌ها زود اشباع می‌شود. باید به هسته متصل شود تا سرویس بدهد.' },
    { id: 'cell_3g',         name: 'دکل سلولی 3G آریاتل',      cost: 32000,  monthlyCost: 1000, buildDays: 0.5,  capacity: 250,   radius: 340,  unlock: null,            category: 'access', tech: 'cellular',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'دکل نسل سوم: برد خوب و ظرفیت متوسط (ظرفیت سایت: حدود ۲۵۰ مگابیت؛ در دنیای واقعی هر سکتور HSPA+ حدود ۱۰ تا ۱۲ مگابیت می‌دهد). تعادل مناسبی برای ابتدای بازی و مناطق مسکونی معمولی. در مناطق پرتراکم به‌تدریج کم می‌آورد. نیازمند اتصال انتقالی به هسته است.' },
    { id: 'cell_4g',         name: 'دکل سلولی 4G پارس‌نت',     cost: 62000,  monthlyCost: 1800, buildDays: 0.625,  capacity: 900,   radius: 290,  unlock: 'lte',           category: 'access', tech: 'cellular',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'دکل LTE با ظرفیت بالا و پوشش خوب (ظرفیت سایت: حدود ۹۰۰ مگابیت؛ در دنیای واقعی یک سایت ۳سکتوره با تجمیع حامل همین حدود را می‌دهد). ستون اصلی شبکه در مناطق پرجمعیت. نیازمند تحقیق «فناوری LTE» است و برای اشباع‌نشدن به اتصال فیبر یا لینک قوی به هسته نیاز دارد.' },
    { id: 'cell_5g',         name: 'دکل سلولی 5G سیمرغ‌لینک',  cost: 125000, monthlyCost: 3400, buildDays: 0.75, capacity: 2500,  radius: 205,  unlock: '5g',            category: 'access', tech: 'cellular',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'بیشترین ظرفیت سلولار برای مناطق بسیار پرتراکم و پرمصرف (ظرفیت سایت: حدود ۲٫۵ گیگابیت؛ در دنیای واقعی سایت 5G میان‌باند با کانال ۱۰۰ مگاهرتزی حدود ۷۰۰ مگابیت تا چند گیگابیت می‌دهد)، ولی بردش کمتر و هزینه‌اش بالاست. نیازمند تحقیق «نسل پنجم» (پس از LTE) و اتصال انتقالی پرظرفیت به هسته است.' },
    { id: 'fwa_ap',          name: 'آنتن TD-LTE',               cost: 15000,  monthlyCost: 600,  buildDays: 0.25,  capacity: 600,   radius: 255,  unlock: null,            category: 'access', tech: 'fwa',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'اینترنت ثابت سیم‌کارتی TD-LTE: دسترسی ثابت سیم‌کارتی روی شبکهٔ موبایل 4G برای خانه‌ها و کسب‌وکارها بدون کابل‌کشی تا مشتری (ظرفیت: حدود ۶۰۰ مگابیت). مهم: TD-LTE فقط داخل پوشش شبکهٔ 4G و بالاتر کار می‌کند — آنتن باید در برد یک دکل 4G یا 5G متصل به شبکه باشد، وگرنه هیچ سرویسی نمی‌دهد. برای حاشیه شهر و جاهایی که فیبر نمی‌رسد ولی پوشش 4G هست عالی است. کیفیتش به فاصله بستگی دارد؛ هر ساختمان سر راه فقط چند درصد از قدرت سیگنالش کم می‌کند.' },
    { id: 'ptp_link',        name: 'لینک نقطه‌به‌نقطه',        cost: 18000,  monthlyCost: 450,  buildDays: 0.25,  capacity: 5000,  radius: 1500, unlock: null,            category: 'backhaul',
      connects: [{ medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }],
      guide: 'اتصال بی‌سیم جهت‌دار بین دو گره؛ جایگزین کابل برای انتقال (Backhaul) با ظرفیت حدود ۵ گیگابیت (در دنیای واقعی لینک‌های مایکروویو ۱ تا ۱۰ گیگابیت می‌دهند). وقتی کابل‌کشی سخت یا گران است استفاده کنید؛ برای مسیر پشتیبان هم خوب است. به دید مستقیم بین دو طرف نیاز دارد.' },
    { id: 'router',          name: 'روتر لبه پارس‌نت',         cost: 10000,  monthlyCost: 250,  buildDays: 0.125,  capacity: 2500,  radius: 0,    unlock: null,            category: 'core',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }],
      guide: 'گره واسط برای جمع‌کردن ترافیک چند دستگاه دسترسی و رساندنش به تجمیع یا هسته (ظرفیت: حدود ۲٫۵ گیگابیت). ارزان و سریع ساخته می‌شود و برای شبکه‌های کوچک کافی است.' },
    { id: 'switch',          name: 'سوئیچ تجمیع محلی',         cost: 6000,   monthlyCost: 150,  buildDays: 0.125,  capacity: 2500,  radius: 0,    unlock: null,            category: 'core',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }],
      guide: 'چند اتصال نزدیک را به هم وصل می‌کند تا به یک گره بالادستی برسند (ظرفیت: حدود ۲٫۵ گیگابیت). ارزان‌ترین راه ساخت یک نقطه تجمیع کوچک در یک محله.' },
    { id: 'aggregation',     name: 'گره تجمیع منطقه‌ای',       cost: 42000,  monthlyCost: 1200, buildDays: 0.375,  capacity: 12000, radius: 0,    unlock: null,            category: 'core',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }],
      guide: 'ترافیک چند منطقه و دستگاه دسترسی را جمع می‌کند و به هسته می‌رساند. ظرفیت بسیار بالا دارد و برای گسترش شبکه به مناطق جدید ضروری است. به اتصال فیبر به هسته نیاز دارد.' },
    { id: 'core_router',     name: 'روتر هسته',                cost: 105000, monthlyCost: 900,  buildDays: 0.625, capacity: 40000, radius: 0,    unlock: null,            category: 'core',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }],
      guide: 'قلب شبکه شما؛ همه ترافیک شهر از آن عبور می‌کند و به دروازه اینترنت وصل است. از ابتدای بازی فعال است. اگر اشباع شود کل شهر کند می‌شود؛ با گره‌های تجمیع بار را پخش کنید.' },
    { id: 'internet_gateway',name: 'دروازه اینترنت',           cost: 155000, monthlyCost: 1500, buildDays: 0.75, capacity: 40000, radius: 0,    unlock: null,            category: 'core',
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'internet', targets: ['internet'], direction: 'upstream' }],
      guide: 'اتصال شبکه شما به اینترنت جهانی. بدون مسیر تا این گره هیچ مشتری‌ای آنلاین نمی‌شود. از ابتدای بازی فعال و به روتر هسته متصل است.' },
    { id: 'backup_power',    name: 'سامانه برق پشتیبان',        cost: 12000,  monthlyCost: 240,  buildDays: 0.125,  capacity: 0,    radius: 250,  unlock: null,            category: 'power',
      connects: [{ medium: 'power', targets: ['node'], direction: 'support' }],
      guide: 'رکتیفایر و باتری پشتیبان برای سایت‌ها و مراکز شبکه. گره‌های داخل شعاع آن کمتر خراب می‌شوند و فرسودگی کندتری دارند؛ برای سایت‌های مهم و مسیرهای حیاتی نصب کنید.' },
    { id: 'test_tools_kit',  name: 'ابزار تست و اندازه‌گیری شبکه', cost: 15000,  monthlyCost: 300,  buildDays: 0.125,  capacity: 0,    radius: 0,    unlock: null,            category: 'tools',
      connects: [{ medium: 'tools', targets: ['team'], direction: 'support' }],
      guide: 'مجموعه ابزار عیب‌یابی و اندازه‌گیری (تست فیبر، توان‌سنج، تحلیل‌گر طیف). هر مجموعه فعال سرعت ساخت و تعمیر تیم را بیشتر می‌کند.' },
  ];
  // دسترسی هم به‌صورت آرایه و هم به‌صورت نگاشت با کلید id
  const equipment = equipmentList.slice();
  equipmentList.forEach((e) => { equipment[e.id] = e; });

  // نگاشت تجهیزات حذف‌شدهٔ کاتالوگ گسترده (۲۰۵ قلم) به نزدیک‌ترین معادل کلی — برای سازگاری ذخیره‌های قدیمی
  const legacyEquipmentMap = { 'sat_terminal_leo': 'fwa_ap', 'sat_terminal_geo': 'fwa_ap', 'sat_gateway': 'aggregation', 'wifi_ap': 'fwa_ap', 'ant_sector_65_900': 'cell_2g', 'ant_sector_90_1800': 'cell_3g', 'ant_sector_33_2600': 'cell_4g', 'ant_sector_120_700': 'cell_2g', 'ant_sector_65_2100': 'cell_3g', 'ant_sector_65_3500': 'cell_5g', 'ant_sector_90_3500': 'cell_5g', 'ant_sector_120_5800': 'cell_5g', 'ant_sector_65_5800': 'cell_5g', 'ant_panel_3500_5g': 'cell_5g', 'ant_panel_2600': 'cell_4g', 'ant_dish_5800_28': 'cell_5g', 'ant_dish_3500_24': 'cell_5g', 'ant_dish_2600_21': 'cell_4g', 'ant_omni_900_8': 'cell_2g', 'ant_omni_1800_10': 'cell_3g', 'ant_omni_5800_12': 'cell_5g', 'ant_yagi_900_12': 'cell_2g', 'ant_yagi_2100_14': 'cell_3g', 'ant_yagi_3500_16': 'cell_5g', 'ant_log_700_2700': 'cell_2g', 'ant_log_1800_5800': 'cell_3g', 'rru_2g_900_40': 'cell_2g', 'rru_2g_1800_80': 'cell_2g', 'rru_3g_2100_220': 'cell_3g', 'rru_3g_900_150': 'cell_3g', 'rru_4g_700_600': 'cell_4g', 'rru_4g_1800_800': 'cell_4g', 'rru_4g_2100_900': 'cell_4g', 'rru_4g_2600_1100': 'cell_4g', 'rru_4g_dual_1800_2600': 'cell_4g', 'rru_4g_carrier_agg': 'cell_4g', 'rru_smallcell_4g_3500': 'cell_4g', 'rru_smallcell_5g_3500': 'cell_5g', 'rru_5g_2600_2800': 'cell_5g', 'rru_5g_3500_3200': 'cell_5g', 'rru_5g_massive_32t32r': 'cell_5g', 'rru_5g_massive_64t64r': 'cell_5g', 'rru_macro_4g5g_dual': 'cell_5g', 'rru_5g_mmwave_26g': 'cell_5g', 'fwa_cpe_lte_1800': 'fwa_ap', 'fwa_cpe_lte_2600': 'fwa_ap', 'fwa_cpe_indoor_3500': 'fwa_ap', 'fwa_cpe_outdoor_3500': 'fwa_ap', 'fwa_cpe_5g_dual': 'fwa_ap', 'fwa_sector_3500_90': 'fwa_ap', 'fwa_sector_5000_120': 'fwa_ap', 'fwa_sector_5800_65': 'fwa_ap', 'fwa_ap_3500_8x8': 'fwa_ap', 'fwa_ap_5000_4x4': 'fwa_ap', 'fwa_ptmp_5800': 'fwa_ap', 'fwa_sector_700': 'fwa_ap', 'fwa_mmwave_26g_ap': 'fwa_ap', 'fwa_mmwave_cpe_26g': 'fwa_ap', 'wifi4_indoor_300': 'fwa_ap', 'wifi4_outdoor_300': 'fwa_ap', 'wifi5_ceiling_867': 'fwa_ap', 'wifi5_wall_1200': 'fwa_ap', 'wifi5_outdoor_1300': 'fwa_ap', 'wifi_mesh_node_5': 'fwa_ap', 'wifi6_ceiling_2400': 'fwa_ap', 'wifi6_wall_1800': 'fwa_ap', 'wifi6_outdoor_2400': 'fwa_ap', 'wifi6_highdensity': 'fwa_ap', 'wifi_mesh_node_6': 'fwa_ap', 'wifi6e_ceiling_3600': 'fwa_ap', 'wifi6e_outdoor_3600': 'fwa_ap', 'wifi7_wall_3600': 'fwa_ap', 'wifi7_ceiling_5800': 'fwa_ap', 'wifi7_outdoor': 'fwa_ap', 'mw_6ghz_300': 'ptp_link', 'mw_11ghz_500': 'ptp_link', 'mw_11ghz_1000': 'ptp_link', 'mw_13ghz_1000': 'ptp_link', 'mw_18ghz_1000': 'ptp_link', 'mw_18ghz_2000': 'ptp_link', 'mw_23ghz_2000': 'ptp_link', 'mw_23ghz_4000': 'ptp_link', 'mw_38ghz_4000': 'ptp_link', 'mw_38ghz_8000': 'ptp_link', 'mw_60ghz_5000': 'ptp_link', 'mw_60ghz_10000': 'ptp_link', 'mw_80ghz_10000': 'ptp_link', 'mw_80ghz_5000': 'ptp_link', 'mw_6ghz_1000_long': 'ptp_link', 'rt_edge_1g_500': 'router', 'rt_edge_1g_1000': 'router', 'rt_edge_10g_5000': 'router', 'rt_agg_10g_10000': 'aggregation', 'rt_agg_25g_20000': 'aggregation', 'rt_agg_40g_30000': 'aggregation', 'rt_core_100g_40000': 'core_router', 'rt_core_100g_60000': 'core_router', 'rt_core_400g_60000': 'core_router', 'rt_branch_1g_800': 'router', 'rt_vpn_10g_8000': 'router', 'sw_access_24g_500': 'switch', 'sw_access_48g_1000': 'switch', 'sw_access_24g_poe_1000': 'switch', 'sw_access_48g_poe_2000': 'switch', 'sw_agg_10g_10000': 'aggregation', 'sw_agg_25g_20000': 'aggregation', 'sw_core_100g_40000': 'switch', 'sw_core_40g_30000': 'switch', 'sw_industrial_1g_800': 'switch', 'fw_edge_400': 'router', 'fw_edge_2000': 'router', 'fw_agg_8000': 'aggregation', 'fw_core_20000': 'router', 'fw_core_30000': 'router', 'olt_gpon_4_2000': 'aggregation', 'olt_gpon_8_4000': 'aggregation', 'olt_gpon_16_8000': 'aggregation', 'olt_xgs_4_5000': 'aggregation', 'olt_xgs_8_10000': 'aggregation', 'olt_xgs_16_20000': 'aggregation', 'olt_combo_8_6000': 'aggregation', 'ont_gpon_1ge_100': 'ftth', 'ont_gpon_4ge_300': 'ftth', 'ont_gpon_wifi_500': 'ftth', 'ont_xgs_1ge_1000': 'ftth', 'ont_xgs_wifi_1000': 'ftth', 'ont_gpon_2ge_200': 'ftth', 'ont_business_1000': 'ftth', 'spl_plc_1x4_500': 'fiber_cable', 'spl_plc_1x8_1000': 'fiber_cable', 'spl_plc_1x16_2000': 'fiber_cable', 'spl_plc_1x32_3000': 'fiber_cable', 'spl_plc_1x64_5000': 'fiber_cable', 'cab_street_500': 'router', 'cab_street_2000': 'router', 'cab_odf_4000': 'router', 'cab_splice_1000': 'router', 'cab_outdoor_8000': 'router', 'cbl_os2_12_5000': 'fiber_cable', 'cbl_os2_48_10000': 'fiber_cable', 'cbl_os2_96_20000': 'fiber_cable', 'cbl_om4_1000': 'fiber_cable', 'cbl_cat6a_1000': 'copper_cable', 'cbl_drop_500': 'fiber_cable', 'cbl_rg11_800': 'fiber_cable', 'con_sc_apc_500': 'fiber_cable', 'con_lc_duplex_1000': 'fiber_cable', 'con_mpo_trunk_10000': 'fiber_cable', 'con_patch_panel_2000': 'fiber_cable', 'twr_lattice_30m': 'cell_4g', 'twr_lattice_45m': 'cell_4g', 'twr_lattice_60m': 'cell_4g', 'twr_lattice_80m': 'cell_4g', 'twr_monopole_15m': 'cell_4g', 'twr_monopole_20m': 'cell_4g', 'twr_monopole_30m': 'cell_4g', 'twr_rooftop_pole_6m': 'cell_4g', 'twr_rooftop_pole_12m': 'cell_4g', 'twr_guyed_50m': 'cell_4g', 'twr_guyed_70m': 'cell_4g', 'twr_camo_tree_25m': 'cell_4g', 'twr_smallcell_pole_8m': 'cell_4g', 'twr_smallcell_pole_12m': 'cell_4g', 'pwr_rectifier_48v_100a': 'backup_power', 'pwr_rectifier_48v_400a': 'backup_power', 'pwr_battery_vrla_400ah': 'backup_power', 'pwr_battery_lithium_200ah': 'backup_power', 'pwr_ups_1kva': 'backup_power', 'pwr_ups_10kva': 'backup_power', 'pwr_ups_30kva': 'backup_power', 'pwr_solar_kit_1kwp': 'backup_power', 'pwr_solar_kit_5kwp': 'backup_power', 'pwr_solar_kit_10kwp': 'backup_power', 'pwr_generator_diesel_10kva': 'backup_power', 'pwr_generator_gas_30kva': 'backup_power', 'pwr_generator_diesel_100kva': 'backup_power', 'pwr_hybrid_solar_diesel_5kwp': 'backup_power', 'pwr_pdu_smart_32a': 'backup_power', 'pwr_grounding_kit_pro': 'backup_power', 'sat_leo_terminal_flat': 'fwa_ap', 'sat_leo_terminal_pro': 'fwa_ap', 'sat_leo_maritime': 'fwa_ap', 'sat_leo_aviation': 'fwa_ap', 'sat_geo_terminal_ku': 'fwa_ap', 'sat_geo_terminal_ka': 'fwa_ap', 'sat_dish_60cm_ku': 'fwa_ap', 'sat_dish_75cm_ku': 'fwa_ap', 'sat_dish_90cm_ka': 'fwa_ap', 'sat_dish_120cm_ka': 'fwa_ap', 'sat_gateway_small': 'aggregation', 'sat_gateway_large': 'aggregation', 'sat_buc_lnb_kit_ka': 'fwa_ap', 'sat_gateway_modem': 'fwa_ap', 'tool_otdr_pro': 'test_tools_kit', 'tool_otdr_mini': 'test_tools_kit', 'tool_optical_power_meter': 'test_tools_kit', 'tool_light_source': 'test_tools_kit', 'tool_fusion_splicer_core': 'test_tools_kit', 'tool_fusion_splicer_handheld': 'test_tools_kit', 'tool_spectrum_analyzer_handheld': 'test_tools_kit', 'tool_spectrum_analyzer_benchtop': 'test_tools_kit', 'tool_cable_certifier_cat6a': 'test_tools_kit', 'tool_ethernet_tester': 'test_tools_kit', 'tool_vna_8ghz': 'test_tools_kit', 'tool_gps_sync_module': 'test_tools_kit', 'tool_fiber_inspection_scope': 'test_tools_kit', 'tool_pim_tester': 'test_tools_kit', 'tool_drone_survey_kit': 'test_tools_kit', 'tool_tdr_cable_fault': 'test_tools_kit' };

  // ---------- درخت فناوری ----------
  const techList = [
    { id: 'fiber',         name: 'شبکه فیبر نوری',        cost: 15000, requires: [],                 unlocks: ['fiber_cable', 'aggregation'] },
    { id: 'lte',           name: 'فناوری LTE (4G)',       cost: 30000, requires: [],                 unlocks: ['cell_4g'] },
    { id: 'ftth',          name: 'فیبر تا خانه',          cost: 45000, requires: ['fiber'],          unlocks: ['ftth'] },
    { id: '5g',            name: 'نسل پنجم (5G)',         cost: 80000, requires: ['lte'],            unlocks: ['cell_5g'] },
    { id: 'smart_mgmt',    name: 'مدیریت هوشمند شبکه',    cost: 40000, requires: ['fiber'],          unlocks: [] },
  ];
  // تکمیل unlocks هر فناوری از روی فیلد unlock تجهیزات کاتالوگ
  techList.forEach((t) => { t.unlocks = Array.from(new Set([...(t.unlocks || []), ...equipmentList.filter((e) => e.unlock === t.id).map((e) => e.id)])); });
  const techs = techList.slice();
  techList.forEach((t) => { techs[t.id] = t; });

  // ---------- بسته‌های اشتراک ----------
  const packageList = [
    { id: 'home',       name: 'خانگی',        speedMbps: 50,   price: 120,  serviceLevel: 'standard', kind: 'standard', expectFa: 'اینترنت پایدار برای مصرف روزانه خانه' },
    { id: 'business',   name: 'تجاری',        speedMbps: 200,  price: 450,  serviceLevel: 'priority', kind: 'standard', expectFa: 'سرعت و پایداری بالا برای کسب‌وکار' },
    { id: 'fwa',        name: 'TD-LTE',       speedMbps: 100,  price: 180,  serviceLevel: 'standard', kind: 'standard', expectFa: 'اینترنت ثابت سیم‌کارتی روی پوشش 4G و بالاتر، بدون کابل‌کشی' },
    { id: 'enterprise', name: 'سازمانی',      speedMbps: 1000, price: 3000, serviceLevel: 'premium',  kind: 'standard', expectFa: 'ظرفیت و اطمینان سازمانی با اولویت بالا' },
    { id: 'gaming',     name: 'گیمینگ (پینگ پایین)', speedMbps: 100, price: 600, serviceLevel: 'priority', kind: 'gaming', expectFa: 'تأخیر کم برای بازی آنلاین' },
    { id: 'streaming',  name: 'استریم (تماشای آنلاین)', speedMbps: 300, price: 700, serviceLevel: 'priority', kind: 'streaming', expectFa: 'پهنای باند پایدار برای پخش ویدیو' },
  ];
  const packages = packageList.slice();
  packageList.forEach((p) => { packages[p.id] = p; });

  // ---------- سهم تقاضای هر فناوری در هر نوع منطقه (جمع هر ردیف = ۱) ----------
  // کلیدها: fiber=فیبر/مسی، cellular=سلولار، fwa=TD-LTE (وای‌فای داخل ساختمانِ مشترک است و سهم جدا ندارد)
  const techDemandSplit = {
    dense:       { fiber: 0.31, cellular: 0.54, fwa: 0.15 },
    residential: { fiber: 0.40, cellular: 0.33, fwa: 0.27 },
    commercial:  { fiber: 0.63, cellular: 0.29, fwa: 0.08 },
    industrial:  { fiber: 0.68, cellular: 0.19, fwa: 0.13 },
    landmark:    { fiber: 0.54, cellular: 0.39, fwa: 0.07 },
    sparse:      { fiber: 0.08, cellular: 0.39, fwa: 0.53 },
    academic:    { fiber: 0.54, cellular: 0.39, fwa: 0.07 },
    medical:     { fiber: 0.65, cellular: 0.28, fwa: 0.07 },
    heavy_industrial: { fiber: 0.74, cellular: 0.13, fwa: 0.13 },
    tourism:     { fiber: 0.39, cellular: 0.46, fwa: 0.15 },
    transport:   { fiber: 0.43, cellular: 0.43, fwa: 0.14 },
    villa:       { fiber: 0.49, cellular: 0.26, fwa: 0.25 },
    slum:        { fiber: 0.08, cellular: 0.46, fwa: 0.46 },
    government:  { fiber: 0.67, cellular: 0.27, fwa: 0.06 },
  };
  const techDemandSplitDefault = { fiber: 0.35, cellular: 0.43, fwa: 0.22 };

  // ---------- راهنمای فناوری‌ها (نمای کلی در منوی راهنما) ----------
  const techGuides = [
    { id: 'cables', name: 'کابل‌ها (فیبر و مسی)',
      desc: 'کابل‌ها گره‌ها را به هم وصل می‌کنند و ترافیک را منتقل می‌کنند. فیبر ظرفیت بسیار بالا و تأخیر کم دارد؛ مسی ارزان است ولی زود اشباع می‌شود.',
      whenToUse: 'برای مسیرهای اصلی و پرترافیک فیبر؛ برای شروع ارزان و اتصال‌های کم‌ترافیک مسی.',
      equipmentIds: ['fiber_cable', 'copper_cable'] },
    { id: 'fiber', name: 'فیبر نوری و FTTH',
      desc: 'فیبر نوری سریع‌ترین و پایدارترین رسانه انتقال است. FTTH یعنی رساندن فیبر تا خود ساختمان مشتری؛ کیفیت و ظرفیت عالی (حدود ۲٫۵ گیگابیت برای هر گره) برای مناطق پرتقاضا. انشعاب ساختمان‌ها از راه «کابینت خیابانی» انجام می‌شود: کابینت را نزدیک ساختمان‌ها بگذارید، به هسته وصلش کنید و از پنل هر ساختمان انشعاب فیبر یا سیم مسی بگیرید (هر ساختمان فقط یکی از این دو).',
      whenToUse: 'وقتی منطقه‌ای پرمشترک و پرمصرف است و کیفیت پایدار می‌خواهید. هزینه اولیه بالاتر، ولی بهترین تجربه مشتری.',
      equipmentIds: ['ftth', 'street_cabinet', 'fiber_cable'] },
    { id: 'copper', name: 'مسی / DSL',
      desc: 'فناوری قدیمی‌تر و ارزان‌تر روی سیم مسی؛ ظرفیت محدود و حساس به فاصله.',
      whenToUse: 'فقط برای شروع ارزان یا اتصال‌های خیلی کم‌ترافیک؛ در بلندمدت با فیبر جایگزین شود.',
      equipmentIds: ['copper_cable'] },
    { id: 'cellular', name: 'سلولار (2G تا 5G)',
      desc: 'دکل‌های موبایل پوشش بی‌سیم وسیع می‌دهند. هر نسل جدید ظرفیت بیشتری دارد ولی برد کمتر و هزینه بالاتر: 2G ارزان و کم‌ظرفیت (حدود ۶۰ مگابیت برای سایت)، 3G متعادل (۲۵۰ مگابیت)، 4G/LTE پرظرفیت (۹۰۰ مگابیت برای سایت ۳سکتوره با تجمیع حامل)، 5G بیشترین ظرفیت (۲٫۵ گیگابیت) برای مناطق بسیار متراکم. این اعداد نزدیک به ظرفیت واقعی سایت‌ها در دنیای واقعی‌اند؛ در عمل فقط بخشی از مشترکان هم‌زمان فعال‌اند (مالتی‌پلکس آماری) و همین باعث می‌شود یک سایت هزاران مشترک را سرویس بدهد.',
      whenToUse: 'برای پوشش سریع مناطق وسیع و پرجمعیت. هر دکل باید با فیبر یا لینک قوی به هسته وصل شود وگرنه اشباع می‌شود.',
      equipmentIds: ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g'] },
    { id: 'fwa', name: 'TD-LTE (اینترنت ثابت سیم‌کارتی)',
      desc: 'اینترنت ثابت سیم‌کارتی روی شبکهٔ موبایل 4G: مشتری ثابت (خانه و مغازه) با مودم سیم‌کارتی به شبکه وصل می‌شود و کابل‌کشی تا مشتری لازم نیست. ظرفیت هر آنتن حدود ۶۰۰ مگابیت است. TD-LTE فقط داخل پوشش شبکهٔ 4G و بالاتر در دسترس است: آنتن TD-LTE باید در برد یک دکل 4G یا 5G متصل به شبکه باشد تا سرویس بدهد؛ بیرون از پوشش 4G هیچ سرویسی ندارد.',
      whenToUse: 'برای حاشیه شهر و مناطقی که فیبر نمی‌رسد ولی پوشش 4G دارند. اول دکل 4G بسازید و وصل کنید، بعد آنتن TD-LTE را داخل پوشش آن بگذارید. به دید مستقیم نیاز دارد و ساختمان بلند مزاحم است.',
      equipmentIds: ['fwa_ap'] },
    { id: 'ptp', name: 'لینک نقطه‌به‌نقطه',
      desc: 'اتصال بی‌سیم جهت‌دار بین دو گره برای انتقال ترافیک (Backhaul) به‌جای کابل، با ظرفیت حدود ۵ گیگابیت.',
      whenToUse: 'وقتی کابل‌کشی بین دو گره سخت یا گران است، یا برای ساخت مسیر پشتیبان دوم.',
      equipmentIds: ['ptp_link'] },
    { id: 'wifi', name: 'وای‌فای داخل ساختمان (مشترک)',
      desc: 'وای‌فای را خود مشترک‌ها داخل ساختمانشان راه می‌اندازند: هر ساختمانِ دارای اشتراک فعال (فیبر، سیم مسی، TD-LTE یا سلولار) اکسس‌پوینت خودش را دارد و کاربران ساختمان از همان اشتراک سرویس می‌گیرند. شما اکسس‌پوینت وای‌فای نمی‌سازید؛ کار شما رساندن اشتراک به ساختمان است.',
      whenToUse: 'خودکار است: ساختمانِ مشترک که به شبکه وصل است (انشعاب سیمی یا پوشش دکل متصل) وای‌فای داخلی فعال دارد. بدون اشتراک، یا وقتی ساختمان به شبکه وصل نیست و در برد هیچ دکل متصلی هم نیست، وای‌فایی هم نیست.',
      equipmentIds: [] },
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

  // ---------- دستاوردها (متریک‌ها را sim محاسبه می‌کند) ----------
  const achievements = [
    { id: 'first_sub',      name: 'نخستین مشترک',        desc: 'اولین مشترک فعال شبکه را جذب کنید.',                    icon: 'users',     metric: 'subscribers',       target: 1 },
    { id: 'subs_100',       name: 'صد مشترک',            desc: 'به ۱۰۰ مشترک فعال برسید.',                             icon: 'users',     metric: 'subscribers',       target: 100 },
    { id: 'subs_1000',      name: 'هزار مشترک',          desc: 'به ۱۰۰۰ مشترک فعال برسید.',                            icon: 'users',     metric: 'subscribers',       target: 1000 },
    { id: 'subs_5000',      name: 'پنج هزار مشترک',      desc: 'به ۵۰۰۰ مشترک فعال برسید.',                            icon: 'users',     metric: 'subscribers',       target: 5000 },
    { id: 'subs_20000',     name: 'بیست هزار مشترک',     desc: 'به ۲۰۰۰۰ مشترک فعال برسید.',                           icon: 'trophy',    metric: 'subscribers',       target: 20000 },
    { id: 'first_fiber',    name: 'نخستین لینک فیبر',    desc: 'اولین لینک فیبر نوری شبکه را بسازید.',                 icon: 'fiber',     metric: 'fiberLinks',        target: 1 },
    { id: 'fiber_10',       name: 'شبکه فیبر گسترده',    desc: '۱۰ لینک فیبر نوری فعال در شبکه داشته باشید.',          icon: 'fiber',     metric: 'fiberLinks',        target: 10 },
    { id: 'districts_3',    name: 'سه منطقه زیر پوشش',   desc: 'در ۳ منطقه به مشترکان سرویس بدهید.',                   icon: 'coverage',  metric: 'servedDistricts',   target: 3 },
    { id: 'districts_10',   name: 'ده منطقه زیر پوشش',   desc: 'در ۱۰ منطقه به مشترکان سرویس بدهید.',                  icon: 'coverage',  metric: 'servedDistricts',   target: 10 },
    { id: 'coverage_50',    name: 'نیمی از شهر',         desc: 'پوشش شبکه را به ۵۰٪ جمعیت شهر برسانید.',               icon: 'coverage',  metric: 'coveragePct',       target: 50 },
    { id: 'coverage_90',    name: 'پوشش سراسری شهر',     desc: 'پوشش شبکه را به ۹۰٪ جمعیت شهر برسانید.',               icon: 'trophy',    metric: 'coveragePct',       target: 90 },
    { id: 'cash_100k',      name: 'صدهزار تومان نقدینگی', desc: 'نقدینگی شرکت را به ۱۰۰٬۰۰۰ تومان برسانید.',           icon: 'cash',      metric: 'cash',              target: 100000 },
    { id: 'cash_1m',        name: 'میلیونر شبکه',        desc: 'نقدینگی شرکت را به ۱٬۰۰۰٬۰۰۰ تومان برسانید.',          icon: 'cash',      metric: 'cash',              target: 1000000 },
    { id: 'revenue_500k',   name: 'نیم‌میلیون درآمد',    desc: 'مجموع درآمد شرکت را به ۵۰۰٬۰۰۰ تومان برسانید.',        icon: 'cash',      metric: 'totalRevenue',      target: 500000 },
    { id: 'monthly_rev_100k', name: 'درآمد ماهانه صدهزار', desc: 'درآمد یک ماه را به ۱۰۰٬۰۰۰ تومان برسانید.',         icon: 'cash',      metric: 'monthlyRevenue',    target: 100000 },
    { id: 'contracts_3',    name: 'سه قرارداد سازمانی',  desc: '۳ قرارداد سازمانی را با موفقیت به پایان برسانید.',     icon: 'shield',    metric: 'contractsDone',     target: 3 },
    { id: 'campaign_1',     name: 'نخستین کمپین تبلیغاتی', desc: 'اولین کمپین تبلیغاتی شرکت را اجرا کنید.',            icon: 'star',      metric: 'campaignsRun',      target: 1 },
    { id: 'satisfaction_80', name: 'رضایت هشتاد درصدی',  desc: 'رضایت مشترکان را به ۸۰٪ برسانید.',                     icon: 'star',      metric: 'satisfaction',      target: 80 },
    { id: 'days_365',       name: 'یک سال پایداری',      desc: '۳۶۵ روز فعالیت شبکه را پشت سر بگذارید.',               icon: 'clock',     metric: 'days',              target: 365 },
    { id: 'techs_5',        name: 'پنج فناوری',          desc: '۵ فناوری در درخت تحقیق باز کنید.',                     icon: 'trophy',    metric: 'techs',             target: 5 },
    { id: 'staff_10',       name: 'تیم ده‌نفره',         desc: '۱۰ نفر پرسنل در شرکت داشته باشید.',                    icon: 'users',     metric: 'staff',             target: 10 },
    { id: 'individual_50',  name: 'پنجاه مشترک فردی',    desc: '۵۰ مشترک فردی (حقیقی) در شبکه داشته باشید.',           icon: 'users',     metric: 'individualSubs',    target: 50 },
    { id: 'profit_3',       name: 'سه ماه سوددهی',       desc: '۳ ماه را با سود خالص مثبت به پایان برسانید.',          icon: 'cash',      metric: 'profitMonths',      target: 3 },
  ];

  // ---------- نام‌های فارسی برای مشترکان فردی ----------
  const firstNames = [
    'علی', 'محمد', 'رضا', 'حسین', 'مهدی', 'امیر', 'سعید', 'حمید', 'حسن', 'احمد',
    'یوسف', 'ابراهیم', 'کیان', 'آرش', 'بابک', 'داریوش', 'فرهاد', 'کامران', 'پارسا', 'نیما',
    'فاطمه', 'زهرا', 'مریم', 'سارا', 'نیلوفر', 'نگار', 'الهه', 'سمیرا', 'الهام', 'رؤیا',
    'شیما', 'پرستو', 'بهار', 'یاسمن', 'ترانه', 'مرجان', 'کیمیا', 'دریا', 'آوا', 'لیلا',
  ];
  const lastNames = [
    'محمدی', 'حسینی', 'رضایی', 'احمدی', 'کریمی', 'موسوی', 'صادقی', 'رحیمی', 'هاشمی', 'نجفی',
    'کاظمی', 'مرادی', 'جعفری', 'عزیزی', 'حسنی', 'محمدزاده', 'ابراهیمی', 'قاسمی', 'سلیمانی', 'رستمی',
    'نوروزی', 'اکبری', 'یوسفی', 'شریفی', 'محمودی', 'علیزاده', 'رضازاده', 'حسینی‌نیا', 'کریمیان', 'امیری',
  ];

  // ---------- قالب قراردادهای سازمانی ----------
  const enterpriseTemplates = [
    { id: 'ent_hospital',   orgName: 'بیمارستان مرکزی',       type: 'medical',    wantSpeed: 300,  wantSla: 97, wantPrice: 45000, months: 12, districtTypes: ['medical', 'landmark'] },
    { id: 'ent_university', orgName: 'دانشگاه صنعتی',         type: 'academic',   wantSpeed: 400,  wantSla: 95, wantPrice: 38000, months: 12, districtTypes: ['academic', 'landmark'] },
    { id: 'ent_steel',      orgName: 'کارخانه فولاد پارس',    type: 'industrial', wantSpeed: 250,  wantSla: 96, wantPrice: 52000, months: 6,  districtTypes: ['industrial', 'heavy_industrial'] },
    { id: 'ent_mall',       orgName: 'مرکز خرید آفتاب',       type: 'commercial', wantSpeed: 200,  wantSla: 94, wantPrice: 28000, months: 6,  districtTypes: ['commercial'] },
    { id: 'ent_bank',       orgName: 'بانک تجارت نوین',       type: 'commercial', wantSpeed: 150,  wantSla: 99, wantPrice: 65000, months: 12, districtTypes: ['commercial', 'government'] },
    { id: 'ent_municipality', orgName: 'شهرداری منطقه ۳',     type: 'government', wantSpeed: 120,  wantSla: 96, wantPrice: 24000, months: 12, districtTypes: ['government', 'commercial'] },
    { id: 'ent_hotel',      orgName: 'هتل پارسیان',           type: 'tourism',    wantSpeed: 150,  wantSla: 93, wantPrice: 22000, months: 3,  districtTypes: ['tourism', 'commercial'] },
    { id: 'ent_airport',    orgName: 'فرودگاه بین‌المللی',    type: 'transport',  wantSpeed: 800,  wantSla: 98, wantPrice: 80000, months: 12, districtTypes: ['transport', 'landmark'] },
    { id: 'ent_clinic',     orgName: 'درمانگاه شبانه‌روزی شفا', type: 'medical',  wantSpeed: 100,  wantSla: 95, wantPrice: 18000, months: 6,  districtTypes: ['medical', 'residential'] },
    { id: 'ent_office',     orgName: 'مجتمع اداری برج نوین',  type: 'commercial', wantSpeed: 300,  wantSla: 95, wantPrice: 34000, months: 6,  districtTypes: ['commercial', 'government'] },
    { id: 'ent_cement',     orgName: 'کارخانه سیمان کوهستان', type: 'industrial', wantSpeed: 200,  wantSla: 94, wantPrice: 30000, months: 9,  districtTypes: ['industrial', 'heavy_industrial'] },
    { id: 'ent_meduni',     orgName: 'دانشگاه علوم پزشکی',    type: 'academic',   wantSpeed: 350,  wantSla: 97, wantPrice: 42000, months: 12, districtTypes: ['academic', 'medical'] },
  ];

  // ---------- انواع کمپین تبلیغاتی ----------
  const campaignTypes = [
    { id: 'billboard', name: 'بیلبورد شهری',              costPerDay: 700,  growthMult: 1.4, desc: 'تبلیغ روی بیلبوردهای پرتردد شهر؛ ارزان‌ترین راه دیده‌شدن و جذب آرام مشترک در مناطق سرویس‌گرفته.' },
    { id: 'social',    name: 'تبلیغات شبکه‌های اجتماعی',  costPerDay: 1500, growthMult: 1.8, desc: 'تبلیغ هدفمند در شبکه‌های اجتماعی؛ رشد سریع‌تر مشترک، به‌ویژه در مناطق جوان و پرتراکم.' },
    { id: 'discount',  name: 'تخفیف ویژه جذب مشترک',      costPerDay: 900,  growthMult: 1.6, desc: 'پیشنهاد تخفیف نصب و اشتراک برای مشترکان جدید؛ هزینه متوسط و اثر خوب در مناطق حساس به قیمت.' },
    { id: 'tv',        name: 'تبلیغ تلویزیونی',           costPerDay: 4500, growthMult: 2.5, desc: 'پخش آگهی تلویزیونی سراسری؛ گران‌ترین کمپین ولی با بیشترین جهش در جذب مشترک در کل شهر.' },
  ];

  // ---------- مجموعه کانال‌های فرکانسی هر فناوری بی‌سیم ----------
  const channelSets = {
    cellular: { count: 6, labels: ['کانال ۱', 'کانال ۲', 'کانال ۳', 'کانال ۴', 'کانال ۵', 'کانال ۶'] },
    fwa:      { count: 4, labels: ['کانال ۱', 'کانال ۲', 'کانال ۳', 'کانال ۴'] },
  };

  // ---------- پهنای پرتو آنتن‌ها (استخراج خودکار از کاتالوگ تجهیزات) ----------
  // سکتورها: عدد پیش از «درجه» در نام تجهیز؛ پنل‌ها: «پرتو افقی N درجه» در متن راهنما
  const _faDigitMap = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  const _toLatinDigits = (s) => String(s).replace(/[۰-۹٠-٩]/g, (ch) => _faDigitMap[ch] || ch);
  const beamwidthByEq = {};
  equipmentList.forEach((e) => {
    if (e.name.includes('سکتور')) {
      const m = _toLatinDigits(e.name).match(/(\d+)\s*درجه/);
      if (m) beamwidthByEq[e.id] = parseInt(m[1], 10);
      return;
    }
    if (e.name.includes('پنل') && e.guide) {
      const g = _toLatinDigits(e.guide).match(/پرتو افقی\s*(\d+)\s*درجه/);
      if (g) beamwidthByEq[e.id] = parseInt(g[1], 10);
    }
  });

  // ---------- آب‌وهوا و فصل‌ها ----------
  const weatherKinds = {
    clear: { name: 'صاف',    wirelessFactor: 1,    mmwaveFactor: 1 },
    rain:  { name: 'بارانی', wirelessFactor: 0.85, mmwaveFactor: 0.45 },
    storm: { name: 'طوفانی', wirelessFactor: 0.6,  mmwaveFactor: 0.25 },
    snow:  { name: 'برفی',   wirelessFactor: 0.8,  mmwaveFactor: 0.6 },
  };
  const seasons = [
    { id: 'spring', name: 'بهار',     demandFactor: 1.0,  weather: { clear: 0.68, rain: 0.18, storm: 0.04, snow: 0.02 } },
    { id: 'summer', name: 'تابستان',  demandFactor: 1.1,  weather: { clear: 0.85, rain: 0.08, storm: 0.05, snow: 0 } },
    { id: 'autumn', name: 'پاییز',    demandFactor: 0.97, weather: { clear: 0.6,  rain: 0.22, storm: 0.06, snow: 0.02 } },
    { id: 'winter', name: 'زمستان',   demandFactor: 1.05, weather: { clear: 0.55, rain: 0.12, storm: 0.03, snow: 0.22 } },
  ];

  // ---------- منحنی تقاضای ساعتی (شاخص = ساعت ۰ تا ۲۳؛ اوج عصرگاهی) ----------
  const hourDemandCurve = [0.55, 0.5, 0.48, 0.48, 0.52, 0.6, 0.75, 0.88, 0.95, 1.0, 1.0, 1.0, 1.08, 1.1, 1.05, 1.1, 1.18, 1.25, 1.32, 1.38, 1.4, 1.35, 1.15, 0.85];

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
      rate: { dense: 0.12, commercial: 0.12, residential: 0.09, industrial: 0.08, landmark: 0.06, sparse: 0.05 },
      // ساختمان‌های پراکندهٔ خارج از مناطق: سقف کل و نرخ ساخت روزانه
      outsideCap: 320,
      outsideRate: 0.3,
    },
    buildingColors: bColors,
    buildingTypes: bTypes,
    // نام فارسی نوع ساختمان‌ها (برای نمایش در رابط کاربری)
    buildingTypeFa: { residential: 'مسکونی', commercial: 'تجاری', office: 'اداری', industrial: 'صنعتی' },
    districts,
    buildings,
    installPoints,
    equipment,
    equipmentList,
    legacyEquipmentMap,
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
    achievements,
    firstNames,
    lastNames,
    enterpriseTemplates,
    campaignTypes,
    channelSets,
    beamwidthByEq,
    weatherKinds,
    seasons,
    hourDemandCurve,
    // رسانه‌های لینک و ویژگی‌هایشان
    linkMedia: {
      fiber:     { name: 'فیبر نوری',  capacity: 10000, latency: 2 },
      copper:    { name: 'مسی',        capacity: 100,   latency: 5 },
      ethernet:  { name: 'اترنت',      capacity: 1000,  latency: 1 },
      ptp:       { name: 'نقطه‌به‌نقطه', capacity: 5000, latency: 8, maxRange: 1800 },
    },
    // همان رسانه‌ها به‌صورت آرایه (برای انتخاب‌گر UI)
    media: [
      { id: 'fiber',     name: 'فیبر نوری',    costPerUnit: 8, capacity: 10000, latency: 2 },
      { id: 'copper',    name: 'مسی',          costPerUnit: 3, capacity: 100,   latency: 5 },
      { id: 'ethernet',  name: 'اترنت',        costPerUnit: 2, capacity: 1000,  latency: 1 },
      { id: 'ptp',       name: 'نقطه‌به‌نقطه', costPerUnit: 5, capacity: 5000,  latency: 8, maxRange: 1800 },
    ],
    linkTypes: null, // در ادامه برابر media می‌شود
  };
})();

GAME_DATA.linkTypes = GAME_DATA.media;
if (typeof window !== 'undefined') window.GAME_DATA = GAME_DATA;

if (typeof module !== 'undefined' && module.exports) module.exports = GAME_DATA;
