import { createClient } from "../app/node_modules/@supabase/supabase-js";
import { generateLedgerPDF, generateLedgerExcel, generateLedgerCSV } from "../app/src/lib/reports/ledger-formatter";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dmfpeycdzshrkwowmvgr.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const sb = createClient(url, serviceRoleKey);
const businessId = "11111111-1111-4111-8111-111111111111";

async function runTests() {
  console.log("================================================================");
  console.log("STARTING CUSTOMER DUE REPORT PDF & CALCULATION TESTS");
  console.log("================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, msg: string) {
    if (cond) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Fetch Mayur Irrigation data
  const { data: mayurCust, error: mayurErr } = await sb
    .from("customers")
    .select("id, name, company_name")
    .eq("business_id", businessId)
    .eq("name", "M/S.MAYUR IRRIGATION")
    .single();

  if (mayurErr || !mayurCust) {
    console.error("Failed to fetch Mayur Irrigation:", mayurErr);
    process.exit(1);
  }

  const { data: mayurOrders } = await sb
    .from("orders")
    .select("id, order_number, total_amount, paid_amount, due_amount, status")
    .eq("customer_id", mayurCust.id);

  const { data: mayurPayments } = await sb
    .from("payments")
    .select("id, payment_number, amount, order_id, status")
    .eq("customer_id", mayurCust.id);

  const { data: mayurAllocations } = await sb
    .from("customer_advance_allocations")
    .select("*")
    .eq("customer_id", mayurCust.id);

  console.log(`[TEST 1] Testing Mayur Irrigation actual records:`);
  console.log(`  Orders: ${mayurOrders?.length}, Payments: ${mayurPayments?.length}, Advance Allocations: ${mayurAllocations?.length}`);

  // Test ORD-000005: Total 105000, 105000 advance allocated -> Due should be 0!
  const ord5 = mayurOrders?.find((o) => o.order_number === "ORD-000005");
  assert(!!ord5, "Found ORD-000005 in Mayur Irrigation orders");
  if (ord5) {
    const due5 = Math.max(0, Number(ord5.total_amount) - Number(ord5.paid_amount));
    assert(Number(ord5.paid_amount) === 105000, "ORD-000005 paid_amount reflects allocated advance (₹105,000)");
    assert(due5 === 0 && Number(ord5.due_amount) === 0, "ORD-000005 Amount Due is exactly ₹0.00");
  }

  // Test ORD-000007: Total 5250, Paid 0 -> Due should be 5250!
  const ord7 = mayurOrders?.find((o) => o.order_number === "ORD-000007");
  assert(!!ord7, "Found ORD-000007 in Mayur Irrigation orders");
  if (ord7) {
    const due7 = Math.max(0, Number(ord7.total_amount) - Number(ord7.paid_amount));
    assert(due7 === 5250 && Number(ord7.due_amount) === 5250, "ORD-000007 Amount Due is exactly ₹5,250.00");
  }

  // Test ORD-000009: Total 29400, Paid 0 -> Due should be 29400!
  const ord9 = mayurOrders?.find((o) => o.order_number === "ORD-000009");
  assert(!!ord9, "Found ORD-000009 in Mayur Irrigation orders");
  if (ord9) {
    const due9 = Math.max(0, Number(ord9.total_amount) - Number(ord9.paid_amount));
    assert(due9 === 29400 && Number(ord9.due_amount) === 29400, "ORD-000009 Amount Due is exactly ₹29,400.00");
  }

  // 2. Test Advance Payment Handling (Not treating customer advances as unpaid dues)
  console.log(`\n[TEST 2] Testing Customer Advance handling in Closing Balance:`);
  const totalAdvances = mayurPayments?.filter((p) => !p.order_id && p.status === "SUCCESS").reduce((s, p) => s + Number(p.amount), 0) || 0;
  assert(totalAdvances === 1110000, "Mayur Irrigation received ₹1,110,000 in customer advances");

  const pdfData = {
    companyName: "Sankalp Irrigation",
    reportTitle: `${mayurCust.name} - Customer Due & Ledger Statement`,
    periodStr: "All Time",
    openingDebit: 0,
    openingCredit: 0,
    entries: [
      {
        date: "23-Oct-26",
        particulars: "Payment received (Advance) - PAY-000007",
        vchType: "Receipt",
        vchNo: "PAY-000007",
        debit: null,
        credit: 100000,
        amountDue: null,
      },
      {
        date: "23-Oct-26",
        particulars: "Payment received (Advance) - PAY-000008",
        vchType: "Receipt",
        vchNo: "PAY-000008",
        debit: null,
        credit: 10000,
        amountDue: null,
      },
      {
        date: "23-Oct-26",
        particulars: "Invoice ORD-000005",
        vchType: "Sales",
        vchNo: "ORD-000005",
        debit: 105000,
        credit: null,
        amountDue: 0, // Paid via advance adjustment
      },
      {
        date: "23-Oct-26",
        particulars: "Invoice ORD-000007",
        vchType: "Sales",
        vchNo: "ORD-000007",
        debit: 5250,
        credit: null,
        amountDue: 5250, // Unpaid
      },
      {
        date: "23-Oct-26",
        particulars: "Invoice ORD-000009",
        vchType: "Sales",
        vchNo: "ORD-000009",
        debit: 29400,
        credit: null,
        amountDue: 29400, // Unpaid
      },
      {
        date: "23-Oct-26",
        particulars: "Payment received (Advance) - PAY-000009",
        vchType: "Receipt",
        vchNo: "PAY-000009",
        debit: null,
        credit: 1000000,
        amountDue: null,
      },
    ],
  };

  // Generate PDF
  const pdfBase64 = generateLedgerPDF(pdfData);
  assert(pdfBase64.length > 500, "generateLedgerPDF produced non-empty PDF base64 string");

  const pdfRawText = Buffer.from(pdfBase64, "base64").toString("utf-8");
  assert(pdfRawText.includes("Amount Due"), "PDF output contains 'Amount Due' column header");
  assert(pdfRawText.includes("Debit") && pdfRawText.includes("Credit"), "PDF output contains 'Debit' and 'Credit' headers");
  assert(pdfRawText.includes("ORD-000005"), "PDF output contains ORD-000005 entry");
  assert(pdfRawText.includes("ORD-000007"), "PDF output contains ORD-000007 entry");

  // Generate Excel
  const excelHtml = generateLedgerExcel(pdfData);
  assert(excelHtml.includes("Amount Due"), "Excel workbook contains 'Amount Due' column header");
  assert(excelHtml.includes("Closing Balance (Advance)"), "Excel workbook identifies net customer credit as 'Closing Balance (Advance)'");

  // Generate CSV
  const csvText = generateLedgerCSV(pdfData);
  assert(csvText.includes("Date,Particulars,Vch Type,Vch No.,Debit,Credit,Amount Due"), "CSV export contains 'Amount Due' column header");
  assert(csvText.includes("Closing Balance (Advance)"), "CSV export correctly labels advance balance without treating it as unpaid due");

  // 3. Test Samarth Agencies settlement
  console.log(`\n[TEST 3] Testing SAMARTH AGENCIES full settlement records:`);
  const { data: samarthCust } = await sb
    .from("customers")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("name", "SAMARTH AGENCIES")
    .limit(1)
    .single();

  if (samarthCust) {
    const { data: samarthOrders } = await sb
      .from("orders")
      .select("order_number, total_amount, paid_amount, due_amount")
      .eq("customer_id", samarthCust.id);

    let allZeroDue = true;
    for (const o of samarthOrders || []) {
      if (Number(o.due_amount) !== 0) {
        allZeroDue = false;
        console.error(`Order ${o.order_number} has unexpected due: ${o.due_amount}`);
      }
    }
    assert(allZeroDue, "All SAMARTH AGENCIES orders have due_amount = 0 after payment and advance allocation");
  }

  // 4. Test Multi-page pagination
  console.log(`\n[TEST 4] Testing PDF Pagination with >26 entries:`);
  const largeEntries = [];
  for (let i = 1; i <= 60; i++) {
    largeEntries.push({
      date: "20-Oct-26",
      particulars: `Invoice ORD-TEST-${i}`,
      vchType: "Sales",
      vchNo: `ORD-TEST-${i}`,
      debit: 1000,
      credit: null,
      amountDue: 1000,
    });
  }
  const multiPagePdf = generateLedgerPDF({
    companyName: "Sankalp Irrigation",
    reportTitle: "Large Customer Due Test Report",
    periodStr: "This Month",
    openingDebit: 500,
    openingCredit: 0,
    entries: largeEntries,
  });
  const decodedMulti = Buffer.from(multiPagePdf, "base64").toString("utf-8");
  assert(decodedMulti.includes("Brought Forward"), "Multi-page report includes 'Brought Forward' row");
  assert(decodedMulti.includes("Carried Forward"), "Multi-page report includes 'Carried Forward' row");

  console.log("\n================================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
