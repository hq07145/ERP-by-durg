import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface DeliveryChallanData {
  business: {
    name: string;
    legal_name?: string;
    tagline?: string;
    business_type?: string;
    gst_number?: string;
    address?: string;
    state?: string;
    phone?: string;
    email?: string;
  };
  delivery: {
    id: string;
    delivery_number: string;
    delivery_date: string;
    invoice_number?: string | null;
    status: string;
    vehicle?: string | null;
    driver?: string | null;
    driver_phone?: string | null;
    tracking_number?: string | null;
    notes?: string | null;
    created_at?: string;
  };
  order: {
    id: string;
    order_number: string;
    order_date?: string | null;
    total_amount?: number | null;
  };
  customer: {
    name: string;
    company_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    state?: string | null;
    gst_number?: string | null;
  };
  items: Array<{
    item_index: number;
    product_name: string;
    product_sku?: string | null;
    unit: string;
    ordered_quantity: number;
    previously_dispatched_quantity: number;
    current_delivery_quantity: number;
    remaining_quantity: number;
  }>;
}

export function formatChallanDate(dateStr?: string | Date | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Generate a professional SANKALP IRRIGATION Delivery Challan PDF.
 * Returns base64 encoded string compatible with client download.
 */
export function generateDeliveryChallanPdf(data: DeliveryChallanData): string {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36; // 0.5 inch margins
  const contentWidth = pageWidth - margin * 2;

  // ----------------------------------------------------
  // Top Outer Border
  // ----------------------------------------------------
  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.8);
  doc.rect(margin, margin, contentWidth, pageHeight - margin * 2);

  // ----------------------------------------------------
  // Header: Company Details
  // ----------------------------------------------------
  let currentY = margin + 18;

  // Header Background Tint
  doc.setFillColor(244, 248, 248);
  doc.rect(margin, margin, contentWidth, 72, "F");

  // Company Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 118, 110); // Brand Teal #0F766E
  doc.text(data.business.name || "SANKALP IRRIGATION", pageWidth / 2, currentY, { align: "center" });

  currentY += 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(70, 80, 95);
  const tagline = data.business.tagline || "ISI CERTIFIED COMPANY | INLINE-ONLINE DRIP MAKER";
  doc.text(tagline, pageWidth / 2, currentY, { align: "center" });

  currentY += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 100, 115);
  const addr = data.business.address || "Icchapur Road, Shahpur, Dist. Burhanpur (M.P.) 450-445";
  doc.text(addr, pageWidth / 2, currentY, { align: "center" });

  currentY += 11;
  const gstin = data.business.gst_number ? `GSTIN: ${data.business.gst_number}` : "GSTIN: 23AAMPQ5857F1ZE";
  const email = data.business.email ? ` | Email: ${data.business.email}` : "";
  const phone = data.business.phone ? ` | Mob: ${data.business.phone}` : "";
  doc.text(`${gstin}${email}${phone}`, pageWidth / 2, currentY, { align: "center" });

  // Divider Line
  currentY = margin + 72;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(1.5);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  // ----------------------------------------------------
  // Document Title Banner
  // ----------------------------------------------------
  currentY += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 43, 59);
  doc.text("DELIVERY CHALLAN", pageWidth / 2, currentY, { align: "center" });

  currentY += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 110, 125);
  doc.text("(Dispatched under Rule 55 of CGST Rules, 2017 - Not a Tax Invoice)", pageWidth / 2, currentY, { align: "center" });

  // ----------------------------------------------------
  // Two-Column Section: Challan Details (Left) vs Customer Details (Right)
  // ----------------------------------------------------
  currentY += 12;
  const boxTop = currentY;
  const colWidth = (contentWidth - 12) / 2;
  const leftX = margin + 6;
  const rightX = margin + colWidth + 12;
  const boxHeight = 78;

  // Box Left: Challan & Order Info
  doc.setFillColor(250, 252, 253);
  doc.setDrawColor(220, 226, 235);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin + 4, boxTop, colWidth, boxHeight, 3, 3, "FD");

  // Box Right: Consignee / Customer
  doc.roundedRect(rightX - 2, boxTop, colWidth, boxHeight, 3, 3, "FD");

  // Left Content
  let leftY = boxTop + 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 118, 110);
  doc.text("CHALLAN & DISPATCH DETAILS", leftX + 4, leftY);

  leftY += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 50, 65);
  doc.text("Challan No:", leftX + 4, leftY);
  doc.setFont("helvetica", "normal");
  doc.text(data.delivery.delivery_number, leftX + 65, leftY);

  leftY += 11;
  doc.setFont("helvetica", "bold");
  doc.text("Challan Date:", leftX + 4, leftY);
  doc.setFont("helvetica", "normal");
  doc.text(formatChallanDate(data.delivery.delivery_date), leftX + 65, leftY);

  leftY += 11;
  doc.setFont("helvetica", "bold");
  doc.text("Order No:", leftX + 4, leftY);
  doc.setFont("helvetica", "normal");
  doc.text(data.order.order_number, leftX + 65, leftY);

  leftY += 11;
  doc.setFont("helvetica", "bold");
  doc.text("Order Date:", leftX + 4, leftY);
  doc.setFont("helvetica", "normal");
  doc.text(formatChallanDate(data.order.order_date), leftX + 65, leftY);

  if (data.delivery.invoice_number) {
    leftY += 11;
    doc.setFont("helvetica", "bold");
    doc.text("Invoice Ref:", leftX + 4, leftY);
    doc.setFont("helvetica", "normal");
    doc.text(data.delivery.invoice_number, leftX + 65, leftY);
  }

  // Right Content (Customer)
  let rightY = boxTop + 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 118, 110);
  doc.text("CONSIGNEE / BILLED TO", rightX + 2, rightY);

  rightY += 12;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 40, 55);
  const custName = data.customer.company_name
    ? `${data.customer.name} (${data.customer.company_name})`
    : data.customer.name;
  doc.text(custName.slice(0, 38), rightX + 2, rightY);

  if (data.customer.address) {
    rightY += 11;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 80, 95);
    doc.text(data.customer.address.slice(0, 42), rightX + 2, rightY);
  }

  if (data.customer.state) {
    rightY += 11;
    doc.setFont("helvetica", "normal");
    doc.text(`State: ${data.customer.state}`, rightX + 2, rightY);
  }

  if (data.customer.gst_number) {
    rightY += 11;
    doc.setFont("helvetica", "bold");
    doc.text("GSTIN:", rightX + 2, rightY);
    doc.setFont("helvetica", "normal");
    doc.text(data.customer.gst_number, rightX + 38, rightY);
  }

  if (data.customer.phone) {
    rightY += 11;
    doc.setFont("helvetica", "bold");
    doc.text("Contact:", rightX + 2, rightY);
    doc.setFont("helvetica", "normal");
    doc.text(data.customer.phone, rightX + 42, rightY);
  }

  // ----------------------------------------------------
  // Transport & Vehicle Details Strip
  // ----------------------------------------------------
  currentY = boxTop + boxHeight + 8;
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(215, 222, 230);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin + 4, currentY, contentWidth - 8, 24, 2, 2, "FD");

  const stripY = currentY + 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 70, 85);

  const vNum = data.delivery.vehicle || "—";
  const dName = data.delivery.driver || "—";
  const dPhone = data.delivery.driver_phone ? ` (${data.delivery.driver_phone})` : "";
  const statusStr = data.delivery.status.replace(/_/g, " ");

  doc.text(`Vehicle No: ${vNum}`, margin + 12, stripY);
  doc.text(`Driver: ${dName}${dPhone}`, margin + 180, stripY);
  doc.text(`Dispatch Status: ${statusStr}`, margin + 350, stripY);

  // ----------------------------------------------------
  // Items Table (autoTable)
  // ----------------------------------------------------
  currentY += 32;

  const tableRows = data.items.map((it, idx) => [
    idx + 1,
    it.product_name,
    it.product_sku || "—",
    Number(it.ordered_quantity).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    Number(it.previously_dispatched_quantity).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    Number(it.current_delivery_quantity).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    Number(it.remaining_quantity).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    it.unit || "Unit",
  ]);

  const totalCurrent = data.items.reduce((s, it) => s + Number(it.current_delivery_quantity || 0), 0);
  const totalOrdered = data.items.reduce((s, it) => s + Number(it.ordered_quantity || 0), 0);
  const totalRemaining = data.items.reduce((s, it) => s + Number(it.remaining_quantity || 0), 0);

  // Add summary total row
  tableRows.push([
    "",
    "TOTAL QUANTITY",
    "",
    totalOrdered.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    "",
    totalCurrent.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    totalRemaining.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    "",
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin + 4, right: margin + 4 },
    head: [
      [
        "#",
        "Product / Item Description",
        "SKU",
        "Ordered",
        "Prev Disp",
        "Current Disp",
        "Balance Rem",
        "Unit",
      ],
    ],
    body: tableRows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: [30, 40, 55],
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      lineWidth: 0.5,
      lineColor: [225, 230, 238],
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [15, 118, 110], // Brand teal
      textColor: [255, 255, 255],
      lineWidth: 0.5,
      lineColor: [13, 101, 94],
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 65, halign: "left" },
      3: { cellWidth: 46, halign: "right" },
      4: { cellWidth: 48, halign: "right" },
      5: { cellWidth: 54, halign: "right", fontStyle: "bold" },
      6: { cellWidth: 50, halign: "right" },
      7: { cellWidth: 32, halign: "center" },
    },
    didParseCell: function (cellData) {
      if (cellData.row.index === tableRows.length - 1) {
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.fillColor = [240, 244, 248];
        cellData.cell.styles.textColor = [15, 118, 110];
      }
    },
  });

  const finalTableY = (doc as any).lastAutoTable?.finalY || (currentY + 120);

  // ----------------------------------------------------
  // Notes / Remarks (if any)
  // ----------------------------------------------------
  let notesY = finalTableY + 12;
  if (data.delivery.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(80, 90, 105);
    doc.text("Dispatch Notes / Instructions:", margin + 6, notesY);
    doc.setFont("helvetica", "normal");
    doc.text(data.delivery.notes.slice(0, 100), margin + 115, notesY);
    notesY += 12;
  }

  // ----------------------------------------------------
  // Declaration & Signatures Footer
  // ----------------------------------------------------
  const footerY = Math.max(notesY + 16, pageHeight - margin - 85);

  // Declaration
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(110, 120, 135);
  doc.text(
    "Declaration: Certified that the particulars given above are true and correct and the goods are dispatched in good condition.",
    margin + 6,
    footerY
  );
  doc.text(
    "Subject to Burhanpur (M.P.) Jurisdiction. Goods once inspected and accepted at dispatch are non-returnable without authorization.",
    margin + 6,
    footerY + 9
  );

  // Signature Boxes
  const sigY = footerY + 36;
  const sigBoxWidth = 160;

  // Receiver Signature (Left)
  doc.setDrawColor(180, 190, 205);
  doc.setLineWidth(0.6);
  doc.line(margin + 12, sigY, margin + 12 + sigBoxWidth, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 70, 85);
  doc.text("Received By (Customer Signature & Stamp)", margin + 12, sigY + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 130, 145);
  doc.text("Date & Time: ________________________", margin + 12, sigY + 21);

  // Authorized Signatory (Right)
  const rightSigX = pageWidth - margin - sigBoxWidth - 12;
  doc.line(rightSigX, sigY, rightSigX + sigBoxWidth, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 118, 110);
  doc.text("For SANKALP IRRIGATION", rightSigX, sigY + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 130, 145);
  doc.text("Authorized Signatory / Warehouse Incharge", rightSigX, sigY + 21);

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}
