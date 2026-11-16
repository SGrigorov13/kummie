import { z } from "zod";
import { ShippingCountry } from "./account";

/**
 * Public trader information (ЗЗП, Н-18) and the delivery terms, shown on the "Данни за търговеца"
 * and "Плащане и доставка" pages. Everything comes from Admin → Фирма (A4, A5); empty until filled.
 */
export const TraderInfo = z.object({
  legalName: z.string().nullable(),
  eik: z.string().nullable(),
  vatNumber: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** Number НАП gave the e-shop (Приложение № 33). */
  eShopNumber: z.string().nullable(),
  delivery: z.object({
    fees: z.array(z.object({ country: ShippingCountry, feeCents: z.number().int() })),
    /** Free delivery from this goods value (D-026). */
    freeFromCents: z.number().int(),
  }),
});
export type TraderInfo = z.infer<typeof TraderInfo>;
