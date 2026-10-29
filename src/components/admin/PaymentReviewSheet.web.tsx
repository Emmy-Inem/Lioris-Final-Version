import { lazyWeb } from '../lazyWeb';
import type { PaymentReviewSheet as PaymentReviewSheetImpl } from './PaymentReviewSheet';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./PaymentReviewSheet.tsx.
export const PaymentReviewSheet = lazyWeb<typeof PaymentReviewSheetImpl>(() => import('./PaymentReviewSheet.tsx').then((m) => m.PaymentReviewSheet), { open: (props) => props.eventId != null });
