// Descobrir forma correta de importar tiktok-live-connector
import * as TTK from "tiktok-live-connector";

console.log("Exports disponíveis:");
console.log(Object.keys(TTK));

// Procurar por classe de conexão
for (const [key, value] of Object.entries(TTK)) {
  if (typeof value === "function" && key.includes("Connection")) {
    console.log(`\n✅ Encontrado: ${key} (${value.name})`);
  }
}

// Tenta conhecidos
console.log("\nVerificando exports comuns:");
console.log("- TikTokLiveConnection:", typeof TTK.TikTokLiveConnection);
console.log("- WebcastPushConnection:", typeof TTK.WebcastPushConnection);
console.log("- default:", typeof TTK.default);

// Se houver apenas uma função constructor
const funcs = Object.entries(TTK).filter(([k, v]) => typeof v === "function" && k[0] === k[0].toUpperCase());
if (funcs.length === 1) {
  console.log(`\n✅ Única classe encontrada: ${funcs[0][0]}`);
}
