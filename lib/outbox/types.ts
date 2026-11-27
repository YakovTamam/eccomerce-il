import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/orders/status";

export const orderStatusSchema = z.enum(ORDER_STATUSES);
