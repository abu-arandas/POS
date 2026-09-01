import { sidebar } from './sidebar';
import { fleet } from './fleet';
import { catalogPush } from './catalogPush';
import { storeAdmin } from './storeAdmin';
import { fleetReport } from './fleetReport';
import { receipt } from './receipt';
import { receiptCfg } from './receiptCfg';
import { errorBoundary } from './errorBoundary';
import { shift } from './shift';
import { print } from './print';
import { settings } from './settings';
import { lockscreen } from './lockscreen';
import { qrmenu } from './qrmenu';
import { dashboard } from './dashboard';
import { register } from './register';
import { common } from './common';
import { inventory } from './inventory';
import { history } from './history';
import { customers } from './customers';
import { categories } from './categories';

export const en = {
  translation: {
    sidebar,
    fleet,
    catalogPush,
    storeAdmin,
    fleetReport,
    receipt,
    receiptCfg,
    errorBoundary,
    shift,
    print,
    settings,
    lockscreen,
    qrmenu,
    dashboard,
    register,
    common,
    inventory,
    history,
    customers,
    categories,
  },
} as const;
