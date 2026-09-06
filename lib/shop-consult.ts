export const CONSULT_PRODUCT_ID = 'consult';
export const CONSULT_PRODUCT_TITLE = 'Консультація по товарах';

export const CONSULT_PRODUCT = {
  id: CONSULT_PRODUCT_ID,
  title: CONSULT_PRODUCT_TITLE,
  price: 0,
} as const;

export function isConsultOrder(order: {
  source?: string;
  product?: { id?: string };
}): boolean {
  return order.source === 'consult' || order.product?.id === CONSULT_PRODUCT_ID;
}
