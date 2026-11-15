# Callsign research and provenance

Research date: 2026-11-15. Three agents audited the existing implementation,
compared trainers and examined international formats and operating practice.

- RufzXP trains whole-call keyboard entry and adapts speed after success/failure;
  it explicitly distinguishes its memory-copying exercise from QRM simulation.
  https://www.rufzxp.net/home.htm
- LCWO offers callsign complexity filters, fixed/adaptive pace and error review.
  https://lcwo.net/changelog
- CWops' Fundamental curriculum initially excludes difficult long/slashed calls
  and independently controls character speed and effective spacing.
  https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm
- Morse Runner separates clean single-call reception from exchanges and optional
  noise, interference and fading. This motivates progressive condition controls.
  https://raw.githubusercontent.com/VE3NEA/MorseRunner/master/Readme.txt
- ITU Article 19 describes diverse formation rules and international allocation
  series. A first-digit split or one letters-digit-letters template is inadequate.
  https://www.itu.int/en/ITU-R/terrestrial/fmd/Pages/identifications.aspx
- Portable/abroad operation adds receiving forms whose licensing requirements
  vary nationally; practice examples do not prescribe legal station identifiers.
  https://rsgb.org/main/operating/licensing-novs-visitors/operating-abroad/
- Contest exchanges differ: CQ WW uses RST/zone while CQ WPX uses RS(T)/serial.
  Exercises therefore name and score their exchange separately.
  https://www.cqww.com/rules/ and https://cqwpx.com/rules/
- Public download does not imply redistribution permission. The ARRL DXCC list
  has personal-use restrictions. No third-party station list is bundled here.
  https://www.arrl.org/country-lists-prefixes

The shipped corpus/generator is original synthetic receiving material, with
versioned deterministic identities and explicit call-part metadata. It neither
verifies assignments nor infers DXCC entities or operator endorsement. The staged
curriculum and progress metrics are product decisions informed by these sources,
not evidence of superior learning effectiveness.
