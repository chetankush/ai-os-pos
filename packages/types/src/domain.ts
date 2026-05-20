/**
 * Core domain entities — kept independent of database concerns.
 * Database row types live in @mehfil/db; these are the API/UI shapes.
 */

export type CafeId = string;
export type MenuCategoryId = string;
export type MenuItemId = string;

export interface Cafe {
  id: CafeId;
  ownerId: string;
  name: string;
  slug: string;
  gstin: string | null;
  fssai: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  isAirConditioned: boolean;
  primaryColor: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: MenuCategoryId;
  cafeId: CafeId;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: MenuItemId;
  cafeId: CafeId;
  categoryId: MenuCategoryId;
  name: string;
  description: string | null;
  basePricePaise: number;
  imageUrl: string | null;
  isVegetarian: boolean;
  isVegan: boolean;
  containsEgg: boolean;
  spiceLevel: number;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[];
}
