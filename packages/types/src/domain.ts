/**
 * Core domain entities — kept independent of database concerns.
 * Database row types live in @cafespace/db; these are the API/UI shapes.
 */

export type CafeId = string;

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
