/**
 * Client-side mirror of the server's CSV parser (apps/api/src/menu/import.ts),
 * used only to drive the live preview in the bulk-import dialog. The server
 * re-parses on import and is the source of truth — this just gives the owner
 * instant feedback. Keep the validation rules in sync with the API module.
 */

export interface ParsedRow {
  category: string;
  name: string;
  pricePaise: number;
  description: string | null;
  isVegetarian: boolean;
  spiceLevel: number;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
}

const REQUIRED_COLUMNS = ['category', 'name', 'price'] as const;
const KNOWN_COLUMNS = [...REQUIRED_COLUMNS, 'description', 'veg', 'spice'] as const;

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
          i++;
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

function parseVeg(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === '' || ['yes', 'y', 'true', 'veg', '1'].includes(v)) return true;
  if (['no', 'n', 'false', 'nonveg', 'non-veg', '0'].includes(v)) return false;
  return null;
}

export function parseMenuCsv(text: string): ParseResult {
  const errors: ParseError[] = [];
  const allLines = text.replace(/\r\n?/g, '\n').split('\n');

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
          message: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
        },
      ],
    };
  }

  const rows: ParsedRow[] = [];
  let sawDataRow = false;

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const raw = allLines[i] ?? '';
    if (raw.trim() === '') continue;
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
      errors.push({ line: lineNo, message: `Invalid price "${priceRaw}".` });
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
        errors.push({ line: lineNo, message: `Invalid spice level "${spiceRaw}" — use 0–3.` });
        continue;
      }
      spiceLevel = spice;
    }

    rows.push({
      category,
      name,
      pricePaise,
      description: at('description') || null,
      isVegetarian,
      spiceLevel,
    });
  }

  if (!sawDataRow) {
    errors.push({ line: headerIdx + 1, message: 'No data rows found below the header.' });
  }

  return { rows, errors };
}
