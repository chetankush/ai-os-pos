/**
 * Customer (CRM / loyalty foundation) domain types + API request/response
 * envelopes. Identified by phone within a cafe. Money is integer paise.
 */

import type { CafeId, Order } from './domain.js';

export type CustomerId = string;

/** A customer of a cafe, with denormalised lifetime totals. */
export interface Customer {
  id: CustomerId;
  cafeId: CafeId;
  phone: string;
  name: string | null;
  totalOrders: number;
  totalSpentPaise: number;
  /** ISO timestamp of the most recent order, or null if none recorded. */
  lastOrderAt: string | null;
  createdAt: string;
}

export interface CustomerListResponse {
  customers: Customer[];
}

export interface CustomerResponse {
  customer: Customer;
  /** The customer's recent orders, newest first. */
  orders: Order[];
}
