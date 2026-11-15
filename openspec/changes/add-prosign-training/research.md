# Prosign research

Reviewed 2026-11-15. Meanings below are paraphrases; examples in Dojo are original.

- [ITU-R M.1677-1](https://www.itu.int/rec/R-REC-M.1677-1-200910-I), in force:
  [English PDF](https://www.itu.int/dms_pubrec/itu-r/rec/m/R-REC-M.1677-1-200910-I!!PDF-E.pdf),
  printed page 3 and timing section. Authoritative patterns and 1/3/7 timing.
  End of work ...-.-; wait .-...; error eight dots; understood ...-.; starting
  -.-.-. Existing punctuation = is -...- and + is .-.-..
- [EUCW prosigns](https://www.eucw.org/op/en/prosigns.html): joined multi-letter
  signals, practical labels BT/AR/SK/AS/KN/VE/CT, AR usage variation and generator
  verification. CL is spaced. Joined BK is an observed convention.
- [IARU Ethics and Operating Procedures, fourth edition, revision 4.2.0 (2026)](https://www.iaru-r1.org/wp-content/uploads/2026/07/IARU-Ethics-and-Operating-Procedures-for-the-Radio-Amateur-4th-Ed-v4.2.0_F.pdf),
  sections 10.3, 13.2, 13.3, 13.7, 13.8: operating abbreviations versus procedural
  signals, KN/BK joined/spaced variation, separator/end-of-contact use, and varied
  QSO templates. Its inter-letter timing description is inconsistent with ITU;
  implement ITU's three-unit letter gap, not that text's one-dit description.
- [ARRL quick operating aids](https://www.arrl.org/quick-reference-operating-aids):
  K invites a response, KN addresses one station, AS waits, SK ends contact, CL
  closes a station. End-of-message usage depends on traffic context.

Implementation consequences: never ask users to acoustically distinguish AR from
+ or BT from =; do not teach all two-letter abbreviations as joined; make KN
convention visible; no claim that practice results establish on-air proficiency.
