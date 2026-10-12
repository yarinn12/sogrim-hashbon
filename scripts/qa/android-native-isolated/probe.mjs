import { launch, inspectExpression } from './driver.mjs';
const page = await launch();
try {
  console.log(JSON.stringify(await page.evaluate(inspectExpression), null, 2));
  console.log(JSON.stringify({ capabilities: await page.evaluate('Capacitor.Plugins.SogrimCapabilities.getCapabilities()') }));
} finally { page.close(); }
