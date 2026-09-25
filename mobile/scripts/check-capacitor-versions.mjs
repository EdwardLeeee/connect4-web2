// The web bundle (frontend/) and the native projects (mobile/) must use the same
// Capacitor release, pinned exactly; Dependabot ignores @capacitor/* in both places.
import { readFileSync } from "node:fs";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const capacitor = (pkg) =>
  Object.fromEntries(
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) =>
      name.startsWith("@capacitor/"),
    ),
  );

const web = capacitor(read("../../frontend/package.json"));
const native = capacitor(read("../package.json"));
const errors = [];

for (const [name, spec] of Object.entries({ ...web, ...native })) {
  if (!/^\d+\.\d+\.\d+$/.test(spec)) errors.push(`${name} must be pinned to an exact version, not "${spec}"`);
}
for (const [name, spec] of Object.entries(web)) {
  if (native[name] !== spec) errors.push(`${name}: frontend has ${spec}, mobile has ${native[name] ?? "nothing"}`);
}
const platform = ["core", "cli", "android", "ios"].map((name) => native[`@capacitor/${name}`]);
if (new Set(platform).size !== 1) errors.push(`core, cli, android and ios differ in mobile: ${platform.join(", ")}`);

if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}
const shared = Object.keys(web);
console.log(
  shared.length
    ? `Capacitor versions match: ${shared.map((name) => `${name}@${web[name]}`).join(", ")}`
    : "frontend has no @capacitor packages yet; mobile pins are exact",
);
