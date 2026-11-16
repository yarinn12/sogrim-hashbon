import {test} from '@playwright/test';
import {verifyNativeCancellation} from '../e2e/helpers/connectedPaymentFixture.mjs';

// Desktop engines support a real mouse wheel. Mobile WebKit's driver rejects
// mouse.wheel before application input; do not skip it or fake a native event.
test.use({serviceWorkers:'block'});
test('native mouse wheel cancels a connected-button capture',async({page,baseURL},info)=>{
  await verifyNativeCancellation(page,baseURL,info,'wheel');
});
