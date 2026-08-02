import { Product, Category, Customer, SaleTransaction, StoreSettings } from '../types';

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'رئيسي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-2',
    name: 'كعكة',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-3',
    name: 'وجبة كلاسيك دجاج',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-4',
    name: 'برغر',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-5',
    name: 'جاج',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-6',
    name: 'ساندويش تاباسكو الحار',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-7',
    name: 'تاباسكو دجاج حار',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-8',
    name: 'رويال باربيكيو',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-9',
    name: 'رويال باربيكي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-10',
    name: 'كلاسيك كرنشي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-11',
    name: 'كلاسيك كرنشي دجاج',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-12',
    name: 'تاباسكو كرنشي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-13',
    name: 'وجبة تاباسكو كرنشي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-14',
    name: 'ساندويش تشيكن sj',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-15',
    name: 'وجبة تشيكن  sj',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-16',
    name: 'ساندويش شاورما صغير',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-17',
    name: 'ساندويش شاورما صغير دجاج',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-18',
    name: 'ساندويش شاورما لحمة صغير',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-19',
    name: 'ساندويش تاباسكو حار دجاج',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-20',
    name: 'وجبة زنجر',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-21',
    name: 'ساندويش زنجر عادي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-22',
    name: 'وجبة زنجر عادي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-23',
    name: 'وجبة زنجر سوبريم',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-24',
    name: 'وجبة زنجر كريمة',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-25',
    name: 'وجبة فاهيتا',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-26',
    name: 'وجبة مكسيكان',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-27',
    name: 'وجبة الفريدوو',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-28',
    name: 'وجبة برجر فردي',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-29',
    name: 'وجبة برجر دبل',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-30',
    name: 'وجبة سكالوب',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'cat-31',
    name: 'وجبة سكالوب دبل',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
];

// Category gradient stops for the generated product thumbnails.
const CATEGORY_GRADIENT: Record<string, [string, string]> = {
  'cat-bev': ['#38bdf8', '#2563eb'],
  'cat-bak': ['#fbbf24', '#d97706'],
  'cat-snd': ['#34d399', '#059669'],
  'cat-snk': ['#a78bfa', '#7c3aed'],
};

// Builds a self-contained SVG thumbnail (a category-tinted gradient behind the
// product's emoji) as a data URI. This keeps the demo catalog looking polished
// fully offline — an offline-first POS often runs on a café LAN with no
// internet — with no external image host and no binary assets in the repo.
// encodeURIComponent (not base64) keeps it UTF-8-safe for the emoji glyph.
function productThumb(category: string, emoji: string): string {
  const [from, to] = CATEGORY_GRADIENT[category] ?? ['#94a3b8', '#475569'];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="400" height="400" fill="url(#g)"/>` +
    `<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-size="210">${emoji}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'بطاطا ودجز صغير',
    price: 1,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-1',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-2',
    name: 'كاسة بطاطا بالجبنة',
    price: 1.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-2',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-3',
    name: 'علبة بطاطا سوبر',
    price: 1,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-3',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-4',
    name: 'علبة بطاطا',
    price: 0.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-4',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-5',
    name: 'وجبة تاباسكو حار لحمة',
    price: 4.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-5',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-6',
    name: 'ساندويش تاباسكو حار لحمة',
    price: 3.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-6',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-7',
    name: 'وجبة هني ماستر لحمة',
    price: 4.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-7',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-8',
    name: 'ساندويش هني ماستر لحمة',
    price: 3.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-8',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-9',
    name: 'وجبة بيكن لحمة',
    price: 4.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-9',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-10',
    name: 'ساندويش بيكن لحمة',
    price: 3.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-10',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-11',
    name: 'وجبة باربيكيو لحمة',
    price: 4.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-11',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-12',
    name: 'ساندويش باربيكيو لحمة',
    price: 3.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-12',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-13',
    name: 'وجبة وايت ماشروم لحمة',
    price: 4.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-13',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-14',
    name: 'ساندويش وايت ماشروم لحمة',
    price: 3.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-14',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-15',
    name: 'وجبة كلاسيك لحمة',
    price: 3.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-15',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-16',
    name: 'ساندويش كلاسيك لحمة',
    price: 2.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-16',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-17',
    name: 'وجبة سماش تريبل',
    price: 5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-17',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-18',
    name: 'ساندويش سماش تريبل',
    price: 4,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-18',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-19',
    name: 'وجبة سماش دبل',
    price: 3.7,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-19',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-20',
    name: 'ساندويش سماش دبل',
    price: 2.7,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-20',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-21',
    name: 'وجبة سماش سنجل',
    price: 2.9,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-21',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-22',
    name: 'ساندويش سماش سنجل',
    price: 1.9,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-22',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-23',
    name: 'ساندويش الفريدو',
    price: 1.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-23',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-24',
    name: 'ساندويش فاهيتا',
    price: 1.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-24',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-25',
    name: 'ساندويش ميكسكان',
    price: 1.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-25',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-26',
    name: 'ساندويش زنجر سوبربم',
    price: 2,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-26',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-27',
    name: 'ساندويش زنجر كريمة',
    price: 2,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-27',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-28',
    name: 'ساندويش زنجرحار',
    price: 1.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-28',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-29',
    name: 'وجبة شاورما لحم دبل',
    price: 4.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-29',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-30',
    name: 'وجبة شاورما لحم سوبر',
    price: 3.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-30',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-31',
    name: 'وجبة شاورما لحم عادي',
    price: 2.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-31',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-32',
    name: 'ساندويش شاورما لحم كبير',
    price: 1.9,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-32',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-33',
    name: 'وجبة شاورما دبل دجاج',
    price: 4,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-33',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-34',
    name: 'وجبة شاورما سوبر دجاج',
    price: 3,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-34',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-35',
    name: 'وجبة شاورما عادي دجاج',
    price: 2.25,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-35',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-36',
    name: 'ساندويش شاورما كبير دجاج',
    price: 1.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-36',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-38',
    name: 'بطاطا ودجز سوبر',
    price: 2,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-38',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-39',
    name: 'بطاطا ودجز كاسة',
    price: 2,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-39',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-40',
    name: 'حلقات بصل',
    price: 1,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-40',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-41',
    name: 'بوكس زنجر',
    price: 2.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-41',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-42',
    name: 'بوكس زنجر بالكريمة',
    price: 2.75,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-42',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-43',
    name: 'بوكس لحمة',
    price: 3,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-43',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-44',
    name: 'سلطة سيزر بدون دجاج',
    price: 1.5,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-44',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-45',
    name: 'سلطة سيزر دجاج',
    price: 2.25,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-45',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-46',
    name: 'جبنة',
    price: 0.3,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-46',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-47',
    name: 'صوص',
    price: 0.3,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-47',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-48',
    name: 'بيبسي',
    price: 0.3,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-48',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-49',
    name: 'ساندويش كلاسيك دجاج',
    price: 2,
    cost: 0,
    category: 'cat-1',
    sku: 'SKU-49',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-1', '🍽️'),
  },
  {
    id: 'prod-50',
    name: 'وجبة كلاسيك جاج',
    price: 3.5,
    cost: 0,
    category: 'cat-5',
    sku: 'SKU-50',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-5', '🍽️'),
  },
  {
    id: 'prod-51',
    name: 'سانويش تاباسكو الحار دجاج',
    price: 2.5,
    cost: 0,
    category: 'cat-6',
    sku: 'SKU-51',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-6', '🍽️'),
  },
  {
    id: 'prod-52',
    name: 'وجبة تاباسكو الحار دجاج',
    price: 3.5,
    cost: 0,
    category: 'cat-7',
    sku: 'SKU-52',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-7', '🍽️'),
  },
  {
    id: 'prod-53',
    name: 'ساندويش رويال باربيكو دجاح',
    price: 2.5,
    cost: 0,
    category: 'cat-8',
    sku: 'SKU-53',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-8', '🍽️'),
  },
  {
    id: 'prod-54',
    name: 'وجبة رويال باربيكو  دجاح',
    price: 3.5,
    cost: 0,
    category: 'cat-9',
    sku: 'SKU-54',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-9', '🍽️'),
  },
  {
    id: 'prod-55',
    name: 'ساندويش كلاسيك كرنشي',
    price: 2,
    cost: 0,
    category: 'cat-10',
    sku: 'SKU-55',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-10', '🍽️'),
  },
  {
    id: 'prod-56',
    name: 'وجبة كلاسيك كرنشي',
    price: 3.5,
    cost: 0,
    category: 'cat-11',
    sku: 'SKU-56',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-11', '🍽️'),
  },
  {
    id: 'prod-57',
    name: 'ساندويش تاباسكو كرنشي',
    price: 2.5,
    cost: 0,
    category: 'cat-12',
    sku: 'SKU-57',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-12', '🍽️'),
  },
  {
    id: 'prod-58',
    name: 'وجبة تاباسكو كرنشي دجاج',
    price: 3.5,
    cost: 0,
    category: 'cat-13',
    sku: 'SKU-58',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-13', '🍽️'),
  },
  {
    id: 'prod-59',
    name: 'ساندويش تشيكن  sj',
    price: 3.5,
    cost: 0,
    category: 'cat-14',
    sku: 'SKU-59',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-14', '🍽️'),
  },
  {
    id: 'prod-60',
    name: 'وجبة تشيكن sj',
    price: 4.5,
    cost: 0,
    category: 'cat-15',
    sku: 'SKU-60',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-15', '🍽️'),
  },
  {
    id: 'prod-61',
    name: 'ساندويش شاورما صغيردجاج',
    price: 0.75,
    cost: 0,
    category: 'cat-17',
    sku: 'SKU-61',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-17', '🍽️'),
  },
  {
    id: 'prod-62',
    name: 'ساندويش شاورما لحمة صغيرر',
    price: 1,
    cost: 0,
    category: 'cat-18',
    sku: 'SKU-62',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-18', '🍽️'),
  },
  {
    id: 'prod-63',
    name: 'ساندويش تباسكو حار دجاج',
    price: 2.5,
    cost: 0,
    category: 'cat-19',
    sku: 'SKU-63',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-19', '🍽️'),
  },
  {
    id: 'prod-64',
    name: 'وجبة زنجر حار',
    price: 2.75,
    cost: 0,
    category: 'cat-20',
    sku: 'SKU-64',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-20', '🍽️'),
  },
  {
    id: 'prod-65',
    name: 'ساندويش زنجر عاديي',
    price: 1.75,
    cost: 0,
    category: 'cat-21',
    sku: 'SKU-65',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-21', '🍽️'),
  },
  {
    id: 'prod-66',
    name: 'وجبة زنجر عاديي',
    price: 1,
    cost: 0,
    category: 'cat-22',
    sku: 'SKU-66',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-22', '🍽️'),
  },
  {
    id: 'prod-67',
    name: 'وجبة زنجر سوبريمم',
    price: 3,
    cost: 0,
    category: 'cat-23',
    sku: 'SKU-67',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-23', '🍽️'),
  },
  {
    id: 'prod-68',
    name: 'وجبة زنجر كريمةة',
    price: 3,
    cost: 0,
    category: 'cat-24',
    sku: 'SKU-68',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-24', '🍽️'),
  },
  {
    id: 'prod-69',
    name: 'وجبة فاهيتاا',
    price: 2.75,
    cost: 0,
    category: 'cat-25',
    sku: 'SKU-69',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-25', '🍽️'),
  },
  {
    id: 'prod-70',
    name: 'وجبة مكسيكاان',
    price: 2.75,
    cost: 0,
    category: 'cat-26',
    sku: 'SKU-70',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-26', '🍽️'),
  },
  {
    id: 'prod-71',
    name: 'وجبة الفريدو',
    price: 2.75,
    cost: 0,
    category: 'cat-27',
    sku: 'SKU-71',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-27', '🍽️'),
  },
  {
    id: 'prod-72',
    name: 'وجبة برجررفردي',
    price: 1.5,
    cost: 0,
    category: 'cat-28',
    sku: 'SKU-72',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-28', '🍽️'),
  },
  {
    id: 'prod-73',
    name: 'وجبة برجر دبلل',
    price: 2.3,
    cost: 0,
    category: 'cat-29',
    sku: 'SKU-73',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-29', '🍽️'),
  },
  {
    id: 'prod-74',
    name: 'وجبة سكالوبب',
    price: 1.5,
    cost: 0,
    category: 'cat-30',
    sku: 'SKU-74',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-30', '🍽️'),
  },
  {
    id: 'prod-75',
    name: 'وجبة سكالوب دبلل',
    price: 2.3,
    cost: 0,
    category: 'cat-31',
    sku: 'SKU-75',
    stock: 100,
    minStock: 0,
    image: productThumb('cat-31', '🍽️'),
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    name: 'Sarah Jenkins',
    email: 'sarah.j@gmail.com',
    phone: '555-0192',
    points: 124,
    createdAt: '2026-05-10',
  },
  {
    id: 'cust-2',
    name: 'Marcus Chen',
    email: 'mchen99@yahoo.com',
    phone: '555-0143',
    points: 48,
    createdAt: '2026-06-01',
  },
  {
    id: 'cust-3',
    name: 'Olivia Martinez',
    email: 'olivia.m@outlook.com',
    phone: '555-0177',
    points: 215,
    createdAt: '2026-04-15',
  },
  {
    id: 'cust-4',
    name: 'David Wilson',
    email: 'david.wilson@gmail.com',
    phone: '555-0188',
    points: 10,
    createdAt: '2026-06-25',
  },
];

export const INITIAL_SETTINGS: StoreSettings = {
  storeName: 'EA POS',
  storeAddress: '123 Tech Boulevard, Suite 400, WA 98101',
  storePhone: '206-555-0100',
  storeLogo: '',
  taxRate: 8.5, // 8.5% Seattle tax
  currency: '$',
  loyaltyPointsRate: 1, // 1 point per $1
  loyaltyPointValue: 0.05, // Each point is worth $0.05 discount
};

// Generates dynamic, realistic past transactions for the last 7 days
export function generatePastTransactions(): SaleTransaction[] {
  const transactions: SaleTransaction[] = [];
  const paymentMethods: Array<'cash' | 'card' | 'mobile'> = [
    'card',
    'card',
    'cash',
    'mobile',
    'card',
  ];

  // Set up mock date loop going back 7 days
  const today = new Date();

  let txCounter = 10001;

  // Generate a random sample of sales
  for (let d = 7; d >= 0; d--) {
    const saleDate = new Date(today);
    saleDate.setDate(today.getDate() - d);

    // Number of sales on this day (weekends have more sales)
    const isWeekend = saleDate.getDay() === 0 || saleDate.getDay() === 6;
    const salesCount = isWeekend
      ? 15 + Math.floor(Math.random() * 10)
      : 8 + Math.floor(Math.random() * 8);

    for (let s = 0; s < salesCount; s++) {
      // Create random hours of operation (7:30 AM to 6:00 PM)
      const hour = 7 + Math.floor(Math.random() * 11);
      const minute = Math.floor(Math.random() * 60);
      saleDate.setHours(hour, minute, 0, 0);

      // Select random products (1 to 4 items)
      const itemCount = 1 + Math.floor(Math.random() * 4);
      const selectedProducts: Set<string> = new Set();
      while (selectedProducts.size < itemCount) {
        const prod = INITIAL_PRODUCTS[Math.floor(Math.random() * INITIAL_PRODUCTS.length)];
        selectedProducts.add(prod.id);
      }

      const items = Array.from(selectedProducts).map((prodId) => {
        const prod = INITIAL_PRODUCTS.find((p) => p.id === prodId)!;
        const qty = 1 + (Math.random() > 0.8 ? 1 : 0); // Mostly quantity 1, occasionally 2
        return {
          productId: prod.id,
          productName: prod.name,
          price: prod.price,
          cost: prod.cost,
          quantity: qty,
          total: Number((prod.price * qty).toFixed(2)),
        };
      });

      const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));

      // Customer linkage (about 40% of sales have a customer linked)
      let customerId: string | null = null;
      let customerName: string | null = null;
      let discountType: SaleTransaction['discountType'] = 'none';
      let discountValue = 0;
      let discount = 0;

      if (Math.random() < 0.4) {
        const cust = INITIAL_CUSTOMERS[Math.floor(Math.random() * INITIAL_CUSTOMERS.length)];
        customerId = cust.id;
        customerName = cust.name;

        // Randomly apply loyalty points discount or regular promo discount
        const discRand = Math.random();
        if (discRand < 0.3) {
          discountType = 'loyalty';
          discountValue = Math.min(cust.points, 20); // apply up to 20 points
          discount = Number((discountValue * INITIAL_SETTINGS.loyaltyPointValue).toFixed(2));
        } else if (discRand < 0.6) {
          discountType = 'percentage';
          discountValue = 10; // 10% off
          discount = Number((subtotal * 0.1).toFixed(2));
        }
      }

      const taxableAmount = Math.max(0, subtotal - discount);
      const tax = Number((taxableAmount * (INITIAL_SETTINGS.taxRate / 100)).toFixed(2));
      const total = Number((taxableAmount + tax).toFixed(2));

      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

      let cashPaid: number | undefined;
      let cashChange: number | undefined;

      if (paymentMethod === 'cash') {
        const bills = [5, 10, 20, 50, 100];
        const payVal = bills.find((b) => b >= total) || Math.ceil(total / 10) * 10;
        cashPaid = payVal;
        cashChange = Number((payVal - total).toFixed(2));
      }

      // Randomly mark 3% of past sales as refunded (excluding today's sales for clean demos)
      const isRefunded = d > 0 && Math.random() < 0.03;

      transactions.push({
        id: `TX-${txCounter++}`,
        date: saleDate.toISOString(),
        items,
        subtotal,
        discount,
        discountType,
        discountValue,
        tax,
        total,
        paymentMethod,
        cashPaid,
        cashChange,
        customerId,
        customerName,
        status: isRefunded ? 'refunded' : 'completed',
        refundDate: isRefunded
          ? new Date(saleDate.getTime() + 4 * 60 * 60 * 1000).toISOString()
          : null,
      });
    }
  }

  // Sort from newest to oldest
  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
