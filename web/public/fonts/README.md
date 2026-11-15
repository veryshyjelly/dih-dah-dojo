# Dojo font assets

Unmodified WOFF2 assets from the official
[Monaspace v1.400 release](https://github.com/githubnext/monaspace/tree/v1.400/fonts/Web%20Fonts).
The bundled [OFL.txt](OFL.txt) covers all five families, including reserved names.
No subsetting, font modification, Nerd Font glyphs or external runtime font service
is used. Local filenames identify the version; Neon retains its existing URL.

| Local asset | Official cut | Bytes | Role |
| --- | --- | ---: | --- |
| MonaspaceNeon.woff2 | Neon Var | 510832 | Everyday UI and literal practice data |
| MonaspaceArgonVar-v1.400.woff2 | Argon Var | 540384 | Headings |
| MonaspaceKryptonVar-v1.400.woff2 | Krypton Var | 445408 | Instruments and numeric values |
| MonaspaceXenon-Regular-v1.400.woff2 | Xenon Regular | 216032 | Explanatory prose |
| MonaspaceRadon-Medium-v1.400.woff2 | Radon Medium | 232700 | Brief coaching accents |

SHA-256 checksums:

```text
6569968f448ae856ab5b57dff1f13b109b220ca8e3f664169e135fcb5c4f0721  MonaspaceNeon.woff2
ad0ad84cb65ab56ea82b3098800403aeec1bbc445ba24da0dc87f439b3883db6  MonaspaceArgonVar-v1.400.woff2
f1357532c080c3f976e35ec1d18a92b423d4261103acb7d2cdccffa03a989fad  MonaspaceKryptonVar-v1.400.woff2
eb34d971e2bf956230ba2e5bd621af7310d4c739057ae7df7b8a38ca95b03cf6  MonaspaceXenon-Regular-v1.400.woff2
ad90529a273267d72c4e1fb9e6feed33073a7b79c301466488a0abbc39c57e3c  MonaspaceRadon-Medium-v1.400.woff2
```

Variable cuts originate in `Variable Web Fonts/Monaspace FAMILY/Monaspace FAMILY Var.woff2`;
static cuts in `Static Web Fonts/Monaspace FAMILY/MonaspaceFAMILY-WEIGHT.woff2`.
The portfolio totals 1,945,356 bytes, 931,256 fewer than five full variable faces.
Only the existing Neon face is preloaded; CSS requests other roles when used.
The static accent cuts have explicit weights and no synthetic bold or italic.
