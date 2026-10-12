/** Hostile land-unit SIDC resolution for synthetic traffic JSONL imports. */

export const NEUTRAL_TRAFFIC_REPORT_SIDC = "10041000000000000000";
const UNKNOWN_SIDC = "10011000000000000000";

type EquipmentRule = [RegExp, string];

const NEMO_EQUIPMENT_SIDC: Record<string, string> = {
  "R-330ZH Zhitel EW system": "10061000001505030000",
  "ZALA-421-16E2 UAS": "10061000001219000000",
  "2S9 Nona-S 120mm SP mortar": "10061000001308010000",
  "2S19 Msta-S 152mm SP howitzer": "10061000001303010000",
  "RPG-7B antitank launcher": "10061000001204000000",
  "BRDM-2 reconnaissance vehicle": "10061000001213000000",
  "BMP-2 infantry fighting vehicle": "10061000001211050000",
  "BTR-80 armored personnel carrier": "10061000001617000000",
  "IMR-3M obstacle-clearing vehicle": "10061000001407000000",
  "AT-14 Kornet ATGM": "10061000001204000000",
  "SA-18 Grouse (9K38 Igla) MANPADS": "10061000001301020000",
  "UR-77 mine-clearing vehicle": "10061000001407000000",
  "T-90A main battle tank": "10061000001205000000",
  "Su-25 Frogfoot CAS aircraft": "10061000001219000000",
  "Tank mine roller": "10061000001205000000",
  "Tank mine plow": "10061000001205000000",
  "BAT-2 tracklayer": "10061000001407000000",
};

const EQUIPMENT_RULES: EquipmentRule[] = [
  [/2S9|Nona-S/i, "10061000001308010000"],
  [/UR-77|mine-clearing vehicle/i, "10061000001407000000"],
  [/mine roller|mine plow/i, "10061000001205000000"],
  [/Su-25|Frogfoot/i, "10061000001219000000"],
  [/Msta-S|2S19|2S3\b/i, "10061000001303010000"],
  [/R-330ZH|Zhitel|TARAN|LEER-3/i, "10061000001505030000"],
  [/Grouse|Igla|MANPADS|SA-18|SA-13/i, "10061000001301020000"],
  [/Kornet|AT-14|\bATGM\b|RPG-7/i, "10061000001204000000"],
  [/ZALA|ORLAN-10|\bUAV\b|\bUAS\b/i, "10061000001219000000"],
  [/2S31|120-?\s?mm Mortar|\bMortar\b/i, "10061000001308010000"],
  [/T-90|T-80|\bTank\b/i, "10061000001205000000"],
  [/BMP-3|BMP-2|BMP-1|\bBMP\b|\bIFV\b/i, "10061000001211050000"],
  [/BRDM-2|\bBRDM\b|Recon/i, "10061000001213000000"],
  [/BTR-80|\bBTR\b/i, "10061000001617000000"],
  [/IMR-3M|IMR-2|BAT-2|Engineer/i, "10061000001407000000"],
  [/R-419|R-166|Signal/i, "10061000001110000000"],
];

function sidcForText(text: string): string {
  for (const [pattern, sidc] of EQUIPMENT_RULES) {
    if (pattern.test(text)) return sidc;
  }
  return UNKNOWN_SIDC;
}

export function resolveTrafficReportSidc(record: Record<string, unknown>): string {
  const existing = record.sidc;
  if (typeof existing === "string" && existing.length === 20 && existing !== NEUTRAL_TRAFFIC_REPORT_SIDC) {
    return existing;
  }
  const equipment = typeof record.equipment === "string" ? record.equipment : "";
  if (equipment && NEMO_EQUIPMENT_SIDC[equipment]) return NEMO_EQUIPMENT_SIDC[equipment];
  if (equipment) return sidcForText(equipment);
  const reportText = typeof record.report_text === "string" ? record.report_text : "";
  return sidcForText(reportText);
}
