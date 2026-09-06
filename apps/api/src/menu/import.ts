/**
 * Pure CSV → menu-row parser. No I/O — the route layer turns ParsedRow[] into
 * categories + items. Kept separate so the parsing rules are unit-tested in
 * isolation (see import.test.ts) and the same shape can drive a preview UI.
 *
 * Expected header (case-insensitive, any order):
 *   category, name, price (rupees), description?, veg? (yes/no), spice? (0-3)
 */

export interface ParsedRow {
  category: string;
  name: string;
  /** Price converted from the rupees column to integer paise. */
  pricePaise: number;
  description: string | null;
  isVegetarian: boolean;
  spiceLevel: number;
}

export interface ParseError {
  /** 1-based line number in the original text (header = line 1). */
  line: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
}

const REQUIRED_COLUMNS = ['category', 'name', 'price'] as const;
const KNOWN_COLUMNS = [...REQUIRED_COLUMNS, 'description', 'veg', 'spice'] as const;

/** A downloadable starter file shown in the UI; also acts as a parser smoke test. */
export const SAMPLE_MENU_CSV = [
  'category,name,price,description,veg,spice',
  'Beverages,Masala Chai,40,Spiced milk tea,yes,1',
  'Beverages,Cold Coffee,120,Iced coffee with cream,yes,0',
  'Starters,Paneer Tikka,260,Smoky grilled cottage cheese,yes,2',
  'Starters,Chicken 65,290,Spicy deep-fried chicken,no,3',
  'Mains,"Rajma, Chawal",220,"Kidney bean curry, rice & salad",yes,1',
  'Mains,Butter Chicken,340,Creamy tomato chicken curry,no,2',
  'Desserts,Gulab Jamun,90,Two pieces in warm syrup,yes,0',
].join('\n');

/**
 * Splits a single CSV line into fields, honoring double-quoted fields (which
 * may contain commas, and "" as an escaped quote). RFC-4180-ish — enough for
 * spreadsheet exports.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** A "yes"-ish boolean. Returns null for anything unrecognised. */
function parseVeg(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === '' || ['yes', 'y', 'true', 'veg', '1'].includes(v)) return true;
  if (['no', 'n', 'false', 'nonveg', 'non-veg', '0'].includes(v)) return false;
  return null;
}

export function parseMenuCsv(text: string): ParseResult {
  const errors: ParseError[] = [];

  // Normalise line endings, then keep the original 1-based index for each line
  // so error messages point at the right row even when blanks are skipped.
  const allLines = text.replace(/\r\n?/g, '\n').split('\n');

  // Find the header — the first non-blank line.
  let headerIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if ((allLines[i] ?? '').trim() !== '') {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] };
  }

  const header = splitCsvLine(allLines[headerIdx] ?? '').map((h) => h.trim().toLowerCase());
  const colIndex = new Map<string, number>();
  for (const known of KNOWN_COLUMNS) {
    const idx = header.indexOf(known);
    if (idx !== -1) colIndex.set(known, idx);
  }

  const missing = REQUIRED_COLUMNS.filter((c) => !colIndex.has(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: headerIdx + 1,
          message: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected a header row with: ${REQUIRED_COLUMNS.join(', ')}.`,
        },
      ],
    };
  }

  const rows: ParsedRow[] = [];
  let sawDataRow = false;

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const raw = allLines[i] ?? '';
    if (raw.trim() === '') continue; // skip blank lines silently
    sawDataRow = true;

    const lineNo = i + 1;
    const fields = splitCsvLine(raw);
    const at = (col: string): string => {
      const idx = colIndex.get(col);
      return idx === undefined ? '' : (fields[idx] ?? '').trim();
    };

    const category = at('category');
    const name = at('name');
    const priceRaw = at('price');

    if (category === '') {
      errors.push({ line: lineNo, message: 'Missing category.' });
      continue;
    }
    if (name === '') {
      errors.push({ line: lineNo, message: 'Missing item name.' });
      continue;
    }

    if (priceRaw === '') {
      errors.push({ line: lineNo, message: 'Missing price.' });
      continue;
    }
    const rupees = Number(priceRaw);
    if (!Number.isFinite(rupees) || rupees < 0) {
      errors.push({
        line: lineNo,
        message: `Invalid price "${priceRaw}" — must be a non-negative number of rupees.`,
      });
      continue;
    }
    const pricePaise = Math.round(rupees * 100);

    const isVegetarian = parseVeg(at('veg'));
    if (isVegetarian === null) {
      errors.push({ line: lineNo, message: `Invalid veg value "${at('veg')}" — use yes or no.` });
      continue;
    }

    let spiceLevel = 0;
    const spiceRaw = at('spice');
    if (spiceRaw !== '') {
      const spice = Number(spiceRaw);
      if (!Number.isInteger(spice) || spice < 0 || spice > 3) {
        errors.push({
          line: lineNo,
          message: `Invalid spice level "${spiceRaw}" — use 0, 1, 2 or 3.`,
        });
        continue;
      }
      spiceLevel = spice;
    }

    const description = at('description') || null;

    rows.push({ category, name, pricePaise, description, isVegetarian, spiceLevel });
  }

  if (!sawDataRow) {
    errors.push({ line: headerIdx + 1, message: 'No data rows found below the header.' });
  }

  return { rows, errors };
}
