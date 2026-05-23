import { networkInterfaces } from "node:os";

export function getLanUrls(port, interfaces = networkInterfaces()) {
  const candidates = Object.entries(interfaces)
    .filter(([name]) => !isVirtualInterface(name))
    .flatMap(([, entries]) => entries ?? [])
    .filter((entry) => entry.family === "IPv4")
    .filter((entry) => !entry.internal);

  const preferred =
    candidates.length > 1
      ? candidates.filter((entry) => !/[.]([12])$/.test(entry.address))
      : candidates;

  return (preferred.length ? preferred : candidates).map(
    (entry) => `http://${entry.address}:${port}`
  );
}

function isVirtualInterface(name) {
  return /virtual|vethernet|vmware|virtualbox|loopback|bluetooth|hyper-v/i.test(
    name
  );
}
