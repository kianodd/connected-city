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

  // ---------- کاتالوگ تجهیزات (نام‌های ساده و عمومی، بدون برند) ----------
  // era: سال ورود به بازی در خط زمانی تاریخی (از ۱۹۹۱)؛ تجهیزات قبل از سال خودشان ساخته نمی‌شوند.
  // slots: سقف ماژول‌های قابل نصب روی هر گره (ماژول‌ها جای ارتقای سطح قدیمی را گرفته‌اند).
  const equipmentList = [
    { id: 'fiber_cable',     name: 'کابل فیبر نوری',   cost: 5000,   monthlyCost: 120,  buildDays: 0.125,  capacity: 10000, radius: 0,    era: 1995,            category: 'cable', slots: 0, powerDraw: 0, buildable: false,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }],
      guide: 'کابل فیبر نوری برای اتصال گره‌ها به هم با ظرفیت بسیار بالا و تأخیر کم. بهترین گزینه برای مسیرهای اصلی و انتقال (Backhaul) است؛ گران‌تر از مسی است ولی ظرفیتش چند برابر است. با ابزار «اتصال» بین دو گره استفاده می‌شود. در مسیرهای خیلی طولانی سیگنال افت می‌کند؛ «تقویت‌کننده سیگنال» در میانه مسیر آن را برمی‌گرداند. از سال ۱۹۹۵ در دسترس است.' },
    { id: 'copper_cable',    name: 'کابل مسی',          cost: 2000,   monthlyCost: 60,   buildDays: 0.125,  capacity: 100,   radius: 0,    era: 1991,            category: 'cable', slots: 0, powerDraw: 0, buildable: false,
      connects: [{ medium: 'copper', targets: ['node'], direction: 'both' }],
      guide: 'ارزان‌ترین راه اتصال دو گره، اما ظرفیت کمی دارد و زود اشباع می‌شود. فقط برای شروع کار و اتصال‌های کوتاه و کم‌ترافیک مناسب است؛ در فاصله‌های طولانی سیگنال مسی سریع افت می‌کند و به تقویت‌کننده نیاز دارد. بعداً با فیبر جایگزینش کنید.' },
    { id: 'cabinet_basic',   name: 'کابینت ساده',           cost: 3000,   monthlyCost: 60,   buildDays: 0.125,  capacity: 300,  radius: 120,  era: 1991,            category: 'access', tech: 'fiber', ports: 8, slots: 2, powerDraw: 60,
      connects: [
        { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' },
        { medium: 'copper', targets: ['building'], direction: 'downstream' },
      ],
      guide: 'کابینت سادهٔ اول بازی: ارزان و کوچک (۸ پورت) و فقط انشعاب سیم مسی (DSL) به خانه‌ها می‌دهد؛ از همان سال ۱۹۹۱ در دسترس است. کابینت را نزدیک ساختمان‌ها بگذارید، با سیم مسی یا اترنت به هسته/تجمیع وصلش کنید و بعد از پنل ساختمان «اتصال به سیم مسی» را بزنید (تا شعاع ۱۲۰ واحد). برای انشعاب فیبر و پورت بیشتر، بعداً «کابینت خیابانی» (از ۱۹۹۸) و گره FTTH (از ۲۰۰۴) می‌آیند.' },
    { id: 'street_cabinet',  name: 'کابینت خیابانی',           cost: 7000,   monthlyCost: 150,  buildDays: 0.125,  capacity: 2500,  radius: 180,  era: 1998,            category: 'access', tech: 'fiber', ports: 24, slots: 3, powerDraw: 120,
      connects: [
        { medium: 'fiber', targets: ['node'], direction: 'both' },
        { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' },
        { medium: 'fiber', targets: ['building'], direction: 'downstream' },
        { medium: 'copper', targets: ['building'], direction: 'downstream' },
      ],
      guide: 'کابینت توزیع خیابانی: نقطهٔ اتصال ساختمان‌های اطراف به شبکهٔ سیمی (در دنیای واقعی همان کابینت DSLAM/توزیع است). انشعاب ساختمان‌ها از راه کابینت یا مستقیم از گره FTTH انجام می‌شود؛ کابینت را نزدیک ساختمان‌ها بگذارید و با فیبر یا مسی به تجمیع/هسته وصلش کنید. هر کابینت ۲۴ پورت دارد (با «ماژول پورت اضافه» بیشتر می‌شود). انشعاب فیبر تا شعاع ۱۸۰ واحد و سیم مسی (DSL، تا حدود ۱۰۰ مگابیت) تا شعاع ۱۲۰ واحد می‌رسد. هر ساختمان فقط به یکی از فیبر یا سیم مسی وصل می‌شود. انشعاب برای شما رایگان است (هزینهٔ نصب با مشترک است)؛ انشعاب فیبر از دوران FTTH (سال ۲۰۰۴) به بعد ممکن است و قبل از آن فقط سیم مسی داریم. از سال ۱۹۹۸ در دسترس است.' },
    { id: 'ftth',            name: 'فیبر تا خانه (FTTH)',      cost: 16000,  monthlyCost: 300,  buildDays: 0.375,  capacity: 2500,  radius: 400,  era: 2004,          category: 'access', tech: 'fiber', ports: 256, slots: 3, powerDraw: 350,
      connects: [
        { medium: 'fiber', targets: ['node'], direction: 'both' },
        { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' },
        { medium: 'fiber', targets: ['building'], direction: 'downstream' },
      ],
      guide: 'گره FTTH همان OLT در معماری واقعی GPON است: فیبر را تا خود ساختمان مشتری می‌رساند (OLT ← تقسیم‌کننده ← ترمینال نوری ساختمان). ساختمان‌ها را می‌توانید مستقیم به همین گره انشعاب فیبر بدهید (تا شعاع ۴۰۰ واحد، ۲۵۶ پورت) یا از راه کابینت‌های خیابانی نزدیک‌تر. ظرفیت گره حدود ۲٫۵ گیگابیت است (مثل یک پورت GPON با نرخ ۲٫۴۸۸ گیگابیت). انشعاب فیبر رایگان است (هزینهٔ نصب با مشترک است). از سال ۲۰۰۴ در دسترس است.' },
    { id: 'cell_2g',         name: 'دکل 2G',      cost: 12000,  monthlyCost: 500,  buildDays: 0.375,  capacity: 60,    radius: 400,  era: 1991,            category: 'access', tech: 'cellular', slots: 4, powerDraw: 250,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'ارزان‌ترین دکل سلولی با برد زیاد ولی ظرفیت بسیار کم (ظرفیت سایت: حدود ۶۰ مگابیت؛ در دنیای واقعی 2G/EDGE فقط چند مگابیت می‌دهد و این عدد برای قابل‌بازی‌ماندن بازی مقیاس شده است). فقط برای پوشش اولیه مناطق کم‌تراکم خوب است و با رشد مشترک‌ها زود اشباع می‌شود. دکل فقط به مشترکان سرویس می‌دهد و ترافیک گره‌های دیگر از آن عبور نمی‌کند؛ برای بک‌هال خودش مستقیم به تجمیع/هسته وصلش کنید. از سال ۱۹۹۱ در دسترس است.' },
    { id: 'cell_3g',         name: 'دکل 3G',      cost: 32000,  monthlyCost: 1000, buildDays: 0.5,  capacity: 250,   radius: 340,  era: 2001,            category: 'access', tech: 'cellular', slots: 4, powerDraw: 450,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'دکل نسل سوم: برد خوب و ظرفیت متوسط (ظرفیت سایت: حدود ۲۵۰ مگابیت؛ در دنیای واقعی هر سکتور HSPA+ حدود ۱۰ تا ۱۲ مگابیت می‌دهد). تعادل مناسبی برای مناطق مسکونی معمولی. در مناطق پرتراکم به‌تدریج کم می‌آورد. نیازمند اتصال انتقالی به هسته است. از سال ۲۰۰۱ در دسترس است.' },
    { id: 'cell_4g',         name: 'دکل 4G',     cost: 62000,  monthlyCost: 1800, buildDays: 0.625,  capacity: 900,   radius: 290,  era: 2009,           category: 'access', tech: 'cellular', slots: 4, powerDraw: 900,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'دکل LTE با ظرفیت بالا و پوشش خوب (ظرفیت سایت: حدود ۹۰۰ مگابیت؛ در دنیای واقعی یک سایت ۳سکتوره با تجمیع حامل همین حدود را می‌دهد). ستون اصلی شبکه در مناطق پرجمعیت. روی دکل‌های 4G و 5G می‌توانید «ماژول TD-LTE» نصب کنید تا مشترکان ثابتِ دارای مودم سیم‌کارتی هم از همان دکل سرویس بگیرند. برای اشباع‌نشدن به اتصال فیبر یا لینک قوی به هسته نیاز دارد. از سال ۲۰۰۹ در دسترس است.' },
    { id: 'cell_5g',         name: 'دکل 5G',  cost: 125000, monthlyCost: 3400, buildDays: 0.75, capacity: 2500,  radius: 205,  era: 2019,            category: 'access', tech: 'cellular', slots: 4, powerDraw: 1500,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'wireless', targets: ['subscribers'], direction: 'service' }],
      guide: 'بیشترین ظرفیت سلولار برای مناطق بسیار پرتراکم و پرمصرف (ظرفیت سایت: حدود ۲٫۵ گیگابیت؛ در دنیای واقعی سایت 5G میان‌باند با کانال ۱۰۰ مگاهرتزی حدود ۷۰۰ مگابیت تا چند گیگابیت می‌دهد)، ولی بردش کمتر و هزینه‌اش بالاست. «ماژول TD-LTE» روی آن هم قابل نصب است. نیازمند اتصال انتقالی پرظرفیت به هسته است. از سال ۲۰۱۹ در دسترس است.' },
    { id: 'ptp_link',        name: 'لینک نقطه‌به‌نقطه',        cost: 18000,  monthlyCost: 450,  buildDays: 0.25,  capacity: 5000,  radius: 1500, era: 1996,            category: 'backhaul', slots: 2, powerDraw: 100,
      connects: [{ medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }],
      guide: 'اتصال بی‌سیم جهت‌دار بین دو گره؛ جایگزین کابل برای انتقال (Backhaul) با ظرفیت حدود ۵ گیگابیت (در دنیای واقعی لینک‌های مایکروویو ۱ تا ۱۰ گیگابیت می‌دهند). هرچه فاصله بیشتر شود ظرفیت مؤثر کمتر می‌شود و ساختمان‌های بلند سر راه دید مستقیم را می‌بندند و ظرفیت را به‌شدت کم می‌کنند. وقتی کابل‌کشی سخت یا گران است استفاده کنید؛ برای مسیر پشتیبان هم خوب است. توجه: گره‌های دسترسی (دکل، کابینت، FTTH) فقط به گره‌های شبکه (هسته، تجمیع، روتر، سوئیچ، تقویت‌کننده) وصل می‌شوند؛ برای بک‌هال بی‌سیم دکل، رسانهٔ «نقطه‌به‌نقطه» را روی همان اتصال دکل↔تجمیع/هسته انتخاب کنید. از سال ۱۹۹۶ در دسترس است.' },
    { id: 'repeater',        name: 'تقویت‌کننده سیگنال',        cost: 4000,   monthlyCost: 100,  buildDays: 0.125,  capacity: 10000, radius: 0,    era: 1991,            category: 'backhaul', slots: 1, powerDraw: 50,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }],
      guide: 'تقویت‌کننده (ریپیتر/آمپلی‌فایر) سیگنال در میانهٔ مسیرهای طولانی: کابل‌های فیبر و مسی در فاصله‌های زیاد سیگنال را از دست می‌دهند و ظرفیت مؤثرشان افت می‌کند (در دنیای واقعی فیبر تک‌مود حدود ۰٫۳۵ دسی‌بل در هر کیلومتر افت دارد و هر چند ده کیلومتر تقویت‌کننده نوری می‌خواهد؛ سیم مسی خیلی زودتر افت می‌کند). تقویت‌کننده را در میانهٔ مسیر بگذارید و دو طرف را به آن وصل کنید تا افت سیگنال جبران شود.' },
    { id: 'router',          name: 'روتر لبه',         cost: 10000,  monthlyCost: 250,  buildDays: 0.125,  capacity: 2500,  radius: 0,    era: 1991,            category: 'core', slots: 4, powerDraw: 200,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }],
      guide: 'گره واسط برای جمع‌کردن ترافیک چند دستگاه دسترسی و رساندنش به تجمیع یا هسته (ظرفیت: حدود ۲٫۵ گیگابیت). ارزان و سریع ساخته می‌شود و برای شبکه‌های کوچک کافی است.' },
    { id: 'switch',          name: 'سوئیچ',         cost: 6000,   monthlyCost: 150,  buildDays: 0.125,  capacity: 2500,  radius: 0,    era: 1991,            category: 'core', slots: 4, powerDraw: 100,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }],
      guide: 'چند اتصال نزدیک را به هم وصل می‌کند تا به یک گره بالادستی برسند (ظرفیت: حدود ۲٫۵ گیگابیت). ارزان‌ترین راه ساخت یک نقطه تجمیع کوچک در یک محله.' },
    { id: 'aggregation',     name: 'گره تجمیع',       cost: 42000,  monthlyCost: 1200, buildDays: 0.375,  capacity: 12000, radius: 0,    era: 2000,            category: 'core', slots: 4, powerDraw: 600,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }],
      guide: 'ترافیک چند منطقه و دستگاه دسترسی را جمع می‌کند و به هسته می‌رساند. ظرفیت بسیار بالا دارد و برای گسترش شبکه به مناطق جدید ضروری است. به اتصال فیبر به هسته نیاز دارد. از سال ۲۰۰۰ در دسترس است.' },
    { id: 'core_router',     name: 'روتر هسته',                cost: 105000, monthlyCost: 900,  buildDays: 0.625, capacity: 40000, radius: 0,    era: 1991,            category: 'core', slots: 4, powerDraw: 2200,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }],
      guide: 'قلب شبکه شما؛ همه ترافیک شهر از آن عبور می‌کند و به دروازه اینترنت وصل است. از ابتدای بازی فعال است. اگر اشباع شود کل شهر کند می‌شود؛ با گره‌های تجمیع بار را پخش کنید.' },
    { id: 'internet_gateway',name: 'دروازه اینترنت',           cost: 155000, monthlyCost: 1500, buildDays: 0.75, capacity: 40000, radius: 0,    era: 1991,            category: 'core', slots: 4, powerDraw: 2200,
      connects: [{ medium: 'fiber', targets: ['node'], direction: 'both' }, { medium: 'copper', targets: ['node'], direction: 'both' }, { medium: 'ethernet', targets: ['node'], direction: 'both' }, { medium: 'ptp', targets: ['node'], direction: 'both' }, { medium: 'internet', targets: ['internet'], direction: 'upstream' }],
      guide: 'اتصال شبکه شما به اینترنت جهانی. بدون مسیر تا این گره هیچ مشتری‌ای آنلاین نمی‌شود. از ابتدای بازی فعال و به روتر هسته متصل است.' },
    { id: 'backup_power',    name: 'برق پشتیبان',        cost: 12000,  monthlyCost: 240,  buildDays: 0.125,  capacity: 0,    radius: 250,  era: 1991,            category: 'power', slots: 0, powerDraw: 0,
      connects: [{ medium: 'power', targets: ['node'], direction: 'support' }],
      guide: 'رکتیفایر و باتری پشتیبان برای سایت‌ها و مراکز شبکه. گره‌های داخل شعاع آن کمتر خراب می‌شوند و فرسودگی کندتری دارند؛ برای سایت‌های مهم و مسیرهای حیاتی نصب کنید.' },
    { id: 'test_tools_kit',  name: 'ابزار تست شبکه', cost: 15000,  monthlyCost: 300,  buildDays: 0.125,  capacity: 0,    radius: 0,    era: 1991,            category: 'tools', slots: 0, powerDraw: 50,
      connects: [{ medium: 'tools', targets: ['team'], direction: 'support' }],
      guide: 'مجموعه ابزار عیب‌یابی و اندازه‌گیری (تست فیبر، توان‌سنج، تحلیل‌گر طیف). هر مجموعه فعال سرعت ساخت و تعمیر تیم را بیشتر می‌کند.' },
  ];
  // دسترسی هم به‌صورت آرایه و هم به‌صورت نگاشت با کلید id
  const equipment = equipmentList.slice();
  equipmentList.forEach((e) => { equipment[e.id] = e; });

  // نگاشت تجهیزات حذف‌شدهٔ کاتالوگ گسترده (۲۰۵ قلم) به نزدیک‌ترین معادل کلی — برای سازگاری ذخیره‌های قدیمی
  const legacyEquipmentMap = { 'sat_terminal_leo': 'fwa_ap', 'sat_terminal_geo': 'fwa_ap', 'sat_gateway': 'aggregation', 'wifi_ap': 'fwa_ap', 'ant_sector_65_900': 'cell_2g', 'ant_sector_90_1800': 'cell_3g', 'ant_sector_33_2600': 'cell_4g', 'ant_sector_120_700': 'cell_2g', 'ant_sector_65_2100': 'cell_3g', 'ant_sector_65_3500': 'cell_5g', 'ant_sector_90_3500': 'cell_5g', 'ant_sector_120_5800': 'cell_5g', 'ant_sector_65_5800': 'cell_5g', 'ant_panel_3500_5g': 'cell_5g', 'ant_panel_2600': 'cell_4g', 'ant_dish_5800_28': 'cell_5g', 'ant_dish_3500_24': 'cell_5g', 'ant_dish_2600_21': 'cell_4g', 'ant_omni_900_8': 'cell_2g', 'ant_omni_1800_10': 'cell_3g', 'ant_omni_5800_12': 'cell_5g', 'ant_yagi_900_12': 'cell_2g', 'ant_yagi_2100_14': 'cell_3g', 'ant_yagi_3500_16': 'cell_5g', 'ant_log_700_2700': 'cell_2g', 'ant_log_1800_5800': 'cell_3g', 'rru_2g_900_40': 'cell_2g', 'rru_2g_1800_80': 'cell_2g', 'rru_3g_2100_220': 'cell_3g', 'rru_3g_900_150': 'cell_3g', 'rru_4g_700_600': 'cell_4g', 'rru_4g_1800_800': 'cell_4g', 'rru_4g_2100_900': 'cell_4g', 'rru_4g_2600_1100': 'cell_4g', 'rru_4g_dual_1800_2600': 'cell_4g', 'rru_4g_carrier_agg': 'cell_4g', 'rru_smallcell_4g_3500': 'cell_4g', 'rru_smallcell_5g_3500': 'cell_5g', 'rru_5g_2600_2800': 'cell_5g', 'rru_5g_3500_3200': 'cell_5g', 'rru_5g_massive_32t32r': 'cell_5g', 'rru_5g_massive_64t64r': 'cell_5g', 'rru_macro_4g5g_dual': 'cell_5g', 'rru_5g_mmwave_26g': 'cell_5g', 'fwa_cpe_lte_1800': 'fwa_ap', 'fwa_cpe_lte_2600': 'fwa_ap', 'fwa_cpe_indoor_3500': 'fwa_ap', 'fwa_cpe_outdoor_3500': 'fwa_ap', 'fwa_cpe_5g_dual': 'fwa_ap', 'fwa_sector_3500_90': 'fwa_ap', 'fwa_sector_5000_120': 'fwa_ap', 'fwa_sector_5800_65': 'fwa_ap', 'fwa_ap_3500_8x8': 'fwa_ap', 'fwa_ap_5000_4x4': 'fwa_ap', 'fwa_ptmp_5800': 'fwa_ap', 'fwa_sector_700': 'fwa_ap', 'fwa_mmwave_26g_ap': 'fwa_ap', 'fwa_mmwave_cpe_26g': 'fwa_ap', 'wifi4_indoor_300': 'fwa_ap', 'wifi4_outdoor_300': 'fwa_ap', 'wifi5_ceiling_867': 'fwa_ap', 'wifi5_wall_1200': 'fwa_ap', 'wifi5_outdoor_1300': 'fwa_ap', 'wifi_mesh_node_5': 'fwa_ap', 'wifi6_ceiling_2400': 'fwa_ap', 'wifi6_wall_1800': 'fwa_ap', 'wifi6_outdoor_2400': 'fwa_ap', 'wifi6_highdensity': 'fwa_ap', 'wifi_mesh_node_6': 'fwa_ap', 'wifi6e_ceiling_3600': 'fwa_ap', 'wifi6e_outdoor_3600': 'fwa_ap', 'wifi7_wall_3600': 'fwa_ap', 'wifi7_ceiling_5800': 'fwa_ap', 'wifi7_outdoor': 'fwa_ap', 'mw_6ghz_300': 'ptp_link', 'mw_11ghz_500': 'ptp_link', 'mw_11ghz_1000': 'ptp_link', 'mw_13ghz_1000': 'ptp_link', 'mw_18ghz_1000': 'ptp_link', 'mw_18ghz_2000': 'ptp_link', 'mw_23ghz_2000': 'ptp_link', 'mw_23ghz_4000': 'ptp_link', 'mw_38ghz_4000': 'ptp_link', 'mw_38ghz_8000': 'ptp_link', 'mw_60ghz_5000': 'ptp_link', 'mw_60ghz_10000': 'ptp_link', 'mw_80ghz_10000': 'ptp_link', 'mw_80ghz_5000': 'ptp_link', 'mw_6ghz_1000_long': 'ptp_link', 'rt_edge_1g_500': 'router', 'rt_edge_1g_1000': 'router', 'rt_edge_10g_5000': 'router', 'rt_agg_10g_10000': 'aggregation', 'rt_agg_25g_20000': 'aggregation', 'rt_agg_40g_30000': 'aggregation', 'rt_core_100g_40000': 'core_router', 'rt_core_100g_60000': 'core_router', 'rt_core_400g_60000': 'core_router', 'rt_branch_1g_800': 'router', 'rt_vpn_10g_8000': 'router', 'sw_access_24g_500': 'switch', 'sw_access_48g_1000': 'switch', 'sw_access_24g_poe_1000': 'switch', 'sw_access_48g_poe_2000': 'switch', 'sw_agg_10g_10000': 'aggregation', 'sw_agg_25g_20000': 'aggregation', 'sw_core_100g_40000': 'switch', 'sw_core_40g_30000': 'switch', 'sw_industrial_1g_800': 'switch', 'fw_edge_400': 'router', 'fw_edge_2000': 'router', 'fw_agg_8000': 'aggregation', 'fw_core_20000': 'router', 'fw_core_30000': 'router', 'olt_gpon_4_2000': 'aggregation', 'olt_gpon_8_4000': 'aggregation', 'olt_gpon_16_8000': 'aggregation', 'olt_xgs_4_5000': 'aggregation', 'olt_xgs_8_10000': 'aggregation', 'olt_xgs_16_20000': 'aggregation', 'olt_combo_8_6000': 'aggregation', 'ont_gpon_1ge_100': 'ftth', 'ont_gpon_4ge_300': 'ftth', 'ont_gpon_wifi_500': 'ftth', 'ont_xgs_1ge_1000': 'ftth', 'ont_xgs_wifi_1000': 'ftth', 'ont_gpon_2ge_200': 'ftth', 'ont_business_1000': 'ftth', 'spl_plc_1x4_500': 'fiber_cable', 'spl_plc_1x8_1000': 'fiber_cable', 'spl_plc_1x16_2000': 'fiber_cable', 'spl_plc_1x32_3000': 'fiber_cable', 'spl_plc_1x64_5000': 'fiber_cable', 'cab_street_500': 'router', 'cab_street_2000': 'router', 'cab_odf_4000': 'router', 'cab_splice_1000': 'router', 'cab_outdoor_8000': 'router', 'cbl_os2_12_5000': 'fiber_cable', 'cbl_os2_48_10000': 'fiber_cable', 'cbl_os2_96_20000': 'fiber_cable', 'cbl_om4_1000': 'fiber_cable', 'cbl_cat6a_1000': 'copper_cable', 'cbl_drop_500': 'fiber_cable', 'cbl_rg11_800': 'fiber_cable', 'con_sc_apc_500': 'fiber_cable', 'con_lc_duplex_1000': 'fiber_cable', 'con_mpo_trunk_10000': 'fiber_cable', 'con_patch_panel_2000': 'fiber_cable', 'twr_lattice_30m': 'cell_4g', 'twr_lattice_45m': 'cell_4g', 'twr_lattice_60m': 'cell_4g', 'twr_lattice_80m': 'cell_4g', 'twr_monopole_15m': 'cell_4g', 'twr_monopole_20m': 'cell_4g', 'twr_monopole_30m': 'cell_4g', 'twr_rooftop_pole_6m': 'cell_4g', 'twr_rooftop_pole_12m': 'cell_4g', 'twr_guyed_50m': 'cell_4g', 'twr_guyed_70m': 'cell_4g', 'twr_camo_tree_25m': 'cell_4g', 'twr_smallcell_pole_8m': 'cell_4g', 'twr_smallcell_pole_12m': 'cell_4g', 'pwr_rectifier_48v_100a': 'backup_power', 'pwr_rectifier_48v_400a': 'backup_power', 'pwr_battery_vrla_400ah': 'backup_power', 'pwr_battery_lithium_200ah': 'backup_power', 'pwr_ups_1kva': 'backup_power', 'pwr_ups_10kva': 'backup_power', 'pwr_ups_30kva': 'backup_power', 'pwr_solar_kit_1kwp': 'backup_power', 'pwr_solar_kit_5kwp': 'backup_power', 'pwr_solar_kit_10kwp': 'backup_power', 'pwr_generator_diesel_10kva': 'backup_power', 'pwr_generator_gas_30kva': 'backup_power', 'pwr_generator_diesel_100kva': 'backup_power', 'pwr_hybrid_solar_diesel_5kwp': 'backup_power', 'pwr_pdu_smart_32a': 'backup_power', 'pwr_grounding_kit_pro': 'backup_power', 'sat_leo_terminal_flat': 'fwa_ap', 'sat_leo_terminal_pro': 'fwa_ap', 'sat_leo_maritime': 'fwa_ap', 'sat_leo_aviation': 'fwa_ap', 'sat_geo_terminal_ku': 'fwa_ap', 'sat_geo_terminal_ka': 'fwa_ap', 'sat_dish_60cm_ku': 'fwa_ap', 'sat_dish_75cm_ku': 'fwa_ap', 'sat_dish_90cm_ka': 'fwa_ap', 'sat_dish_120cm_ka': 'fwa_ap', 'sat_gateway_small': 'aggregation', 'sat_gateway_large': 'aggregation', 'sat_buc_lnb_kit_ka': 'fwa_ap', 'sat_gateway_modem': 'fwa_ap', 'tool_otdr_pro': 'test_tools_kit', 'tool_otdr_mini': 'test_tools_kit', 'tool_optical_power_meter': 'test_tools_kit', 'tool_light_source': 'test_tools_kit', 'tool_fusion_splicer_core': 'test_tools_kit', 'tool_fusion_splicer_handheld': 'test_tools_kit', 'tool_spectrum_analyzer_handheld': 'test_tools_kit', 'tool_spectrum_analyzer_benchtop': 'test_tools_kit', 'tool_cable_certifier_cat6a': 'test_tools_kit', 'tool_ethernet_tester': 'test_tools_kit', 'tool_vna_8ghz': 'test_tools_kit', 'tool_gps_sync_module': 'test_tools_kit', 'tool_fiber_inspection_scope': 'test_tools_kit', 'tool_pim_tester': 'test_tools_kit', 'tool_drone_survey_kit': 'test_tools_kit', 'tool_tdr_cable_fault': 'test_tools_kit' };

  // ---------- خط زمانی تاریخی فناوری ----------
  // بازی از سال ۱۹۹۱ شروع می‌شود و هر ۱۰ روزِ بازی یک سال جلو می‌رود.
  // هر تجهیز از سال «era» خودش در منوی ساخت ظاهر می‌شود (بر اساس تاریخ واقعی مخابرات).
  const timeline = {
    startYear: 1991,
    daysPerYear: 10,
    eras: [
      { year: 1991, name: 'دوران 2G و سیم مسی', desc: 'شبکهٔ موبایل GSM (2G) در فنلاند راه افتاد؛ اینترنت خانگی روی سیم مسی و روترهای اولیه است.' },
      { year: 1995, name: 'فیبر نوری در ستون فقرات', desc: 'فیبر نوری ستون فقرات شبکه‌های انتقال شد؛ کابل فیبر برای بک‌هال در دسترس است.' },
      { year: 1996, name: 'لینک‌های مایکروویو', desc: 'لینک‌های نقطه‌به‌نقطهٔ مایکروویو برای بک‌هال بی‌سیم رایج شدند.' },
      { year: 1998, name: 'دوران DSL', desc: 'اینترنت پرسرعت روی سیم تلفن (DSL) و کابینت‌های خیابانی به خانه‌ها رسید.' },
      { year: 2000, name: 'تجمیع منطقه‌ای', desc: 'گره‌های تجمیع منطقه‌ای ترافیک محله‌ها را جمع و به هسته می‌رسانند.' },
      { year: 2001, name: 'دوران 3G', desc: 'نسل سوم موبایل (3G) در ژاپن راه افتاد؛ اینترنت موبایل واقعی شروع شد.' },
      { year: 2004, name: 'فیبر تا خانه (FTTH)', desc: 'استاندارد GPON تصویب شد و فیبر تا خانه (FTTH) با معماری OLT و تقسیم‌کننده به ساختمان‌ها رسید.' },
      { year: 2009, name: 'دوران 4G (LTE)', desc: 'نسل چهارم (LTE) در اسلو و استکهلم راه افتاد؛ سرعت موبایل چند برابر شد.' },
      { year: 2012, name: 'TD-LTE ثابت', desc: 'اینترنت ثابت سیم‌کارتی TD-LTE روی شبکهٔ LTE گسترش یافت؛ ماژول TD-LTE روی دکل‌های 4G و 5G قابل نصب است.' },
      { year: 2019, name: 'دوران 5G', desc: 'نسل پنجم (5G) در کرهٔ جنوبی راه افتاد؛ ظرفیت و سرعت موبایل به اوج رسید.' },
    ],
  };

  // ---------- کاتالوگ ماژول‌ها (جایگزین ارتقای سطح) ----------
  // مدل ماژول‌ها: هر نوع ماژول یک‌بار روی گره نصب و بعد سطح‌به‌سطح آپگرید می‌شود (بدون محدودیت تعداد و بدون اشغال جا).
  // هزینهٔ رسیدن به سطح L برابر cost × 1.6^(L-1) است؛ نصب و آپگرید آنی‌اند. سقف سطح: ۱۰ (منبع تغذیه: ۸).
  const moduleList = [
    { id: 'cap_boost',   name: 'ماژول افزایش ظرفیت', cost: 8000,  monthlyCost: 120, era: 1991, powerDraw: 200,
      desc: 'ظرفیت گره را بیشتر می‌کند: سطح‌های اول هرکدام ×۱٫۵ و سطح‌های بالاتر با بازده کمتر (×۱٫۳ و بعد ×۱٫۱۵). نصب یک‌باره است و بعد سطح‌به‌سطح آپگرید می‌شود؛ جا اشغال نمی‌کند. ظرفیت بیشتر یعنی هزینهٔ نگهداری ماهانهٔ بیشتر.' },
    { id: 'range_boost', name: 'ماژول افزایش برد',   cost: 6000,  monthlyCost: 80,  era: 1991, powerDraw: 120,
      desc: 'هر سطح شعاع پوشش گرهٔ دسترسی را ۱۰٪ بیشتر می‌کند. نصب یک‌باره است و بعد سطح‌به‌سطح آپگرید می‌شود؛ جا اشغال نمی‌کند.' },
    { id: 'ports_boost', name: 'ماژول پورت اضافه',   cost: 5000,  monthlyCost: 60,  era: 1998, powerDraw: 60,
      desc: 'هر سطح ۲۴ پورت انشعاب به کابینت خیابانی یا گره FTTH اضافه می‌کند. نصب یک‌باره است و بعد سطح‌به‌سطح آپگرید می‌شود؛ جا اشغال نمی‌کند.' },
    { id: 'tdlte',       name: 'ماژول TD-LTE',       cost: 15000, monthlyCost: 300, era: 2012, powerDraw: 350,
      desc: 'اینترنت ثابت سیم‌کارتی روی همین دکل: مشترکان دارای مودم TD-LTE داخل پوشش دکل سرویس می‌گیرند. مزیتش نسبت به موبایل: پینگ پایدار و بدون نوسان (جیتر). فقط روی دکل 4G و 5G نصب می‌شود؛ هر سطح ۶۰۰ مگابیت ظرفیت TD-LTE می‌دهد.' },
    { id: 'power',       name: 'ماژول منبع تغذیه',   cost: 1500,  monthlyCost: 40,  era: 1991, powerDraw: 0,
      desc: 'برق گره: هر گره برای کارکردن به منبع تغذیه نیاز دارد (سطح پایه در قیمت ساخت هست). هر سطح توان را دو برابر می‌کند (۸۰۰، ۱۶۰۰، ۳۲۰۰… وات). ماژول‌های دیگر و سطح‌های بالاترشان برق بیشتری می‌خواهند؛ اگر مصرف از توان بیشتر شود گره خاموش می‌شود تا منبع تغذیه آپگرید شود.' },
  ];
  const modules = moduleList.slice();
  moduleList.forEach((m) => { modules[m.id] = m; });

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
      desc: 'فیبر نوری سریع‌ترین و پایدارترین رسانه انتقال است. FTTH یعنی رساندن فیبر تا خود ساختمان مشتری با معماری واقعی GPON: گره FTTH (همان OLT) ← تقسیم‌کنندهٔ نوری ← ترمینال نوری داخل ساختمان. ساختمان‌ها را می‌توانید مستقیم به گره FTTH انشعاب فیبر بدهید (شعاع ۴۰۰ واحد، ۲۵۶ پورت) یا از راه کابینت‌های خیابانی نزدیک‌تر. در اول بازی (از ۱۹۹۱) «کابینت ساده» ارزان با ۸ پورت فقط انشعاب سیم مسی (DSL) می‌دهد؛ «کابینت خیابانی» (از ۱۹۹۸، ۲۴ پورت) هم فیبر و هم مسی می‌دهد. انشعاب فیبر و مسی برای شما رایگان است (هزینهٔ نصب با مشترک است)؛ انشعاب فیبر از دوران FTTH (سال ۲۰۰۴) ممکن است و قبل از آن فقط سیم مسی (DSL) داریم. کابل‌های طولانی فیبر و مسی سیگنال از دست می‌دهند؛ «تقویت‌کننده سیگنال» در میانهٔ مسیر افت را جبران می‌کند.',
      whenToUse: 'وقتی منطقه‌ای پرمشترک و پرمصرف است و کیفیت پایدار می‌خواهید. هزینه اولیه بالاتر، ولی بهترین تجربه مشتری.',
      equipmentIds: ['ftth', 'street_cabinet', 'cabinet_basic', 'fiber_cable', 'repeater'] },
    { id: 'copper', name: 'مسی / DSL',
      desc: 'فناوری قدیمی‌تر و ارزان‌تر روی سیم مسی؛ ظرفیت محدود و حساس به فاصله.',
      whenToUse: 'فقط برای شروع ارزان یا اتصال‌های خیلی کم‌ترافیک؛ در بلندمدت با فیبر جایگزین شود.',
      equipmentIds: ['copper_cable'] },
    { id: 'cellular', name: 'سلولار (2G تا 5G)',
      desc: 'دکل‌های موبایل پوشش بی‌سیم وسیع می‌دهند. هر نسل جدید ظرفیت بیشتری دارد ولی برد کمتر و هزینه بالاتر: 2G ارزان و کم‌ظرفیت (حدود ۶۰ مگابیت برای سایت)، 3G متعادل (۲۵۰ مگابیت)، 4G/LTE پرظرفیت (۹۰۰ مگابیت برای سایت ۳سکتوره با تجمیع حامل)، 5G بیشترین ظرفیت (۲٫۵ گیگابیت) برای مناطق بسیار متراکم. این اعداد نزدیک به ظرفیت واقعی سایت‌ها در دنیای واقعی‌اند؛ در عمل فقط بخشی از مشترکان هم‌زمان فعال‌اند (مالتی‌پلکس آماری) و همین باعث می‌شود یک سایت هزاران مشترک را سرویس بدهد.',
      whenToUse: 'برای پوشش سریع مناطق وسیع و پرجمعیت. هر دکل باید با فیبر یا لینک قوی به هسته وصل شود وگرنه اشباع می‌شود.',
      equipmentIds: ['cell_2g', 'cell_3g', 'cell_4g', 'cell_5g'] },
    { id: 'fwa', name: 'TD-LTE (اینترنت ثابت سیم‌کارتی)',
      desc: 'اینترنت ثابت سیم‌کارتی روی شبکهٔ موبایل 4G: مشتری ثابت (خانه و مغازه) با مودم سیم‌کارتی (CPE) به شبکه وصل می‌شود و کابل‌کشی تا مشتری لازم نیست. TD-LTE گرهٔ جدا ندارد؛ «ماژول TD-LTE» روی دکل 4G یا 5G نصب می‌شود و مشترکان ثابتِ داخل پوشش همان دکل از آن سرویس می‌گیرند (ظرفیت ماژول: حدود ۶۰۰ مگابیت). مزیت TD-LTE نسبت به موبایل: پینگ پایدار و بدون نوسان (جیتر)، چون مودم ثابت است و جابه‌جا نمی‌شود. ماژول از سال ۲۰۱۲ در دسترس است.',
      whenToUse: 'برای حاشیه شهر و مناطقی که فیبر نمی‌رسد ولی پوشش 4G دارند. روی دکل 4G/5G منطقه «ماژول TD-LTE» نصب کنید؛ تقاضای TD-LTE فقط جایی سرویس می‌گیرد که دکلِ دارای ماژول پوشش دهد.',
      equipmentIds: ['cell_4g', 'cell_5g'] },
    { id: 'ptp', name: 'لینک نقطه‌به‌نقطه',
      desc: 'اتصال بی‌سیم جهت‌دار بین دو گره برای انتقال ترافیک (Backhaul) به‌جای کابل، با ظرفیت حدود ۵ گیگابیت.',
      whenToUse: 'وقتی کابل‌کشی بین دو گره سخت یا گران است، یا برای ساخت مسیر پشتیبان دوم.',
      equipmentIds: ['ptp_link'] },
    { id: 'wifi', name: 'وای‌فای داخل ساختمان (مشترک)',
      desc: 'وای‌فای را خود مشترک‌ها داخل ساختمانشان راه می‌اندازند: هر ساختمانِ دارای اشتراک فعال (فیبر، سیم مسی، TD-LTE یا سلولار) اکسس‌پوینت خودش را دارد و کاربران ساختمان از همان اشتراک سرویس می‌گیرند. شما اکسس‌پوینت وای‌فای نمی‌سازید؛ کار شما رساندن اشتراک به ساختمان است.',
      whenToUse: 'خودکار است: ساختمانِ مشترک که به شبکه وصل است (انشعاب سیمی یا پوشش دکل متصل) وای‌فای داخلی فعال دارد. بدون اشتراک، یا وقتی ساختمان به شبکه وصل نیست و در برد هیچ دکل متصلی هم نیست، وای‌فایی هم نیست.',
      equipmentIds: [] },
    { id: 'core', name: 'هسته و تجمیع',
      desc: 'روتر هسته و دروازه اینترنت قلب شبکه‌اند؛ گره‌های تجمیع ترافیک مناطق را جمع و به هسته می‌رسانند. هر دستگاه دسترسی باید مسیری تا هسته و دروازه داشته باشد. دکل‌ها فقط به مشترکان سرویس می‌دهند و ترافیک گره‌های دیگر از آن‌ها عبور نمی‌کند (دکل برگِ شبکه است، نه گره عبوری)؛ بک‌هال هر دکل مستقیم به تجمیع/هسته/روتر وصل می‌شود.',
      whenToUse: 'تجمیع را وقتی بسازید که چند دستگاه دسترسی در یک ناحیه دارید تا بار هسته کم و مسیرها کوتاه شود.',
      equipmentIds: ['core_router', 'internet_gateway', 'aggregation', 'router', 'switch'] },
    { id: 'timeline', name: 'خط زمانی و ماژول‌ها',
      desc: 'بازی از سال ۱۹۹۱ شروع می‌شود و هر ۱۰ روزِ بازی یک سال جلو می‌رود. تجهیزات با رسیدن دورانشان در منوی ساخت ظاهر می‌شوند (فیبر ۱۹۹۵، DSL و کابینت ۱۹۹۸، 3G در ۲۰۰۱، FTTH در ۲۰۰۴، 4G در ۲۰۰۹، ماژول TD-LTE در ۲۰۱۲، 5G در ۲۰۱۹) و تقاضای مردم هم با دوران عوض می‌شود: در دوران جدید، ماندن روی فناوری قدیمی رضایت را کم می‌کند. به‌جای ارتقای سطح گره، روی هر گره «ماژول» نصب می‌کنید (افزایش ظرفیت، افزایش برد، پورت اضافه، TD-LTE و منبع تغذیه)؛ هر ماژول یک‌بار نصب و بعد سطح‌به‌سطح آپگرید می‌شود (بدون محدودیت تعداد و بدون اشغال جا) و نصب آنی است. هر گره برای کارکردن «ماژول منبع تغذیه» می‌خواهد؛ ماژول‌های قوی‌تر برق بیشتری می‌خواهند و اگر مصرف از توان منبع بیشتر شود گره خاموش می‌شود تا منبع تغذیه آپگرید شود.',
      whenToUse: 'با ورود هر دوران، تجهیزات جدید را در مناطق پرتقاضا بسازید و روی گره‌های شلوغ ماژول ظرفیت نصب کنید.',
      equipmentIds: [] },
  ];

  // ---------- مأموریت‌ها ----------
  const missions = [
    { id: 'm_first_tower', name: 'اولین دکل',        description: 'یک گره دسترسی (دکل یا آنتن) بسازید.',            goal: { type: 'build_access', count: 1 },        reward: 5000 },
    { id: 'm_connect',     name: 'اتصال به هسته',    description: 'یک گره دسترسی را به شبکه وصل کنید.',              goal: { type: 'connect_access', count: 1 },      reward: 5000 },
    { id: 'm_serve',       name: 'اولین مشترکان',    description: 'در یک منطقه به کیفیت سرویس ۵۰٪ برسید.',           goal: { type: 'district_qos', qos: 0.5, count: 1 }, reward: 8000 },
    { id: 'm_subs_500',    name: '۵۰۰ مشترک',        description: 'به ۵۰۰ مشترک فعال برسید.',                        goal: { type: 'subscribers', count: 500 },       reward: 15000 },
    { id: 'm_era3g',       name: 'ورود به دوران 3G',  description: 'تا سال ۲۰۰۱ (دوران 3G) پیش بروید.',               goal: { type: 'year', year: 2001 },              reward: 10000 },
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
    { id: 'ev_copper_theft',name: 'سرقت کابل مسی',     type: 'failure',  probability: 0.007, description: 'سارقان یک کابل مسی را بریدند و بردند.',        effect: { target: 'random_link', action: 'cut_copper' } },
    { id: 'ev_equipment_theft', name: 'سرقت تجهیزات سایت', type: 'failure', probability: 0.005, description: 'تجهیزات یک سایت دکل به سرقت رفت و سایت از کار افتاد.', effect: { target: 'random_node', action: 'fail' } },
    { id: 'ev_viral',       name: 'موج وایرال',        type: 'demand',   probability: 0.008, description: 'یک ویدیوی وایرال مصرف اینترنت چند منطقه را بالا برد.', effect: { target: 'random_district', action: 'demand_up', factor: 1.6 } },
    { id: 'ev_blackout',    name: 'قطعی برق گسترده',   type: 'failure',  probability: 0.004, description: 'قطعی برق گسترده دو گره شبکه را از کار انداخت.', effect: { target: 'random_node', action: 'fail_two' } },
    // ---------- رویدادهای فصلی و مناسبتی (لنگر تقویمی: فصل‌های ۹۰روزهٔ بازی) ----------
    { id: 'ev_nowruz',      name: 'نوروز',              type: 'seasonal', seasonal: 'spring', description: 'تعطیلات نوروز شروع شد؛ مردم به مسافرت رفتند و مصرف خانگی اینترنت کم شد.', effect: { action: 'effect', demandMult: 0.85, days: 3, satBonus: 3 } },
    { id: 'ev_yalda',       name: 'شب یلدا',            type: 'seasonal', seasonal: 'winter', description: 'شب یلداست؛ خانواده‌ها تا دیر وقت بیدارند و ترافیک شبانه بالا رفت.', effect: { action: 'effect', demandMult: 1.3, days: 2 } },
    { id: 'ev_semester',    name: 'شروع ترم دانشگاه',   type: 'seasonal', seasonal: 'autumn', description: 'ترم جدید دانشگاه شروع شد؛ دانشجوها برگشتند و تقاضای مناطق دانشگاهی بالا رفت.', effect: { action: 'effect', demandMult: 1.4, days: 5, districtTypes: ['academic', 'landmark'] } },
    { id: 'ev_exam',        name: 'فصل امتحان',         type: 'demand',   probability: 0.006, cooldownDays: 60, description: 'فصل امتحان‌هاست؛ دانشجوها آنلاین درس می‌خوانند و به پایداری اینترنت حساس‌تر شده‌اند.', effect: { action: 'effect', demandMult: 1.3, days: 4, districtTypes: ['academic', 'landmark'] } },
    { id: 'ev_ramadan',     name: 'شب‌های رمضان',       type: 'demand',   probability: 0.003, cooldownDays: 200, description: 'ماه رمضان است؛ اوج مصرف از روز به شب و سحر منتقل شده است.', effect: { action: 'effect', demandMult: 1.1, days: 10 } },
    { id: 'ev_stream_fest', name: 'جشنواره استریم',     type: 'demand',   probability: 0.005, cooldownDays: 30, description: 'جشنوارهٔ پخش زنده و استریم در شهر برگزار می‌شود؛ همه هم‌زمان آنلاین‌اند.', effect: { action: 'effect', demandMult: 1.5, days: 2 } },
    { id: 'ev_live_match',  name: 'پخش زندهٔ مسابقه',   type: 'demand',   probability: 0.007, cooldownDays: 15, description: 'مسابقهٔ مهمی به‌صورت زنده پخش می‌شود و ترافیک شهر جهش کرد.', effect: { action: 'effect', demandMult: 1.4, days: 1 } },
    { id: 'ev_shopping',    name: 'جشنواره خرید اینترنتی', type: 'demand', probability: 0.005, cooldownDays: 30, description: 'جشنوارهٔ فروش اینترنتی شروع شد؛ مناطق تجاری شلوغ‌تر از همیشه‌اند.', effect: { action: 'effect', demandMult: 1.4, days: 3, districtTypes: ['commercial'] } },
    { id: 'ev_dust',        name: 'طوفان گردوغبار',     type: 'weather',  probability: 0.005, cooldownDays: 20, description: 'طوفان گردوغبار شهر را گرفته است؛ کیفیت لینک‌های بی‌سیم افت کرد.', effect: { action: 'weather', kind: 'dust', days: 2 } },
    { id: 'ev_heavy_snow',  name: 'برف سنگین',          type: 'weather',  probability: 0.004, cooldownDays: 30, description: 'برف سنگین باریده و مردم خانه‌نشین شده‌اند؛ مصرف اینترنت بالا رفت ولی بی‌سیم‌ها ضعیف‌تر شدند.', effect: { action: 'weather_effect', kind: 'snow', days: 2, demandMult: 1.15 } },
    { id: 'ev_quake',       name: 'زلزلهٔ خفیف',        type: 'failure',  probability: 0.003, cooldownDays: 60, description: 'زلزلهٔ خفیفی شهر را لرزاند و به یک سایت شبکه آسیب زد.', effect: { target: 'random_node', action: 'fail' } },
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
    { id: 'districts_open_10', name: 'ده منطقهٔ باز',    desc: '۱۰ منطقهٔ شهر را برای ساخت‌وساز باز کنید.',          icon: 'coverage',  metric: 'unlockedDistricts', target: 10 },
    { id: 'campaign_1',     name: 'نخستین کمپین تبلیغاتی', desc: 'اولین کمپین تبلیغاتی شرکت را اجرا کنید.',            icon: 'star',      metric: 'campaignsRun',      target: 1 },
    { id: 'satisfaction_80', name: 'رضایت هشتاد درصدی',  desc: 'رضایت مشترکان را به ۸۰٪ برسانید.',                     icon: 'star',      metric: 'satisfaction',      target: 80 },
    { id: 'days_365',       name: 'یک سال پایداری',      desc: '۳۶۵ روز فعالیت شبکه را پشت سر بگذارید.',               icon: 'clock',     metric: 'days',              target: 365 },
    { id: 'era_5g',         name: 'رسیدن به دوران 5G',  desc: 'تا سال ۲۰۱۹ (دوران 5G) پیش بروید.',                  icon: 'trophy',    metric: 'year',              target: 2019 },
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
    dust:  { name: 'گردوغبار', wirelessFactor: 0.7,  mmwaveFactor: 0.3 },
  };
  const seasons = [
    { id: 'spring', name: 'بهار',     demandFactor: 1.0,  weather: { clear: 0.68, rain: 0.18, storm: 0.04, snow: 0.02 } },
    { id: 'summer', name: 'تابستان',  demandFactor: 1.1,  weather: { clear: 0.85, rain: 0.08, storm: 0.05, snow: 0 } },
    { id: 'autumn', name: 'پاییز',    demandFactor: 0.97, weather: { clear: 0.6,  rain: 0.22, storm: 0.06, snow: 0.02 } },
    { id: 'winter', name: 'زمستان',   demandFactor: 1.05, weather: { clear: 0.55, rain: 0.12, storm: 0.03, snow: 0.22 } },
  ];

  // ---------- رشد تقاضای پهنای باند هر کاربر در گذر تاریخ ----------
  // در ۱۹۹۱ فناوری ضعیف است و هر کاربر کم مصرف می‌کند؛ با پیشرفت فناوری (پهن‌باند، استریم، مدرن)
  // مصرف هر مشترک بیشتر می‌شود. ضریب بین نقاط به‌صورت خطی درون‌یابی می‌شود.
  const eraDemandCurve = [
    { year: 1991, mult: 0.30 }, { year: 1995, mult: 0.40 }, { year: 1998, mult: 0.50 },
    { year: 2001, mult: 0.60 }, { year: 2004, mult: 0.75 }, { year: 2009, mult: 0.90 },
    { year: 2012, mult: 1.00 }, { year: 2019, mult: 1.20 }, { year: 2025, mult: 1.50 },
    { year: 2030, mult: 1.80 },
  ];

  // ---------- منحنی تقاضای ساعتی (شاخص = ساعت ۰ تا ۲۳؛ اوج عصرگاهی) ----------
  const hourDemandCurve = [0.55, 0.5, 0.48, 0.48, 0.52, 0.6, 0.75, 0.88, 0.95, 1.0, 1.0, 1.0, 1.08, 1.1, 1.05, 1.1, 1.18, 1.25, 1.32, 1.38, 1.4, 1.35, 1.15, 0.85];

  return {
    world: { width: 14400, height: 10800 },
    // مسیر رودخانه (همان نقاطی که map.js رسم می‌کند؛ برای جای‌گذاری ساختمان‌های جدید)
    river: [
      { x: 2160, y: -40 }, { x: 2080, y: 360 }, { x: 2200, y: 800 },
      { x: 2100, y: 1240 }, { x: 2220, y: 1700 }, { x: 2120, y: 2080 }, { x: 2200, y: 2440 }
    ],
    // رشد تدریجی شهر: سقف ساختمان هر منطقه = شمار اولیه × ضریب نوع منطقه؛ نرخ = احتمال ساخت یک ساختمان در هر روز
    growth: {
      capMultiplier: { dense: 2.0, commercial: 2.0, residential: 1.8, industrial: 1.6, landmark: 1.4, sparse: 1.5, village: 1.6,
        academic: 1.6, medical: 1.4, heavy_industrial: 1.5, tourism: 1.6, transport: 1.5, villa: 1.6, slum: 2.2, government: 1.5 },
      rate: { dense: 0.12, commercial: 0.12, residential: 0.09, industrial: 0.08, landmark: 0.06, sparse: 0.05 },
      // ساختمان‌های پراکندهٔ خارج از مناطق: سقف کل و نرخ ساخت روزانه
      outsideCap: 640,
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
    timeline,
    modules,
    moduleList,
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
    campaignTypes,
    channelSets,
    beamwidthByEq,
    weatherKinds,
    seasons,
    hourDemandCurve,
    eraDemandCurve,
    // رسانه‌های لینک و ویژگی‌هایشان
    linkMedia: {
      fiber:     { name: 'فیبر نوری',  capacity: 10000, latency: 2, era: 1995 },
      copper:    { name: 'مسی',        capacity: 100,   latency: 5, era: 1991 },
      ethernet:  { name: 'اترنت',      capacity: 1000,  latency: 1, era: 1991, maxRange: 600 },
      ptp:       { name: 'نقطه‌به‌نقطه', capacity: 5000, latency: 8, maxRange: 1800, era: 1996 },
    },
    // همان رسانه‌ها به‌صورت آرایه (برای انتخاب‌گر UI)
    // هزینهٔ هر لینک = فاصله × costPerUnit؛ مسی ارزان‌ترین رسانه است و اترنت فقط برای لینک‌های کوتاه (حداکثر ۶۰۰ واحد).
    media: [
      { id: 'fiber',     name: 'فیبر نوری',    costPerUnit: 8, capacity: 10000, latency: 2, era: 1995 },
      { id: 'copper',    name: 'مسی',          costPerUnit: 1, capacity: 100,   latency: 5, era: 1991 },
      { id: 'ethernet',  name: 'اترنت',        costPerUnit: 3, capacity: 1000,  latency: 1, era: 1991, maxRange: 600 },
      { id: 'ptp',       name: 'نقطه‌به‌نقطه', costPerUnit: 5, capacity: 5000,  latency: 8, maxRange: 1800, era: 1996 },
    ],
    linkTypes: null, // در ادامه برابر media می‌شود
  };
})();

GAME_DATA.linkTypes = GAME_DATA.media;
if (typeof window !== 'undefined') window.GAME_DATA = GAME_DATA;

if (typeof module !== 'undefined' && module.exports) module.exports = GAME_DATA;
