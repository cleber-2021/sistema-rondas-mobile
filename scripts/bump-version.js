// Incrementa automaticamente o "version" (versionName) do app.json.
// Ex.: 1.0.0 -> 1.0.1 -> 1.0.2 ...
// É o número que o MDM compara para distribuir a atualização.
const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const partes = String(appJson.expo.version).split('.').map((n) => parseInt(n, 10) || 0);
while (partes.length < 3) partes.push(0);
partes[2] = partes[2] + 1; // incrementa o patch (último número)

appJson.expo.version = partes.join('.');
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

console.log('✅ Nova versão (versionName):', appJson.expo.version);
