// Seed realistic dialysis consumables inventory data. Run once: node seed.mjs
import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

const [existing] = await sql`SELECT COUNT(*)::int AS c FROM items`;
if (existing.c > 0) {
  console.log("Database already seeded — skipping.");
  await sql.end();
  process.exit(0);
}

// ── Items ────────────────────────────────────────────────────────────────────
const items = [
  ["FX 60 High-Flux Dialyzer", "dialyzer", "unit", 15, 25, "Fresenius FX 60, 1.6 m² synthetic membrane, high flux"],
  ["FX 80 High-Flux Dialyzer", "dialyzer", "unit", 20, 35, "Fresenius FX 80, 1.8 m² synthetic membrane, high flux"],
  ["FX 100 High-Flux Dialyzer", "dialyzer", "unit", 10, 20, "Fresenius FX 100, 2.2 m² synthetic membrane, high flux"],
  ["CombiSet Bloodline Set (200 cm)", "bloodline", "unit", 25, 40, "Arterial + venous line with integrated transducer protectors"],
  ["SurDial Bloodline Set (185 cm)", "bloodline", "unit", 20, 30, "Nipro SURDIAL lines with Y-connector"],
  ["Fistula Needle 15G", "needles", "unit", 30, 60, "15G blue buttonhole-compatible fistula needle"],
  ["Fistula Needle 16G", "needles", "unit", 30, 60, "16G grey fistula needle, bevel back"],
  ["Fistula Needle 17G", "needles", "unit", 25, 50, "17G green fistula needle"],
  ["Catheter Kit (12F x 23 cm)", "needles", "unit", 5, 10, "Tunneled cuffed hemodialysis catheter insertion kit"],
  ["Sodium Chloride 0.9% 500 mL", "saline", "bag", 40, 80, "0.9% NaCl 500 mL bag for priming and rinse-back"],
  ["Sodium Chloride 0.9% 1000 mL", "saline", "bag", 30, 60, "0.9% NaCl 1000 mL bag"],
  ["Heparin 5000 IU/mL 5 mL vial", "medications", "vial", 20, 40, "Unfractionated heparin for circuit anticoagulation"],
  ["Epoetin Alfa 4000 IU (ESA)", "medications", "vial", 15, 30, "Erythropoiesis-stimulating agent"],
  ["IV Iron Sucrose 5 mL", "medications", "vial", 15, 30, "Iron sucrose 20 mg/mL for IV administration"],
  ["Citric Acid Disinfection Stick", "disinfectants", "unit", 50, 80, "Single-use citric acid stick for machine disinfection cycle"],
  ["Liquid Citric Acid 20% 5 L", "disinfectants", "container", 4, 8, "Bulk liquid citric acid for machine disinfection"],
  ["Peracetic Acid Disinfectant", "disinfectants", "unit", 30, 50, "High-level disinfectant for machine and station"],
  ["Chlorhexidine Prep Swabs", "disinfectants", "unit", 100, 200, "2% chlorhexidine gluconate + 70% IPA prep swabs"],
  ["Nitrile Exam Gloves (Box/100)", "PPE", "box", 20, 40, "Powder-free nitrile exam gloves, medium"],
  ["Sterile Gauze 4x4 (Pack/100)", "PPE", "pack", 15, 25, "Sterile gauze pads for post-needle dressings"],
  ["Dialysis Dressing Kit", "PPE", "unit", 40, 70, "Pre-cut dressing with tape for needle sites"],
  ["Tourniquet", "PPE", "unit", 15, 25, "Single-use tourniquet"],
  ["Sharps Container 5 L", "PPE", "unit", 10, 15, "Puncture-resistant sharps disposal container"],
  ["Peritoneal Dialysate 1.5% 2 L", "PD supplies", "bag", 60, 120, "PD dialysate 1.5% dextrose, 2 L bag"],
  ["Peritoneal Dialysate 2.5% 2 L", "PD supplies", "bag", 40, 80, "PD dialysate 2.5% dextrose, 2 L bag"],
  ["PD Transfer Set", "PD supplies", "unit", 8, 15, "Transfer set for cycler PD, replaced every 6 months"],
  ["PD Drain Bag 4 L", "PD supplies", "unit", 20, 40, "4 L overnight drain collection bag"],
];
for (const [name, category, unitOfMeasure, minStockLevel, reorderLevel, description] of items) {
  await sql`INSERT INTO items ${sql({ name, category, unitOfMeasure, minStockLevel, reorderLevel, description })}`;
}

const itemRows = await sql`SELECT id, name FROM items ORDER BY id`;
const byName = Object.fromEntries(itemRows.map((r) => [r.name, r.id]));

const today = new Date();
const d = (offset) => {
  const x = new Date(today);
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

// ── Batches (mix of expiry windows to demonstrate alerts) ────────────────────
const batches = [
  [byName["FX 60 High-Flux Dialyzer"], "LOT-DFX60-2411", "Fresenius Kabi", 60, 48, d(25), false],
  [byName["FX 60 High-Flux Dialyzer"], "LOT-DFX60-2501", "Fresenius Kabi", 40, 38, d(180), false],
  [byName["FX 80 High-Flux Dialyzer"], "LOT-DFX80-2410", "Fresenius Kabi", 50, 35, d(8), false],
  [byName["FX 80 High-Flux Dialyzer"], "LOT-DFX80-2502", "Fresenius Kabi", 45, 45, d(210), false],
  [byName["FX 100 High-Flux Dialyzer"], "LOT-DFX100-2503", "Fresenius Kabi", 30, 18, d(145), false],
  [byName["CombiSet Bloodline Set (200 cm)"], "LOT-BCS24-0914", "Fresenius Medical Care", 80, 62, d(12), false],
  [byName["CombiSet Bloodline Set (200 cm)"], "LOT-BCS25-0210", "Fresenius Medical Care", 60, 60, d(240), false],
  [byName["SurDial Bloodline Set (185 cm)"], "LOT-SD185-2412", "Nipro", 55, 30, d(60), false],
  [byName["Fistula Needle 15G"], "LOT-FN15-2411", "B. Braun", 100, 72, d(45), false],
  [byName["Fistula Needle 15G"], "LOT-FN15-2502", "B. Braun", 80, 80, d(300), false],
  [byName["Fistula Needle 16G"], "LOT-FN16-2501", "B. Braun", 90, 55, d(190), false],
  [byName["Fistula Needle 17G"], "LOT-FN17-2412", "B. Braun", 70, 24, d(110), false],
  [byName["Catheter Kit (12F x 23 cm)"], "LOT-CK12-2409", "Arrow International", 12, 6, d(-5), false],
  [byName["Catheter Kit (12F x 23 cm)"], "LOT-CK12-2501", "Arrow International", 10, 10, d(270), false],
  [byName["Sodium Chloride 0.9% 500 mL"], "LOT-NS500-2410", "B. Baxter", 120, 70, d(15), false],
  [byName["Sodium Chloride 0.9% 500 mL"], "LOT-NS500-2503", "B. Baxter", 90, 90, d(200), false],
  [byName["Sodium Chloride 0.9% 1000 mL"], "LOT-NS1000-2502", "B. Baxter", 80, 30, d(175), false],
  [byName["Heparin 5000 IU/mL 5 mL vial"], "LOT-HP5-2411", "Pfizer", 60, 35, d(70), false],
  [byName["Heparin 5000 IU/mL 5 mL vial"], "LOT-HP5-2501", "Pfizer", 45, 45, d(260), false],
  [byName["Epoetin Alfa 4000 IU (ESA)"], "LOT-EP4K-2412", "Amgen", 40, 22, d(88), false],
  [byName["IV Iron Sucrose 5 mL"], "LOT-FES-2501", "Vifor Pharma", 35, 18, d(150), false],
  [byName["Citric Acid Disinfection Stick"], "LOT-CA24-1112", "Fresenius Medical Care", 150, 90, d(120), false],
  [byName["Liquid Citric Acid 20% 5 L"], "LOT-LCA25-01", "Renal Tech", 10, 5, d(230), false],
  [byName["Peracetic Acid Disinfectant"], "LOT-PAA24-12", "Steris", 60, 32, d(65), false],
  [byName["Chlorhexidine Prep Swabs"], "LOT-CHG25-03", "Medline", 250, 140, d(195), false],
  [byName["Nitrile Exam Gloves (Box/100)"], "LOT-NIT25-02", "Superior Glove", 50, 30, d(280), false],
  [byName["Nitrile Exam Gloves (Box/100)"], "LOT-NIT24-10", "Superior Glove", 25, 18, d(2), false],
  [byName["Sterile Gauze 4x4 (Pack/100)"], "LOT-GZ25-01", "Medline", 40, 17, d(205), false],
  [byName["Dialysis Dressing Kit"], "LOT-DDK24-12", "Curity", 100, 42, d(95), false],
  [byName["Tourniquet"], "LOT-TQ25-02", "Medline", 40, 16, d(265), false],
  [byName["Sharps Container 5 L"], "LOT-SH5-2411", "BD", 25, 12, d(360), false],
  [byName["Peritoneal Dialysate 1.5% 2 L"], "LOT-PD15-2411", "Baxter", 120, 65, d(22), false],
  [byName["Peritoneal Dialysate 1.5% 2 L"], "LOT-PD15-2502", "Baxter", 90, 90, d(225), false],
  [byName["Peritoneal Dialysate 2.5% 2 L"], "LOT-PD25-2412", "Baxter", 70, 42, d(75), false],
  [byName["PD Transfer Set"], "LOT-PDTS-2501", "Baxter", 20, 9, d(200), false],
  [byName["PD Drain Bag 4 L"], "LOT-PDDB-2412", "Baxter", 45, 21, d(140), false],
];
for (const [itemId, lotNumber, supplier, quantityReceived, quantityOnHand, expiryDate, isQuarantined] of batches) {
  await sql`INSERT INTO batches ${sql({ itemId, lotNumber, supplier, quantityReceived, quantityOnHand, expiryDate, isQuarantined })}`;
}

const batchRows = await sql`SELECT id, "itemId", "lotNumber" FROM batches ORDER BY id`;
const batchByItem = {};
for (const b of batchRows) {
  batchByItem[b.itemId] = batchByItem[b.itemId] || [];
  batchByItem[b.itemId].push(b);
}

// ── Recent transactions ──────────────────────────────────────────────────────
const txns = [
  ["stock-in", "issued", 60, "Fresenius Kabi", "LOT-DFX60-2501", d(180), "Scheduled monthly restock"],
  ["stock-in", "issued", 40, "Fresenius Kabi", "LOT-DFX60-2411", d(25), "Back-order fulfillment"],
  ["stock-in", "issued", 45, "Fresenius Kabi", "LOT-DFX80-2502", d(210), "Monthly restock"],
  ["stock-in", "issued", 60, "Fresenius Medical Care", "LOT-BCS25-0210", d(240), "Monthly restock"],
  ["stock-in", "issued", 55, "Nipro", "LOT-SD185-2412", d(60), "Monthly restock"],
  ["stock-in", "issued", 80, "B. Braun", "LOT-FN15-2502", d(300), "Quarterly needle order"],
  ["stock-in", "issued", 90, "B. Baxter", "LOT-NS500-2503", d(200), "Saline restock"],
  ["stock-in", "issued", 45, "Pfizer", "LOT-HP5-2501", d(260), "Monthly medication order"],
  ["stock-in", "issued", 250, "Medline", "LOT-CHG25-03", d(195), "PPE bulk order"],
  ["stock-in", "issued", 120, "Baxter", "LOT-PD15-2502", d(225), "PD supply restock"],
  ["stock-out", "issued", 12, null, null, null, "Morning shift usage"],
  ["stock-out", "issued", 12, null, null, null, "Morning shift usage"],
  ["stock-out", "issued", 24, null, null, null, "Morning shift needles"],
  ["stock-out", "issued", 15, null, null, null, "Morning shift saline"],
  ["stock-out", "adjusted", 2, null, null, null, "Count correction during cycle count"],
  ["stock-out", "written off", 3, null, null, null, "Damaged packaging at receipt"],
  ["stock-in", "returned", 5, null, null, null, "Returned excess stock to ward"],
];
const txItems = [
  byName["FX 60 High-Flux Dialyzer"],
  byName["FX 60 High-Flux Dialyzer"],
  byName["FX 80 High-Flux Dialyzer"],
  byName["CombiSet Bloodline Set (200 cm)"],
  byName["SurDial Bloodline Set (185 cm)"],
  byName["Fistula Needle 15G"],
  byName["Sodium Chloride 0.9% 500 mL"],
  byName["Heparin 5000 IU/mL 5 mL vial"],
  byName["Chlorhexidine Prep Swabs"],
  byName["Peritoneal Dialysate 1.5% 2 L"],
  byName["FX 60 High-Flux Dialyzer"],
  byName["FX 80 High-Flux Dialyzer"],
  byName["Fistula Needle 15G"],
  byName["Sodium Chloride 0.9% 500 mL"],
  byName["Tourniquet"],
  byName["Nitrile Exam Gloves (Box/100)"],
  byName["Sterile Gauze 4x4 (Pack/100)"],
];
for (let i = 0; i < txns.length; i++) {
  const [type, reason, quantity, supplier, lotNumber, expiryDate, notes] = txns[i];
  const itemId = txItems[i];
  let batchId = null;
  if (lotNumber) {
    const match = batchRows.find((b) => b.itemId === itemId && b.lotNumber === lotNumber);
    if (match) batchId = match.id;
  }
  const performedAt = new Date(Date.now() - (txns.length - i) * 2 * 3600 * 1000);
  await sql`INSERT INTO stock_transactions ${sql({
    itemId,
    batchId,
    type,
    reason,
    quantity,
    supplier,
    lotNumber,
    expiryDate,
    notes,
    performedBy: "Nurse A. Rivera",
    performedAt,
  })}`;
}

// ── Consumption templates ────────────────────────────────────────────────────
const hdTemplates = [
  ["FX 60 High-Flux Dialyzer", 1, "Dialyzer"],
  ["FX 80 High-Flux Dialyzer", 1, "Dialyzer (alt.)"],
  ["CombiSet Bloodline Set (200 cm)", 1, "Bloodline set"],
  ["SurDial Bloodline Set (185 cm)", 1, "Bloodline set (alt.)"],
  ["Fistula Needle 15G", 2, "Fistula needles"],
  ["Sodium Chloride 0.9% 500 mL", 2, "Saline (prime + rinse-back)"],
  ["Heparin 5000 IU/mL 5 mL vial", 1, "Heparin (protocol-based)"],
  ["Chlorhexidine Prep Swabs", 2, "Access site prep"],
  ["Dialysis Dressing Kit", 2, "Post-needle dressings"],
  ["Nitrile Exam Gloves (Box/100)", 1, "Gloves"],
  ["Citric Acid Disinfection Stick", 1, "Machine disinfection cycle"],
];
const pdTemplates = [
  ["Peritoneal Dialysate 1.5% 2 L", 4, "Dialysate exchanges"],
  ["Peritoneal Dialysate 2.5% 2 L", 2, "Dialysate exchanges (higher conc.)"],
  ["PD Transfer Set", 1, "Transfer set (6-monthly)"],
  ["PD Drain Bag 4 L", 1, "Overnight drain bag"],
  ["Chlorhexidine Prep Swabs", 2, "Exit-site antisepsis"],
  ["Nitrile Exam Gloves (Box/100)", 1, "Gloves"],
];
for (const [sessionType, templates] of [["HD", hdTemplates], ["PD", pdTemplates]]) {
  for (const [name, defaultQty, label] of templates) {
    await sql`INSERT INTO consumption_templates ${sql({ sessionType, itemId: byName[name], defaultQty, label })}`;
  }
}

// ── Recent treatment sessions with consumables ───────────────────────────────
const sessions = [
  ["Patient A. Tan", "1", "morning", "HD", -1],
  ["Patient M. Reyes", "2", "morning", "HD", -1],
  ["Patient J. Cruz", "3", "morning", "HD", -1],
  ["Patient L. Santos", "5", "morning", "HD", -1],
  ["Patient R. Okafor", "7", "afternoon", "HD", -1],
  ["Patient S. Nguyen", "8", "afternoon", "HD", -1],
  ["Patient K. Patel", "10", "afternoon", "HD", -1],
  ["Patient D. Ibrahim", "12", "evening", "HD", -1],
  ["Patient F. Garcia", "6", "afternoon", "PD", -1],
];
for (const [patientName, chair, shift, sessionType, dayOffset] of sessions) {
  const [{ id: sessionId }] = await sql`INSERT INTO treatment_sessions ${sql({
    patientName,
    chair,
    shift,
    sessionType,
    sessionDate: d(dayOffset),
    status: "completed",
    createdBy: "Nurse A. Rivera",
  })} RETURNING id`;
  const templates = sessionType === "HD" ? hdTemplates : pdTemplates;
  for (const [name, quantity] of templates) {
    const itemId = byName[name];
    const b = batchByItem[itemId] && batchByItem[itemId][0];
    await sql`INSERT INTO session_consumables ${sql({ sessionId, itemId, batchId: b ? b.id : null, quantity })}`;
  }
}

await sql.end();
console.log("Seed completed successfully.");
