import { describe, expect, it } from 'vitest';
import { SAMPLE_MENU_CSV, parseMenuCsv } from './import.js';

describe('parseMenuCsv', () => {
  it('parses a well-formed CSV with all columns', () => {
    const csv = [
      'category,name,price,description,veg,spice',
      'Beverages,Cappuccino,150,Espresso with steamed milk,yes,0',
      'Mains,Paneer Tikka,280,Smoky cottage cheese,yes,2',
    ].join('\n');

    const { rows, errors } = parseMenuCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      category: 'Beverages',
      name: 'Cappuccino',
      pricePaise: 15000,
      description: 'Espresso with steamed milk',
      isVegetarian: true,
      spiceLevel: 0,
    });
    expect(rows[1]).toEqual({
      category: 'Mains',
      name: 'Paneer Tikka',
      pricePaise: 28000,
      description: 'Smoky cottage cheese',
      isVegetarian: true,
      spiceLevel: 2,
    });
  });

  it('converts rupees to paise (handles decimals)', () => {
    const csv = ['category,name,price', 'Snacks,Samosa,12.50'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]?.pricePaise).toBe(1250);
  });

  it('treats headers case-insensitively and trims them', () => {
    const csv = [' Category , NAME , Price ', 'Beverages,Tea,40'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]?.category).toBe('Beverages');
    expect(rows[0]?.name).toBe('Tea');
    expect(rows[0]?.pricePaise).toBe(4000);
  });

  it('defaults optional columns: no description, veg=true, spice=0', () => {
    const csv = ['category,name,price', 'Beverages,Tea,40'].join('\n');
    const { rows } = parseMenuCsv(csv);
    expect(rows[0]).toEqual({
      category: 'Beverages',
      name: 'Tea',
      pricePaise: 4000,
      description: null,
      isVegetarian: true,
      spiceLevel: 0,
    });
  });

  it('parses veg no/false/0 as non-vegetarian', () => {
    const csv = [
      'category,name,price,veg',
      'Mains,Chicken Curry,320,no',
      'Mains,Fish Fry,300,false',
      'Mains,Mutton,400,0',
      'Mains,Egg Bhurji,180,yes',
    ].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.isVegetarian)).toEqual([false, false, false, true]);
  });

  it('skips fully blank lines without error', () => {
    const csv = ['category,name,price', 'Beverages,Tea,40', '', '   ', 'Beverages,Coffee,60'].join(
      '\n',
    );
    const { rows, errors } = parseMenuCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it('handles quoted fields containing commas', () => {
    const csv = [
      'category,name,price,description',
      'Mains,"Rajma, Chawal",220,"Kidney beans, rice & salad"',
    ].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]?.name).toBe('Rajma, Chawal');
    expect(rows[0]?.description).toBe('Kidney beans, rice & salad');
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const csv = ['category,name,price', 'Mains,"The ""Big"" Thali",350'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]?.name).toBe('The "Big" Thali');
  });

  it('handles CRLF line endings', () => {
    const csv = 'category,name,price\r\nBeverages,Tea,40\r\n';
    const { rows, errors } = parseMenuCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('errors when required header columns are missing', () => {
    const csv = ['name,price', 'Tea,40'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(1);
    expect(errors[0]?.message).toMatch(/category/i);
  });

  it('errors on a completely empty input', () => {
    const { rows, errors } = parseMenuCsv('');
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/empty/i);
  });

  it('errors on a header-only file (no data rows)', () => {
    const { rows, errors } = parseMenuCsv('category,name,price');
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/no/i);
  });

  it('reports a row with a missing required name and keeps good rows', () => {
    const csv = ['category,name,price', 'Beverages,,40', 'Beverages,Coffee,60'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Coffee');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toMatch(/name/i);
  });

  it('reports a row with a missing category', () => {
    const csv = ['category,name,price', ',Coffee,60'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/category/i);
  });

  it('reports a non-numeric price', () => {
    const csv = ['category,name,price', 'Beverages,Tea,abc'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/price/i);
  });

  it('reports a negative price', () => {
    const csv = ['category,name,price', 'Beverages,Tea,-5'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/price/i);
  });

  it('reports a missing price', () => {
    const csv = ['category,name,price', 'Beverages,Tea,'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/price/i);
  });

  it('reports an out-of-range spice level', () => {
    const csv = ['category,name,price,spice', 'Mains,Inferno,200,7'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/spice/i);
  });

  it('reports a non-numeric spice level', () => {
    const csv = ['category,name,price,spice', 'Mains,Inferno,200,hot'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/spice/i);
  });

  it('rejects an unparseable veg value', () => {
    const csv = ['category,name,price,veg', 'Mains,Tofu,200,maybe'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toMatch(/veg/i);
  });

  it('reports the correct line number across blank lines', () => {
    const csv = ['category,name,price', 'Beverages,Tea,40', '', 'Beverages,Coffee,abc'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(4);
  });

  it('accumulates multiple row errors', () => {
    const csv = ['category,name,price', 'Beverages,,40', 'Beverages,Tea,abc'].join('\n');
    const { rows, errors } = parseMenuCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it('the bundled sample CSV parses cleanly', () => {
    const { rows, errors } = parseMenuCsv(SAMPLE_MENU_CSV);
    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
  });
});
