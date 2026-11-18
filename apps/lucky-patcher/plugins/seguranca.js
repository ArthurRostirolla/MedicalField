// Config plugin de endurecimento, Android e iOS. O que e comum fica no codigo JS (banco cifrado com
// SQLCipher, chave no Keystore/Keychain "so neste aparelho"); aqui fica o que e de cada plataforma:
//  Android
//  - nada vai para backup na nuvem nem transferencia entre aparelhos;
//  - release: trafego em claro proibido (servidor so por HTTPS);
//  - debug: trafego em claro liberado (Metro e gateway local do emulador). O recurso de
//    src/debug sobrepoe o de src/main so na variante debug.
//  iOS
//  - App Transport Security explicito: so HTTPS, com excecao apenas para localhost (simulador).
//  - O backup do iCloud leva o arquivo do banco, mas cifrado e sem a chave (Keychain THIS_DEVICE_ONLY).
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const EXCLUIR = ['root', 'database', 'sharedpref', 'file', 'external']
  .map((dominio) => `        <exclude domain="${dominio}" />`)
  .join('\n');

const ARQUIVOS = {
  'main/res/xml/data_extraction_rules.xml': `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
${EXCLUIR}
    </cloud-backup>
    <device-transfer>
${EXCLUIR}
    </device-transfer>
</data-extraction-rules>
`,
  'main/res/xml/network_security_config.xml': `<?xml version="1.0" encoding="utf-8"?>
<!-- Release: trafego em claro proibido. O servidor precisa de HTTPS. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
</network-security-config>
`,
  'debug/res/xml/network_security_config.xml': `<?xml version="1.0" encoding="utf-8"?>
<!-- Debug: libera HTTP para o Metro e para o gateway local (10.0.2.2) no emulador. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`,
};

module.exports = function seguranca(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSAppTransportSecurity = { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true };
    return cfg;
  });
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = 'false';
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    delete app.$['android:usesCleartextTraffic'];
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const src = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src');
      for (const [relativo, conteudo] of Object.entries(ARQUIVOS)) {
        const destino = path.join(src, relativo);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, conteudo);
      }
      return cfg;
    },
  ]);
};
